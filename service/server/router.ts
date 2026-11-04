import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { CUSTOM_RGB_EFFECTS } from '../../src/keyboard/customRgb';
import { isTachyonLightingWrite } from '../../src/protocol/hero68/tachyonLighting';
import { BRAND } from '../brand';
import type { DeviceLock } from '../bridge/deviceLock';
import type { NativeBridge } from '../bridge/hidBridge';
import type { ServiceContext } from '../context';
import { serviceControlPanel } from '../controlPanel';
import { validateDeviceRequest } from '../deviceRequests';
import type { GamepadController } from '../gamepad/gamepadController';
import type { HallController } from '../hall/hallController';
import { readUpdateStatus, terminal } from '../installState';
import { isAllowedServiceRequest } from '../origins';
import { percentile } from '../rgb/profileNormalizer';
import type { RgbController } from '../rgb/rgbController';
import { RHYTHM_MODES, RHYTHM_SIDE_VERIFIED } from '../rhythm';
import type { createSetupUpdater } from '../setupUpdater';
import { CORE_API_VERSION, LAUNCHER_VERSION } from '../updatePackage';

export type DeviceRequestsInput = {
  requests?: unknown;
} & Record<string, unknown>;

export type ServiceRouterDeps = {
  ctx: ServiceContext;
  bridge: NativeBridge;
  deviceLock: DeviceLock;
  hallController: HallController;
  gamepadController: GamepadController;
  rgbController: RgbController;
  setupUpdater: ReturnType<typeof createSetupUpdater>;
  shutdown: (exitCode?: number) => Promise<void>;
};

export function createServiceServer({
  ctx,
  bridge,
  deviceLock,
  hallController,
  gamepadController,
  rgbController,
  setupUpdater,
  shutdown,
}: ServiceRouterDeps) {
  const { exclusive, getPendingRequests } = deviceLock;
  const panel = serviceControlPanel;

  function status() {
    const now = performance.now();
    if (now - ctx.cpuAt >= 1000) {
      const next = process.cpuUsage();
      ctx.cpuPercent =
        (next.user - ctx.cpuPrevious.user + (next.system - ctx.cpuPrevious.system)) /
        (now - ctx.cpuAt) /
        10;
      ctx.cpuPrevious = next;
      ctx.cpuAt = now;
    }
    return {
      service: BRAND.serviceLabel,
      version: 2,
      apiVersion: CORE_API_VERSION,
      deviceModel: ctx.deviceModel,
      supportedEffects: CUSTOM_RGB_EFFECTS.map(effect => effect.id),
      supportedBaseEffects: ['aurora'],
      pid: process.pid,
      coreVersion: ctx.coreVersion,
      launcherVersion: LAUNCHER_VERSION,
      supportsFullUpdate: setupUpdater.supported,
      driverInstalled: ctx.driverInstalled,
      updateOperation: ctx.updateOperation,
      mode: ctx.mode,
      tachyon: ctx.tachyon,
      supportsTachyon: true,
      enabled: ctx.mode !== 'onboard',
      connected: ctx.connected,
      preset: !!ctx.profile || ctx.savedMode === 'rhythm',
      savedMode: ctx.savedMode,
      configurationBusy: ctx.configurationBusy,
      pendingRequests: getPendingRequests(),
      sessionId: ctx.sessionId,
      customConfiguration: ctx.profile ?? undefined,
      customRevision: ctx.customRevision,
      fps: ctx.fps,
      frameMs: ctx.frameMs,
      renderMs: ctx.renderMs,
      encodeMs: ctx.encodeMs,
      writeMs: ctx.writeMs,
      frames: ctx.frames,
      packets: ctx.packets,
      hallSnapshots: ctx.hallSnapshots,
      hallPolls: ctx.hallPolls,
      hallClients: ctx.hallClients.size,
      timeouts: ctx.timeouts,
      maxGapMs: ctx.maxGapMs,
      ipc: ctx.bridgeIpc,
      frameGapP95Ms: percentile(ctx.frameGaps),
      frameGapP99Ms: percentile(ctx.frameGaps, 0.99),
      gapsOver100: ctx.gapsOver100,
      lastLongGapAt: ctx.lastLongGapAt,
      eventLoopDelayP99Ms: ctx.eventLoopDelay.percentile(99) / 1e6,
      eventLoopDelayMaxMs: ctx.eventLoopDelay.max / 1e6,
      lastError: ctx.lastError,
      rawInputReady: ctx.rawInputReady,
      inputTransitions: ctx.inputTransitions,
      inputToLedP95Ms: percentile(ctx.inputLatencies),
      targetFps: 60,
      renderFps: ctx.mode === 'rhythm' ? ctx.fps : ctx.renderFps,
      reusedFrames: ctx.reusedFrames,
      paletteColors: 32,
      sideOutput: RHYTHM_SIDE_VERIFIED,
      supportedModes: ['onboard', 'custom', 'rhythm'],
      supportedRhythmModes: RHYTHM_MODES.map(m => m.id),
      supportedRhythmSideModes: RHYTHM_SIDE_VERIFIED ? [500, 501, 502, 503] : [500],
      rhythmConfiguration: ctx.rhythmConfig,
      audioState: ctx.audioState,
      audioError: ctx.audioError,
      audioLevel: ctx.audioLevel,
      audioEndpoint: ctx.audioEndpoint,
      sampleRate: ctx.sampleRate,
      droppedFrames: ctx.droppedFrames,
      audioToWriteP95Ms: percentile(ctx.audioLatencies),
      audioTimestampInvalid: ctx.audioTimestampInvalid,
      audioLatencySamples: ctx.audioLatencies.length,
      captureToWriteP95Ms: percentile(ctx.captureLatencies),
      supportsGamepad: true,
      gamepad: gamepadController.gamepadStatus(),
      sharedHall: true,
      cpuPercent: ctx.cpuPercent,
      rssMB: process.memoryUsage().rss / 1048576,
    };
  }

  /**
   * Serializes `/device/request` and `/device/batch` HID transactions through
   * `exclusive()`. Pauses native Gamepad and Rhythm streaming while executing
   * direct HID configuration commands, and temporarily restores firmware key
   * mappings before any remap/advanced/macro write (`mutatesRemaps`) so
   * gamepad key suppression never leaks into user remap readbacks or saves.
   */
  async function handleDeviceRequests(url: string, input: DeviceRequestsInput) {
    const batch = url === '/device/batch';
    const requests: ReturnType<typeof validateDeviceRequest>[] = batch
      ? Array.isArray(input.requests) && input.requests.length > 0 && input.requests.length <= 128
        ? input.requests.map(validateDeviceRequest)
        : (() => {
            throw Error('Expected 1-128 device requests');
          })()
      : [validateDeviceRequest(input)];

    if (batch && requests.some(({ reenumerate }) => reenumerate)) {
      throw Error('Re-enumeration requires a standalone request');
    }

    const replies = await exclusive(async () => {
      if (ctx.tachyon && requests.some(({ packet }) => isTachyonLightingWrite(packet))) {
        throw Error('Turn off Tachyon Mode before changing RGB lighting.');
      }
      ctx.configurationBusy = true;
      const resume = ctx.mode !== 'onboard';
      await bridge.line('gamepad-pause');
      if (resume) {
        await bridge.line('rhythm-pause');
      }
      const mutatesRemaps = requests.some(
        ({ packet, reenumerate }) => reenumerate || [0x03, 0x10, 0x12, 0x05].includes(packet[1]),
      );
      const run = ctx.gamepadState.enabled;
      try {
        if (!ctx.connected) {
          await rgbController.connect();
        }
        if (
          mutatesRemaps &&
          (gamepadController.firmware.active || gamepadController.firmware.pendingRecovery)
        ) {
          await gamepadController.firmware.restore();
        }
        const collectedReplies: string[] = [];
        for (const { packet, reenumerate } of requests) {
          let reply: Awaited<ReturnType<NativeBridge['request']>> | undefined;
          const attempts = batch && [0x19, 0x16, 0x15].includes(packet[1]) ? 3 : 1;
          for (let i = 0; i < attempts; i++) {
            try {
              reply = await bridge.request(packet, reenumerate);
              break;
            } catch (e) {
              if (i === attempts - 1) {
                throw e;
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
          if (!reply) {
            throw Error('Missing HID reply');
          }
          collectedReplies.push(
            Buffer.from(gamepadController.firmware.projectRead(reply).raw).toString('hex'),
          );
          if (packet[1] === 0x10 && packet[2] === 0) {
            ctx.gamepadSlot = packet[7];
            ctx.gamepadToggleTracker.reset();
            await gamepadController.configureNativeGamepad(
              ctx.gamepadConfigurations[ctx.gamepadSlot],
              run,
            );
            ctx.persistGamepad();
            await hallController.syncHall();
          }
          if (reenumerate) {
            ctx.connected = false;
            await bridge.close();
            const deadline = performance.now() + 7000;
            let recovered = false;
            while (performance.now() < deadline) {
              await new Promise(resolve => setTimeout(resolve, 120));
              try {
                await rgbController.connect();
                recovered = true;
                break;
              } catch {
                await bridge.close();
              }
            }
            if (!recovered) {
              throw Error('HERO68 did not return after polling-rate change');
            }
          }
        }
        const changesDigitalSettings = requests.some(({ packet }) =>
          [0x13, 0x19, 0x16].includes(packet[1]),
        );
        if (run && (mutatesRemaps || changesDigitalSettings)) {
          await gamepadController.configureNativeGamepad(
            ctx.gamepadConfigurations[ctx.gamepadSlot],
            run,
          );
        }
        if (mutatesRemaps && run) {
          await gamepadController.applyFirmware(ctx.gamepadConfigurations[ctx.gamepadSlot]);
        }
        return collectedReplies;
      } catch (e) {
        if (run) {
          await gamepadController.stopGamepad().catch(() => {});
        }
        throw e;
      } finally {
        ctx.configurationBusy = false;
        if (resume) {
          await bridge.line('rhythm-resume');
        }
        await bridge.line('gamepad-resume');
      }
    });

    return batch ? { hexes: replies } : { hex: replies[0] };
  }

  // Enforce loopback Host + strict Origin allowlist (`origins.ts`) before
  // exposing any local service endpoint or Private Network Access headers.
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Origin');
    if (!isAllowedServiceRequest(req.headers.host, origin, ctx.origins, ctx.port)) {
      res.writeHead(403).end();
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    const json = (code: number, value: unknown) => {
      res
        .writeHead(code, {
          'Content-Type': 'application/json',
        })
        .end(JSON.stringify(value));
    };

    const plain = (code: number, value: string) => {
      res
        .writeHead(code, {
          'Content-Type': 'text/plain; charset=utf-8',
        })
        .end(value);
    };

    try {
      if (req.method === 'GET' && req.url === '/') {
        res
          .writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
          })
          .end(panel);
        return;
      }
      if (req.method === 'GET' && req.url === '/status') {
        json(200, status());
        return;
      }
      if (req.method === 'GET' && req.url === '/gamepad/status') {
        json(200, gamepadController.gamepadStatus());
        return;
      }
      if (req.method === 'GET' && req.url === '/gamepad/input/events') {
        if (!ctx.gamepadState.fastInputSupported) {
          json(409, {
            error: 'Update the full Windows service package to 0.4.1 or later',
          });
          return;
        }
        gamepadController.subscribeGamepadInputEvents(req, res);
        return;
      }
      if (req.method === 'GET' && req.url === '/gamepad/events') {
        gamepadController.subscribeGamepadEvents(req, res);
        return;
      }
      if (req.method === 'GET' && req.url === '/audio/devices') {
        json(200, {
          devices: await exclusive(() => bridge.audioDevices()),
        });
        return;
      }
      if (req.method === 'GET' && req.url === '/updates') {
        json(200, {
          coreVersion: ctx.coreVersion,
          supportsFullUpdate: setupUpdater.supported,
          ...setupUpdater.status(),
        });
        return;
      }
      if (req.method === 'GET' && req.url === '/frames') {
        rgbController.subscribeFrames(req, res);
        return;
      }
      if (req.method === 'GET' && req.url?.startsWith('/hall/stream?')) {
        hallController.subscribeHallStream(req, res);
        return;
      }

      const validPostRoutes = [
        '/gamepad/config',
        '/gamepad/profile',
        '/gamepad/start',
        '/gamepad/stop',
        '/gamepad/toggle',
        '/tachyon',
        '/start',
        '/stop',
        '/mode',
        '/preset',
        '/rhythm/start',
        '/rhythm/config',
        '/shutdown',
        '/updates/apply',
        '/updates/tray-check',
        '/updates/prepare',
        '/device/request',
        '/device/batch',
      ];
      if (req.method !== 'POST' || !validPostRoutes.includes(req.url ?? '')) {
        json(404, {
          error: 'Unknown endpoint',
        });
        return;
      }
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
        json(415, {
          error: 'Expected application/json',
        });
        return;
      }

      let body = '';
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) {
          throw Error('Preset too large');
        }
        body += chunk;
      }
      const input = JSON.parse(body || '{}') as Record<string, unknown>;

      if (
        ctx.updating &&
        !['/shutdown', '/updates/apply', '/updates/tray-check', '/updates/prepare'].includes(
          req.url ?? '',
        )
      ) {
        throw Error('App update in progress');
      }

      if (req.url?.startsWith('/gamepad/')) {
        const result = await gamepadController.handleGamepadRequest(req.url, input);
        json(200, result);
        return;
      }

      if (req.url === '/updates/prepare') {
        const update = readUpdateStatus(ctx.stateDir);
        if (
          !input.operationId ||
          input.operationId !== update.operationId ||
          terminal(update.phase)
        ) {
          throw Error('Invalid update operation');
        }
        ctx.updating = true;
        await exclusive(async () => true);
        json(200, {
          ready: true,
        });
        return;
      }

      if (req.url === '/updates/tray-check' || req.url === '/updates/apply') {
        const update = setupUpdater.start();
        if (req.url === '/updates/tray-check') {
          await setupUpdater.settled();
          const final = setupUpdater.status();
          const kind = final.phase === 'completed' ? 'none' : 'started';
          plain(200, kind + '|' + (final.version ?? ctx.coreVersion));
        } else {
          json(202, update);
        }
        return;
      }

      if (req.url === '/tachyon') {
        if (typeof input.enabled !== 'boolean') {
          throw Error('Expected Tachyon enabled boolean');
        }
        const tachyonEnabled = input.enabled;
        await exclusive(async () => {
          if (tachyonEnabled) {
            await gamepadController.stopGamepad();
          }
          await rgbController.setTachyon(tachyonEnabled);
          await hallController.syncHall();
        });
        json(200, status());
        return;
      }

      if (
        req.url === '/rhythm/start' ||
        req.url === '/rhythm/config' ||
        (req.url === '/start' && !Object.keys(input).length && ctx.savedMode === 'rhythm')
      ) {
        await rgbController.handleRhythmRequest(req.url, input);
        json(200, status());
        return;
      }

      if (req.url === '/device/request' || req.url === '/device/batch') {
        const responsePayload = await handleDeviceRequests(req.url, input);
        json(200, responsePayload);
        return;
      }

      await rgbController.handleRgbModeRequest(req.url ?? '', input);
      json(200, status());
      if (req.url === '/shutdown') {
        void shutdown();
      }
    } catch (e) {
      json(
        (e as { status?: number }).status === 409 ? 409 : 400,
        {
          error: e instanceof Error ? e.message : String(e),
        },
      );
    }
  });

  return {
    server,
    status,
  };
}
