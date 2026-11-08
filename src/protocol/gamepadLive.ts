import {
  gamepadService,
  type GamepadInputFrame,
  type GamepadStatus,
  type SharedHallSample
} from './gamepadService';
import type { GamepadReport } from '../keyboard/gamepad';

export const NEUTRAL_GAMEPAD: GamepadReport = {
  buttons: 0,
  lx: 0,
  ly: 0,
  rx: 0,
  ry: 0,
  lt: 0,
  rt: 0
};

export type LiveGamepad = {
  report: GamepadReport;
  samples: SharedHallSample[];
  source: 'browser' | 'service' | 'demo' | 'stopped';
};

const empty: LiveGamepad = {
  report: NEUTRAL_GAMEPAD,
  samples: [],
  source: 'stopped'
};

function isValidHallSample(s: SharedHallSample | undefined): boolean {
  if (!s || typeof s.keyId !== 'string') {
    return false;
  }
  if (!Number.isFinite(s.distanceUnits) || s.distanceUnits < 0 || s.distanceUnits > 32767) {
    return false;
  }
  if (!Number.isFinite(s.ageMs) || (s.ageMs ?? -1) < 0) {
    return false;
  }
  if (!Number.isSafeInteger(s.sequence) || s.sequence < 1) {
    return false;
  }
  return true;
}

export function validInputFrame(frame: GamepadInputFrame) {
  if (
    !frame ||
    !Number.isSafeInteger(frame.sequence) ||
    frame.sequence < 1 ||
    !frame.report ||
    !Array.isArray(frame.samples) ||
    frame.samples.length > 68
  ) {
    return false;
  }
  const hasInvalidFlag = (['enabled', 'armed', 'stale', 'xinputVerified'] as const).some(
    k => typeof frame[k] !== 'boolean'
  );
  if (hasInvalidFlag) {
    return false;
  }
  if (frame.samples.some(s => !isValidHallSample(s))) {
    return false;
  }
  return Object.entries(NEUTRAL_GAMEPAD).every(([key]) => {
    const n = frame.report[key as keyof GamepadReport];
    if (!Number.isInteger(n)) {
      return false;
    }
    if (key === 'buttons') {
      return n >= 0 && n <= 65535;
    }
    if (key === 'lt' || key === 'rt') {
      return n >= 0 && n <= 255;
    }
    return n >= -32768 && n <= 32767;
  });
}

// Browser indices do not match XInput indices. With multiple Xbox pads, use our
// native stream rather than displaying somebody else's controller.
export function browserXboxReport(pads: readonly (Gamepad | null)[]): GamepadReport | null {
  const candidates = pads.filter((p): p is Gamepad => {
    if (!p || !p.connected || p.mapping !== 'standard') {
      return false;
    }
    return /xbox 360/i.test(p.id) || /045e.*028e/i.test(p.id);
  });
  if (candidates.length !== 1) {
    return null;
  }

  const p = candidates[0];
  const hasInvalidAxes = p.axes.length < 4 || p.axes.slice(0, 4).some(n => !Number.isFinite(n));
  const hasInvalidButtons =
    p.buttons.length < 16 ||
    p.buttons.some(b => !Number.isFinite(b.value) || b.value < 0 || b.value > 1);
  if (hasInvalidAxes || hasInvalidButtons) {
    return null;
  }

  const axis = (i: number, invert = false) =>
    Math.round(Math.max(-1, Math.min(1, p.axes[i])) * 32767 * (invert ? -1 : 1));
  const masks = [4096, 8192, 16384, 32768, 256, 512, 0, 0, 32, 16, 64, 128, 1, 2, 4, 8, 1024];
  return {
    lx: axis(0),
    ly: axis(1, true),
    rx: axis(2),
    ry: axis(3, true),
    lt: Math.round(p.buttons[6].value * 255),
    rt: Math.round(p.buttons[7].value * 255),
    buttons: p.buttons.reduce((bits, b, i) => bits | (b.pressed ? (masks[i] ?? 0) : 0), 0)
  };
}

export function coherentBrowserReport(browser: GamepadReport | null, native: GamepadReport) {
  if (!browser || browser.buttons !== native.buttons) {
    return null;
  }
  const sticksMatch = (['lx', 'ly', 'rx', 'ry'] as const).every(
    k => Math.abs(browser[k] - native[k]) <= 3277
  );
  const triggersMatch = (['lt', 'rt'] as const).every(k => Math.abs(browser[k] - native[k]) <= 26);
  return sticksMatch && triggersMatch ? browser : null;
}

/** Latest frame only; UI animation and input SSE never trigger a page render,
 * configure HID, subscribe to Hall, or wait for slow diagnostic statistics. */
export class GamepadLiveStore {
  private listeners = new Set<() => void>();
  private value: LiveGamepad = empty;
  private latest: GamepadInputFrame | null = null;
  private receivedAt = 0;
  private raf = 0;
  private close: (() => void) | undefined;
  private generation = 0;
  private active = false;
  private status: GamepadStatus | null = null;
  private demo: LiveGamepad | null = null;
  private signature = '';

  getSnapshot = () => this.value;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  configure(active: boolean, status: GamepadStatus | null, demo: LiveGamepad | null) {
    const change =
      this.active !== active ||
      this.status?.capabilities.fastInput !== status?.capabilities.fastInput ||
      !!this.demo !== !!demo;
    this.active = active;
    this.status = status;
    this.demo = demo;
    if (!status?.enabled && !demo) {
      this.latest = null;
    }
    if (change) {
      this.stop();
      if (active && !document.hidden) {
        this.start();
      }
    }
    if (active && !status?.capabilities.fastInput) {
      this.latest = status
        ? {
            ...status,
            sequence: 1
          }
        : null;
      this.receivedAt = performance.now();
    }
  }

  private draw = () => {
    if (!this.active || document.hidden) {
      return;
    }
    const elapsed = performance.now() - this.receivedAt;
    const f = this.latest;
    let next = empty;
    const maxFrameAgeMs = this.status?.capabilities.fastInput ? 120 : 400;
    if (this.demo) {
      next = this.demo;
    } else if (f?.enabled && f.armed && !f.stale && elapsed < maxFrameAgeMs) {
      let report: GamepadReport | null = null;
      if (f.xinputVerified) {
        try {
          report = coherentBrowserReport(
            browserXboxReport(navigator.getGamepads?.() ?? []),
            f.report
          );
        } catch {
          /* browser policy denies Gamepad API; native stream remains available */
        }
      }
      next = {
        report: report ?? f.report,
        source: report ? 'browser' : 'service',
        samples: f.samples.filter(s => Number.isFinite(s.ageMs) && (s.ageMs ?? 0) + elapsed < 50)
      };
    }
    const signature = JSON.stringify(next);
    if (signature !== this.signature) {
      this.signature = signature;
      this.value = next;
      for (const notify of this.listeners) {
        notify();
      }
    }
    this.raf = requestAnimationFrame(this.draw);
  };

  private start() {
    if (!this.demo && this.status?.capabilities.fastInput) {
      const epoch = ++this.generation;
      let sequence = 0;
      this.close = gamepadService.inputStream(
        f => {
          if (epoch !== this.generation || !validInputFrame(f) || f.sequence <= sequence) {
            return;
          }
          sequence = f.sequence;
          this.latest = f;
          this.receivedAt = performance.now();
        },
        () => {
          if (epoch === this.generation) {
            sequence = 0;
            this.latest = null;
          }
        }
      );
    }
    this.raf = requestAnimationFrame(this.draw);
  }

  private stop() {
    cancelAnimationFrame(this.raf);
    this.generation++;
    this.close?.();
    this.close = undefined;
    this.latest = null;
    this.value = empty;
    this.signature = '';
    for (const notify of this.listeners) {
      notify();
    }
  }

  visibility = () => {
    this.stop();
    if (this.active && !document.hidden) {
      this.start();
    }
  };

  dispose = () => {
    this.active = false;
    this.stop();
  };
}
