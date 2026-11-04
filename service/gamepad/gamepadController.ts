import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  nativeGamepadCommand,
  validateGamepad,
  type GamepadConfiguration,
} from '../../src/keyboard/gamepad';
import type { GamepadStatus } from '../../src/protocol/gamepadService';
import { selectProfile } from '../../src/protocol/hero68/commands';
import type { NativeBridge } from '../bridge/hidBridge';
import type { ServiceContext } from '../context';
import { digitalSettingsCommand } from '../gamepadDigital';
import { GamepadFirmware } from '../gamepadFirmware';
import { hookConfiguration } from '../gamepadKeyboard';
import { latestSse } from '../latestSse';

export type GamepadControllerDeps = {
  ctx: ServiceContext;
  getBridge: () => NativeBridge;
  exclusive: <T>(work: () => Promise<T>) => Promise<T>;
  syncHall: () => Promise<void>;
  connect: () => Promise<void>;
  onRgbKey: (keyId: string, pressed: boolean) => void;
};

export function createGamepadController({
  ctx,
  getBridge,
  exclusive,
  syncHall,
  connect,
  onRgbKey,
}: GamepadControllerDeps) {
  const recoveryFile = path.join(ctx.stateDir, 'gamepad-remap-recovery.json');

  const firmware = new GamepadFirmware(
    packet => getBridge().request(packet),
    async () => {
      const result = await getBridge().line('device-identity');
      if (!/^device-identity:[0-9a-f]+$/.test(result)) {
        throw Error('Cannot identify HERO68 for remap recovery');
      }
      return createHash('sha256').update(result).digest('hex');
    },
    {
      load: () => (existsSync(recoveryFile) ? JSON.parse(readFileSync(recoveryFile, 'utf8')) : null),
      save: j => {
        const fd = openSync(recoveryFile + '.tmp', 'w');
        try {
          writeFileSync(fd, JSON.stringify(j));
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
        renameSync(recoveryFile + '.tmp', recoveryFile);
      },
      clear: () => {
        if (existsSync(recoveryFile)) {
          unlinkSync(recoveryFile);
        }
      },
    },
  );

  function gamepadStatus(): GamepadStatus {
    return {
      ...ctx.gamepadState,
      keyboardSuppressionActive:
        firmware.active || !!(ctx.gamepadState as GamepadStatus).keyboardSuppressionActive,
      keyboardSuppressionError:
        firmware.error || (ctx.gamepadState as GamepadStatus).keyboardSuppressionError,
      firmwareRecoveryPending: firmware.pendingRecovery,
      backend: 'vigem',
      slot: ctx.gamepadSlot,
      configuration: ctx.gamepadConfigurations[ctx.gamepadSlot],
      capabilities: {
        gamepad: true,
        keyboardSuppression: ctx.gamepadState.fastInputSupported === true,
        keyboardHook: ctx.gamepadState.keyboardHookSupported === true,
        fastInput: ctx.gamepadState.fastInputSupported === true,
      },
      hall: {
        ...ctx.hallMetrics,
        consumers: ctx.hallBroker.consumers.map(s => ({
          ...s,
          keys: [...s.keys],
        })),
      },
      samples: [...ctx.hallSamples.values()].map(s => ({
        ...s,
        ageMs: performance.now() - (ctx.hallReceivedAt.get(s.keyId) ?? 0),
      })),
    };
  }

  function publishGamepad() {
    const value = `data: ${JSON.stringify(gamepadStatus())}\n\n`;
    for (const client of ctx.gamepadClients) {
      if (client.destroyed || client.writableLength > 65536) {
        client.destroy();
        ctx.gamepadClients.delete(client);
      } else if (!client.writableLength) {
        client.write(value);
      }
    }
  }

  function scheduleInputStream() {
    if (ctx.inputStreamScheduled || ctx.closing) {
      return;
    }
    ctx.inputStreamScheduled = true;
    void exclusive(async () => {
      while (!ctx.closing && ctx.inputStreamApplied !== ctx.gamepadInputClients.size > 0) {
        const wanted = ctx.gamepadInputClients.size > 0;
        const result = await getBridge().line(wanted ? 'gamepad-input-on' : 'gamepad-input-off');
        if (result !== 'gamepad-input-ready') {
          throw Error('Fast gamepad input unavailable');
        }
        ctx.inputStreamApplied = wanted;
      }
    })
      .catch(() => {
        ctx.inputStreamApplied = false;
        for (const client of ctx.gamepadInputClients.keys()) {
          client.destroy();
        }
        ctx.gamepadInputClients.clear();
      })
      .finally(() => {
        ctx.inputStreamScheduled = false;
        if (!ctx.closing && ctx.inputStreamApplied !== ctx.gamepadInputClients.size > 0) {
          scheduleInputStream();
        }
      });
  }

  function publishGamepadInput(value: { enabled: boolean; report: unknown; sequence: number }) {
    if (!ctx.gamepadInputClients.size) {
      return;
    }
    const now = performance.now();
    const keys = new Set(ctx.gamepadConfigurations[ctx.gamepadSlot].bindings.map(b => b.keyId));
    const samples = value.enabled
      ? [...ctx.hallSamples.values()]
          .filter(s => keys.has(s.keyId))
          .map(s => ({
            ...s,
            ageMs: now - (ctx.hallReceivedAt.get(s.keyId) ?? 0),
          }))
      : [];
    const text = `data: ${JSON.stringify({
      ...value,
      samples,
    })}\n\n`;
    for (const [client, send] of ctx.gamepadInputClients) {
      if (client.destroyed || client.writableLength > 65536) {
        client.destroy();
      } else {
        send(text);
      }
    }
  }

  async function stopGamepad() {
    const result = await getBridge().line('gamepad-stop');
    if (result !== 'gamepad-stopped') {
      throw Error(result);
    }
    for (const binding of ctx.gamepadConfigurations[ctx.gamepadSlot].bindings) {
      if (firmware.active) {
        onRgbKey(binding.keyId, false);
      }
      ctx.gamepadToggleTracker.event(
        binding.keyId,
        false,
        ctx.gamepadConfigurations[ctx.gamepadSlot].toggleKeybind,
      );
    }
    ctx.gamepadState = {
      ...ctx.gamepadState,
      enabled: false,
      armed: false,
      stale: true,
      report: {
        buttons: 0,
        lx: 0,
        ly: 0,
        rx: 0,
        ry: 0,
        lt: 0,
        rt: 0,
      },
    };
    await syncHall();
    await firmware.restore();
  }

  function scheduleFirmwareRecovery() {
    if (ctx.closing || ctx.firmwareRecoveryScheduled || ctx.firmwareRecoveryTimer) {
      return;
    }
    ctx.firmwareRecoveryScheduled = true;
    void exclusive(async () => {
      await stopGamepad();
      ctx.firmwareRecoveryAttempt = 0;
      publishGamepad();
    })
      .catch(e => {
        ctx.log('Gamepad remap recovery pending: ' + String(e));
        publishGamepad();
        if (!ctx.closing) {
          ctx.firmwareRecoveryTimer = setTimeout(() => {
            ctx.firmwareRecoveryTimer = undefined;
            scheduleFirmwareRecovery();
          }, [250, 500, 1000, 2000][Math.min(ctx.firmwareRecoveryAttempt++, 3)]);
        }
      })
      .finally(() => {
        ctx.firmwareRecoveryScheduled = false;
      });
  }

  async function applyFirmware(config: GamepadConfiguration) {
    if (config.suppressMappedKeys && config.keyboardSuppressionMode === 'firmware') {
      await firmware.apply(
        ctx.gamepadSlot as 0 | 1 | 2,
        config.bindings.map(b => b.keyId),
      );
    }
  }

  async function configureNativeGamepad(config: GamepadConfiguration, running: boolean) {
    const bridge = getBridge();
    const actual =
      running && config.suppressMappedKeys && config.keyboardSuppressionMode === 'hook'
        ? await hookConfiguration(config, packet => bridge.request(packet))
        : config;
    const r = await bridge.line(nativeGamepadCommand(actual));
    if (r !== 'gamepad-configured') {
      throw Error(r);
    }
    if (running) {
      const settings = await digitalSettingsCommand(config, packet => bridge.request(packet));
      const result = await bridge.line(settings);
      if (result !== 'gamepad-digital-ready') {
        throw Error(
          'Digital AP/RT requires the full Windows service 0.4.6 package or later: ' + result,
        );
      }
    }
  }

  // ViGEmBus initializes its XInput mapping lazily after boot, so the first
  // attach can fail and a second attempt succeeds. Retry once instead of
  // asking the user to press the toggle twice.
  async function startNativeGamepad() {
    const command = ctx.gamepadState.fastInputSupported ? 'gamepad-start-paused' : 'gamepad-start';
    const first = await getBridge().line(command);
    if (first === 'gamepad-ready') {
      return;
    }
    const retry = await getBridge().line(command);
    if (retry !== 'gamepad-ready') {
      throw Error(/Xbox controller/i.test(first) ? `${retry}. Start Gamepad again; ViGEmBus finishes initializing after the first attempt.` : retry);
    }
  }

  function onGamepadToggleInput(id: string, pressed: boolean) {
    const config = ctx.gamepadConfigurations[ctx.gamepadSlot];
    if (!ctx.gamepadToggleTracker.event(id, pressed, config.toggleKeybind)) {
      return;
    }
    const now = performance.now();
    if (ctx.closing || ctx.updating || ctx.hotkeyToggleInFlight || now - ctx.lastHotkeyToggleAt < 350) {
      return;
    }
    ctx.lastHotkeyToggleAt = now;
    ctx.hotkeyToggleInFlight = true;
    void exclusive(async () => {
      const bridge = getBridge();
      clearTimeout(ctx.firmwareRecoveryTimer);
      ctx.firmwareRecoveryTimer = undefined;
      if (ctx.gamepadState.enabled) {
        await stopGamepad();
        return;
      }
      const activeConfig = ctx.gamepadConfigurations[ctx.gamepadSlot];
      if (ctx.tachyon) {
        throw Error('Turn off Tachyon Mode before starting Hall gamepad output.');
      }
      if (!activeConfig.bindings.length) {
        throw Error('Add at least one gamepad binding');
      }
      if (
        activeConfig.suppressMappedKeys &&
        !(activeConfig.keyboardSuppressionMode === 'hook'
          ? ctx.gamepadState.keyboardHookSupported
          : ctx.gamepadState.fastInputSupported)
      ) {
        throw Error('Mapped-key blocking requires the full Windows service 0.4.1 package or later');
      }
      const resume = ctx.mode !== 'onboard';
      if (resume) {
        await bridge.line('rhythm-pause');
      }
      try {
        await stopGamepad();
        if (!ctx.connected) {
          await connect();
        }
        await bridge.request(selectProfile(ctx.gamepadSlot as 0 | 1 | 2));
        await configureNativeGamepad(activeConfig, true);
        await startNativeGamepad();
        ctx.gamepadState = {
          ...ctx.gamepadState,
          enabled: true,
          armed: false,
          stale: true,
          error: '',
        };
        await bridge.line('gamepad-pause');
        await applyFirmware(activeConfig);
        await bridge.line('gamepad-resume');
        const state = await bridge.line('gamepad-status');
        if (!state.startsWith('gamepad-state:')) {
          throw Error(state);
        }
        ctx.gamepadState = JSON.parse(state.slice(14));
        await syncHall();
      } catch (e) {
        await stopGamepad().catch(ignoredError => {
          void ignoredError;
        });
        ctx.gamepadState = {
          ...ctx.gamepadState,
          error: e instanceof Error ? e.message : String(e),
        };
        throw e;
      } finally {
        if (resume) {
          await bridge.line('rhythm-resume');
        }
      }
    })
      .then(() => publishGamepad())
      .catch(e => {
        ctx.log('Gamepad toggle keybind failed: ' + String(e));
        publishGamepad();
      })
      .finally(() => {
        ctx.hotkeyToggleInFlight = false;
      });
  }

  async function handleGamepadRequest(url: string, input: any) {
    const bridge = getBridge();
    const slot = input.slot ?? ctx.gamepadSlot;
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) {
      throw Error('Expected profile 0-2');
    }
    const config =
      input.configuration === undefined
        ? ctx.gamepadConfigurations[slot]
        : validateGamepad(input.configuration);

    await exclusive(async () => {
      clearTimeout(ctx.firmwareRecoveryTimer);
      ctx.firmwareRecoveryTimer = undefined;
      if (url === '/gamepad/toggle') {
        const now = performance.now();
        if (input.expectedEnabled !== undefined && ctx.gamepadState.enabled === input.expectedEnabled) {
          return;
        }
        if (input.source === 'hotkey' && now - ctx.lastHotkeyToggleAt < 350) {
          return;
        }
        if (input.source === 'hotkey') {
          ctx.lastHotkeyToggleAt = now;
        }
        if (ctx.gamepadState.enabled) {
          await stopGamepad();
          return;
        }
      }
      if (url === '/gamepad/stop') {
        await stopGamepad();
        return;
      }
      if (
        config.suppressMappedKeys &&
        !(config.keyboardSuppressionMode === 'hook'
          ? ctx.gamepadState.keyboardHookSupported
          : ctx.gamepadState.fastInputSupported)
      ) {
        throw Error('Mapped-key blocking requires the full Windows service 0.4.1 package or later');
      }
      if (ctx.tachyon) {
        throw Error('Turn off Tachyon Mode before starting Hall gamepad output.');
      }
      if (
        url === '/gamepad/config' &&
        JSON.stringify(config) === JSON.stringify(ctx.gamepadConfigurations[slot])
      ) {
        return;
      }
      if (url === '/gamepad/config' && slot === ctx.gamepadSlot && ctx.gamepadState.enabled) {
        // Live edits keep the Xbox target attached. Neutralize while swapping
        // mapping/subscriptions; firmware writes are needed only for key scope
        // or suppression changes, never for a curve/angle/rate slider alone.
        const previous = ctx.gamepadConfigurations[slot];
        const scope = (c: GamepadConfiguration) =>
          JSON.stringify([
            c.suppressMappedKeys,
            c.keyboardSuppressionMode,
            [...new Set(c.bindings.map(b => b.keyId))].sort(),
          ]);
        const remapChanged = scope(previous) !== scope(config);
        const resume = ctx.mode !== 'onboard';
        await bridge.line('gamepad-pause');
        if (resume) {
          await bridge.line('rhythm-pause');
        }
        try {
          if (remapChanged) {
            if (firmware.active) {
              for (const binding of previous.bindings) {
                onRgbKey(binding.keyId, false);
              }
            }
            await firmware.restore();
          }
          await configureNativeGamepad(config, true);
          ctx.gamepadConfigurations[slot] = config;
          ctx.persistGamepad();
          if (remapChanged) {
            await applyFirmware(config);
          }
          await syncHall();
          await bridge.line('gamepad-resume');
          const state = await bridge.line('gamepad-status');
          if (!state.startsWith('gamepad-state:')) {
            throw Error(state);
          }
          ctx.gamepadState = JSON.parse(state.slice(14));
        } catch (e) {
          await stopGamepad().catch(ignoredError => {
            void ignoredError;
          });
          publishGamepad();
          throw e;
        } finally {
          if (resume) {
            await bridge.line('rhythm-resume');
          }
        }
        return;
      }
      const startRequested = url === '/gamepad/start' || url === '/gamepad/toggle';
      const active = url === '/gamepad/profile' || startRequested || slot === ctx.gamepadSlot;
      const run = active && (ctx.gamepadState.enabled || startRequested);
      const resume = ctx.mode !== 'onboard';
      if (active) {
        if (startRequested && !config.bindings.length) {
          throw Error('Add at least one gamepad binding');
        }
      }
      if (active && resume) {
        await bridge.line('rhythm-pause');
      }
      try {
        if (active) {
          await stopGamepad();
          if (run) {
            if (!ctx.connected) {
              await connect();
            }
            await bridge.request(selectProfile(slot as 0 | 1 | 2));
          }
          await configureNativeGamepad(config, run);
          ctx.gamepadSlot = slot;
        }
        ctx.gamepadConfigurations[slot] = config;
        ctx.persistGamepad();
        if (run) {
          if (!ctx.connected) {
            await connect();
          }
          // Check the driver before mutating firmware. Output remains neutral
          // until Hall subscriptions are installed and every bound key rests.
          await startNativeGamepad();
          ctx.gamepadState = {
            ...ctx.gamepadState,
            enabled: true,
            armed: false,
            stale: true,
            error: '',
          };
          await bridge.line('gamepad-pause');
          await applyFirmware(config);
          await bridge.line('gamepad-resume');
        }
        const state = await bridge.line('gamepad-status');
        if (!state.startsWith('gamepad-state:')) {
          throw Error(state);
        }
        ctx.gamepadState = JSON.parse(state.slice(14));
        await syncHall();
      } catch (e) {
        if (active) {
          await stopGamepad().catch(ignoredError => {
            void ignoredError;
          });
        }
        publishGamepad();
        throw e;
      } finally {
        if (active && resume) {
          await bridge.line('rhythm-resume');
        }
      }
    });
    publishGamepad();
    return gamepadStatus();
  }

  function subscribeGamepadEvents(req: IncomingMessage, res: ServerResponse) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`data: ${JSON.stringify(gamepadStatus())}\n\n`);
    ctx.gamepadClients.add(res);
    const heartbeat = setInterval(() => {
      if (!res.writableLength) {
        res.write(': keepalive\n\n');
      }
    }, 15000);
    heartbeat.unref();
    req.on('close', () => {
      clearInterval(heartbeat);
      ctx.gamepadClients.delete(res);
    });
  }

  function subscribeGamepadInputEvents(req: IncomingMessage, res: ServerResponse) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Cache-Control': 'no-store',
    });
    res.write(': connected\n\n');
    ctx.gamepadInputClients.set(res, latestSse(res));
    scheduleInputStream();
    req.on('close', () => {
      ctx.gamepadInputClients.delete(res);
      scheduleInputStream();
    });
  }

  return {
    firmware,
    gamepadStatus,
    publishGamepad,
    publishGamepadInput,
    scheduleInputStream,
    stopGamepad,
    scheduleFirmwareRecovery,
    applyFirmware,
    configureNativeGamepad,
    onGamepadToggleInput,
    handleGamepadRequest,
    subscribeGamepadEvents,
    subscribeGamepadInputEvents,
  };
}

export type GamepadController = ReturnType<typeof createGamepadController>;
