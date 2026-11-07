import { useSyncExternalStore } from 'react';
import { rgbService } from './rgbService';
import { publishLightingFrame, type LightingFrame } from '../keyboard/lightingPreviewBus';
import { subscribeRgbService, getRgbServiceState } from './rgbServiceState';
import { CustomRgbEngine, restoreCustomRgb } from '../keyboard/customRgb';
import { renderRhythmAudioFrame, type RhythmConfiguration } from '../keyboard/rhythm';
import { acceptsRgbPreviewKey } from '../keyboard/rgbPreviewInput';
import type { RgbProfile } from './hero68/rgb';
import {
  buildXsydRgbWriteFrame,
  XSYD_MAX_BRIGHTNESS,
  XSYD_PER_KEY_RGB_MODE,
  XsydCustomRgbStreamer,
  xsydDeviceManager,
} from './xsyd/device';

let frame: LightingFrame | null = null;
let lastSession = '';
let lastSequence = -1;
const listeners = new Set<() => void>();
let closeStatus: (() => void) | undefined;
let closeFrames: (() => void) | undefined;
let generation = 0;

// --- Persistent WIN 68 HE MAX (XSYD) Custom RGB & Rhythm Background Runner ---
let xsydCustomActive = false;
let xsydCustomProfile: RgbProfile | null = null;
let xsydCustomEngine: CustomRgbEngine | null = null;

let xsydRhythmActive = false;
let xsydRhythmConfig: RhythmConfiguration | null = null;
let xsydRhythmAudioLevel = 0;
let xsydRhythmSideFrame: string[] = Array(18).fill('#181c20');
let xsydRhythmFps = 30;
let xsydRhythmAudioSource: 'synth' | 'system' | 'mic' = 'synth';
let xsydRhythmSampleRate = 48000;
let xsydAudioContext: AudioContext | null = null;
let xsydAudioAnalyser: AnalyserNode | null = null;
let xsydAudioStream: MediaStream | null = null;
let xsydFreqBuffer: Uint8Array | null = null;
let xsydTimeBuffer: Uint8Array | null = null;

const xsydStreamer = new XsydCustomRgbStreamer();
let xsydStreamBusy = false;
let xsydTimerHandle: ReturnType<typeof setInterval> | null = null;
let xsydElapsedMs = 110;
let xsydLastTickAt = 0;
let xsydKeyListenersAttached = false;
const xsydHeldKeys = new Set<string>();
const xsydStateListeners = new Set<() => void>();

export type XsydRhythmStats = {
  active: boolean;
  fps: number;
  audioLevel: number;
  side: string[];
  audioSource: 'synth' | 'system' | 'mic';
  sampleRate: number;
  configuration: RhythmConfiguration | null;
};

let xsydRhythmStatsSnapshot: XsydRhythmStats = {
  active: false,
  fps: 0,
  audioLevel: 0,
  side: xsydRhythmSideFrame,
  audioSource: 'synth',
  sampleRate: 48000,
  configuration: null,
};

function updateXsydRhythmStatsSnapshot() {
  xsydRhythmStatsSnapshot = {
    active: xsydRhythmActive,
    fps: xsydRhythmActive ? xsydRhythmFps : 0,
    audioLevel: xsydRhythmActive ? xsydRhythmAudioLevel : 0,
    side: xsydRhythmSideFrame,
    audioSource: xsydRhythmAudioSource,
    sampleRate: xsydRhythmSampleRate,
    configuration: xsydRhythmConfig,
  };
}

function notifyXsydState() {
  updateXsydRhythmStatsSnapshot();
  xsydStateListeners.forEach(l => l());
}

function publish(next: LightingFrame | null) {
  frame = next;
  if (next) {
    publishLightingFrame(next);
  }
  listeners.forEach(listener => listener());
}

function streamFrameToXsyd(keysFrame: LightingFrame, rhythmCycle = false) {
  if (!xsydDeviceManager.connected || xsydStreamBusy) {
    return;
  }
  xsydStreamBusy = true;
  const op = rhythmCycle
    ? xsydStreamer.pushRhythmCycle(xsydDeviceManager, keysFrame)
    : xsydStreamer.pushFrameDelta(xsydDeviceManager, keysFrame);
  void op
    .catch(() => {})
    .finally(() => {
      xsydStreamBusy = false;
    });
}

function cleanupXsydAudioCapture() {
  if (xsydAudioStream) {
    for (const track of xsydAudioStream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Ignore track stop errors
      }
    }
    xsydAudioStream = null;
  }
  if (xsydAudioContext) {
    void xsydAudioContext.close().catch(() => {});
    xsydAudioContext = null;
  }
  xsydAudioAnalyser = null;
  xsydFreqBuffer = null;
  xsydTimeBuffer = null;
}

async function setupXsydAudioCapture(endpoint: string): Promise<'synth' | 'system' | 'mic'> {
  cleanupXsydAudioCapture();
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.mediaDevices) {
    xsydRhythmAudioSource = 'synth';
    return 'synth';
  }
  if (endpoint !== 'web-system' && endpoint !== 'web-mic') {
    xsydRhythmAudioSource = 'synth';
    return 'synth';
  }
  try {
    let stream: MediaStream;
    if (endpoint === 'web-system' && navigator.mediaDevices.getDisplayMedia) {
      stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      });
      // Stop video tracks immediately if the browser required video=true for tab/system audio capture
      for (const vTrack of stream.getVideoTracks()) {
        vTrack.stop();
      }
      if (stream.getAudioTracks().length === 0) {
        throw new Error('No audio track shared. Enable "Share audio" in the browser prompt.');
      }
    } else {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      throw new Error('Web Audio API is not supported in this browser.');
    }
    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.65;
    source.connect(analyser);

    xsydAudioStream = stream;
    xsydAudioContext = ctx;
    xsydAudioAnalyser = analyser;
    xsydRhythmSampleRate = ctx.sampleRate || 48000;
    xsydFreqBuffer = new Uint8Array(analyser.frequencyBinCount);
    xsydTimeBuffer = new Uint8Array(analyser.fftSize);
    xsydRhythmAudioSource = endpoint === 'web-system' ? 'system' : 'mic';
    return xsydRhythmAudioSource;
  } catch {
    cleanupXsydAudioCapture();
    xsydRhythmAudioSource = 'synth';
    return 'synth';
  }
}

function onXsydWindowKeyDown(event: KeyboardEvent) {
  if (!xsydCustomActive || !xsydCustomEngine || !acceptsRgbPreviewKey(event)) {
    return;
  }
  xsydHeldKeys.add(event.code);
  xsydCustomEngine.event(event.code, true);
}

function onXsydWindowKeyUp(event: KeyboardEvent) {
  if (!xsydCustomActive || !xsydCustomEngine) {
    return;
  }
  if (xsydHeldKeys.delete(event.code)) {
    xsydCustomEngine.event(event.code, false);
  }
}

function onXsydWindowBlur() {
  if (!xsydCustomEngine) {
    return;
  }
  xsydHeldKeys.clear();
  xsydCustomEngine.releaseAll();
}

function attachXsydKeyListeners() {
  if (xsydKeyListenersAttached || typeof window === 'undefined') {
    return;
  }
  xsydKeyListenersAttached = true;
  window.addEventListener('keydown', onXsydWindowKeyDown);
  window.addEventListener('keyup', onXsydWindowKeyUp);
  window.addEventListener('blur', onXsydWindowBlur);
}

function detachXsydKeyListeners() {
  if (!xsydKeyListenersAttached || typeof window === 'undefined') {
    return;
  }
  xsydKeyListenersAttached = false;
  window.removeEventListener('keydown', onXsydWindowKeyDown);
  window.removeEventListener('keyup', onXsydWindowKeyUp);
  window.removeEventListener('blur', onXsydWindowBlur);
}

function xsydTick() {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const dt = xsydLastTickAt > 0 ? Math.max(1, Math.min(100, now - xsydLastTickAt)) : 33;
  xsydLastTickAt = now;
  xsydElapsedMs += dt;

  if (xsydRhythmActive && xsydRhythmConfig) {
    if (xsydAudioAnalyser && xsydFreqBuffer && xsydTimeBuffer) {
      xsydAudioAnalyser.getByteFrequencyData(xsydFreqBuffer as Uint8Array<ArrayBuffer>);
      xsydAudioAnalyser.getByteTimeDomainData(xsydTimeBuffer as Uint8Array<ArrayBuffer>);
    }
    const rendered = renderRhythmAudioFrame(
      xsydRhythmConfig,
      xsydElapsedMs,
      xsydAudioAnalyser ? xsydFreqBuffer : null,
      xsydAudioAnalyser ? xsydTimeBuffer : null,
      'win68HeMax'
    );
    const releaseFactor = Math.max(0.15, Math.min(0.92, xsydRhythmConfig.releaseMs / 220));
    xsydRhythmAudioLevel =
      rendered.level >= xsydRhythmAudioLevel
        ? rendered.level
        : xsydRhythmAudioLevel * releaseFactor + rendered.level * (1 - releaseFactor);
    xsydRhythmSideFrame = rendered.side;
    xsydRhythmFps = Math.round((1000 / dt) * 10) / 10;
    publish(rendered.keys);
    streamFrameToXsyd(rendered.keys, true);
    notifyXsydState();
    return;
  }

  if (!xsydCustomActive || !xsydCustomEngine) {
    return;
  }
  xsydCustomEngine.advance(xsydElapsedMs);
  const rendered = xsydCustomEngine.frame();
  publish(rendered.keys);
  streamFrameToXsyd(rendered.keys, false);
}

export function isXsydCustomRgbActive(): boolean {
  return xsydCustomActive;
}

export function isXsydRhythmActive(): boolean {
  return xsydRhythmActive;
}

export function getXsydRhythmStats(): XsydRhythmStats {
  return xsydRhythmStatsSnapshot;
}

export function useXsydRhythmStats(): XsydRhythmStats {
  return useSyncExternalStore(
    subscribeXsydCustomRgb,
    getXsydRhythmStats,
    getXsydRhythmStats
  );
}

export function getXsydCustomRgbFrame(): LightingFrame | null {
  return xsydCustomActive || xsydRhythmActive ? frame : null;
}

export function subscribeXsydCustomRgb(listener: () => void): () => void {
  xsydStateListeners.add(listener);
  return () => {
    xsydStateListeners.delete(listener);
  };
}

export function updateXsydCustomRgbProfile(profile: RgbProfile): void {
  xsydCustomProfile = profile;
  if (xsydCustomEngine) {
    xsydCustomEngine.configure(profile);
    if (xsydCustomActive) {
      const rendered = xsydCustomEngine.frame();
      publish(rendered.keys);
      streamFrameToXsyd(rendered.keys, false);
    }
  }
}

export function updateXsydRhythmConfig(config: RhythmConfiguration): void {
  const prevEndpoint = xsydRhythmConfig?.endpoint;
  xsydRhythmConfig = config;
  if (xsydRhythmActive) {
    if (prevEndpoint !== config.endpoint && (config.endpoint.startsWith('web-') || prevEndpoint?.startsWith('web-'))) {
      void setupXsydAudioCapture(config.endpoint).then(() => notifyXsydState());
    }
    notifyXsydState();
  }
}

export async function startXsydCustomRgb(profile: RgbProfile): Promise<void> {
  if (xsydRhythmActive) {
    xsydRhythmActive = false;
    cleanupXsydAudioCapture();
  }
  if (xsydDeviceManager.connected) {
    await xsydDeviceManager.request(
      buildXsydRgbWriteFrame({
        mode: XSYD_PER_KEY_RGB_MODE,
        mix: false,
        rgb: [255, 255, 255],
        brightness: XSYD_MAX_BRIGHTNESS,
        speed: 3,
        reverse: false,
        colorIndex: 0,
      })
    );
  }
  xsydStreamer.reset();
  const normalizedProfile: RgbProfile = {
    ...profile,
    custom: {
      ...restoreCustomRgb(profile.custom, profile),
      enabled: true,
    },
  };
  xsydCustomProfile = normalizedProfile;
  if (!xsydCustomEngine) {
    xsydCustomEngine = new CustomRgbEngine(normalizedProfile, 'win68HeMax');
    xsydElapsedMs = Math.max(110, xsydCustomEngine.milliseconds);
  } else {
    xsydCustomEngine.configure(normalizedProfile);
  }
  xsydCustomActive = true;
  xsydLastTickAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  attachXsydKeyListeners();
  if (xsydTimerHandle !== null) {
    clearInterval(xsydTimerHandle);
  }
  const setTimer = typeof window !== 'undefined' && window.setInterval ? window.setInterval.bind(window) : setInterval;
  xsydTimerHandle = setTimer(xsydTick, 33);
  xsydTick();
  notifyXsydState();
}

export async function startXsydRhythm(config: RhythmConfiguration): Promise<void> {
  if (xsydCustomActive) {
    xsydCustomActive = false;
    detachXsydKeyListeners();
    xsydHeldKeys.clear();
    xsydCustomEngine?.releaseAll();
  }
  if (!xsydDeviceManager.connected && (await xsydDeviceManager.hasAuthorizedDevice())) {
    await xsydDeviceManager.connect(false).catch(() => {});
  }
  if (xsydDeviceManager.connected) {
    // Matches `rhythm_capture.pcapng` #0014: switch to mode 0x15 (Per-Key RGB), brightness 4, speed 3, colorIndex 0
    await xsydStreamer.start(xsydDeviceManager, XSYD_MAX_BRIGHTNESS);
  } else {
    xsydStreamer.reset();
  }
  xsydRhythmConfig = config;
  await setupXsydAudioCapture(config.endpoint);
  xsydRhythmActive = true;
  xsydLastTickAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (xsydTimerHandle !== null) {
    clearInterval(xsydTimerHandle);
  }
  const setTimer = typeof window !== 'undefined' && window.setInterval ? window.setInterval.bind(window) : setInterval;
  xsydTimerHandle = setTimer(xsydTick, 33);
  xsydTick();
  notifyXsydState();
}

export async function stopXsydRhythm(onboardProfile?: RgbProfile): Promise<void> {
  xsydRhythmActive = false;
  cleanupXsydAudioCapture();
  if (!xsydCustomActive && xsydTimerHandle !== null) {
    clearInterval(xsydTimerHandle);
    xsydTimerHandle = null;
  }
  const targetZone = onboardProfile?.keys ?? xsydCustomProfile?.keys;
  if (xsydDeviceManager.connected && targetZone) {
    await xsydStreamer.stop(xsydDeviceManager, targetZone);
  } else {
    xsydStreamer.reset();
  }
  publish(null);
  notifyXsydState();
}

export async function stopXsydCustomRgb(onboardProfile?: RgbProfile): Promise<void> {
  xsydCustomActive = false;
  xsydRhythmActive = false;
  cleanupXsydAudioCapture();
  if (xsydTimerHandle !== null) {
    clearInterval(xsydTimerHandle);
    xsydTimerHandle = null;
  }
  detachXsydKeyListeners();
  xsydHeldKeys.clear();
  xsydCustomEngine?.releaseAll();
  const targetZone = onboardProfile?.keys ?? xsydCustomProfile?.keys;
  if (xsydDeviceManager.connected && targetZone) {
    await xsydStreamer.stop(xsydDeviceManager, targetZone);
  } else {
    xsydStreamer.reset();
  }
  publish(null);
  notifyXsydState();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    const current = ++generation;
    const refresh = () => {
      const status = getRgbServiceState().status;
      if (current !== generation) {
        return;
      }
      if (status?.enabled && (status.apiVersion ?? 0) >= 2) {
        if (!closeFrames) {
          closeFrames = rgbService.frames(next => {
            if (current !== generation || next.sessionId !== getRgbServiceState().status?.sessionId) {
              return;
            }
            if (next.sessionId) {
              if (next.sessionId !== lastSession) {
                lastSession = next.sessionId;
                lastSequence = -1;
              }
              if (typeof next.sequence === 'number' && next.sequence <= lastSequence) {
                return;
              }
              if (typeof next.sequence === 'number') {
                lastSequence = next.sequence;
              }
            }
            if (xsydCustomActive || xsydRhythmActive) {
              return;
            }
            if (next.enabled && next.connected && next.keys) {
              const allBlack = Object.values(next.keys).every(c => c === '#000000');
              if (!allBlack || status.mode === 'rhythm') {
                publish(next.keys);
                if (status.mode === 'rhythm' && xsydDeviceManager.connected) {
                  streamFrameToXsyd(next.keys, true);
                }
              }
            } else {
              publish(null);
            }
          });
        }
      } else {
        closeFrames?.();
        closeFrames = undefined;
        if (!xsydCustomActive && !xsydRhythmActive) {
          publish(null);
        }
      }
    };
    closeStatus = subscribeRgbService(refresh);
    refresh();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      generation++;
      closeStatus?.();
      closeStatus = undefined;
      closeFrames?.();
      closeFrames = undefined;
      if (!xsydCustomActive && !xsydRhythmActive) {
        frame = null;
      }
      lastSession = '';
      lastSequence = -1;
    }
  };
}
/** Share actual service output across RGB, AP, RT and other keyboard previews. */
const noSubscription = () => () => {};
export function useServiceLighting(enabled = true) {
  return useSyncExternalStore(enabled ? subscribe : noSubscription, () => enabled ? frame : null, () => null);
}
