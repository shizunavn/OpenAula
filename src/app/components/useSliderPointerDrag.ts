import { useEffect, useRef } from 'react';
import type * as React from 'react';
import {
  beginSliderDrag,
  type SliderDragSession,
  type SliderStepScale,
  type SliderTrackAxis,
  updateSliderDrag
} from './sliderDrag';

/**
 * Shared pointer-capture drag hook for horizontal and vertical range sliders.
 */
function useSliderPointerDrag({
  disabled,
  currentValue,
  currentRatio,
  fineScale,
  dragScale,
  getTrackAxis,
  getCoord,
  onCommitValue
}: {
  disabled: boolean;
  currentValue: number;
  currentRatio: number;
  fineScale: SliderStepScale;
  dragScale?: SliderStepScale;
  getTrackAxis: (target: HTMLInputElement) => SliderTrackAxis;
  getCoord: (event: React.PointerEvent<HTMLInputElement>) => number;
  onCommitValue: (nextValue: number) => void;
}) {
  const dragSessionRef = useRef<SliderDragSession | null>(null);

  useEffect(() => {
    if (disabled) {
      dragSessionRef.current = null;
    }
  }, [disabled]);

  const finishDrag = (e: React.PointerEvent<HTMLInputElement>, releaseCapture: boolean) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) {
      return;
    }
    dragSessionRef.current = null;
    if (releaseCapture && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore capture release errors if capture already ended.
      }
    }
  };

  return {
    onPointerDown: (e: React.PointerEvent<HTMLInputElement>) => {
      if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) {
        return;
      }
      e.preventDefault();
      e.currentTarget.focus({ preventScroll: true });
      const { session, jumpedValue } = beginSliderDrag({
        pointerId: e.pointerId,
        currentValue,
        currentRatio,
        fineScale,
        dragScale,
        coordPx: getCoord(e),
        axis: getTrackAxis(e.currentTarget)
      });
      dragSessionRef.current = session;
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // Ignore capture errors in headless environments without pointer capture.
      }
      if (jumpedValue != null) {
        onCommitValue(jumpedValue);
      }
    },
    onPointerMove: (e: React.PointerEvent<HTMLInputElement>) => {
      const session = dragSessionRef.current;
      if (disabled || !session || session.pointerId !== e.pointerId) {
        return;
      }
      const nextValue = updateSliderDrag(session, {
        fineScale,
        dragScale,
        coordPx: getCoord(e),
        axis: getTrackAxis(e.currentTarget)
      });
      if (nextValue != null) {
        onCommitValue(nextValue);
      }
    },
    onPointerUp: (e: React.PointerEvent<HTMLInputElement>) => finishDrag(e, true),
    onPointerCancel: (e: React.PointerEvent<HTMLInputElement>) => finishDrag(e, false),
    onLostPointerCapture: (e: React.PointerEvent<HTMLInputElement>) => finishDrag(e, false)
  };
}

export { useSliderPointerDrag };
