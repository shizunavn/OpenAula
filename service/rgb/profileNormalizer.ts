import { restoreCustomRgb } from '../../src/keyboard/customRgb';
import { HERO68_KEY_IDS } from '../../src/keyboard/hero68Layout';
import { defaultRgb, type RgbColor, type RgbProfile, type RgbZone } from '../../src/protocol/hero68/rgb';

const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const finite = (v: unknown, fallback: number, low: number, high: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, low, high) : fallback;

function normalizeZone(input: Partial<RgbZone> | undefined, fallback: RgbZone): RgbZone {
  if (!input || typeof input !== 'object') {
    return { ...fallback };
  }
  return {
    mode: Math.round(finite(input.mode, fallback.mode, 0, 255)),
    mix: typeof input.mix === 'boolean' ? input.mix : fallback.mix,
    rgb: [0, 1, 2].map(i => Math.round(finite(input.rgb?.[i], fallback.rgb[i] ?? 255, 0, 255))) as RgbColor,
    brightness: Math.round(finite(input.brightness, fallback.brightness, 0, 20)),
    speed: Math.round(finite(input.speed, fallback.speed, 0, 4)),
    ...(typeof input.reverse === 'boolean' ? { reverse: input.reverse } : {}),
    ...(typeof input.colorIndex === 'number' && Number.isFinite(input.colorIndex)
      ? { colorIndex: Math.round(clamp(input.colorIndex, 0, 7)) }
      : {}),
    ...(Array.isArray(input.palette) && input.palette.length === 7
      ? {
          palette: input.palette.map(c => ([
            Math.round(finite(c?.[0], 255, 0, 255)),
            Math.round(finite(c?.[1], 255, 0, 255)),
            Math.round(finite(c?.[2], 255, 0, 255)),
          ] as RgbColor)),
        }
      : {}),
  };
}

export function normalizeProfile(input: unknown): RgbProfile {
  if (!input || typeof input !== 'object') {
    throw Error('Expected RGB profile');
  }
  const value = input as RgbProfile;
  const profile = defaultRgb();
  if (value.custom?.version !== 1 || !value.custom.base || !Array.isArray(value.custom.layers)) {
    throw Error('Missing custom RGB configuration');
  }
  profile.keys = normalizeZone(value.keys, profile.keys);
  for (const id of HERO68_KEY_IDS) {
    const color = value.colors?.[id];
    if (!Array.isArray(color) || color.length !== 3 || color.some(c => !Number.isInteger(c) || c < 0 || c > 255)) {
      throw Error(`Invalid color for ${id}`);
    }
    profile.colors[id] = [...color];
  }
  profile.custom = restoreCustomRgb(value.custom, profile);
  // Side LEDs keep their onboard effect. CMD08 only addresses the main keys.
  profile.side.mode = 0;
  return profile;
}

export function percentile(values: readonly number[], fraction = 0.95): number | null {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}
