import { clampNumber, snapToAllowedValue, snapToStep } from '../helpers';

type SliderStepScale =
  | {
      kind: 'discrete';
      values: readonly number[];
    }
  | {
      kind: 'continuous';
      min: number;
      max: number;
      step: number;
    };

interface SliderTrackAxis {
  trackStartPx: number;
  trackSpanPx: number;
  direction: 1 | -1;
}

interface SliderDragSession {
  pointerId: number;
  downCoordPx: number;
  grabOffsetPx: number;
  grabbedThumb: boolean;
  hasMovedBeyondThreshold: boolean;
  sessionValue: number;
}

const THUMB_HIT_RADIUS_PX = 12;
const DRAG_ACTIVATION_PX = 2;

function getScaleCount(scale: SliderStepScale): number {
  if (scale.kind === 'discrete') {
    return scale.values.length;
  }
  const minUm = Math.round(scale.min * 1000);
  const maxUm = Math.round(scale.max * 1000);
  const stepUm = Math.max(1, Math.round(scale.step * 1000));
  return Math.max(1, Math.floor((maxUm - minUm) / stepUm) + 1);
}

function scaleIndexToValue(scale: SliderStepScale, index: number): number {
  const maxIndex = Math.max(0, getScaleCount(scale) - 1);
  const clampedIndex = clampNumber(Math.round(index), 0, maxIndex);
  if (scale.kind === 'discrete') {
    return scale.values[clampedIndex] ?? 0;
  }
  const minUm = Math.round(scale.min * 1000);
  const stepUm = Math.max(1, Math.round(scale.step * 1000));
  return snapToStep((minUm + clampedIndex * stepUm) / 1000, scale.min, scale.max, scale.step);
}

function scaleValueToIndex(scale: SliderStepScale, value: number): number {
  const maxIndex = Math.max(0, getScaleCount(scale) - 1);
  if (scale.kind === 'discrete') {
    if (!scale.values.length) {
      return 0;
    }
    const target = snapToAllowedValue(
      clampNumber(value, scale.values[0], scale.values[scale.values.length - 1]),
      scale.values
    );
    const targetUm = Math.round(target * 1000);
    return scale.values.reduce((bestIndex, candidate, index) => {
      const bestDiff = Math.abs(Math.round(scale.values[bestIndex] * 1000) - targetUm);
      const nextDiff = Math.abs(Math.round(candidate * 1000) - targetUm);
      return nextDiff < bestDiff ? index : bestIndex;
    }, 0);
  }
  const minUm = Math.round(scale.min * 1000);
  const stepUm = Math.max(1, Math.round(scale.step * 1000));
  const clamped = snapToStep(value, scale.min, scale.max, scale.step);
  return clampNumber(Math.round((Math.round(clamped * 1000) - minUm) / stepUm), 0, maxIndex);
}

function ratioToScaleIndex(scale: SliderStepScale, ratio: number): number {
  const maxIndex = Math.max(0, getScaleCount(scale) - 1);
  return clampNumber(Math.round(clampNumber(ratio, 0, 1) * maxIndex), 0, maxIndex);
}

function ratioFromCoord(coordPx: number, axis: SliderTrackAxis): number {
  const normalized = clampNumber(
    (coordPx - axis.trackStartPx) / Math.max(1, axis.trackSpanPx),
    0,
    1
  );
  return axis.direction === 1 ? normalized : 1 - normalized;
}

function thumbCoordFromRatio(ratio: number, axis: SliderTrackAxis): number {
  const clampedRatio = clampNumber(ratio, 0, 1);
  const normalized = axis.direction === 1 ? clampedRatio : 1 - clampedRatio;
  return axis.trackStartPx + normalized * Math.max(1, axis.trackSpanPx);
}

/**
 * Starts a 1:1 pointer-drag session mapped directly to the track axis.
 */
function beginSliderDrag({
  pointerId,
  currentValue,
  currentRatio,
  fineScale,
  dragScale,
  coordPx,
  axis
}: {
  pointerId: number;
  currentValue: number;
  currentRatio: number;
  fineScale: SliderStepScale;
  dragScale?: SliderStepScale;
  coordPx: number;
  axis: SliderTrackAxis;
}): { session: SliderDragSession; jumpedValue: number | null } {
  const activeScale = dragScale ?? fineScale;
  const thumbCoord = thumbCoordFromRatio(currentRatio, axis);
  const grabbedThumb = Math.abs(coordPx - thumbCoord) <= THUMB_HIT_RADIUS_PX;

  if (grabbedThumb) {
    return {
      session: {
        pointerId,
        downCoordPx: coordPx,
        grabOffsetPx: coordPx - thumbCoord,
        grabbedThumb: true,
        hasMovedBeyondThreshold: false,
        sessionValue: currentValue
      },
      jumpedValue: null
    };
  }

  const clickedIndex = ratioToScaleIndex(activeScale, ratioFromCoord(coordPx, axis));
  const clickedValue = scaleIndexToValue(activeScale, clickedIndex);

  return {
    session: {
      pointerId,
      downCoordPx: coordPx,
      grabOffsetPx: 0,
      grabbedThumb: false,
      hasMovedBeyondThreshold: true,
      sessionValue: clickedValue
    },
    jumpedValue: clickedValue
  };
}

/**
 * Advances an active drag session on pointermove and returns the new snapped value when changed.
 */
function updateSliderDrag(
  session: SliderDragSession,
  {
    fineScale,
    dragScale,
    coordPx,
    axis
  }: {
    fineScale: SliderStepScale;
    dragScale?: SliderStepScale;
    coordPx: number;
    axis: SliderTrackAxis;
  }
): number | null {
  const activeScale = dragScale ?? fineScale;

  if (session.grabbedThumb && !session.hasMovedBeyondThreshold) {
    if (Math.abs(coordPx - session.downCoordPx) < DRAG_ACTIVATION_PX) {
      return null;
    }
    session.hasMovedBeyondThreshold = true;
  }

  const nextIndex = ratioToScaleIndex(
    activeScale,
    ratioFromCoord(coordPx - session.grabOffsetPx, axis)
  );
  const nextValue = scaleIndexToValue(activeScale, nextIndex);
  if (nextValue === session.sessionValue) {
    return null;
  }
  session.sessionValue = nextValue;
  return nextValue;
}

export {
  beginSliderDrag,
  getScaleCount,
  ratioToScaleIndex,
  scaleIndexToValue,
  scaleValueToIndex,
  updateSliderDrag
};
export type { SliderDragSession, SliderStepScale, SliderTrackAxis };
