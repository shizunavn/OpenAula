import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { heroLayout } from '../../keyboard/layout';
import type { HeroDeviceModelId } from '../../keyboard/devices';
import { SwitchStemMenuIcon } from './SwitchStemMenuIcon';

// React's CSSProperties has no index signature for custom properties.
const keyUnits = (units: number) => ({ '--key-units': units }) as CSSProperties;
const DRAG_THRESHOLD_PX = 4;

function segmentIntersectsRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rect: { left: number; top: number; right: number; bottom: number }
): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return true;
    }
  }
  return false;
}

function SwitchSelectorBoard({
  model,
  selectedKeys,
  onToggleKey,
  onSelectKeys,
  switchImagesByKey
}: {
  model: HeroDeviceModelId;
  selectedKeys: Set<string>;
  onToggleKey: (keyId: string) => void;
  onSelectKeys?: (nextKeys: Set<string>) => void;
  switchImagesByKey: Record<string, string>;
}) {
  const rows = heroLayout(model).rows;
  const wrapRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const selectedKeysRef = useRef<Set<string>>(selectedKeys);
  selectedKeysRef.current = selectedKeys;
  const suppressNextClickRef = useRef(false);

  const [marqueeRect, setMarqueeRect] = useState<null | {
    left: number;
    top: number;
    width: number;
    height: number;
  }>(null);

  const dragSessionRef = useRef<null | {
    pointerId: number;
    startClientX: number;
    startClientY: number;
    lastClientX: number;
    lastClientY: number;
    isDragging: boolean;
    mode: 'box' | 'swipe';
    startKeyId: string | null;
    deselect: boolean;
    liveSelection: Set<string>;
    visitedSwipeKeys: Set<string>;
    keyRects: { id: string; left: number; top: number; right: number; bottom: number }[];
  }>(null);

  const commitBatchSelection = (nextSet: Set<string>, prevSet: Set<string>) => {
    let changed = nextSet.size !== prevSet.size;
    if (!changed) {
      for (const id of nextSet) {
        if (!prevSet.has(id)) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;
    if (onSelectKeys) {
      onSelectKeys(new Set(nextSet));
      return;
    }
    for (const id of nextSet) {
      if (!prevSet.has(id)) onToggleKey(id);
    }
    for (const id of prevSet) {
      if (!nextSet.has(id)) onToggleKey(id);
    }
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      const dx = event.clientX - session.startClientX;
      const dy = event.clientY - session.startClientY;
      if (!session.isDragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        session.isDragging = true;
        suppressNextClickRef.current = true;
      }

      if (session.mode === 'box') {
        const minX = Math.min(session.startClientX, event.clientX);
        const maxX = Math.max(session.startClientX, event.clientX);
        const minY = Math.min(session.startClientY, event.clientY);
        const maxY = Math.max(session.startClientY, event.clientY);

        setMarqueeRect({
          left: minX,
          top: minY,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY)
        });

        // Auto deselect all previous keys on each box drag
        const nextSelection = new Set<string>();
        for (const k of session.keyRects) {
          const intersects = k.left <= maxX && k.right >= minX && k.top <= maxY && k.bottom >= minY;
          if (intersects) {
            nextSelection.add(k.id);
          }
        }
        commitBatchSelection(nextSelection, session.liveSelection);
        session.liveSelection = nextSelection;
      } else {
        // Swipe drag inside keys: only adds to selection (never deselects)
        const nextSelection = new Set(session.liveSelection);
        if (session.startKeyId) {
          nextSelection.add(session.startKeyId);
        }
        for (const k of session.keyRects) {
          if (
            segmentIntersectsRect(
              session.lastClientX,
              session.lastClientY,
              event.clientX,
              event.clientY,
              k
            )
          ) {
            nextSelection.add(k.id);
          }
        }
        session.lastClientX = event.clientX;
        session.lastClientY = event.clientY;
        commitBatchSelection(nextSelection, session.liveSelection);
        session.liveSelection = nextSelection;
      }
    };

    const onUp = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      const wasDragging = session.isDragging;
      dragSessionRef.current = null;
      if (wasDragging) {
        setMarqueeRect(null);
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 60);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  });

  const startSession = (
    pointerId: number,
    clientX: number,
    clientY: number,
    targetEl: HTMLElement | null
  ) => {
    if (!boardRef.current) return;
    const keyButtons = Array.from(
      boardRef.current.querySelectorAll<HTMLButtonElement>('button.switch-board-key[data-key-id]')
    );
    const keyRects = keyButtons.map(btn => {
      const r = btn.getBoundingClientRect();
      return {
        id: btn.dataset.keyId!,
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom
      };
    });
    const startKeyBtn = targetEl?.closest<HTMLButtonElement>(
      'button.switch-board-key[data-key-id]'
    );
    const startKeyId = startKeyBtn?.dataset.keyId ?? null;
    const mode: 'box' | 'swipe' = startKeyId ? 'swipe' : 'box';
    const startKeySelected = Boolean(startKeyId && selectedKeysRef.current.has(startKeyId));

    dragSessionRef.current = {
      pointerId,
      startClientX: clientX,
      startClientY: clientY,
      lastClientX: clientX,
      lastClientY: clientY,
      isDragging: false,
      mode,
      startKeyId,
      deselect: mode === 'swipe' ? startKeySelected : false,
      liveSelection: new Set(selectedKeysRef.current),
      visitedSwipeKeys: new Set(startKeyId ? [startKeyId] : []),
      keyRects
    };
  };

  useEffect(() => {
    const wrapEl = wrapRef.current;
    const stageEl = wrapEl?.closest<HTMLElement>('.switch-selector-stage');
    if (!stageEl) return;

    const pageEl = stageEl.closest<HTMLElement>('.page, .switch-selector-page');
    const instructionEl =
      pageEl?.querySelector<HTMLElement>('.selection-instruction, .switch-selection-instruction') ??
      null;

    const onStageDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (wrapEl && wrapEl.contains(event.target as Node | null)) return;
      startSession(
        event.pointerId,
        event.clientX,
        event.clientY,
        event.target as HTMLElement | null
      );
    };

    const onInstructionDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      startSession(
        event.pointerId,
        event.clientX,
        event.clientY,
        event.target as HTMLElement | null
      );
    };

    stageEl.addEventListener('pointerdown', onStageDown);
    instructionEl?.addEventListener('pointerdown', onInstructionDown);
    return () => {
      stageEl.removeEventListener('pointerdown', onStageDown);
      instructionEl?.removeEventListener('pointerdown', onInstructionDown);
    };
  }, [model]);

  return (
    <div
      ref={wrapRef}
      className={`switch-board-wrap is-${model}`}
      onPointerDown={event => {
        if (event.button !== 0) return;
        startSession(
          event.pointerId,
          event.clientX,
          event.clientY,
          event.target as HTMLElement | null
        );
      }}
    >
      <div ref={boardRef} className="switch-board-preview" style={{ position: 'relative' }}>
        {rows.map((row, rowIndex) => (
          <div className="switch-board-row" key={rowIndex}>
            {row.map(key => (
              <button
                key={key.id}
                type="button"
                data-key-id={key.id}
                className={`switch-board-key ${selectedKeys.has(key.id) ? 'is-selected' : ''}`}
                style={keyUnits(key.width ?? 1)}
                onClick={event => {
                  if (suppressNextClickRef.current) {
                    suppressNextClickRef.current = false;
                    event.preventDefault();
                    return;
                  }
                  if (event.detail > 0) {
                    event.currentTarget.blur();
                  }
                  onToggleKey(key.id);
                }}
                aria-label={key.label}
              >
                {switchImagesByKey[key.id] ? (
                  <img
                    src={switchImagesByKey[key.id]}
                    alt=""
                    aria-hidden="true"
                    className="switch-board-switch"
                  />
                ) : (
                  <span className="switch-board-generic" aria-hidden="true">
                    <SwitchStemMenuIcon />
                  </span>
                )}
                <span className="switch-board-key-label" aria-hidden="true">
                  {key.label}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {marqueeRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="hero-marquee-selection"
            aria-hidden="true"
            style={{
              position: 'fixed',
              left: `${marqueeRect.left}px`,
              top: `${marqueeRect.top}px`,
              width: `${marqueeRect.width}px`,
              height: `${marqueeRect.height}px`
            }}
          />,
          document.body
        )}
    </div>
  );
}

export { SwitchSelectorBoard };
