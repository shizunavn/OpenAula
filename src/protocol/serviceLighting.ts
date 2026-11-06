import { useSyncExternalStore } from 'react';
import { rgbService } from './rgbService';
import { publishLightingFrame, type LightingFrame } from '../keyboard/lightingPreviewBus';
import { subscribeRgbService, getRgbServiceState } from './rgbServiceState';
import { CustomRgbEngine, restoreCustomRgb } from '../keyboard/customRgb';
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
const xsydStreamer = new XsydCustomRgbStreamer();
let xsydStreamBusy = false;
let xsydTimerHandle: ReturnType<typeof setInterval> | null = null;
let xsydElapsedMs = 110;
let xsydLastTickAt = 0;
let xsydKeyListenersAttached = false;
const xsydHeldKeys = new Set<string>();
const xsydStateListeners = new Set<() => void>();

function notifyXsydState() {
  xsydStateListeners.forEach(l => l());
}

function publish(next: LightingFrame | null) {
  frame = next;
  if (next) {
    publishLightingFrame(next);
  }
  listeners.forEach(listener => listener());
}

function streamFrameToXsyd(keysFrame: LightingFrame) {
  if (!xsydDeviceManager.connected || xsydStreamBusy) {
    return;
  }
  xsydStreamBusy = true;
  void xsydStreamer
    .pushFrameDelta(xsydDeviceManager, keysFrame)
    .catch(() => {})
    .finally(() => {
      xsydStreamBusy = false;
    });
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
  if (!xsydCustomActive || !xsydCustomEngine) {
    return;
  }
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const dt = xsydLastTickAt > 0 ? Math.max(0, Math.min(100, now - xsydLastTickAt)) : 16;
  xsydLastTickAt = now;
  xsydElapsedMs += dt;
  xsydCustomEngine.advance(xsydElapsedMs);
  const rendered = xsydCustomEngine.frame();
  publish(rendered.keys);
  streamFrameToXsyd(rendered.keys);
}

export function isXsydCustomRgbActive(): boolean {
  return xsydCustomActive;
}

export function getXsydCustomRgbFrame(): LightingFrame | null {
  return xsydCustomActive ? frame : null;
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
      streamFrameToXsyd(rendered.keys);
    }
  }
}

export async function startXsydCustomRgb(profile: RgbProfile): Promise<void> {
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

export async function stopXsydCustomRgb(onboardProfile?: RgbProfile): Promise<void> {
  xsydCustomActive = false;
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
            if (xsydCustomActive) {
              return;
            }
            if (next.enabled && next.connected && next.keys) {
              const allBlack = Object.values(next.keys).every(c => c === '#000000');
              if (!allBlack || status.mode === 'rhythm') {
                publish(next.keys);
                if (status.mode === 'rhythm' && xsydDeviceManager.connected) {
                  streamFrameToXsyd(next.keys);
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
        if (!xsydCustomActive) {
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
      if (!xsydCustomActive) {
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
