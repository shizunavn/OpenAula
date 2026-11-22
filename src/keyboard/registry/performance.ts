import { normalizeSwitchProfileId } from '../../protocol/hero68/switchProfiles';
import type { BoardDescriptor, BoardSwitchSpec, ResolvedTravelLimits } from './types';

function roundMm(value: number, step: number): number {
  const decimals = step < 0.01 ? 3 : 2;
  return Number(value.toFixed(decimals));
}

export function snapTravelStep(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    return 0;
  }
  const snapped = Math.round(value / step) * step;
  return roundMm(snapped, step);
}

export function resolveBoardSwitch(
  board: BoardDescriptor,
  switchId?: string | null
): BoardSwitchSpec | undefined {
  if (!switchId) {
    return undefined;
  }
  const normalized = normalizeSwitchProfileId(switchId);
  return board.switches.switches.find(sw => sw.id === switchId || sw.id === normalized);
}

function switchEffectiveTravel(board: BoardDescriptor, switchId?: string | null): number {
  const sw = resolveBoardSwitch(board, switchId);
  if (!sw) {
    return board.performance.defaultMaxTravelMm;
  }
  return sw.firmwareMaxTravelMm ?? sw.travelMm;
}

export type ResolveTravelLimitsOptions = {
  switchId?: string | null;
  switchIds?: readonly (string | null | undefined)[];
  firmwareMaxTravelMm?: number | null;
};

/**
 * Dynamically computes effective Actuation, Rapid Trigger, DKS, and Gamepad travel
 * ceilings from the board's performance spec, selected switch(es), and optional
 * firmware handshake cap.
 */
export function resolveEffectiveTravelLimits(
  board: BoardDescriptor,
  options: ResolveTravelLimitsOptions = {}
): ResolvedTravelLimits {
  const perf = board.performance;
  let maxTravelMm = perf.defaultMaxTravelMm;

  if (options.switchIds && options.switchIds.length > 0) {
    let minTravel = Infinity;
    for (const id of options.switchIds) {
      const travel = switchEffectiveTravel(board, id);
      if (travel < minTravel) {
        minTravel = travel;
      }
    }
    if (Number.isFinite(minTravel)) {
      maxTravelMm = minTravel;
    }
  } else if (options.switchId) {
    maxTravelMm = switchEffectiveTravel(board, options.switchId);
  }

  if (
    board.switches.travelPolicy === 'switch-with-firmware-cap' &&
    typeof options.firmwareMaxTravelMm === 'number' &&
    Number.isFinite(options.firmwareMaxTravelMm) &&
    options.firmwareMaxTravelMm > perf.minActuationMm
  ) {
    maxTravelMm = Math.min(maxTravelMm, options.firmwareMaxTravelMm);
  }

  maxTravelMm = roundMm(Math.max(perf.minActuationMm, maxTravelMm), perf.distanceUnitMm);
  const step = perf.rapidTriggerStepMm || perf.distanceUnitMm;
  const dksMaxRaw = Math.max(perf.minActuationMm, maxTravelMm - perf.dksBottomMarginMm);

  return {
    maxTravelMm,
    actuationMinMm: perf.minActuationMm,
    actuationMaxMm: maxTravelMm,
    rapidTriggerMinMm: perf.minRapidTriggerMm,
    rapidTriggerMaxMm: maxTravelMm,
    rapidTriggerStepMm: step,
    dksMinMm: perf.minActuationMm,
    dksMaxMm: snapTravelStep(dksMaxRaw, perf.distanceUnitMm),
    gamepadEndMaxMm: maxTravelMm
  };
}

/**
 * Builds the sorted list of allowed Rapid Trigger values for the given limits
 * (or returns the board's explicit discrete list filtered to rapidTriggerMaxMm).
 */
export function generateRapidTriggerValues(
  board: BoardDescriptor,
  limits: ResolvedTravelLimits = resolveEffectiveTravelLimits(board)
): number[] {
  if (board.performance.rapidTriggerAllowedMm?.length) {
    return board.performance.rapidTriggerAllowedMm.filter(
      v => v >= limits.rapidTriggerMinMm && v <= limits.rapidTriggerMaxMm + 1e-6
    );
  }
  const step = limits.rapidTriggerStepMm;
  const startUnits = Math.round(limits.rapidTriggerMinMm / step);
  const endUnits = Math.round(limits.rapidTriggerMaxMm / step);
  const values: number[] = [];
  for (let i = startUnits; i <= endUnits; i++) {
    values.push(roundMm(i * step, step));
  }
  return values;
}
