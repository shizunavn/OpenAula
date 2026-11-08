import { defaultRhythm, validateRhythm, restoreRhythm, RHYTHM_MODES, type RhythmConfiguration } from '../src/keyboard/rhythm';
export { defaultRhythm, validateRhythm, restoreRhythm, RHYTHM_MODES };
export type { RhythmConfiguration };
export const RHYTHM_SIDE_VERIFIED = false;
/** Side modes that still need count/order/channel verification on real hardware. */
const RHYTHM_SIDE_UNVERIFIED: readonly RhythmConfiguration['sideMode'][] = [501, 502, 503, 504, 505, 506];
export function nativeRhythmCommand(input: RhythmConfiguration) {
  const c = validateRhythm(input);
  if (!RHYTHM_SIDE_VERIFIED && RHYTHM_SIDE_UNVERIFIED.includes(c.sideMode)) {
    throw Error('Side rhythm has not been verified on HERO68 hardware. Select Leave onboard for live playback.');
  }
  return 'rhythm:' + [c.keyMode, c.sideMode, c.brightness, c.sensitivity, c.releaseMs, c.speed, ...[1, 3, 5].map(i => parseInt(c.color.slice(i, i + 2), 16)), ['fixed', 'rainbow', 'aurora', 'fire'].indexOf(c.palette), c.spectrum.db, ['hann', 'hamming', 'blackman'].indexOf(c.spectrum.window), c.spectrum.spatialRadius, 1, Buffer.from(c.endpoint, 'utf8').toString('hex')].join(';');
}
