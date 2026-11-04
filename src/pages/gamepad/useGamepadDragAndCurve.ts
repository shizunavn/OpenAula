import { useEffect, useRef, useState, type RefObject } from 'react';
import type { CurvePoint, GamepadAction, GamepadConfiguration } from '../../keyboard/gamepad';

export type DraggedGamepadBinding = {
  action: GamepadAction;
  x: number;
  y: number;
  sourceKeyId?: string;
};

export function useGamepadDragAndCurve({
  config,
  disabled,
  locked,
  profileBusy,
  tab,
  keyboardRef,
  onPatch,
  onRemoveBinding,
  onCurveDragStateChange,
}: {
  config: GamepadConfiguration;
  disabled: boolean;
  locked: boolean;
  profileBusy: boolean;
  tab: 'setup' | 'configuration' | 'tester';
  keyboardRef: RefObject<HTMLDivElement | null>;
  onPatch: (next: Partial<GamepadConfiguration>) => void;
  onRemoveBinding: (keyId: string) => void;
  onCurveDragStateChange?: (dragging: boolean) => void;
}) {
  const [dragged, setDragged] = useState<DraggedGamepadBinding | null>(null);
  const [removeTarget, setRemoveTarget] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<{ keyId: string; sequence: number } | null>(null);
  const [curveDragging, setCurveDragging] = useState(false);
  const [point, setPoint] = useState(1);

  const curveSvg = useRef<SVGSVGElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const curveBeforeDragRef = useRef<CurvePoint[] | null>(null);

  function clearDrag() {
    setDragged(null);
    setDropTarget(null);
    setRemoveTarget(false);
  }

  function finishCurve(cancel = false) {
    if (dragIndexRef.current === null) {
      return;
    }
    if (cancel && curveBeforeDragRef.current) {
      onPatch({ curve: curveBeforeDragRef.current });
    }
    curveBeforeDragRef.current = null;
    dragIndexRef.current = null;
    setCurveDragging(false);
    onCurveDragStateChange?.(false);
  }

  function startCurveDrag(index: number, pointerId: number, target: SVGCircleElement) {
    curveBeforeDragRef.current = config.curve.map((p) => [...p] as CurvePoint);
    onCurveDragStateChange?.(true);
    setCurveDragging(true);
    dragIndexRef.current = index;
    target.setPointerCapture(pointerId);
  }

  function changeCurve(index: number, x: number, y: number) {
    if (disabled || index <= 0 || index >= config.curve.length - 1) {
      return;
    }
    const next = config.curve.map((p) => [...p] as CurvePoint);
    const before = next[index - 1];
    const after = next[index + 1];
    const gap = Math.min(0.005, (after[0] - before[0]) / 3);
    next[index] = [
      Math.max(before[0] + gap, Math.min(after[0] - gap, x)),
      Math.max(before[1], Math.min(after[1], y)),
    ];
    onPatch({ curve: next });
  }

  function moveCurveDrag(clientX: number, clientY: number) {
    if (dragIndexRef.current === null || disabled || !curveSvg.current) {
      return;
    }
    const rect = curveSvg.current.getBoundingClientRect();
    const normX = (((clientX - rect.left) / rect.width) * 320 - 30) / 270;
    const normY = (220 - ((clientY - rect.top) / rect.height) * 250) / 200;
    changeCurve(dragIndexRef.current, normX, normY);
  }

  useEffect(() => {
    const sourceKeyId = dragged?.sourceKeyId;
    if (!sourceKeyId || disabled) {
      return;
    }
    const outsideKeyboard = (event: DragEvent) =>
      event.target instanceof Node &&
      !keyboardRef.current?.querySelector('.hero68-case')?.contains(event.target);

    const over = (event: DragEvent) => {
      const outside = outsideKeyboard(event);
      setRemoveTarget(outside);
      if (outside) {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'move';
        }
        setDropTarget(null);
      }
    };

    const drop = (event: DragEvent) => {
      if (!outsideKeyboard(event)) {
        return;
      }
      event.preventDefault();
      onRemoveBinding(sourceKeyId);
      clearDrag();
    };

    document.addEventListener('dragover', over);
    document.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('dragover', over);
      document.removeEventListener('drop', drop);
    };
  }, [dragged, disabled]);

  useEffect(() => {
    if (!assigned) {
      return;
    }
    const timer = setTimeout(() => setAssigned(null), 700);
    return () => clearTimeout(timer);
  }, [assigned]);

  useEffect(() => {
    if (locked || profileBusy) {
      clearDrag();
      if (dragIndexRef.current !== null) {
        finishCurve(true);
      }
    }
  }, [locked, profileBusy]);

  useEffect(() => {
    if (!curveDragging) {
      return;
    }
    if (tab !== 'configuration') {
      finishCurve(true);
      return;
    }
    const cancel = () => finishCurve(true);
    const visibility = () => {
      if (document.hidden) {
        cancel();
      }
    };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [curveDragging, tab]);

  return {
    dragged,
    setDragged,
    removeTarget,
    setRemoveTarget,
    dropTarget,
    setDropTarget,
    assigned,
    setAssigned,
    curveDragging,
    point,
    setPoint,
    curveSvg,
    clearDrag,
    startCurveDrag,
    moveCurveDrag,
    finishCurve,
    changeCurve,
  };
}
