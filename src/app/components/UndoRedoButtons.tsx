import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';

export interface UndoRedoButtonsProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  disabled?: boolean;
  enableShortcuts?: boolean;
  className?: string;
}

function shouldBlockGlobalUndoShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target instanceof HTMLInputElement) {
    if (
      target.type === 'range' ||
      target.type === 'checkbox' ||
      target.type === 'radio' ||
      target.type === 'color'
    ) {
      return false;
    }
    if (target.closest('.meter-value-input, .custom-rgb-slider')) {
      return false;
    }
    return true;
  }
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
    return true;
  }
  return Boolean(target.closest('[contenteditable="true"]'));
}

function blurActiveTextInput() {
  if (typeof document === 'undefined') {
    return;
  }
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    active.blur();
  }
}

export function UndoRedoButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  disabled = false,
  enableShortcuts = false,
  className = ''
}: UndoRedoButtonsProps) {
  const { tr } = useI18n();

  useEffect(() => {
    if (!enableShortcuts) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (disabled || shouldBlockGlobalUndoShortcut(event.target)) {
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.altKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        if (canUndo) {
          event.preventDefault();
          blurActiveTextInput();
          onUndo();
        }
      } else if ((key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey)) {
        if (canRedo) {
          event.preventDefault();
          blurActiveTextInput();
          onRedo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canRedo, canUndo, disabled, enableShortcuts, onRedo, onUndo]);

  return (
    <div
      className={`woot-undo-redo-group ${className}`.trim()}
      role="group"
      aria-label={tr('Undo and Redo')}
    >
      <button
        type="button"
        className="woot-history-button"
        disabled={disabled || !canUndo}
        onPointerDown={() => blurActiveTextInput()}
        onClick={onUndo}
        title={`${tr('Undo')} (Ctrl+Z)`}
        aria-label={tr('Undo')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          height="20px"
          viewBox="0 -960 960 960"
          width="20px"
          fill="currentColor"
          focusable="false"
          className="chakra-icon css-6ey7w3"
          aria-hidden="true"
        >
          <path d="M288-192v-72h288q50 0 85-35t35-85q0-50-35-85t-85-35H330l93 93-51 51-180-180 180-180 51 51-93 93h246q80 0 136 56t56 136q0 80-56 136t-136 56H288Z" />
        </svg>
      </button>
      <button
        type="button"
        className="woot-history-button"
        disabled={disabled || !canRedo}
        onPointerDown={() => blurActiveTextInput()}
        onClick={onRedo}
        title={`${tr('Redo')} (Ctrl+Y)`}
        aria-label={tr('Redo')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          height="20px"
          viewBox="0 -960 960 960"
          width="20px"
          fill="currentColor"
          focusable="false"
          className="chakra-icon css-6ey7w3"
          aria-hidden="true"
        >
          <path d="M384-192q-80 0-136-56t-56-136q0-80 56-136t136-56h246l-93-93 51-51 180 180-180 180-51-51 93-93H384q-50 0-85 35t-35 85q0 50 35 85t85 35h288v72H384Z" />
        </svg>
      </button>
    </div>
  );
}

export function useUndoRedoState<T>(
  currentValue: T,
  applyValue: (next: T) => void,
  resetKey?: string | number | null,
  maxDepth = 40
) {
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const committedRef = useRef<T>(structuredClone(currentValue));
  const committedJsonRef = useRef<string>(JSON.stringify(currentValue));
  const lastResetKeyRef = useRef(resetKey);
  const isApplyingRef = useRef(false);
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (lastResetKeyRef.current !== resetKey) {
      lastResetKeyRef.current = resetKey;
      pastRef.current = [];
      futureRef.current = [];
      committedRef.current = structuredClone(currentValue);
      committedJsonRef.current = JSON.stringify(currentValue);
      setVersion(v => v + 1);
      return;
    }
    const nextJson = JSON.stringify(currentValue);
    if (nextJson === committedJsonRef.current) {
      isApplyingRef.current = false;
      return;
    }
    if (isApplyingRef.current) {
      isApplyingRef.current = false;
      committedRef.current = structuredClone(currentValue);
      committedJsonRef.current = nextJson;
      return;
    }
    pastRef.current = [...pastRef.current.slice(-(maxDepth - 1)), committedRef.current];
    futureRef.current = [];
    committedRef.current = structuredClone(currentValue);
    committedJsonRef.current = nextJson;
    setVersion(v => v + 1);
  }, [currentValue, maxDepth, resetKey]);

  const undo = () => {
    if (pastRef.current.length === 0) {
      return;
    }
    const previous = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, committedRef.current];
    const prevClone = structuredClone(previous);
    committedRef.current = prevClone;
    committedJsonRef.current = JSON.stringify(prevClone);
    isApplyingRef.current = true;
    setVersion(v => v + 1);
    applyValue(structuredClone(prevClone));
  };

  const redo = () => {
    if (futureRef.current.length === 0) {
      return;
    }
    const next = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, committedRef.current];
    const nextClone = structuredClone(next);
    committedRef.current = nextClone;
    committedJsonRef.current = JSON.stringify(nextClone);
    isApplyingRef.current = true;
    setVersion(v => v + 1);
    applyValue(structuredClone(nextClone));
  };

  const resetHistory = (baselineValue: T) => {
    pastRef.current = [];
    futureRef.current = [];
    const clone = structuredClone(baselineValue);
    committedRef.current = clone;
    committedJsonRef.current = JSON.stringify(clone);
    isApplyingRef.current = true;
    setVersion(v => v + 1);
  };

  return {
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    undo,
    redo,
    resetHistory
  };
}
