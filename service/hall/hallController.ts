import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import { needsRgbAnalogHall, rgbHallKeys } from '../../src/keyboard/customRgb';
import { isAnalogAction } from '../../src/keyboard/gamepad';
import { heroLayout } from '../../src/keyboard/layout';
import type { NativeBridge } from '../bridge/hidBridge';
import type { HallRecord, ServiceContext } from '../context';

export type HallControllerDeps = {
  ctx: ServiceContext;
  getBridge: () => NativeBridge;
  exclusive: <T>(work: () => Promise<T>) => Promise<T>;
  isFirmwareActive: () => boolean;
  onRgbKey: (keyId: string, pressed: boolean) => void;
  onGamepadToggleInput: (keyId: string, pressed: boolean) => void;
};

export function createHallController({
  ctx,
  getBridge,
  exclusive,
  isFirmwareActive,
  onRgbKey,
  onGamepadToggleInput,
}: HallControllerDeps) {
  function needsAnalogHall() {
    return !ctx.tachyon && ctx.mode === 'custom' && needsRgbAnalogHall(ctx.profile?.custom);
  }

  async function syncHall() {
    ctx.hallBroker.update({
      id: 'rgb',
      keys: needsAnalogHall() ? rgbHallKeys(ctx.profile?.custom) : [],
      hz: 100,
    });
    for (const [suffix, analog] of [
      ['analog', true],
      ['digital', false],
    ] as const) {
      ctx.hallBroker.update({
        id: 'gamepad:' + suffix,
        keys: ctx.gamepadState.enabled
          ? ctx.gamepadConfigurations[ctx.gamepadSlot].bindings
              .filter(b => isAnalogAction(b.action) === analog)
              .map(b => b.keyId)
          : [],
        hz: analog ? ctx.gamepadConfigurations[ctx.gamepadSlot].rate : 200,
      });
    }
    const command = ctx.hallBroker.command('gamepad:');
    if (command !== ctx.lastHallCommand) {
      const result = await getBridge().line(command);
      if (result !== 'hall-ready') {
        throw Error(result);
      }
      ctx.lastHallCommand = command;
    }
    for (const key of ctx.hallSamples.keys()) {
      if (!ctx.hallBroker.demands.has(key)) {
        ctx.hallSamples.delete(key);
        ctx.hallReceivedAt.delete(key);
      }
    }
  }

  function scheduleHallSync() {
    ctx.hallSyncAgain = true;
    if (ctx.hallSyncScheduled || ctx.closing) {
      return;
    }
    ctx.hallSyncScheduled = true;
    void exclusive(async () => {
      while (ctx.hallSyncAgain && !ctx.closing) {
        ctx.hallSyncAgain = false;
        await syncHall();
      }
    })
      .catch(e => {
        ctx.lastError = String(e);
        ctx.hallSyncAgain = true;
      })
      .finally(() => {
        ctx.hallSyncScheduled = false;
        if (ctx.hallSyncAgain && !ctx.closing) {
          setTimeout(scheduleHallSync, 100).unref();
        }
      });
  }

  function publishHall(records: HallRecord[]) {
    const now = performance.now();
    for (const [client, subscription] of ctx.hallClients) {
      if (client.destroyed || client.writableLength > 65536) {
        client.destroy();
        ctx.hallClients.delete(client);
        ctx.hallBroker.unsubscribe(subscription.id);
        scheduleHallSync();
        continue;
      }
      for (const record of records) {
        if (subscription.keys.has(record.keyId)) {
          subscription.pending.set(record.keyId, record);
        }
      }
      if (!subscription.pending.size || now - subscription.lastSent < (subscription.keys.size > 10 ? 32 : 0)) {
        continue;
      }
      client.write(
        `data: ${JSON.stringify({
          records: [...subscription.pending.values()],
        })}\n\n`,
      );
      subscription.pending.clear();
      subscription.lastSent = now;
    }
  }

  function onHallSnapshot(value: {
    publishedMs?: number;
    requests: number;
    timeouts: number;
    records: Omit<HallRecord, 'keyId'>[];
  }) {
    const records: HallRecord[] = [];
    const currentConfig = ctx.gamepadConfigurations[ctx.gamepadSlot];
    const fwActive = isFirmwareActive();
    for (const s of value.records) {
      const keyId = ctx.keyByPosition.get(s.pos);
      if (!keyId || !ctx.hallBroker.demands.has(keyId)) {
        continue;
      }
      const record = {
        ...s,
        keyId,
      };
      ctx.hallSamples.set(keyId, record);
      ctx.hallReceivedAt.set(
        keyId,
        performance.now() - Math.max(0, (value.publishedMs ?? s.timestampMs) - s.timestampMs),
      );
      records.push(record);
      if (ctx.gamepadState.enabled && currentConfig.bindings.some(b => b.keyId === keyId)) {
        if (fwActive) {
          onRgbKey(keyId, s.pressed);
        }
        if (fwActive || currentConfig.suppressMappedKeys) {
          onGamepadToggleInput(keyId, s.pressed);
        }
      }
    }
    ctx.hallPolls = value.requests;
    ctx.hallSnapshots += records.length;
    publishHall(records);
  }

  function subscribeHallStream(req: IncomingMessage, res: ServerResponse) {
    const ids = new URL(req.url ?? '', `http://127.0.0.1:${ctx.port}`).searchParams.get('keys')?.split(',') ?? [];
    const hallKeyIds = heroLayout(ctx.deviceModel ?? 'hero84').keyIds;
    if (ids.length < 1 || ids.length > hallKeyIds.length || ids.some(id => !hallKeyIds.includes(id))) {
      throw Error(`Expected 1-${hallKeyIds.length} valid Hall keys`);
    }
    const keys = new Set(ids);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const id = 'web:' + randomUUID();
    res.write(': connected\n\n');
    ctx.hallClients.set(res, {
      id,
      keys,
      pending: new Map(),
      lastSent: 0,
    });
    ctx.hallBroker.subscribe({
      id,
      keys: [...keys],
      hz: 100,
    });
    scheduleHallSync();
    const initial = [...ctx.hallSamples.values()].filter(record => keys.has(record.keyId));
    if (initial.length) {
      res.write(
        `data: ${JSON.stringify({
          records: initial,
        })}\n\n`,
      );
    }
    const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15000);
    heartbeat.unref();
    req.on('close', () => {
      clearInterval(heartbeat);
      ctx.hallClients.delete(res);
      ctx.hallBroker.unsubscribe(id);
      scheduleHallSync();
    });
  }

  return {
    needsAnalogHall,
    syncHall,
    scheduleHallSync,
    publishHall,
    onHallSnapshot,
    subscribeHallStream,
  };
}

export type HallController = ReturnType<typeof createHallController>;
