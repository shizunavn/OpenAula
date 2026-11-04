import { restoreCustomRgb } from '../../src/keyboard/customRgb';
import { HERO68_KEY_IDS } from '../../src/keyboard/hero68Layout';
import { defaultRgb, type RgbProfile } from '../../src/protocol/hero68/rgb';

export function normalizeProfile(input: unknown): RgbProfile {
  if (!input || typeof input !== 'object') {
    throw Error('Expected RGB profile');
  }
  const value = input as RgbProfile;
  const profile = defaultRgb();
  if (value.custom?.version !== 1 || !value.custom.base || !Array.isArray(value.custom.layers)) {
    throw Error('Missing custom RGB configuration');
  }
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
