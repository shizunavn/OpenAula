import { randomUUID } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { HeroDeviceModelId } from '../src/keyboard/devices';
import {
  defaultGamepad,
  GamepadToggleTracker,
  validateGamepad,
  type GamepadConfiguration,
} from '../src/keyboard/gamepad';
import type { GamepadStatus, HallKeyMetric, SharedHallSample } from '../src/protocol/gamepadService';
import { HERO84_KEY_POSITIONS } from '../src/protocol/hero68/keyPositions';
import type { RgbProfile } from '../src/protocol/hero68/rgb';
import {
  TachyonLighting,
  validTachyonSnapshot,
  type TachyonLightingSnapshot,
} from '../src/protocol/hero68/tachyonLighting';
import { CustomPlayback } from './customPlayback';
import { deferredSave } from './deferredSave';
import { RgbFrameEncoder } from './frame';
import { FrameDelivery } from './frameTelemetry';
import { HallBroker } from './hallBroker';
import type { latestSse } from './latestSse';
import { normalizeProfile } from './rgb/profileNormalizer';
import { defaultRhythm, restoreRhythm, type RhythmConfiguration } from './rhythm';

export type HallRecord = SharedHallSample;

export type HallClient = {
  id: string;
  keys: Set<string>;
  pending: Map<string, HallRecord>;
  lastSent: number;
};

export type BridgeIpcStats = {
  customTicks: number;
  customTickMaxGapMs?: number;
  queuedReplies: number;
  queuedKeys: number;
  queuedTelemetry: number;
  coalescedTelemetry: number;
};

export type ServiceContextOptions = {
  port: number;
  stateDir: string;
  coreVersion: string;
  driverInstalled: boolean;
  updateOperation?: string;
  origins: Set<string>;
  log: (message: string) => void;
};

export function createServiceContext(options: ServiceContextOptions) {
  const { stateDir, log } = options;
  const tachyonFile = path.join(stateDir, 'tachyon.json');

  let initialTachyon = false;
  let initialTachyonSnapshot: TachyonLightingSnapshot | null = null;
  let initialTachyonPreviousMode: 'onboard' | 'custom' | 'rhythm' = 'onboard';

  try {
    const saved = JSON.parse(readFileSync(tachyonFile, 'utf8'));
    initialTachyon = saved.enabled === true;
    if (validTachyonSnapshot(saved.snapshot)) {
      initialTachyonSnapshot = saved.snapshot;
    }
    if (['onboard', 'custom', 'rhythm'].includes(saved.previousMode)) {
      initialTachyonPreviousMode = saved.previousMode;
    }
  } catch (ignoredError) {
    /* Ignored non-fatal error. */
    void ignoredError;
  }

  let initialRhythmConfig: RhythmConfiguration = defaultRhythm();
  try {
    initialRhythmConfig = restoreRhythm(
      JSON.parse(readFileSync(path.join(stateDir, 'rhythm-preset.json'), 'utf8')),
    );
  } catch (ignoredError) {
    /* Ignored non-fatal error. */
    void ignoredError;
  }

  let initialProfile: RgbProfile | null = null;
  let initialSavedMode: 'onboard' | 'custom' | 'rhythm' = 'onboard';
  let initialMode: 'onboard' | 'custom' | 'rhythm' = 'onboard';
  try {
    const saved = JSON.parse(readFileSync(path.join(stateDir, 'preset.json'), 'utf8'));
    if (saved.profile) {
      initialProfile = normalizeProfile(saved.profile);
    }
    initialSavedMode = saved.savedMode ?? saved.mode ?? (saved.enabled ? 'custom' : 'onboard');
    initialMode =
      saved.mode === 'rhythm'
        ? 'rhythm'
        : saved.mode === 'custom' || (saved.mode === undefined && saved.enabled === true)
          ? 'custom'
          : 'onboard';
  } catch (ignoredError) {
    /* Ignored non-fatal error. */
    void ignoredError;
  }

  if (initialTachyon) {
    if (initialTachyonPreviousMode === 'onboard' && ['custom', 'rhythm'].includes(initialSavedMode)) {
      initialTachyonPreviousMode = initialSavedMode;
    }
    initialMode = 'onboard';
  }

  const initialGamepadConfigs: Record<number, GamepadConfiguration> = {
    0: defaultGamepad(),
    1: defaultGamepad(),
    2: defaultGamepad(),
  };
  let initialGamepadSlot = 0;
  try {
    const v = JSON.parse(readFileSync(path.join(stateDir, 'gamepad.json'), 'utf8'));
    for (const slot of [0, 1, 2]) {
      if (v.profiles?.[slot]) {
        initialGamepadConfigs[slot] = validateGamepad(v.profiles[slot]);
      }
    }
    if ([0, 1, 2].includes(v.slot)) {
      initialGamepadSlot = v.slot;
    }
  } catch (ignoredError) {
    /* Ignored non-fatal error. */
    void ignoredError;
  }

  const eventLoopDelay = monitorEventLoopDelay({
    resolution: 5,
  });
  eventLoopDelay.enable();

  const playback = new CustomPlayback(initialProfile);

  const ctx = {
    ...options,
    tachyon: initialTachyon,
    tachyonPreviousMode: initialTachyonPreviousMode,
    tachyonLighting: null as unknown as TachyonLighting,
    profile: initialProfile,
    mode: initialMode,
    savedMode: initialSavedMode,
    rhythmConfig: initialRhythmConfig,
    connected: false,
    closing: false,
    updating: false,
    customRevision: 0,
    configurationBusy: false,
    frameEncoder: new RgbFrameEncoder(),
    deviceModel: null as HeroDeviceModelId | null,
    playback,
    engine: playback.engine,
    reconnectAt: 0,
    lastError: null as string | null,
    frames: 0,
    packets: 0,
    hallSnapshots: 0,
    timeouts: 0,
    lastFrameAt: 0,
    maxGapMs: 0,
    frameMs: 0,
    eventLoopDelay,
    cpuPrevious: process.cpuUsage(),
    cpuAt: performance.now(),
    cpuPercent: 0,
    frameGaps: [] as number[],
    gapsOver100: 0,
    lastLongGapAt: null as string | null,
    gapLogAt: -Infinity,
    gapSession: '',
    previousNativeLongGaps: 0,
    sessionId: randomUUID(),
    frameSequence: 0,
    rawInputReady: false,
    inputTransitions: 0,
    outputHeld: new Set<string>(),
    inputLatencies: [] as number[],
    pendingInputs: [] as number[],
    windowStart: performance.now(),
    windowFrames: 0,
    fps: 0,
    customSubmission: 0,
    lastCustomSubmission: 0,
    reusedFrames: 0,
    windowRendered: 0,
    renderFps: 0,
    customJob: false,
    customTickPending: false,
    customFrames: new Map<
      number,
      {
        keys: Record<string, string>;
        started: number;
        renderMs: number;
        encodeMs: number;
      }
    >(),
    customDelivery: new FrameDelivery(),
    rhythmDelivery: new FrameDelivery(),
    bridgeIpc: undefined as BridgeIpcStats | undefined,
    audioState: 'stopped',
    audioError: '',
    audioLevel: 0,
    audioEndpoint: '',
    sampleRate: 0,
    droppedFrames: 0,
    audioTimestampInvalid: 0,
    renderMs: 0,
    encodeMs: 0,
    writeMs: 0,
    audioLatencies: [] as number[],
    captureLatencies: [] as number[],
    frameClients: new Set<ServerResponse>(),
    frameWriters: new WeakMap<ServerResponse, ReturnType<typeof latestSse>>(),
    lastPublishedFrame: null as unknown,
    hallClients: new Map<ServerResponse, HallClient>(),
    hallSamples: new Map<string, HallRecord>(),
    hallReceivedAt: new Map<string, number>(),
    hallBroker: new HallBroker(),
    hallPolls: 0,
    hallMetrics: {
      requests: 0,
      timeouts: 0,
      keys: [] as HallKeyMetric[],
    } as {
      requests: number;
      timeouts: number;
      keys: HallKeyMetric[];
      nativeCpuPercent?: number;
      nativeRssMB?: number;
    },
    lastHallCommand: '',
    hallSyncScheduled: false,
    hallSyncAgain: false,
    keyByPosition: new Map(
      Object.entries(HERO84_KEY_POSITIONS).map(([id, pos]) => [pos, id]),
    ),
    gamepadClients: new Set<ServerResponse>(),
    gamepadInputClients: new Map<ServerResponse, ReturnType<typeof latestSse>>(),
    inputStreamScheduled: false,
    inputStreamApplied: false,
    gamepadState: {
      enabled: false,
      armed: false,
      stale: true,
      xinputVerified: false,
      userIndex: -1,
      neutralCount: 0,
      error: '',
      report: {
        buttons: 0,
        lx: 0,
        ly: 0,
        rx: 0,
        ry: 0,
        lt: 0,
        rt: 0,
      },
    } as Pick<
      GamepadStatus,
      | 'enabled'
      | 'armed'
      | 'stale'
      | 'xinputVerified'
      | 'userIndex'
      | 'neutralCount'
      | 'error'
      | 'report'
      | 'keyboardHookSupported'
      | 'fastInputSupported'
    >,
    gamepadSlot: initialGamepadSlot,
    gamepadConfigurations: initialGamepadConfigs,
    gamepadToggleTracker: new GamepadToggleTracker(),
    lastHotkeyToggleAt: -Infinity,
    hotkeyToggleInFlight: false,
    firmwareRecoveryScheduled: false,
    firmwareRecoveryTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    firmwareRecoveryAttempt: 0,
    presetSave: null as unknown as ReturnType<typeof deferredSave>,
    persistTachyon() {
      writeFileSync(
        tachyonFile + '.tmp',
        JSON.stringify({
          enabled: ctx.tachyon,
          snapshot: ctx.tachyonLighting.snapshot,
          previousMode: ctx.tachyonPreviousMode,
        }),
      );
      renameSync(tachyonFile + '.tmp', tachyonFile);
    },
    persistRhythm() {
      const file = path.join(stateDir, 'rhythm-preset.json');
      writeFileSync(file + '.tmp', JSON.stringify(ctx.rhythmConfig));
      renameSync(file + '.tmp', file);
    },
    persist() {
      ctx.presetSave.cancel();
      const file = path.join(stateDir, 'preset.json');
      try {
        const old = JSON.parse(readFileSync(file, 'utf8'));
        const previous = old.profile?.custom?.layers
          ?.map((layer: { id: string; effect: string }) => `${layer.id}:${layer.effect}`)
          .join('|');
        const current = ctx.profile?.custom?.layers
          ?.map(layer => `${layer.id}:${layer.effect}`)
          .join('|');
        if (previous !== current) {
          writeFileSync(
            path.join(stateDir, `preset-layer-backup-${Date.now()}.json`),
            JSON.stringify(old),
          );
        }
      } catch (ignoredError) {
        /* No previous valid preset. */
        void ignoredError;
      }
      writeFileSync(
        file + '.tmp',
        JSON.stringify({
          version: 3,
          mode: ctx.mode,
          savedMode: ctx.savedMode,
          enabled: ctx.mode !== 'onboard',
          profile: ctx.profile,
        }),
      );
      renameSync(file + '.tmp', file);
    },
    persistGamepad() {
      const file = path.join(stateDir, 'gamepad.json');
      writeFileSync(
        file + '.tmp',
        JSON.stringify({
          version: 1,
          slot: ctx.gamepadSlot,
          profiles: ctx.gamepadConfigurations,
        }),
      );
      renameSync(file + '.tmp', file);
    },
  };

  ctx.tachyonLighting = new TachyonLighting(initialTachyonSnapshot, snapshot => {
    ctx.tachyonLighting.snapshot = snapshot;
    ctx.persistTachyon();
  });

  ctx.presetSave = deferredSave(
    () => ctx.persist(),
    error => {
      ctx.lastError = String(error);
      log('Preset save failed: ' + String(error));
    },
  );

  return ctx;
}

export type ServiceContext = ReturnType<typeof createServiceContext>;
