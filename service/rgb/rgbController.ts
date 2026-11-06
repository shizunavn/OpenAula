import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import { rgbHallKeys } from '../../src/keyboard/customRgb';
import { detectHeroDeviceModelFromUuid, heroDeviceModel } from '../../src/keyboard/devices';
import { HERO68_KEY_IDS } from '../../src/keyboard/hero68Layout';
import { HERO84_COLOR_SOURCES } from '../../src/keyboard/hero84Layout';
import { buildReport } from '../../src/protocol/hero68/codec';
import type {
  NativeBridge,
  NativeCustomFramePayload,
  NativeRhythmFramePayload,
} from '../bridge/hidBridge';
import type { ServiceContext } from '../context';
import type { NativeFrameTotals } from '../frameTelemetry';
import { latestSse } from '../latestSse';
import { nativeRhythmCommand, validateRhythm } from '../rhythm';
import { normalizeProfile } from './profileNormalizer';

export type RhythmRequestInput = {
  sessionId?: unknown;
  configuration?: unknown;
} & Record<string, unknown>;

export type RgbModeRequestInput = {
  mode?: unknown;
  sessionId?: unknown;
  expectedRevision?: unknown;
  profile?: unknown;
} & Record<string, unknown>;

export type RgbControllerDeps = {
  ctx: ServiceContext;
  getBridge: () => NativeBridge;
  exclusive: <T>(work: () => Promise<T>) => Promise<T>;
  needsAnalogHall: () => boolean;
  syncHall: () => Promise<void>;
};

export function createRgbController({
  ctx,
  getBridge,
  exclusive,
  needsAnalogHall,
  syncHall,
}: RgbControllerDeps) {
  const lightingTransport = {
    request: (packet: Uint8Array) => getBridge().request(packet),
  };

  function publishFrame(value: unknown) {
    ctx.lastPublishedFrame = value;
    const text = `data: ${JSON.stringify(value)}\n\n`;
    for (const client of ctx.frameClients) {
      if (client.destroyed || client.writableLength > 65536) {
        client.destroy();
        ctx.frameClients.delete(client);
      } else {
        ctx.frameWriters.get(client)?.(text);
      }
    }
  }

  function recordFrameGap(gapMs: number, totals?: NativeFrameTotals) {
    const nativeMax = totals?.outputMaxGapMs;
    const nativeLong = totals?.outputLongGaps;
    if (nativeMax !== undefined && Number.isFinite(nativeMax) && nativeMax >= 0) {
      ctx.maxGapMs = Math.max(ctx.maxGapMs, nativeMax);
    }
    const previousLong = ctx.gapsOver100;
    const hasNativeLong =
      nativeLong !== undefined && Number.isSafeInteger(nativeLong) && nativeLong >= 0;
    if (ctx.gapSession !== ctx.sessionId) {
      ctx.gapSession = ctx.sessionId;
      ctx.previousNativeLongGaps = 0;
    }
    if (hasNativeLong) {
      if (nativeLong < ctx.previousNativeLongGaps) {
        ctx.previousNativeLongGaps = 0;
      }
      ctx.gapsOver100 += nativeLong - ctx.previousNativeLongGaps;
      ctx.previousNativeLongGaps = nativeLong;
    }
    if (gapMs <= 0) {
      return;
    }
    ctx.maxGapMs = Math.max(ctx.maxGapMs, gapMs);
    ctx.frameGaps.push(gapMs);
    if (ctx.frameGaps.length > 512) {
      ctx.frameGaps.shift();
    }
    if (gapMs <= 100 && ctx.gapsOver100 === previousLong) {
      return;
    }
    if (!hasNativeLong) {
      ctx.gapsOver100++;
      ctx.previousNativeLongGaps++;
    }
    ctx.lastLongGapAt = new Date().toISOString();
    const now = performance.now();
    if (now - ctx.gapLogAt < 10000) {
      return;
    }
    ctx.gapLogAt = now;
    const message = `RGB frame gap ${(gapMs > 100 ? gapMs : ctx.maxGapMs).toFixed(1)}ms mode=${ctx.mode} render=${ctx.renderMs.toFixed(1)}ms encode=${ctx.encodeMs.toFixed(1)}ms write=${ctx.writeMs.toFixed(1)}ms reused=${ctx.reusedFrames} dropped=${ctx.droppedFrames} hallTimeouts=${ctx.timeouts} eventLoopP99=${(ctx.eventLoopDelay.percentile(99) / 1e6).toFixed(1)}ms ipcCoalesced=${ctx.bridgeIpc?.coalescedTelemetry ?? 0}`;
    setImmediate(() => ctx.log(message));
  }

  async function connect() {
    const bridge = getBridge();
    const identity = await bridge.request(
      buildReport({
        command: 0x82,
        zone: 1,
      }),
    );
    const detected = detectHeroDeviceModelFromUuid(identity.data);
    if (!detected) {
      throw Error('Device is not a supported HERO68/HERO84 keyboard');
    }
    ctx.deviceModel = detected;
    ctx.frameEncoder.setModel(detected);
    await bridge.syncModel();
    ctx.connected = true;
    ctx.lastError = null;
    ctx.hallSamples.clear();
    ctx.frameEncoder.reset();
    ctx.engine = ctx.playback.start(ctx.profile, ctx.deviceModel ?? undefined);
    ctx.outputHeld.clear();
    ctx.pendingInputs.length = 0;
    ctx.lastFrameAt = 0;
    if (ctx.tachyon) {
      try {
        await ctx.tachyonLighting.disable(lightingTransport);
      } catch (e) {
        ctx.connected = false;
        throw e;
      }
    }
    ctx.log(heroDeviceModel(detected).name.toUpperCase() + ' connected');
  }

  async function stop() {
    const bridge = getBridge();
    const previousMode = ctx.mode;
    ctx.mode = 'onboard';
    if (previousMode === 'rhythm') {
      await bridge.stopRhythm();
    }
    if (previousMode === 'custom') {
      await bridge.stopCustom();
    }
    ctx.customFrames.clear();
    ctx.audioState = 'stopped';
    ctx.audioLevel = 0;
    ctx.fps = 0;
    ctx.sessionId = randomUUID();
    ctx.frameSequence = 0;
    if (ctx.connected) {
      try {
        await bridge.request(
          buildReport({
            command: 8,
            zone: 2,
            data: [0, 0, 0],
          }),
        );
      } catch (e) {
        ctx.lastError = String(e);
      }
    }
    ctx.engine?.releaseAll();
    ctx.outputHeld.clear();
    ctx.pendingInputs.length = 0;
    ctx.persist();
    ctx.log('Onboard RGB restored');
    publishFrame({
      enabled: false,
      connected: false,
      sessionId: ctx.sessionId,
    });
    await syncHall();
  }

  /**
   * Advances the custom RGB simulation clock (~0.5ms firmware tick resolution),
   * feeds fresh analog Hall travel samples into reactive effects, and queues
   * the quantized 64-byte HID packets to the native bridge scheduler.
   */
  async function tick() {
    if (ctx.mode !== 'custom' || !ctx.profile || !ctx.engine || ctx.closing) {
      return;
    }
    if (!ctx.connected) {
      if (performance.now() < ctx.reconnectAt) {
        return;
      }
      await connect();
    }
    const started = performance.now();
    ctx.playback.advance();
    if (needsAnalogHall()) {
      const ids = new Set(rgbHallKeys(ctx.profile?.custom));
      const samples = [...ctx.hallSamples].filter(
        ([id]) => ids.has(id) && performance.now() - (ctx.hallReceivedAt.get(id) ?? 0) < 100,
      );
      ctx.engine!.setTravel(
        Object.fromEntries(samples.map(([id, s]) => [id, s.distanceUnits / 100])),
        Object.fromEntries(
          samples.map(([id, s]) => [
            id,
            {
              sequence: s.sequence,
              timestampMs: s.timestampMs,
            },
          ]),
        ),
      );
    }
    const keys = ctx.engine!.frame().keys;
    const renderedAt = performance.now();
    const frame = ctx.frameEncoder.prepare(keys);
    const encodedAt = performance.now();
    const submission = ++ctx.customSubmission;
    ctx.customFrames.set(submission, {
      keys: frame.keys,
      started,
      renderMs: renderedAt - started,
      encodeMs: encodedAt - renderedAt,
    });
    while (ctx.customFrames.size > 8) {
      ctx.customFrames.delete(ctx.customFrames.keys().next().value!);
    }
    await getBridge().queueFrame(submission, frame.packets);
  }

  function onCustomTick() {
    if (ctx.mode !== 'custom' || ctx.closing) {
      return;
    }
    if (ctx.customJob) {
      ctx.customTickPending = true;
      return;
    }
    ctx.customJob = true;
    void exclusive(tick)
      .catch(e => {
        ctx.connected = false;
        ctx.lastError = String(e);
        ctx.reconnectAt = performance.now() + 1000;
        publishFrame({
          enabled: ctx.mode !== 'onboard',
          connected: false,
          sessionId: ctx.sessionId,
        });
      })
      .finally(() => {
        ctx.customJob = false;
        if (ctx.customTickPending) {
          ctx.customTickPending = false;
          onCustomTick();
        }
      });
  }

  function onCustomFrame(value: NativeCustomFramePayload) {
    if (ctx.mode !== 'custom') {
      return;
    }
    const frame = ctx.customFrames.get(value.submission);
    const now = performance.now();
    ctx.audioState = 'stopped';
    ctx.audioError = '';
    ctx.audioLevel = 0;
    const delta = ctx.customDelivery.observe(value, value.submission !== ctx.lastCustomSubmission);
    ctx.connected = true;
    ctx.lastError = null;
    ctx.frames += delta.frames;
    ctx.windowFrames += delta.frames;
    ctx.packets += delta.packets;
    ctx.frameMs = value.frameMs;
    ctx.droppedFrames = value.droppedFrames;
    ctx.reusedFrames = value.reusedFrames;
    ctx.windowRendered += delta.rendered;
    ctx.lastCustomSubmission = value.submission;
    ctx.writeMs = value.frameMs;
    if (frame) {
      ctx.renderMs = frame.renderMs;
      ctx.encodeMs = frame.encodeMs;
    }
    recordFrameGap(value.gapMs, value);
    if (frame) {
      while (ctx.pendingInputs.length && ctx.pendingInputs[0] <= frame.started) {
        ctx.inputLatencies.push(now - ctx.pendingInputs.shift()!);
        if (ctx.inputLatencies.length > 256) {
          ctx.inputLatencies.shift();
        }
      }
      if (ctx.frameClients.size) {
        publishFrame({
          enabled: true,
          connected: true,
          mode: 'custom',
          keys: frame.keys,
          sequence: ++ctx.frameSequence,
          sessionId: ctx.sessionId,
        });
      }
    }
    if (!ctx.frameClients.size) {
      ctx.frameSequence++;
    }
  }

  function rhythmPreviewKeys(colors: string[]) {
    const keys: Record<string, string> = Object.fromEntries(
      HERO68_KEY_IDS.map((id, i) => [id, colors[i]]),
    );
    if (ctx.deviceModel === 'hero84') {
      for (const [id, source] of Object.entries(HERO84_COLOR_SOURCES)) {
        keys[id] = keys[source];
      }
    }
    return keys;
  }

  function onNativeFrame(value: NativeRhythmFramePayload) {
    if (ctx.mode !== 'rhythm' || value.colors?.length !== 68) {
      return;
    }
    const delta = ctx.rhythmDelivery.observe(value);
    ctx.connected = true;
    ctx.lastError = null;
    ctx.frames += delta.frames;
    ctx.windowFrames += delta.frames;
    ctx.packets += delta.packets;
    ctx.frameMs = value.frameMs;
    ctx.droppedFrames = value.droppedFrames;
    ctx.audioState = value.audioState;
    ctx.audioError = value.audioError;
    ctx.audioLevel = value.audioLevel;
    ctx.audioEndpoint = value.audioEndpoint;
    ctx.sampleRate = value.sampleRate;
    if (value.audioToWriteMs >= 0) {
      ctx.audioLatencies.push(value.audioToWriteMs);
      if (ctx.audioLatencies.length > 512) {
        ctx.audioLatencies.shift();
      }
    }
    if (value.captureToWriteMs >= 0) {
      ctx.captureLatencies.push(value.captureToWriteMs);
      if (ctx.captureLatencies.length > 512) {
        ctx.captureLatencies.shift();
      }
    }
    if (value.audioTimestampInvalid) {
      ctx.audioTimestampInvalid++;
    }
    ctx.renderMs = value.renderMs;
    ctx.encodeMs = value.encodeMs;
    ctx.writeMs = value.writeMs;
    recordFrameGap(value.gapMs, value);
    const now = performance.now();
    if (now - ctx.windowStart >= 1000) {
      ctx.fps = (ctx.windowFrames * 1000) / (now - ctx.windowStart);
      ctx.windowFrames = 0;
      ctx.windowStart = now;
    }
    if (ctx.frameClients.size) {
      publishFrame({
        enabled: true,
        connected: true,
        mode: 'rhythm',
        keys: rhythmPreviewKeys(value.colors),
        audioLevel: ctx.audioLevel,
        sequence: ++ctx.frameSequence,
        sessionId: ctx.sessionId,
        sideOutput: false,
      });
    } else {
      ctx.frameSequence++;
    }
  }

  function onRgbKey(id: string, pressed: boolean) {
    if (
      ctx.mode !== 'custom' ||
      !ctx.engine ||
      (pressed ? ctx.outputHeld.has(id) : !ctx.outputHeld.has(id))
    ) {
      return;
    }
    if (pressed) {
      ctx.outputHeld.add(id);
    } else {
      ctx.outputHeld.delete(id);
    }
    const at = performance.now();
    ctx.pendingInputs.push(at);
    ctx.playback.advance();
    ctx.engine.event(id, pressed);
    ctx.inputTransitions++;
  }

  /**
   * Toggles Tachyon Mode (low-latency scan priority) by suspending active RGB
   * streams, snapshot-zeroing both physical LED zones, and restoring the prior
   * lighting mode when disabled.
   */
  async function setTachyon(enabled: boolean) {
    const bridge = getBridge();
    if (enabled) {
      if (!ctx.tachyon) {
        ctx.tachyonPreviousMode = ctx.mode;
      }
      ctx.tachyon = true;
      ctx.persistTachyon();
      await stop();
      await bridge.stopCustom();
      await bridge.stopRhythm();
      try {
        if (!ctx.connected) {
          await connect();
        } else {
          await ctx.tachyonLighting.disable(lightingTransport);
        }
      } catch (e) {
        ctx.connected = false;
        ctx.lastError = String(e);
        throw e;
      }
      publishFrame({
        enabled: false,
        connected: ctx.connected,
        mode: 'onboard',
        tachyon: true,
        sessionId: ctx.sessionId,
      });
    } else {
      if (!ctx.connected) {
        await connect();
      }
      await ctx.tachyonLighting.restore(lightingTransport);
      ctx.tachyon = false;
      const restoreMode = ctx.tachyonPreviousMode;
      ctx.tachyonPreviousMode = 'onboard';
      ctx.persistTachyon();
      if (restoreMode === 'rhythm') {
        const config = validateRhythm(ctx.rhythmConfig);
        nativeRhythmCommand(config);
        if (!ctx.connected) {
          try {
            await connect();
          } catch (e) {
            ctx.lastError = String(e);
            ctx.connected = false;
          }
        }
        await bridge.configureRhythm(config);
        ctx.rhythmConfig = config;
        ctx.mode = 'rhythm';
        ctx.savedMode = 'rhythm';
        ctx.engine?.releaseAll();
        ctx.outputHeld.clear();
        ctx.sessionId = randomUUID();
        ctx.frameSequence = 0;
        ctx.frames = 0;
        ctx.packets = 0;
        ctx.timeouts = 0;
        ctx.maxGapMs = 0;
        ctx.droppedFrames = 0;
        ctx.audioTimestampInvalid = 0;
        ctx.frameGaps.length = 0;
        ctx.audioLatencies.length = 0;
        ctx.captureLatencies.length = 0;
        ctx.windowFrames = 0;
        ctx.windowStart = performance.now();
        ctx.fps = 0;
        ctx.audioState = 'connecting';
        ctx.audioError = '';
        ctx.persistRhythm();
        ctx.persist();
        publishFrame({
          enabled: true,
          connected: ctx.connected,
          mode: 'rhythm',
          sessionId: ctx.sessionId,
          sequence: ctx.frameSequence,
        });
        ctx.log('Rhythm Sync resumed after Tachyon');
      } else if (restoreMode === 'custom' && ctx.profile) {
        if (ctx.mode === 'rhythm') {
          await bridge.stopRhythm();
        }
        if (ctx.mode !== 'custom') {
          ctx.engine = ctx.playback.start(ctx.profile, ctx.deviceModel ?? undefined);
          ctx.outputHeld.clear();
          ctx.pendingInputs.length = 0;
        }
        ctx.mode = 'custom';
        ctx.savedMode = 'custom';
        ctx.customFrames.clear();
        ctx.reusedFrames = 0;
        ctx.windowRendered = 0;
        ctx.renderFps = 0;
        await bridge.startCustom();
        ctx.frameEncoder.reset();
        ctx.sessionId = randomUUID();
        ctx.frameSequence = 0;
        publishFrame({
          enabled: true,
          connected: ctx.connected,
          sessionId: ctx.sessionId,
          sequence: 0,
        });
        ctx.reconnectAt = 0;
        ctx.frames = 0;
        ctx.packets = 0;
        ctx.hallSnapshots = 0;
        ctx.timeouts = 0;
        ctx.maxGapMs = 0;
        ctx.gapsOver100 = 0;
        ctx.lastLongGapAt = null;
        ctx.frameGaps.length = 0;
        ctx.eventLoopDelay.reset();
        ctx.lastFrameAt = 0;
        ctx.persist();
        ctx.log('Custom RGB resumed after Tachyon');
      } else {
        ctx.mode = 'onboard';
        ctx.savedMode = 'onboard';
        ctx.persist();
        publishFrame({
          enabled: false,
          connected: ctx.connected,
          mode: 'onboard',
          tachyon: false,
          sessionId: ctx.sessionId,
        });
        ctx.log('Onboard RGB restored after Tachyon');
      }
    }
  }

  /**
   * Starts or live-updates native WASAPI Rhythm Sync, enforcing sessionId locks
   * on live edits so stale browser tabs cannot overwrite active audio settings.
   */
  async function handleRhythmRequest(url: string, input: RhythmRequestInput) {
    const bridge = getBridge();
    await exclusive(async () => {
      if (ctx.tachyon) {
        throw Error('Turn off Tachyon Mode before starting RGB effects.');
      }
      const editing = url === '/rhythm/config';
      if (editing && (ctx.mode !== 'rhythm' || input.sessionId !== ctx.sessionId)) {
        throw Error('Stale rhythm editor session; configuration was not applied');
      }
      const config = validateRhythm(
        input.configuration ?? (url === '/start' ? ctx.rhythmConfig : input),
      );
      nativeRhythmCommand(config);
      if (!ctx.connected) {
        try {
          await connect();
        } catch (e) {
          ctx.lastError = String(e);
          ctx.connected = false;
        }
      }
      await bridge.configureRhythm(config);
      ctx.rhythmConfig = config;
      ctx.mode = 'rhythm';
      ctx.savedMode = 'rhythm';
      if (!editing) {
        ctx.engine?.releaseAll();
        ctx.outputHeld.clear();
        ctx.sessionId = randomUUID();
        ctx.frameSequence = 0;
        ctx.frames = 0;
        ctx.packets = 0;
        ctx.timeouts = 0;
        ctx.maxGapMs = 0;
        ctx.droppedFrames = 0;
        ctx.audioTimestampInvalid = 0;
        ctx.frameGaps.length = 0;
        ctx.audioLatencies.length = 0;
        ctx.captureLatencies.length = 0;
        ctx.windowFrames = 0;
        ctx.windowStart = performance.now();
        ctx.fps = 0;
        ctx.audioState = 'connecting';
        ctx.audioError = '';
      }
      ctx.persistRhythm();
      ctx.persist();
      publishFrame({
        enabled: true,
        connected: ctx.connected,
        mode: 'rhythm',
        sessionId: ctx.sessionId,
        sequence: ctx.frameSequence,
      });
      await syncHall();
    });
  }

  /**
   * Handles transitions between onboard and custom RGB modes and applies live
   * custom presets guarded by `sessionId` and optimistic `expectedRevision`
   * checks (returning HTTP 409 on concurrent editor conflicts).
   */
  async function handleRgbModeRequest(url: string, input: RgbModeRequestInput) {
    const bridge = getBridge();
    await exclusive(async () => {
      if (url === '/stop' || url === '/shutdown' || (url === '/mode' && input.mode === 'onboard')) {
        await stop();
        return;
      }
      if (ctx.tachyon) {
        throw Error('Turn off Tachyon Mode before starting RGB effects.');
      }
      if (url === '/mode' && input.mode !== 'custom') {
        throw Error('Expected onboard or custom mode');
      }
      if (url === '/preset' && input.sessionId !== ctx.sessionId) {
        throw Error('Stale RGB editor session; preset was not applied');
      }
      if (url === '/preset' && ctx.mode !== 'custom') {
        throw Error('Custom RGB is not running');
      }
      if (url === '/preset' && input.expectedRevision !== undefined) {
        if (
          typeof input.expectedRevision !== 'number' ||
          !Number.isInteger(input.expectedRevision) ||
          input.expectedRevision < 0
        ) {
          throw Error('Invalid custom revision');
        }
        if (input.expectedRevision !== ctx.customRevision) {
          throw Object.assign(
            Error('Custom configuration changed in another editor. Your draft was preserved.'),
            { status: 409 },
          );
        }
      }
      if (
        url === '/preset' ||
        (url === '/start' && Object.keys(input).length) ||
        (url === '/mode' && input.profile)
      ) {
        ctx.profile = normalizeProfile(
          url === '/mode' || url === '/preset' ? input.profile : input,
        );
        ctx.customRevision++;
        if (ctx.engine) {
          ctx.engine.configure(ctx.profile);
        } else {
          ctx.engine = ctx.playback.start(ctx.profile, ctx.deviceModel ?? undefined);
        }
        if (url === '/preset') {
          ctx.presetSave.schedule();
        } else {
          ctx.persist();
        }
      }
      if (url === '/start' || url === '/mode') {
        if (ctx.mode === 'rhythm') {
          await bridge.stopRhythm();
        }
        if (!ctx.profile) {
          throw Error('Send a preset first');
        }
        if (ctx.mode !== 'custom') {
          ctx.engine = ctx.playback.start(ctx.profile, ctx.deviceModel ?? undefined);
          ctx.outputHeld.clear();
          ctx.pendingInputs.length = 0;
        }
        ctx.mode = 'custom';
        ctx.savedMode = 'custom';
        ctx.customFrames.clear();
        ctx.reusedFrames = 0;
        ctx.windowRendered = 0;
        ctx.renderFps = 0;
        await bridge.startCustom();
        ctx.frameEncoder.reset();
        ctx.sessionId = randomUUID();
        ctx.frameSequence = 0;
        publishFrame({
          enabled: true,
          connected: ctx.connected,
          sessionId: ctx.sessionId,
          sequence: 0,
        });
        ctx.reconnectAt = 0;
        ctx.frames = 0;
        ctx.packets = 0;
        ctx.hallSnapshots = 0;
        ctx.timeouts = 0;
        ctx.maxGapMs = 0;
        ctx.gapsOver100 = 0;
        ctx.lastLongGapAt = null;
        ctx.frameGaps.length = 0;
        ctx.eventLoopDelay.reset();
        ctx.lastFrameAt = 0;
        ctx.persist();
        ctx.log('Custom RGB started');
      }
      await syncHall();
    });
  }

  function subscribeFrames(req: IncomingMessage, res: ServerResponse) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    ctx.frameClients.add(res);
    const send = latestSse(res);
    ctx.frameWriters.set(res, send);
    if (ctx.lastPublishedFrame) {
      send(`data: ${JSON.stringify(ctx.lastPublishedFrame)}\n\n`);
    }
    const heartbeat = setInterval(() => {
      if (!res.writableLength) {
        res.write(': keepalive\n\n');
      }
    }, 15000);
    heartbeat.unref();
    req.on('close', () => {
      clearInterval(heartbeat);
      ctx.frameClients.delete(res);
    });
  }

  return {
    publishFrame,
    recordFrameGap,
    connect,
    stop,
    tick,
    onCustomTick,
    onCustomFrame,
    onNativeFrame,
    onRgbKey,
    setTachyon,
    handleRhythmRequest,
    handleRgbModeRequest,
    subscribeFrames,
  };
}

export type RgbController = ReturnType<typeof createRgbController>;
