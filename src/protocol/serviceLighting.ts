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
let xsydRhythmAudioSource: 'synth' | 'system' | 'mic' = 'system';
let xsydRhythmSampleRate = 48000;
let xsydAudioContext: AudioContext | null = null;
let xsydAudioAnalyser: AnalyserNode | null = null;
let xsydAudioStream: MediaStream | null = null;
let xsydFreqBuffer: Uint8Array | null = null;
let xsydTimeBuffer: Uint8Array | null = null;

const xsydStreamer = new XsydCustomRgbStreamer();
let xsydStreamBusy = false;
let stopXsydTimer: (() => void) | null = null;
let xsydElapsedMs = 110;
let xsydLastTickAt = 0;
let xsydKeyListenersAttached = false;
let lastServiceObservedMode: string | undefined;
const xsydHeldKeys = new Set<string>();
const xsydStateListeners = new Set<() => void>();

/**
 * Create an unthrottled repeating timer using a dedicated Web Worker so
 * Chrome/Edge background-tab throttling (`document.hidden`) never slows down
 * Custom RGB or Rhythm Sync when the user switches browser tabs.
 */
function startUnthrottledInterval(callback: () => void, intervalMs: number): () => void {
  const ms = Math.max(10, Math.round(intervalMs));
  if (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof Blob !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  ) {
    try {
      const workerCode = `let t=setInterval(()=>postMessage(0),${ms});onmessage=e=>{if(e.data==='stop'){clearInterval(t);close();}};`;
      const blobUrl = URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' }));
      const worker = new Worker(blobUrl);
      worker.onmessage = () => callback();
      return () => {
        try {
          worker.postMessage('stop');
          worker.terminate();
        } catch {
          // Ignore worker termination errors
        }
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {
          // Ignore URL revoke errors
        }
      };
    } catch {
      // Fall back to standard setInterval if CSP blocks blob workers
    }
  }
  const setTimer = typeof window !== 'undefined' && window.setInterval ? window.setInterval.bind(window) : setInterval;
  const clearTimer =
    typeof window !== 'undefined' && window.clearInterval ? window.clearInterval.bind(window) : clearInterval;
  const handle = setTimer(callback, ms);
  return () => clearTimer(handle);
}

function clearXsydTimer() {
  if (stopXsydTimer) {
    stopXsydTimer();
    stopXsydTimer = null;
  }
}

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
  audioSource: 'system',
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
    xsydRhythmAudioSource = 'system';
    return 'system';
  }
  if (endpoint !== 'web-system' && endpoint !== 'web-mic') {
    xsydRhythmAudioSource = 'system';
    return 'system';
  }
  try {
    let stream: MediaStream;
    if (endpoint === 'web-system' && navigator.mediaDevices.getDisplayMedia) {
      stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      });
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
    xsydRhythmAudioSource = endpoint === 'web-mic' ? 'mic' : 'system';
    return xsydRhythmAudioSource;
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

function onXsydPreviewPress(event: Event) {
  if (!xsydCustomActive || !xsydCustomEngine) {
    return;
  }
  const id = (event as CustomEvent<string>).detail;
  if (!id) {
    return;
  }
  xsydCustomEngine.event(id, true);
  setTimeout(() => {
    if (xsydCustomActive && xsydCustomEngine && !xsydHeldKeys.has(id)) {
      xsydCustomEngine.event(id, false);
    }
  }, 180);
}

function onXsydWindowBlur() {
  if (!xsydCustomEngine || xsydHeldKeys.size === 0) {
    return;
  }
  // Only release physically held keys when focus leaves the window; do not
  // reset ongoing non-key animations or clear the engine clock.
  for (const code of xsydHeldKeys) {
    xsydCustomEngine.event(code, false);
  }
  xsydHeldKeys.clear();
}

function attachXsydKeyListeners() {
  if (xsydKeyListenersAttached || typeof window === 'undefined') {
    return;
  }
  xsydKeyListenersAttached = true;
  window.addEventListener('keydown', onXsydWindowKeyDown);
  window.addEventListener('keyup', onXsydWindowKeyUp);
  window.addEventListener('blur', onXsydWindowBlur);
  window.addEventListener('custom-rgb-preview-press', onXsydPreviewPress);
}

function detachXsydKeyListeners() {
  if (!xsydKeyListenersAttached || typeof window === 'undefined') {
    return;
  }
  xsydKeyListenersAttached = false;
  window.removeEventListener('keydown', onXsydWindowKeyDown);
  window.removeEventListener('keyup', onXsydWindowKeyUp);
  window.removeEventListener('blur', onXsydWindowBlur);
  window.removeEventListener('custom-rgb-preview-press', onXsydPreviewPress);
}

function xsydTick() {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const dt = xsydLastTickAt > 0 ? Math.max(1, Math.min(500, now - xsydLastTickAt)) : 33;
  xsydLastTickAt = now;
  xsydElapsedMs += dt;

  // If the native C++ service is connected and actively streaming without errors,
  // let the native service own the USB pipe.
  const serviceStatus = getRgbServiceState().status;
  const nativeOwnsUsb = Boolean(
    serviceStatus?.enabled &&
    serviceStatus.connected &&
    !serviceStatus.lastError
  );

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
      'win68HeMax',
      false
    );
    const releaseFactor = Math.max(0.15, Math.min(0.92, xsydRhythmConfig.releaseMs / 220));
    const nextLevel =
      rendered.level >= xsydRhythmAudioLevel
        ? rendered.level
        : xsydRhythmAudioLevel * releaseFactor + rendered.level * (1 - releaseFactor);
    xsydRhythmAudioLevel = nextLevel < 0.005 ? 0 : nextLevel;
    xsydRhythmSideFrame = rendered.side;
    xsydRhythmFps = Math.round((1000 / Math.max(16, dt)) * 10) / 10;
    publish(rendered.keys);
    if (!nativeOwnsUsb) {
      streamFrameToXsyd(rendered.keys, true);
    }
    notifyXsydState();
    return;
  }

  if (!xsydCustomActive || !xsydCustomEngine) {
    return;
  }
  xsydCustomEngine.advance(xsydElapsedMs);
  const rendered = xsydCustomEngine.frame();
  publish(rendered.keys);
  if (!nativeOwnsUsb) {
    streamFrameToXsyd(rendered.keys, false);
  }
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
      const serviceStatus = getRgbServiceState().status;
      if (!(serviceStatus?.enabled && serviceStatus.connected && !serviceStatus.lastError)) {
        streamFrameToXsyd(rendered.keys, false);
      }
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
  if (!xsydDeviceManager.connected && (await xsydDeviceManager.hasAuthorizedDevice())) {
    await xsydDeviceManager.connect(false).catch(() => {});
  }
  const serviceStatus = getRgbServiceState().status;
  const nativeOwnsUsb = Boolean(
    serviceStatus?.enabled &&
    serviceStatus.connected &&
    !serviceStatus.lastError
  );
  if (xsydDeviceManager.connected && !nativeOwnsUsb) {
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
  clearXsydTimer();
  stopXsydTimer = startUnthrottledInterval(xsydTick, 33);
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
  const serviceStatus = getRgbServiceState().status;
  const nativeOwnsUsb = Boolean(
    serviceStatus?.enabled &&
    serviceStatus.connected &&
    !serviceStatus.lastError
  );
  if (xsydDeviceManager.connected && !nativeOwnsUsb) {
    await xsydStreamer.start(xsydDeviceManager, XSYD_MAX_BRIGHTNESS);
  } else {
    xsydStreamer.reset();
  }
  xsydRhythmConfig = config;
  xsydRhythmAudioLevel = 0;
  await setupXsydAudioCapture(config.endpoint);
  xsydRhythmActive = true;
  xsydLastTickAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  clearXsydTimer();
  stopXsydTimer = startUnthrottledInterval(xsydTick, 33);
  xsydTick();
  notifyXsydState();
}

export async function stopXsydRhythm(onboardProfile?: RgbProfile): Promise<void> {
  xsydRhythmActive = false;
  xsydRhythmAudioLevel = 0;
  cleanupXsydAudioCapture();
  if (!xsydCustomActive) {
    clearXsydTimer();
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
  xsydRhythmAudioLevel = 0;
  cleanupXsydAudioCapture();
  clearXsydTimer();
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
      // Sync WebHID fallback with service mode transitions (e.g. "Start saved RGB"
      // or "Onboard RGB" triggered from the tray app / service control panel).
      if (status) {
        const prevMode = lastServiceObservedMode;
        lastServiceObservedMode = status.enabled ? status.mode : 'onboard';
        const needsWebHidFallback = !status.connected || Boolean(status.lastError?.includes('RGB write failed'));
        if (status.enabled && status.mode === 'custom' && status.customConfiguration && needsWebHidFallback && !xsydCustomActive) {
          void startXsydCustomRgb(status.customConfiguration).catch(() => {});
        } else if (status.enabled && status.mode === 'rhythm' && xsydRhythmActive && !xsydAudioAnalyser) {
          // If the native Windows service is handling Rhythm Sync and no browser Web Audio
          // stream is active, shut down any stray browser rhythm runner so it never overwrites
          // real service frames.
          xsydRhythmActive = false;
          xsydRhythmAudioLevel = 0;
          if (!xsydCustomActive) {
            clearXsydTimer();
          }
          notifyXsydState();
        } else if (!status.enabled && prevMode && prevMode !== 'onboard' && (xsydCustomActive || xsydRhythmActive)) {
          void stopXsydCustomRgb(status.customConfiguration).catch(() => {});
        }
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
            if (xsydCustomActive || (xsydRhythmActive && xsydAudioAnalyser)) {
              return;
            }
            if (next.enabled && next.connected && next.keys) {
              const allBlack = Object.values(next.keys).every(c => c === '#000000');
              if (!allBlack || status.mode === 'rhythm') {
                publish(next.keys);
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
