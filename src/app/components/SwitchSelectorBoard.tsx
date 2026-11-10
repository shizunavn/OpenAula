import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { heroLayout } from '../../keyboard/layout';
import type { HeroDeviceModelId } from '../../keyboard/devices';
import { SwitchStemMenuIcon } from './SwitchStemMenuIcon';

// React's CSSProperties has no index signature for custom properties.
const keyUnits = (units: number) => ({ '--key-units': units }) as CSSProperties;
const DRAG_THRESHOLD_PX = 5;

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
    boardLeft: number;
    boardTop: number;
    boardWidth: number;
    boardHeight: number;
    isDragging: boolean;
    deselect: boolean;
    baseSelection: Set<string>;
    liveSelection: Set<string>;
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
      const minX = Math.min(session.startClientX, event.clientX);
      const maxX = Math.max(session.startClientX, event.clientX);
      const minY = Math.min(session.startClientY, event.clientY);
      const maxY = Math.max(session.startClientY, event.clientY);

      const clampedLeft = Math.max(0, Math.min(session.boardWidth, minX - session.boardLeft));
      const clampedTop = Math.max(0, Math.min(session.boardHeight, minY - session.boardTop));
      const clampedRight = Math.max(0, Math.min(session.boardWidth, maxX - session.boardLeft));
      const clampedBottom = Math.max(0, Math.min(session.boardHeight, maxY - session.boardTop));

      setMarqueeRect({
        left: (clampedLeft / session.boardWidth) * 100,
        top: (clampedTop / session.boardHeight) * 100,
        width: Math.max(0, ((clampedRight - clampedLeft) / session.boardWidth) * 100),
        height: Math.max(0, ((clampedBottom - clampedTop) / session.boardHeight) * 100)
      });

      const nextSelection = new Set(session.baseSelection);
      for (const k of session.keyRects) {
        const intersects = k.left <= maxX && k.right >= minX && k.top <= maxY && k.bottom >= minY;
        if (intersects) {
          if (session.deselect) {
            nextSelection.delete(k.id);
          } else {
            nextSelection.add(k.id);
          }
        }
      }
      commitBatchSelection(nextSelection, session.liveSelection);
      session.liveSelection = nextSelection;
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

  return (
    <div className={`switch-board-wrap is-${model}`}>
      <div
        ref={boardRef}
        className="switch-board-preview"
        style={{ position: 'relative' }}
        onPointerDown={event => {
          if (event.button !== 0 || !boardRef.current) return;
          const bounds = boardRef.current.getBoundingClientRect();
          const keyButtons = Array.from(
            boardRef.current.querySelectorAll<HTMLButtonElement>(
              'button.switch-board-key[data-key-id]'
            )
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
          dragSessionRef.current = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            boardLeft: bounds.left,
            boardTop: bounds.top,
            boardWidth: Math.max(1, bounds.width),
            boardHeight: Math.max(1, bounds.height),
            isDragging: false,
            deselect: event.altKey,
            baseSelection: new Set(selectedKeysRef.current),
            liveSelection: new Set(selectedKeysRef.current),
            keyRects
          };
        }}
      >
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
        {marqueeRect && (
          <div
            className="hero-marquee-selection"
            aria-hidden="true"
            style={{
              left: `${marqueeRect.left}%`,
              top: `${marqueeRect.top}%`,
              width: `${marqueeRect.width}%`,
              height: `${marqueeRect.height}%`
            }}
          />
        )}
      </div>
    </div>
  );
}

export { SwitchSelectorBoard };
