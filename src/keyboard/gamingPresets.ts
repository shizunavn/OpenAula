import type { RgbColor } from '../protocol/hero68/rgb';

/**
 * Standard recommended default color layouts for gaming presets:
 * - Mode 22: Gaming Preset 1 (WASD / FPS)
 * - Mode 23: Gaming Preset 2 (MOBA / LOL / Dota)
 * - Mode 24: Gaming Preset 3 (RTS / StarCraft / AOE)
 * - Mode 25: Gaming Preset 4 (MMO / WoW / FFXIV)
 */
export const GAMING_PRESETS_DEFAULT_COLORS: Readonly<Record<number, Record<string, RgbColor>>> = {
  // Mode 22: Gaming Preset 1 (WASD / FPS)
  22: {
    KeyW: [0, 255, 255],     // Movement - Cyan
    KeyA: [0, 255, 255],
    KeyS: [0, 255, 255],
    KeyD: [0, 255, 255],
    ArrowUp: [255, 220, 0],  // Directional - Yellow
    ArrowDown: [255, 220, 0],
    ArrowLeft: [255, 220, 0],
    ArrowRight: [255, 220, 0],
    ShiftLeft: [255, 80, 0], // Sprint - Orange
    ControlLeft: [255, 80, 0], // Crouch
    Space: [255, 80, 0],     // Jump
    KeyR: [0, 255, 120],     // Reload - Green
    Digit1: [255, 180, 0],   // Weapons - Gold
    Digit2: [255, 180, 0],
    Digit3: [255, 180, 0],
    Escape: [255, 0, 80],    // Menu - Red
  },
  // Mode 23: Gaming Preset 2 (MOBA)
  23: {
    KeyQ: [0, 220, 255],     // Abilities - Cyan / Sky Blue
    KeyW: [0, 220, 255],
    KeyE: [0, 220, 255],
    KeyR: [255, 0, 100],     // Ultimate - Crimson / Magenta
    KeyD: [255, 180, 0],     // Summoner Spells - Amber
    KeyF: [255, 180, 0],
    Digit1: [0, 255, 120],   // Active items - Lime Green
    Digit2: [0, 255, 120],
    Digit3: [0, 255, 120],
    Digit4: [0, 255, 120],
    Digit5: [0, 255, 120],
    Digit6: [0, 255, 120],
    Digit7: [255, 220, 0],   // Trinket / Ward - Yellow
    KeyB: [180, 50, 255],    // Recall / Base - Purple
    Tab: [100, 200, 255],    // Scoreboard
    Space: [0, 255, 255],    // Center camera
  },
  // Mode 24: Gaming Preset 3 (RTS)
  24: {
    Digit1: [0, 150, 255],   // Control groups - Blue
    Digit2: [0, 150, 255],
    Digit3: [0, 150, 255],
    Digit4: [0, 150, 255],
    Digit5: [0, 150, 255],
    KeyQ: [255, 140, 0],     // Grid unit & build commands - Orange
    KeyW: [255, 140, 0],
    KeyE: [255, 140, 0],
    KeyR: [255, 140, 0],
    KeyA: [255, 140, 0],
    KeyS: [255, 140, 0],
    KeyD: [255, 140, 0],
    KeyF: [255, 140, 0],
    KeyZ: [255, 140, 0],
    KeyX: [255, 140, 0],
    KeyC: [255, 140, 0],
    KeyV: [255, 140, 0],
    KeyH: [255, 220, 0],     // Hold / Base / Stop - Yellow
    KeyM: [255, 220, 0],
    KeyP: [255, 220, 0],
    ShiftLeft: [0, 255, 150], // Waypoint / Queue
    ControlLeft: [0, 255, 150],
    Space: [0, 255, 255],
  },
  // Mode 25: Gaming Preset 4 (MMO)
  25: {
    Digit1: [255, 80, 0],    // Action bar 1..12 - Red-Orange
    Digit2: [255, 80, 0],
    Digit3: [255, 80, 0],
    Digit4: [255, 80, 0],
    Digit5: [255, 80, 0],
    Digit6: [255, 80, 0],
    Digit7: [255, 80, 0],
    Digit8: [255, 80, 0],
    Digit9: [255, 80, 0],
    Digit0: [255, 80, 0],
    Minus: [255, 80, 0],
    Equal: [255, 80, 0],
    KeyW: [0, 255, 255],     // Movement - Cyan
    KeyA: [0, 255, 255],
    KeyS: [0, 255, 255],
    KeyD: [0, 255, 255],
    KeyQ: [0, 255, 255],     // Strafe
    KeyE: [0, 255, 255],
    Tab: [180, 70, 255],     // Target - Purple
    Space: [180, 70, 255],
    ShiftLeft: [180, 70, 255],
    ControlLeft: [180, 70, 255],
    KeyI: [255, 220, 0],     // UI panels (Inventory, Map, Character) - Yellow
    KeyM: [255, 220, 0],
    KeyC: [255, 220, 0],
  },
};

/**
 * Normalizes preset mode numbers between Hero68 and Win68:
 * - Hero68 modes: 221..226 -> 21..26, 19 -> 21
 * - Win68 modes: 21..26 -> 21..26
 */
export function normalizeGamingPresetMode(mode: number): number {
  if (mode >= 221 && mode <= 226) {
    return mode - 200;
  }
  if (mode === 19) {
    return 21;
  }
  return mode;
}

/**
 * Checks whether a mode is a per-key customizable mode on either Hero68 or Win68.
 */
export function isPerKeyRgbMode(mode: number, isWin68?: boolean): boolean {
  if (isWin68) {
    return (mode >= 21 && mode <= 26) || mode === 119;
  }
  return mode === 19 || (mode >= 21 && mode <= 26) || (mode >= 221 && mode <= 226) || mode === 119;
}

/**
 * Returns a full per-key colors map for a gaming preset, setting active keys
 * to their recommended colors and all other keys to off ([0, 0, 0]).
 */
export function getGamingPresetDefaultColors(
  mode: number,
  allKeyIds?: readonly string[]
): Record<string, RgbColor> {
  const normalized = normalizeGamingPresetMode(mode);
  const defaults = GAMING_PRESETS_DEFAULT_COLORS[normalized] ?? {};
  const result: Record<string, RgbColor> = {};
  if (allKeyIds) {
    for (const id of allKeyIds) {
      result[id] = defaults[id] ? [...defaults[id]] as RgbColor : [0, 0, 0];
    }
  } else {
    for (const [id, color] of Object.entries(defaults)) {
      result[id] = [...color] as RgbColor;
    }
  }
  return result;
}

/**
 * Resolves the colors for a target per-key mode.
 * - If saved in presetColors, returns that.
 * - Otherwise if a default gaming template exists, returns that.
 * - Otherwise returns current colors.
 */
export function resolvePresetColors(
  mode: number,
  currentColors: Record<string, RgbColor>,
  presetColors?: Record<number, Record<string, RgbColor>>,
  allKeyIds?: readonly string[]
): Record<string, RgbColor> {
  const normalized = normalizeGamingPresetMode(mode);
  if (presetColors?.[normalized] && Object.keys(presetColors[normalized]).length > 0) {
    return { ...presetColors[normalized] };
  }
  if (presetColors?.[mode] && Object.keys(presetColors[mode]).length > 0) {
    return { ...presetColors[mode] };
  }
  if (GAMING_PRESETS_DEFAULT_COLORS[normalized]) {
    return getGamingPresetDefaultColors(normalized, allKeyIds);
  }
  return { ...currentColors };
}
