import {
  allRegisteredKeyPositions,
  getBoard,
  maxRegisteredGamepadBindings,
  type HeroDeviceModelId
} from './registry';
import { WINDOWS_SCANS } from './windowsScans';

export const GAMEPAD_ACTIONS = [
  'A',
  'B',
  'X',
  'Y',
  'Start',
  'Back',
  'Guide',
  'Up',
  'Down',
  'Left',
  'Right',
  'LB',
  'RB',
  'LClick',
  'RClick',
  'LUp',
  'LDown',
  'LLeft',
  'LRight',
  'RUp',
  'RDown',
  'RLeft',
  'RRight',
  'LT',
  'RT'
] as const;

export type GamepadAction = (typeof GAMEPAD_ACTIONS)[number];
export type CurvePoint = [number, number];

export type GamepadBinding = {
  keyId: string;
  action: GamepadAction;
  startMm: number;
  endMm: number;
  keyboardKeyId?: string;
};

export const GAMEPAD_TOGGLE_MODIFIERS = [
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft'
] as const;

export const isToggleModifier = (keyId: string) =>
  (GAMEPAD_TOGGLE_MODIFIERS as readonly string[]).includes(keyId);

/** Minimum background-service version that understands POST /gamepad/toggle. */
export const GAMEPAD_TOGGLE_SERVICE_VERSION = '1.1.0';

export function isValidToggleKeybind(keys: unknown): keys is readonly string[] {
  if (!Array.isArray(keys) || keys.length > 4) {
    return false;
  }
  const seen = new Set<string>();
  for (const keyId of keys) {
    if (typeof keyId !== 'string' || WINDOWS_SCANS[keyId] === undefined || seen.has(keyId)) {
      return false;
    }
    seen.add(keyId);
  }
  return true;
}

export function normalizeToggleKeybind(keys: readonly string[]): string[] {
  if (!isValidToggleKeybind(keys)) {
    throw Error('Invalid gamepad toggle keybind');
  }
  const seen = new Set<string>(keys);
  const modifiers = GAMEPAD_TOGGLE_MODIFIERS.filter(m => seen.has(m));
  const mainKeys = keys.filter(k => !isToggleModifier(k));
  return [...modifiers, ...mainKeys];
}

export function formatToggleKeybind(
  keys: readonly string[] | undefined,
  labelForKey: (id: string) => string = id => id
): string {
  if (!keys?.length) {
    return '';
  }
  return keys.map(labelForKey).join(' + ');
}

export class GamepadToggleTracker {
  readonly held = new Set<string>();
  private latched = false;

  reset() {
    this.held.clear();
    this.latched = false;
  }

  event(keyId: string, pressed: boolean, toggleKeybind: readonly string[] | undefined): boolean {
    const bind = toggleKeybind?.length ? normalizeToggleKeybind(toggleKeybind) : [];
    if (!pressed) {
      this.held.delete(keyId);
      if (!bind.length || !bind.every(k => this.held.has(k))) {
        this.latched = false;
      }
      return false;
    }
    this.held.add(keyId);
    if (!bind.length || !bind.includes(keyId)) {
      return false;
    }
    const extraModifierHeld = [...this.held].some(k => isToggleModifier(k) && !bind.includes(k));
    if (extraModifierHeld) {
      return false;
    }
    if (bind.every(k => this.held.has(k)) && !this.latched) {
      this.latched = true;
      return true;
    }
    return false;
  }
}

export type GamepadConfiguration = {
  version: 1;
  rate: 50 | 100 | 200;
  bindings: GamepadBinding[];
  curve: CurvePoint[];
  snappy: boolean;
  square: boolean;
  angleEnabled: boolean;
  angle: number;
  suppressMappedKeys: boolean;
  keyboardSuppressionMode: 'firmware' | 'hook';
  toggleKeybind?: string[];
};

export const CURVE_PRESETS: Record<string, CurvePoint[]> = {
  Linear: [
    [0, 0],
    [1, 1]
  ],
  Aggressive: [
    [0, 0],
    [0.25, 0.55],
    [1, 1]
  ],
  Slow: [
    [0, 0],
    [0.7, 0.25],
    [1, 1]
  ],
  Smooth: [
    [0, 0],
    [0.25, 0.12],
    [0.75, 0.88],
    [1, 1]
  ],
  Instant: [
    [0, 0],
    [0.01, 1],
    [1, 1]
  ]
};

export const isAnalogAction = (action: GamepadAction) =>
  ['LUp', 'LDown', 'LLeft', 'LRight', 'RUp', 'RDown', 'RLeft', 'RRight', 'LT', 'RT'].includes(
    action
  );

export function defaultGamepad(): GamepadConfiguration {
  const defaultBindings: [string, GamepadAction][] = [
    ['KeyW', 'LUp'],
    ['KeyS', 'LDown'],
    ['KeyA', 'LLeft'],
    ['KeyD', 'LRight'],
    ['KeyQ', 'LT'],
    ['KeyE', 'RT'],
    ['Space', 'A']
  ];
  return {
    version: 1,
    rate: 200,
    bindings: defaultBindings.map(([keyId, action]) => ({
      keyId,
      action,
      startMm: 0.1,
      endMm: 3.4
    })),
    curve: [
      [0, 0],
      [0.33, 0.33],
      [0.67, 0.67],
      [1, 1]
    ],
    snappy: true,
    square: false,
    angleEnabled: false,
    angle: 45,
    suppressMappedKeys: false,
    keyboardSuppressionMode: 'firmware'
  };
}

function isValidSuppressionMode(mode: unknown): mode is 'firmware' | 'hook' | undefined {
  return mode === undefined || mode === 'firmware' || mode === 'hook';
}

function isValidBindingRecord(
  b: GamepadBinding | undefined,
  validPositions: Readonly<Record<string, number>>,
  seen: Set<string>
): b is GamepadBinding {
  if (!b) {
    return false;
  }
  if (validPositions[b.keyId] === undefined || seen.has(b.keyId)) {
    return false;
  }
  if (!GAMEPAD_ACTIONS.includes(b.action)) {
    return false;
  }
  if (!Number.isFinite(b.startMm) || !Number.isFinite(b.endMm)) {
    return false;
  }
  if (b.startMm < 0 || b.endMm > 3.4 || b.endMm - b.startMm < 0.01 - 1e-9) {
    return false;
  }
  return true;
}

function isValidResponseCurvePoint(
  point: unknown,
  index: number,
  allPoints: readonly CurvePoint[]
): point is CurvePoint {
  if (!Array.isArray(point) || point.length !== 2) {
    return false;
  }
  const [x, y] = point;
  if (!Number.isFinite(x) || x < 0 || x > 1 || !Number.isFinite(y) || y < 0 || y > 1) {
    return false;
  }
  if (index > 0) {
    const [prevX, prevY] = allPoints[index - 1];
    if (x <= prevX || y < prevY) {
      return false;
    }
  }
  return true;
}

export function validateGamepad(input: unknown, model?: HeroDeviceModelId): GamepadConfiguration {
  const v = input as GamepadConfiguration;
  const maxBindings = model
    ? getBoard(model).capabilities.maxGamepadBindings
    : maxRegisteredGamepadBindings();
  const validPositions = model ? getBoard(model).keyIdToPos : allRegisteredKeyPositions();

  const hasValidHeader =
    Boolean(v) &&
    isValidSuppressionMode(v.keyboardSuppressionMode) &&
    v.version === 1 &&
    [50, 100, 200].includes(v.rate) &&
    Array.isArray(v.bindings) &&
    v.bindings.length <= maxBindings;
  if (!hasValidHeader) {
    throw Error('Invalid gamepad configuration');
  }

  const toggleKeybind =
    v.toggleKeybind === undefined || v.toggleKeybind === null
      ? []
      : normalizeToggleKeybind(v.toggleKeybind);

  const seen = new Set<string>();
  const bindings = v.bindings.map(b => {
    if (!isValidBindingRecord(b, validPositions, seen)) {
      throw Error('Invalid gamepad binding');
    }
    if (
      b.keyboardKeyId !== undefined &&
      b.keyboardKeyId !== 'None' &&
      WINDOWS_SCANS[b.keyboardKeyId] === undefined
    ) {
      throw Error('Invalid Windows keyboard key');
    }
    seen.add(b.keyId);
    return { ...b };
  });

  if (!Array.isArray(v.curve) || v.curve.length < 2 || v.curve.length > 16) {
    throw Error('Invalid analog curve');
  }
  const curve = v.curve.map((p, i) => {
    if (!isValidResponseCurvePoint(p, i, v.curve)) {
      throw Error('Curve must be monotonic');
    }
    return [p[0], p[1]] as CurvePoint;
  });
  const firstPoint = curve[0];
  const lastPoint = curve.at(-1)!;
  if (firstPoint[0] !== 0 || firstPoint[1] !== 0 || lastPoint[0] !== 1 || lastPoint[1] !== 1) {
    throw Error('Curve endpoints must be 0 and 1');
  }

  const invalidSuppressionFlag =
    v.suppressMappedKeys !== undefined && typeof v.suppressMappedKeys !== 'boolean';
  const invalidToggleFlags = (['snappy', 'square', 'angleEnabled'] as const).some(
    k => typeof v[k] !== 'boolean'
  );
  const invalidAngle = !Number.isFinite(v.angle) || v.angle < 30 || v.angle > 60;
  if (invalidSuppressionFlag || invalidToggleFlags || invalidAngle) {
    throw Error('Invalid joystick settings');
  }

  return {
    version: 1,
    rate: v.rate,
    bindings,
    curve,
    snappy: v.snappy,
    square: v.square,
    angleEnabled: v.angleEnabled,
    angle: v.angle,
    suppressMappedKeys: v.suppressMappedKeys ?? false,
    keyboardSuppressionMode: v.keyboardSuppressionMode ?? 'firmware',
    ...(toggleKeybind.length ? { toggleKeybind } : {})
  };
}

export function restoreGamepad(value: unknown, model?: HeroDeviceModelId) {
  try {
    return validateGamepad(value, model);
  } catch {
    return defaultGamepad();
  }
}

export function curveValue(curve: CurvePoint[], value: number) {
  const x = Math.max(0, Math.min(1, value));
  for (let i = 1; i < curve.length; i++) {
    if (x <= curve[i][0]) {
      const a = curve[i - 1];
      const b = curve[i];
      return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    }
  }
  return 1;
}

export type GamepadReport = {
  buttons: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  lt: number;
  rt: number;
};

export const GAMEPAD_BUTTONS: Partial<Record<GamepadAction, number>> = {
  Up: 1,
  Down: 2,
  Left: 4,
  Right: 8,
  Start: 16,
  Back: 32,
  LClick: 64,
  RClick: 128,
  LB: 256,
  RB: 512,
  Guide: 1024,
  A: 4096,
  B: 8192,
  X: 16384,
  Y: 32768
};

export function mapGamepad(
  config: GamepadConfiguration,
  samples: Record<
    string,
    {
      distanceMm: number;
      pressed: boolean;
    }
  >
): GamepadReport {
  const values: Partial<Record<GamepadAction, number>> = {};
  let buttons = 0;
  for (const b of config.bindings) {
    const s = samples[b.keyId];
    if (!s) {
      continue;
    }
    if (!isAnalogAction(b.action)) {
      if (s.pressed) {
        buttons |= GAMEPAD_BUTTONS[b.action] ?? 0;
      }
      continue;
    }
    const p = curveValue(config.curve, (s.distanceMm - b.startMm) / (b.endMm - b.startMm));
    values[b.action] = Math.max(values[b.action] ?? 0, p);
  }

  const axis = (p: number, n: number) => (config.snappy ? (p === n ? 0 : p > n ? p : -n) : p - n);

  const stick = (prefix: 'L' | 'R') => {
    let x = axis(values[`${prefix}Right`] ?? 0, values[`${prefix}Left`] ?? 0);
    let y = axis(values[`${prefix}Up`] ?? 0, values[`${prefix}Down`] ?? 0);
    if (config.angleEnabled) {
      const magnitude = Math.hypot(x, y);
      y *= Math.tan((config.angle * Math.PI) / 180);
      const altered = Math.hypot(x, y);
      if (altered) {
        x *= magnitude / altered;
        y *= magnitude / altered;
      }
    }
    if (!config.square) {
      const length = Math.hypot(x, y);
      if (length > 1) {
        x /= length;
        y /= length;
      }
    }
    return [
      Math.round(Math.max(-1, Math.min(1, x)) * 32767),
      Math.round(Math.max(-1, Math.min(1, y)) * 32767)
    ];
  };

  const [lx, ly] = stick('L');
  const [rx, ry] = stick('R');
  return {
    buttons,
    lx,
    ly,
    rx,
    ry,
    lt: Math.round((values.LT ?? 0) * 255),
    rt: Math.round((values.RT ?? 0) * 255)
  };
}

/** Stable native wire format; validated before any mutation. No firmware packets here. */
export function nativeGamepadCommand(config: GamepadConfiguration, model?: HeroDeviceModelId) {
  const v = validateGamepad(config, model);
  const positions = model ? getBoard(model).keyIdToPos : allRegisteredKeyPositions();
  const rate = v.rate;
  const flags = `${Number(v.snappy)};${Number(v.square)};${Number(v.angleEnabled)}`;
  const angle = v.angle;
  const curve = v.curve.map(p => p.join(',')).join('|');
  const bindings = v.bindings
    .map(b => [positions[b.keyId], GAMEPAD_ACTIONS.indexOf(b.action), b.startMm, b.endMm].join(','))
    .join('|');
  const useHookSuppression = v.suppressMappedKeys && v.keyboardSuppressionMode === 'hook';
  const scansSuffix = useHookSuppression ? `;1;${gamepadSuppressionScans(v).join(',')}` : '';
  return `gamepad-config:${rate};${flags};${angle};${curve};${bindings}${scansSuffix}`;
}

export function gamepadSuppressionScans(config: GamepadConfiguration) {
  const scans = config.bindings
    .map(b => WINDOWS_SCANS[b.keyboardKeyId ?? b.keyId])
    .filter((s): s is number => s !== undefined);
  return [...new Set(scans)];
}
