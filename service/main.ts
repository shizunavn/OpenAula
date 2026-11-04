import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { nativeGamepadCommand } from '../src/keyboard/gamepad';
import { serviceStateDir } from './brand';
import { createDeviceLock } from './bridge/deviceLock';
import { NativeBridge } from './bridge/hidBridge';
import { createServiceContext } from './context';
import { createGamepadController } from './gamepad/gamepadController';
import { createHallController } from './hall/hallController';
import { migrateLegacyStateDir } from './migrateState';
import { serviceOrigins } from './origins';
import { normalizeProfile } from './rgb/profileNormalizer';
import { createRgbController } from './rgb/rgbController';
import { createServiceServer } from './server/router';
import { createSetupUpdater } from './setupUpdater';
import { CORE_VERSION } from './updatePackage';

export { normalizeProfile };

function option(name: string) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && !process.argv[index + 1]) {
    throw Error(`Missing ${name} value`);
  }
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const port = Number(option('--port') ?? 16868);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw Error('Invalid local service port');
}

const stateDir = option('--state-dir')
  ? path.resolve(option('--state-dir')!)
  : (migrateLegacyStateDir(), serviceStateDir());

// Older launchers export the pre-1.0 variable names.
const coreVersion =
  process.env.OPENAULA_CORE_VERSION ?? process.env.OPENHERO68_CORE_VERSION ?? CORE_VERSION;

mkdirSync(stateDir, {
  recursive: true,
});

const log = (message: string) =>
  appendFileSync(path.join(stateDir, 'service.log'), `${new Date().toISOString()} ${message}\n`);

const driverProbe = spawnSync(path.join(__dirname, 'update-host.exe'), ['--probe-driver'], {
  windowsHide: true,
  stdio: 'ignore',
  timeout: 3000,
});
const driverInstalled = driverProbe.status === 0 || driverProbe.status === 2;

const origins = serviceOrigins(port);
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--allow-origin' && process.argv[i + 1]) {
    origins.add(new URL(process.argv[++i]).origin);
  }
}

const ctx = createServiceContext({
  port,
  stateDir,
  coreVersion,
  driverInstalled,
  updateOperation: option('--update-operation'),
  origins,
  log,
});

const deviceLock = createDeviceLock(32);
const { exclusive } = deviceLock;

let bridge: NativeBridge;

const hallController = createHallController({
  ctx,
  getBridge: () => bridge,
  exclusive,
  isFirmwareActive: () => gamepadController.firmware.active,
  onRgbKey: (keyId, pressed) => rgbController.onRgbKey(keyId, pressed),
  onGamepadToggleInput: (keyId, pressed) => gamepadController.onGamepadToggleInput(keyId, pressed),
});

const rgbController = createRgbController({
  ctx,
  getBridge: () => bridge,
  exclusive,
  needsAnalogHall: () => hallController.needsAnalogHall(),
  syncHall: () => hallController.syncHall(),
});

const gamepadController = createGamepadController({
  ctx,
  getBridge: () => bridge,
  exclusive,
  syncHall: () => hallController.syncHall(),
  connect: () => rgbController.connect(),
  onRgbKey: (keyId, pressed) => rgbController.onRgbKey(keyId, pressed),
});

bridge = new NativeBridge(ctx, __dirname, {
  onGamepadInput: payload => gamepadController.publishGamepadInput(payload),
  onHallSnapshot: payload => hallController.onHallSnapshot(payload),
  onPowerOrHallRecovery: () => {
    if (gamepadController.firmware.active || gamepadController.firmware.pendingRecovery) {
      gamepadController.scheduleFirmwareRecovery();
    }
  },
  onHallErrorRecovery: () => {
    if (gamepadController.firmware.active) {
      gamepadController.scheduleFirmwareRecovery();
    }
  },
  onGamepadStatusChanged: () => hallController.scheduleHallSync(),
  onCustomTick: () => rgbController.onCustomTick(),
  onCustomFrame: payload => rgbController.onCustomFrame(payload),
  onRhythmFrame: payload => rgbController.onNativeFrame(payload),
  onRgbKey: (keyId, pressed) => rgbController.onRgbKey(keyId, pressed),
  onGamepadToggleInput: (keyId, pressed) => gamepadController.onGamepadToggleInput(keyId, pressed),
  publishFrame: value => rgbController.publishFrame(value),
  publishGamepad: () => gamepadController.publishGamepad(),
  onFatalExit: exitCode => void shutdown(exitCode),
});

const setupUpdater = createSetupUpdater({
  version: coreVersion,
  stateDir,
  directory: __dirname,
});

const { server } = createServiceServer({
  ctx,
  bridge,
  deviceLock,
  hallController,
  gamepadController,
  rgbController,
  setupUpdater,
  shutdown,
});

let timer: ReturnType<typeof setTimeout>;

async function loop() {
  const now = performance.now();
  if (ctx.tachyon && !ctx.connected && !ctx.closing && now >= ctx.reconnectAt) {
    ctx.reconnectAt = now + 1000;
    try {
      await exclusive(() => rgbController.connect());
    } catch (e) {
      ctx.connected = false;
      ctx.lastError = String(e);
    }
  }
  if (now - ctx.windowStart >= 1000) {
    ctx.fps = (ctx.windowFrames * 1000) / (now - ctx.windowStart);
    ctx.renderFps = (ctx.windowRendered * 1000) / (now - ctx.windowStart);
    ctx.windowFrames = 0;
    ctx.windowRendered = 0;
    ctx.windowStart = now;
  }
  if (!ctx.closing) {
    timer = setTimeout(loop, 250);
  }
}

async function shutdown(exitCode = 0) {
  if (ctx.closing) {
    return;
  }
  ctx.closing = true;
  clearTimeout(timer);
  clearTimeout(ctx.firmwareRecoveryTimer);
  rgbController.publishFrame({
    enabled: false,
    connected: false,
    shuttingDown: true,
  });
  await exclusive(async () => {
    await gamepadController.stopGamepad();
    await rgbController.stop();
  }).catch(e => log(String(e)));
  for (const client of ctx.frameClients) {
    client.end();
  }
  for (const client of ctx.gamepadClients) {
    client.end();
  }
  for (const client of ctx.gamepadInputClients.keys()) {
    client.end();
  }
  for (const client of ctx.hallClients.keys()) {
    client.end();
  }
  await exclusive(() => bridge.close()).catch(ignoredError => {
    void ignoredError;
  });
  bridge.end();
  server.close(() => process.exit(exitCode));
  setTimeout(() => process.exit(exitCode), 1000).unref();
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
process.on('uncaughtException', e => {
  log(e.stack ?? e.message);
  void shutdown();
});

server.on('error', e => {
  log(`Server error: ${e.message}`);
  bridge.end();
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  log(`Service listening on 127.0.0.1:${port}`);
  void exclusive(async () => {
    await bridge.line(nativeGamepadCommand(ctx.gamepadConfigurations[ctx.gamepadSlot]));
    if (gamepadController.firmware.pendingRecovery) {
      try {
        await gamepadController.firmware.restore();
      } catch (ignoredError) {
        void ignoredError;
        setImmediate(() => gamepadController.scheduleFirmwareRecovery());
      }
    }
    if (ctx.mode === 'custom') {
      await bridge.startCustom();
    }
    if (ctx.mode === 'rhythm') {
      await bridge.configureRhythm(ctx.rhythmConfig);
    }
    await hallController.syncHall();
  }).catch(e => {
    ctx.lastError = String(e);
    ctx.mode = 'onboard';
  });
  void loop();
});
