// IDs from the stock vendor catalog; event capabilities from fw0320 handlers.
const names = [
  'Off',
  'Static',
  'Breathing',
  'Rainbow',
  'Reactive',
  'Starry',
  'Ripple',
  'Key Ripples',
  'Raindrops',
  'Snowflakes',
  'Continuous Flow',
  'Windmill',
  'Follow Shadow',
  'Light Wave',
  'Scan',
  'Rotating Circle',
  'Waterfall',
  'Bloom',
  'Spinning Storm',
  'Per-key Color'
];
// Rainbow, Rotating Circle and Waterfall always use the firmware palette.
export const KEY_RGB_MODES = names.map((name, id) => ({
  id,
  name,
  reactive: [4, 7, 9, 12].includes(id),
  color: ![0, 3, 15, 16, 19].includes(id),
  speed: ![0, 1, 19].includes(id)
}));
// Side mode 1 fades the configured RGB along the strip, which the vendor calls
// "Flowing Stream"; mode 2 cycles the whole strip through the palette and
// ignores RGB.
export const SIDE_RGB_MODES = [
  'Off',
  'Flowing Stream',
  'Color Cycle',
  'Static',
  'Breathing',
  'Bounce'
].map((name, id) => ({
  id,
  name,
  reactive: false,
  color: ![0, 2].includes(id),
  speed: ![0, 3].includes(id)
}));
export const RGB_SERVICE_AVAILABLE = false;

export type Win68RgbModeCapability = {
  /** External Mode ID (`0..26`) stored in `0x18` `payload[39]`. */
  id: number;
  /** Internal Mode ID (`1..27`) mapped via `EXT_TO_INT_ROM` (`VA 0x1D2A0`). */
  internalId: number;
  name: string;
  reactive: boolean;
  color: boolean;
  speed: boolean;
  reverse: boolean;
  perKey: boolean;
};

/**
 * Exact 27 External Modes (`0..26`) of AULA WIN 68 HE MAX (firmware v1.1.4),
 * mapped 1:1 from `EXT_TO_INT_ROM` at `VA 0x1D2A0` and verified against USB captures:
 * - `0x02` = Tide Flux (`pkt=2274`)
 * - `0x03` = Soft Ripple (`pkt=3798`)
 * - `0x04` = Snipping Storm (`pkt=5324`)
 * - `0x0C` = Smooth Flow (`pkt=28908`)
 * - `0x15` = Per-key Color (`Q(green)-E(red)_-Z(yellow)-P(Pink).txt`)
 */
export const WIN68_KEY_RGB_MODES: readonly Win68RgbModeCapability[] = [
  {
    id: 0,
    internalId: 7,
    name: 'Static',
    reactive: false,
    color: true,
    speed: false,
    reverse: false,
    perKey: false
  },
  {
    id: 1,
    internalId: 8,
    name: 'Aurora Wave',
    reactive: false,
    color: true,
    speed: true,
    reverse: true,
    perKey: false
  },
  {
    id: 2,
    internalId: 9,
    name: 'Tide Flux',
    reactive: false,
    color: true,
    speed: true,
    reverse: true,
    perKey: false
  },
  {
    id: 3,
    internalId: 10,
    name: 'Soft Ripple',
    reactive: false,
    color: true,
    speed: true,
    reverse: true,
    perKey: false
  },
  {
    id: 4,
    internalId: 11,
    name: 'Snipping Storm',
    reactive: false,
    color: true,
    speed: true,
    reverse: true,
    perKey: false
  },
  {
    id: 5,
    internalId: 12,
    name: 'Rotating Compass',
    reactive: false,
    color: true,
    speed: true,
    reverse: true,
    perKey: false
  },
  {
    id: 6,
    internalId: 13,
    name: 'Butterfly Wave',
    reactive: false,
    color: true,
    speed: true,
    reverse: true,
    perKey: false
  },
  {
    id: 7,
    internalId: 14,
    name: 'Radial Iris',
    reactive: false,
    color: true,
    speed: true,
    reverse: false,
    perKey: false
  },
  {
    id: 8,
    internalId: 15,
    name: '3-Zone Sine',
    reactive: false,
    color: true,
    speed: true,
    reverse: false,
    perKey: false
  },
  {
    id: 9,
    internalId: 16,
    name: 'Dual Sine Ribbon',
    reactive: false,
    color: true,
    speed: true,
    reverse: true,
    perKey: false
  },
  {
    id: 10,
    internalId: 17,
    name: 'Color Wipe',
    reactive: false,
    color: true,
    speed: true,
    reverse: false,
    perKey: false
  },
  {
    id: 11,
    internalId: 18,
    name: 'Sine Snake',
    reactive: false,
    color: true,
    speed: true,
    reverse: true,
    perKey: false
  },
  {
    id: 12,
    internalId: 19,
    name: 'Smooth Flow',
    reactive: false,
    color: true,
    speed: true,
    reverse: true,
    perKey: false
  },
  {
    id: 13,
    internalId: 20,
    name: 'Starry Shimmer',
    reactive: false,
    color: true,
    speed: true,
    reverse: false,
    perKey: false
  },
  {
    id: 14,
    internalId: 21,
    name: 'Raindrops',
    reactive: false,
    color: true,
    speed: true,
    reverse: false,
    perKey: false
  },
  {
    id: 15,
    internalId: 22,
    name: 'Digital Rain',
    reactive: false,
    color: true,
    speed: true,
    reverse: false,
    perKey: false
  },
  {
    id: 16,
    internalId: 23,
    name: 'Bouncing Orb',
    reactive: false,
    color: true,
    speed: true,
    reverse: false,
    perKey: false
  },
  {
    id: 17,
    internalId: 24,
    name: 'Reactive Key',
    reactive: true,
    color: true,
    speed: true,
    reverse: false,
    perKey: false
  },
  {
    id: 18,
    internalId: 25,
    name: 'Reactive Cross',
    reactive: true,
    color: true,
    speed: true,
    reverse: false,
    perKey: false
  },
  {
    id: 19,
    internalId: 26,
    name: 'Reactive Laser',
    reactive: true,
    color: true,
    speed: true,
    reverse: false,
    perKey: false
  },
  {
    id: 20,
    internalId: 27,
    name: 'Reactive Ripple',
    reactive: true,
    color: true,
    speed: true,
    reverse: false,
    perKey: false
  },
  {
    id: 21,
    internalId: 1,
    name: 'Per-key Color',
    reactive: false,
    color: false,
    speed: false,
    reverse: false,
    perKey: true
  },
  {
    id: 22,
    internalId: 2,
    name: 'Gaming Preset 1 (WASD)',
    reactive: false,
    color: false,
    speed: false,
    reverse: false,
    perKey: true
  },
  {
    id: 23,
    internalId: 3,
    name: 'Gaming Preset 2 (MOBA)',
    reactive: false,
    color: false,
    speed: false,
    reverse: false,
    perKey: true
  },
  {
    id: 24,
    internalId: 4,
    name: 'Gaming Preset 3 (RTS)',
    reactive: false,
    color: false,
    speed: false,
    reverse: false,
    perKey: true
  },
  {
    id: 25,
    internalId: 5,
    name: 'Gaming Preset 4 (MMO)',
    reactive: false,
    color: false,
    speed: false,
    reverse: false,
    perKey: true
  },
  {
    id: 26,
    internalId: 6,
    name: 'User Custom Preset',
    reactive: false,
    color: false,
    speed: false,
    reverse: false,
    perKey: true
  }
];

export function isWin68PerKeyMode(mode: number): boolean {
  return (mode >= 21 && mode <= 26) || mode === 119;
}

export type MergedRgbModeCapability = {
  id: number;
  name: string;
  reactive: boolean;
  color: boolean;
  speed: boolean;
  reverse?: boolean;
  perKey?: boolean;
};

const HERO_TO_WIN68_MODE_MAP: Readonly<Record<number, number>> = {
  0: 0, // Off -> Static (brightness 0 handled separately)
  1: 0, // Static -> Static
  2: 7, // Breathing -> Radial Iris / Breathing
  3: 1, // Rainbow -> Aurora Wave
  4: 17, // Reactive -> Reactive Key
  5: 13, // Starry -> Starry Shimmer
  6: 3, // Ripple -> Soft Ripple
  7: 20, // Key Ripples -> Reactive Ripple
  8: 14, // Raindrops -> Raindrops
  9: 18, // Snowflakes -> Reactive Cross
  10: 12, // Continuous Flow -> Smooth Flow
  11: 4, // Windmill -> Snipping Storm
  12: 19, // Follow Shadow -> Reactive Laser
  13: 2, // Light Wave -> Tide Flux
  14: 10, // Scan -> Color Wipe
  15: 5, // Rotating Circle -> Rotating Compass
  16: 15, // Waterfall -> Digital Rain
  17: 6, // Bloom -> Butterfly Wave
  18: 4, // Spinning Storm -> Snipping Storm
  19: 21 // Per-key Color -> Per-key Color
};

const WIN68_TO_HERO_MODE_MAP: Readonly<Record<number, number>> = {
  0: 1, // Static -> Static
  1: 13, // Aurora Wave -> Light Wave
  2: 10, // Tide Flux -> Continuous Flow
  3: 6, // Soft Ripple -> Ripple
  4: 18, // Snipping Storm -> Spinning Storm
  5: 15, // Rotating Compass -> Rotating Circle
  6: 17, // Butterfly Wave -> Bloom
  7: 2, // Radial Iris -> Breathing
  8: 13, // 3-Zone Sine -> Light Wave
  9: 10, // Dual Sine Ribbon -> Continuous Flow
  10: 14, // Color Wipe -> Scan
  11: 10, // Sine Snake -> Continuous Flow
  12: 10, // Smooth Flow -> Continuous Flow
  13: 5, // Starry Shimmer -> Starry
  14: 8, // Raindrops -> Raindrops
  15: 16, // Digital Rain -> Waterfall
  16: 6, // Bouncing Orb -> Ripple
  17: 4, // Reactive Key -> Reactive
  18: 9, // Reactive Cross -> Snowflakes
  19: 12, // Reactive Laser -> Follow Shadow
  20: 7, // Reactive Ripple -> Key Ripples
  21: 19, // Per-key Color -> Per-key Color
  22: 19, // Gaming Preset 1 -> Per-key Color
  23: 19, // Gaming Preset 2 -> Per-key Color
  24: 19, // Gaming Preset 3 -> Per-key Color
  25: 19, // Gaming Preset 4 -> Per-key Color
  26: 19 // User Custom Preset -> Per-key Color
};

export function mapModeToWin68Hardware(mode: number): number {
  if (mode >= 0 && mode <= 26) return mode;
  if (mode >= 100 && mode < 200) {
    return HERO_TO_WIN68_MODE_MAP[mode - 100] ?? 1;
  }
  if (mode >= 200 && mode < 300) {
    return Math.max(0, Math.min(26, mode - 200));
  }
  return HERO_TO_WIN68_MODE_MAP[mode] ?? 1;
}

export function mapModeToHero68Hardware(mode: number): number {
  if (mode >= 0 && mode <= 19) return mode;
  if (mode >= 100 && mode < 200) {
    return Math.max(0, Math.min(19, mode - 100));
  }
  if (mode >= 200 && mode < 300) {
    return WIN68_TO_HERO_MODE_MAP[mode - 200] ?? 1;
  }
  return WIN68_TO_HERO_MODE_MAP[mode] ?? 1;
}

/**
 * Returns the unified, deduplicated onboard preset list combining all presets
 * from both AULA HERO 68 HE and AULA WIN 68 HE MAX without duplicates.
 *
 * - On WIN 68 HE MAX (`isWin68 = true`), native WIN68 modes keep IDs `0..26`,
 *   and unique HERO68 modes are appended with IDs `100 + heroMode.id`.
 * - On HERO 68/84 (`isWin68 = false`), native HERO68 modes keep IDs `0..19`,
 *   and unique WIN68 modes are appended with IDs `200 + win68Mode.id`.
 */
export function mergedKeyRgbModesForModel(isWin68: boolean): readonly MergedRgbModeCapability[] {
  if (isWin68) {
    const seen = new Set(WIN68_KEY_RGB_MODES.map(m => m.name.toLowerCase()));
    const extra: MergedRgbModeCapability[] = KEY_RGB_MODES.filter(
      m => m.name !== 'Off' && !seen.has(m.name.toLowerCase())
    ).map(m => ({
      id: 100 + m.id,
      name: m.name,
      reactive: m.reactive,
      color: m.color,
      speed: m.speed,
      reverse: false,
      perKey: m.id === 19
    }));
    return [...WIN68_KEY_RGB_MODES, ...extra];
  }
  const seen = new Set(KEY_RGB_MODES.map(m => m.name.toLowerCase()));
  const extra: MergedRgbModeCapability[] = WIN68_KEY_RGB_MODES.filter(
    m => !seen.has(m.name.toLowerCase())
  ).map(m => ({
    id: 200 + m.id,
    name: m.name,
    reactive: m.reactive,
    color: m.color,
    speed: m.speed,
    reverse: m.reverse,
    perKey: m.perKey
  }));
  return [...KEY_RGB_MODES, ...extra];
}
