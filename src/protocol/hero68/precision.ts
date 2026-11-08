/**
 * Firmware 0323 host-facing distance scale (`0.01 mm` per wire unit, `precision_rt = 10`).
 *
 * HERO 68 XS (`v1.17`) reports `precision_rt = 5` and `precision_distance = 5` via CMD `0x82`
 * zones `6` and `8`, representing `5 µm` (`0.005 mm`) per wire unit.
 */
export const HERO68_DISTANCE_UNIT_MM = 0.01 as const;
export const HERO68_XS_DISTANCE_UNIT_MM = 0.005 as const;

let activeHero68DistanceUnitMm: number = HERO68_DISTANCE_UNIT_MM;

export function getHero68DistanceUnitMm(): number {
  return activeHero68DistanceUnitMm;
}

export function setHero68DistanceUnitMm(unitMm: number): void {
  if (unitMm === 0.005 || unitMm === 0.01 || unitMm === 0.001) {
    activeHero68DistanceUnitMm = unitMm;
  }
}
