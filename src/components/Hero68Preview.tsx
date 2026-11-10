import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';
import { formatMillimeters } from '../app/helpers';
import { heroLayout } from '../keyboard/layout';
import type { HeroDeviceModelId } from '../keyboard/devices';
import { subscribeLightingFrame, type LightingFrame } from '../keyboard/lightingPreviewBus';
import { useServiceLighting } from '../protocol/serviceLighting';
import { HERO68_HALL_VISUAL_MAX_MM } from '../protocol/hero68/hallStream';
import type { AdvancedBinding } from '../protocol/hero68/advanced';
import AdvancedKeyIcon from './AdvancedKeyIcon';
import { TachyonContext } from '../app/TachyonContext';
import { DeviceModelContext } from '../app/DeviceModelContext';
import { useI18n } from '../i18n';

const tachyonLightingFrames = Object.fromEntries(
  (['hero68', 'hero68Xs', 'hero84', 'win68HeMax', 'win68'] as const).map(model => [
    model,
    Object.fromEntries(
      heroLayout(model)
        .rows.flat()
        .map(key => [key.id, '#000000'])
    )
  ])
) as Record<HeroDeviceModelId, LightingFrame>;

const WOOTILITY_MAX_FONT_PX = 12.3199;
const HERO68_DESIGN_WIDTH_EM = 64.05;
const HERO68_DESIGN_HEIGHT_EM = 21.35;
// Each extra row adds one key pitch (3.815em key + 0.0812em gap); HERO84 has 6 rows.
const HERO68_ROWS = 5;
const HERO_ROW_PITCH_EM = 3.8962;
const HERO68_MIN_FONT_PX = 7.4;
const HALL_STREAM_NOISE_FLOOR_MM = 0.05;
const DRAG_THRESHOLD_PX = 5;

function fitKeyboardFontSize(
  width: number,
  height: number,
  rows: number,
  maxFontPx = WOOTILITY_MAX_FONT_PX
) {
  const designHeightEm = HERO68_DESIGN_HEIGHT_EM + (rows - HERO68_ROWS) * HERO_ROW_PITCH_EM;
  const widthScale = width / HERO68_DESIGN_WIDTH_EM;
  const heightScale = height > 0 ? height / designHeightEm : maxFontPx;
  const fitted = Math.min(widthScale, heightScale, maxFontPx);
  // Preserve the preferred minimum only while the entire keyboard still fits.
  const minimum = Math.min(HERO68_MIN_FONT_PX, widthScale, heightScale);
  return Math.max(minimum, Math.round(fitted * 100) / 100);
}

export type Hero68PreviewProps = {
  model?: HeroDeviceModelId;
  selectedKeys: Set<string>;
  highlightedKeys?: ReadonlySet<string>;
  onToggleKey: (keyId: string) => void;
  onSelectKeys?: (nextKeys: Set<string>) => void;
  onDropKey?: (keyId: string, event: React.DragEvent<HTMLButtonElement>) => void;
  onDragOverKey?: (keyId: string, event: React.DragEvent<HTMLButtonElement>) => void;
  onDragLeaveKey?: (keyId: string) => void;
  draggableKeys?: ReadonlySet<string>;
  onDragStartKey?: (keyId: string, event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEndKey?: (keyId: string, event: React.DragEvent<HTMLButtonElement>) => void;
  onRemoveKey?: (keyId: string) => void;
  keyLabels?: Record<string, string>;
  keyDecorations?: Record<string, ReactNode>;
  keyClassNames?: Record<string, string>;
  advancedBindings?: AdvancedBinding[];
  showAdvancedIcons?: boolean;
  keyTooltips?: Record<
    string,
    {
      title: string;
      detail?: string;
      raw?: string;
    }
  >;
  lightingFrame?: LightingFrame;
  lightingSource?: 'auto' | 'local';
  selectionEnabled?: boolean;
  overlayMode?: 'none' | 'actuation' | 'rapid' | 'deadzone' | 'stream';
  actuationValues?: Record<string, number>;
  rapidPreviewValues?: Record<
    string,
    {
      primary: string;
      secondary?: string;
      active: boolean;
    }
  >;
  deadzonePreviewValues?: Record<
    string,
    {
      top: string;
      bottom: string;
      active: boolean;
    }
  >;
  streamPreviewValues?: Record<
    string,
    {
      distanceMm: number;
      rawAdc: number;
      pressed: boolean;
      releaseInferred?: boolean;
    }
  >;
  maxFontPx?: number;
  onWidthChange?: (width: number) => void;
};

export default function Hero68Preview({
  model: modelProp,
  selectedKeys,
  highlightedKeys,
  onToggleKey,
  onSelectKeys,
  onDropKey,
  onDragOverKey,
  onDragLeaveKey,
  draggableKeys,
  onDragStartKey,
  onDragEndKey,
  onRemoveKey,
  keyLabels,
  keyDecorations,
  keyClassNames,
  advancedBindings = [],
  showAdvancedIcons = true,
  keyTooltips = {},
  lightingFrame,
  lightingSource = 'auto',
  selectionEnabled = true,
  overlayMode = 'none',
  actuationValues = {},
  rapidPreviewValues = {},
  deadzonePreviewValues = {},
  streamPreviewValues = {},
  maxFontPx = WOOTILITY_MAX_FONT_PX,
  onWidthChange
}: Hero68PreviewProps) {
  const { tr } = useI18n();
  const contextModel = useContext(DeviceModelContext);
  const model = modelProp ?? contextModel;
  const keyboard = useMemo(() => heroLayout(model), [model]);
  const baseDemoLighting = useMemo(() => keyboard.makeDemoLighting(), [keyboard]);
  const keyLabelById = useMemo(
    () => new Map(keyboard.rows.flat().map(key => [key.id, key.label])),
    [keyboard]
  );
  const tachyon = useContext(TachyonContext);
  const serviceLighting = useServiceLighting(!tachyon && lightingSource !== 'local');
  const displayedLighting = tachyon
    ? (tachyonLightingFrames[model] ?? tachyonLightingFrames.hero68)
    : lightingSource === 'local'
      ? lightingFrame
      : (serviceLighting ?? lightingFrame);
  const advancedByKey = useMemo(
    () =>
      new Map(
        advancedBindings.flatMap(binding => binding.keys.map(key => [key, binding] as const))
      ),
    [advancedBindings]
  );
  const previewTooltips = useMemo(() => {
    const result = {
      ...keyTooltips
    };
    for (const [keyId, binding] of advancedByKey) {
      const physical = keyLabelById.get(keyId) ?? keyId;
      result[keyId] = {
        ...result[keyId],
        title: `${physical} · ${binding.kind === 'UNKNOWN' ? 'Advanced Key' : binding.kind}`,
        detail: [
          result[keyId]?.title,
          result[keyId]?.detail,
          binding.kind === 'SOCD'
            ? `Paired with ${binding.keys
                .filter(key => key !== keyId)
                .map(key => keyLabelById.get(key) ?? key)
                .join(', ')}`
            : 'Advanced Key binding'
        ]
          .filter(Boolean)
          .join(' · ')
      };
    }
    return result;
  }, [advancedByKey, keyLabelById, keyTooltips]);

  const [lighting, setLighting] = useState<LightingFrame>(() => baseDemoLighting);
  useEffect(() => {
    setLighting(previous => ({
      ...baseDemoLighting,
      ...previous
    }));
  }, [baseDemoLighting]);

  const previewRef = useRef<HTMLDivElement>(null);
  const caseRef = useRef<HTMLDivElement>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const selectedKeysRef = useRef<Set<string>>(selectedKeys);
  selectedKeysRef.current = selectedKeys;

  const [keyboardFontSize, setKeyboardFontSize] = useState(maxFontPx);
  const [dragSelectionMode, setDragSelectionMode] = useState<'box' | 'swipe'>('box');
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
    isDragging: boolean;
    mode: 'box' | 'swipe';
    deselect: boolean;
    baseSelection: Set<string>;
    liveSelection: Set<string>;
    keyRects: { id: string; left: number; top: number; right: number; bottom: number }[];
  }>(null);
  const suppressNextClickRef = useRef(false);

  const [keyTooltip, setKeyTooltip] = useState<null | {
    keyId: string;
    title: string;
    detail?: string;
    raw?: string;
    left: number;
    top: number;
    placement: 'above' | 'below';
  }>(null);

  const clearTooltipTimer = () => {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  };

  const showKeyTooltip = (keyId: string, target: HTMLButtonElement, immediate = false) => {
    if (dragSessionRef.current?.isDragging) {
      return;
    }
    const tooltip = previewTooltips[keyId];
    if (!tooltip) {
      return;
    }
    clearTooltipTimer();
    const show = () => {
      const rect = target.getBoundingClientRect();
      const placement: 'above' | 'below' = rect.top >= 106 ? 'above' : 'below';
      const left = Math.max(124, Math.min(window.innerWidth - 124, rect.left + rect.width / 2));
      const top = placement === 'above' ? rect.top - 8 : rect.bottom + 8;
      setKeyTooltip({
        keyId,
        ...tooltip,
        left,
        top,
        placement
      });
      tooltipTimerRef.current = null;
    };
    if (immediate) {
      show();
    } else {
      tooltipTimerRef.current = window.setTimeout(show, 170);
    }
  };

  const hideKeyTooltip = () => {
    clearTooltipTimer();
    setKeyTooltip(null);
  };

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
      if (!prevSet.has(id)) {
        onToggleKey(id);
      }
    }
    for (const id of prevSet) {
      if (!nextSet.has(id)) {
        onToggleKey(id);
      }
    }
  };

  const canDragSelect =
    selectionEnabled && overlayMode !== 'stream' && (!draggableKeys || draggableKeys.size === 0);

  const handleStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canDragSelect || event.button !== 0) {
      return;
    }
    const targetEl = event.target as HTMLElement | null;
    if (targetEl?.closest('.hero-drag-mode-bar')) {
      return;
    }
    const caseEl = caseRef.current;
    if (!caseEl) return;

    const keyButtons = Array.from(
      caseEl.querySelectorAll<HTMLButtonElement>('button.hero-key[data-key-id]')
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

    const startKeyBtn = targetEl?.closest<HTMLButtonElement>('button.hero-key[data-key-id]');
    const startKeyId = startKeyBtn?.dataset.keyId ?? null;
    const effectiveMode: 'box' | 'swipe' = event.shiftKey ? 'swipe' : dragSelectionMode;
    const startKeySelected = Boolean(startKeyId && selectedKeysRef.current.has(startKeyId));
    const allCurrentlySelected =
      keyRects.length > 0 && selectedKeysRef.current.size >= keyRects.length;
    const deselect =
      event.altKey ||
      (effectiveMode === 'swipe' && startKeySelected) ||
      (effectiveMode === 'box' && (allCurrentlySelected || (startKeySelected && event.ctrlKey)));

    dragSessionRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      isDragging: false,
      mode: effectiveMode,
      deselect,
      baseSelection: new Set(selectedKeysRef.current),
      liveSelection: new Set(selectedKeysRef.current),
      keyRects
    };
  };

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;

      const dx = event.clientX - session.startClientX;
      const dy = event.clientY - session.startClientY;
      if (!session.isDragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
          return;
        }
        session.isDragging = true;
        suppressNextClickRef.current = true;
        hideKeyTooltip();
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
      } else {
        // Swipe / paint mode: hit-test key under pointer (and start point)
        const nextSelection = new Set(session.liveSelection);
        for (const k of session.keyRects) {
          const hitCurrent =
            event.clientX >= k.left &&
            event.clientX <= k.right &&
            event.clientY >= k.top &&
            event.clientY <= k.bottom;
          const hitStart =
            session.startClientX >= k.left &&
            session.startClientX <= k.right &&
            session.startClientY >= k.top &&
            session.startClientY <= k.bottom;
          if (hitCurrent || hitStart) {
            if (session.deselect) {
              nextSelection.delete(k.id);
            } else {
              nextSelection.add(k.id);
            }
          }
        }
        commitBatchSelection(nextSelection, session.liveSelection);
        session.liveSelection = nextSelection;
      }
    };

    const handleWindowPointerUp = (event: PointerEvent) => {
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

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  });

  const rows = keyboard.rows.length;
  useLayoutEffect(() => {
    const preview = previewRef.current;
    const container = preview?.parentElement;
    if (!preview || !container) {
      return;
    }
    const updateSize = () => {
      const horizontalPadding = 12;
      const verticalPadding = 8;
      const availableWidth = Math.max(1, container.clientWidth - horizontalPadding);
      const availableHeight = Math.max(1, container.clientHeight - verticalPadding);
      setKeyboardFontSize(current => {
        const next = fitKeyboardFontSize(availableWidth, availableHeight, rows, maxFontPx);
        return Math.abs(current - next) > 0.01 ? next : current;
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [maxFontPx, rows]);

  useLayoutEffect(() => {
    const keyboardEl = previewRef.current?.querySelector<HTMLElement>('.hero68-case');
    const layoutEl = previewRef.current?.querySelector<HTMLElement>('.hero68-layout');
    if (!keyboardEl || !onWidthChange) {
      return;
    }
    const measureCaseWidth = (borderInlineSize?: number) => {
      const measured = Math.round(
        Math.max(
          borderInlineSize ?? 0,
          keyboardEl.offsetWidth,
          keyboardEl.scrollWidth,
          layoutEl?.scrollWidth ?? 0
        )
      );
      if (measured >= 320) {
        onWidthChange(measured);
      }
    };
    measureCaseWidth();
    const observer = new ResizeObserver(([entry]) => {
      measureCaseWidth(entry?.borderBoxSize?.[0]?.inlineSize);
    });
    observer.observe(keyboardEl);
    return () => observer.disconnect();
  }, [onWidthChange, model]);

  useEffect(
    () =>
      lightingFrame || tachyon
        ? undefined
        : subscribeLightingFrame(frame => {
            setLighting(previous => ({
              ...previous,
              ...frame
            }));
          }),
    [lightingFrame, tachyon]
  );
  useEffect(() => () => clearTooltipTimer(), []);
  useEffect(() => {
    if (!keyTooltip) {
      return;
    }
    const dismiss = () => hideKeyTooltip();
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [keyTooltip]);

  return (
    <>
      <div
        ref={previewRef}
        className={`hero68-preview-wrap is-${model} ${model === 'hero68Xs' ? 'is-hero68' : ''} ${marqueeRect ? 'is-marquee-dragging' : ''}`}
        aria-label={`${keyboard.model.label} RGB preview`}
        onPointerDown={handleStagePointerDown}
        style={
          {
            '--keyboard-font-size': `${keyboardFontSize}px`
          } as React.CSSProperties
        }
      >
        <div ref={caseRef} className="hero68-case">
          <div className="hero68-layout" dir="ltr">
            {keyboard.rows.map((row, rowIndex) => (
              <div className="hero68-row" key={rowIndex}>
                {row.map((key, keyIndex) => {
                  const selected = selectedKeys.has(key.id);
                  const advanced =
                    overlayMode === 'deadzone' ? undefined : advancedByKey.get(key.id);
                  const advancedIcon = showAdvancedIcons &&
                    advanced &&
                    !(
                      overlayMode === 'rapid' &&
                      rapidPreviewValues[key.id]?.active &&
                      rapidPreviewValues[key.id]?.secondary
                    ) && (
                      <span className="hero-key-advanced-icon">
                        <AdvancedKeyIcon kind={advanced.kind} />
                      </span>
                    );
                  const keyColor =
                    (displayedLighting ?? lighting)[key.id] ??
                    baseDemoLighting[key.id] ??
                    '#35393b';
                  const channels = /^#[0-9a-f]{6}$/i.test(keyColor)
                    ? [1, 3, 5].map(i => parseInt(keyColor.slice(i, i + 2), 16))
                    : undefined;
                  const rgbTextColor =
                    displayedLighting &&
                    channels &&
                    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 155
                      ? '#172022'
                      : undefined;
                  const rapidPreview = rapidPreviewValues[key.id];
                  const deadzonePreview = deadzonePreviewValues[key.id];
                  const streamPreview = streamPreviewValues[key.id];
                  const actuationValue = actuationValues[key.id] ?? 0;
                  const showActuationOverlay = overlayMode === 'actuation';
                  const showRapidOverlay = overlayMode === 'rapid';
                  const rapidDisabled = showRapidOverlay && !rapidPreview?.active;
                  const showDeadzoneOverlay = overlayMode === 'deadzone';
                  const deadzoneDisabled = showDeadzoneOverlay && !deadzonePreview?.active;
                  const showStreamOverlay = overlayMode === 'stream';
                  const showStreamState = Boolean(
                    showStreamOverlay &&
                    streamPreview &&
                    (streamPreview.pressed ||
                      streamPreview.releaseInferred ||
                      streamPreview.distanceMm >= HALL_STREAM_NOISE_FLOOR_MM)
                  );
                  const streamTravelPercent =
                    showStreamState && streamPreview
                      ? Math.max(
                          0,
                          Math.min(
                            100,
                            (streamPreview.distanceMm / HERO68_HALL_VISUAL_MAX_MM) * 100
                          )
                        )
                      : 0;
                  if (key.spacer) {
                    return (
                      <div className="hero-key-slot is-spacer" key={key.id} aria-hidden="true" />
                    );
                  }
                  return (
                    <div
                      className="hero-key-slot"
                      key={key.id}
                      style={
                        {
                          '--key-units': key.width ?? 1
                        } as React.CSSProperties
                      }
                    >
                      <div
                        className="hero-key-selectable"
                        data-key={key.matrixKey ?? `${rowIndex}-${keyIndex}`}
                      >
                        <button
                          type="button"
                          data-key-id={key.id}
                          aria-label={keyLabels?.[key.id] ?? key.label}
                          aria-description={advanced ? previewTooltips[key.id]?.title : undefined}
                          className={`hero-key ${keyClassNames?.[key.id] ?? ''} ${highlightedKeys?.has(key.id) ? 'is-preset-highlighted' : ''} ${advanced ? 'has-advanced-binding' : ''} ${overlayMode === 'rapid' && rapidPreviewValues[key.id]?.active && rapidPreviewValues[key.id]?.secondary ? 'has-split-rapid' : ''} ${selected ? 'is-selected' : ''} ${overlayMode !== 'none' ? 'has-overlay' : ''} ${showActuationOverlay ? 'is-actuation-overlay' : ''} ${showRapidOverlay && rapidPreview?.active ? 'has-rapid-overlay' : ''} ${rapidDisabled || deadzoneDisabled ? 'is-feature-disabled' : ''} ${showDeadzoneOverlay && deadzonePreview?.active ? 'has-deadzone-overlay' : ''} ${showStreamOverlay ? 'is-stream-key' : ''} ${showStreamState ? 'has-stream-overlay' : ''} ${showStreamState && streamPreview?.releaseInferred ? 'has-stream-inferred-release' : ''}`}
                          style={
                            {
                              '--key-rgb': keyColor,
                              '--rgb-label-color': rgbTextColor,
                              '--stream-travel': `${streamTravelPercent}%`
                            } as React.CSSProperties
                          }
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
                          draggable={draggableKeys?.has(key.id) ?? false}
                          onDragStart={event => {
                            hideKeyTooltip();
                            onDragStartKey?.(key.id, event);
                          }}
                          onDragEnd={event => onDragEndKey?.(key.id, event)}
                          onDragOver={event => {
                            if (onDropKey) {
                              event.preventDefault();
                            }
                            onDragOverKey?.(key.id, event);
                          }}
                          onDragLeave={event => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                              onDragLeaveKey?.(key.id);
                            }
                          }}
                          onDrop={event => onDropKey?.(key.id, event)}
                          onContextMenu={event => {
                            if (onRemoveKey) {
                              event.preventDefault();
                              onRemoveKey(key.id);
                            }
                          }}
                          onPointerEnter={event => showKeyTooltip(key.id, event.currentTarget)}
                          onPointerLeave={hideKeyTooltip}
                          onFocus={event => showKeyTooltip(key.id, event.currentTarget, true)}
                          onBlur={hideKeyTooltip}
                          aria-selected={selected}
                          aria-pressed={lightingFrame && selectionEnabled ? selected : undefined}
                          aria-disabled="false"
                        >
                          <span className="hero-key-render" aria-hidden="true" />
                          <span className="hero-key-content">
                            {keyDecorations?.[key.id] ? (
                              keyDecorations[key.id]
                            ) : showActuationOverlay ? (
                              <span className="hero-key-actuation-content">
                                <span className="hero-key-actuation-value">
                                  {formatMillimeters(actuationValue)}
                                </span>
                                {!advanced && (
                                  <span className="hero-key-actuation-name">
                                    {keyLabels?.[key.id] ?? key.label}
                                  </span>
                                )}
                                {key.indicator && (
                                  <span
                                    className={`hero-key-indicator is-${key.indicator}`}
                                    aria-hidden="true"
                                  />
                                )}
                              </span>
                            ) : showRapidOverlay && rapidPreview?.active ? (
                              <span
                                className={`hero-key-rapid-overlay ${rapidPreview?.active ? 'is-active' : ''} ${rapidPreview?.secondary ? 'is-split' : ''}`}
                              >
                                <span>{rapidPreview?.primary ?? '0.00'}</span>
                                {rapidPreview.secondary && <span>{rapidPreview.secondary}</span>}
                              </span>
                            ) : showDeadzoneOverlay && deadzonePreview?.active ? (
                              <span
                                className={`hero-key-deadzone-overlay ${deadzonePreview?.active ? 'is-active' : ''}`}
                              >
                                <span>↑{deadzonePreview?.top ?? '0.00'}</span>
                                <span>↓{deadzonePreview?.bottom ?? '0.00'}</span>
                              </span>
                            ) : showStreamOverlay && showStreamState ? (
                              <span
                                className={`hero-key-stream-overlay ${streamPreview?.pressed ? 'is-pressed' : ''}`}
                              >
                                <span className="hero-key-stream-fill" aria-hidden="true" />
                                <span className="hero-key-stream-value">
                                  {streamPreview
                                    ? formatMillimeters(streamPreview.distanceMm)
                                    : '—'}
                                </span>
                                <small>mm</small>
                              </span>
                            ) : (
                              <>
                                {(!advanced || !showAdvancedIcons) && (
                                  <span className="hero-key-label">
                                    {keyLabels?.[key.id] ?? key.label}
                                  </span>
                                )}
                                {key.indicator && (
                                  <span
                                    className={`hero-key-indicator is-${key.indicator}`}
                                    aria-hidden="true"
                                  />
                                )}
                              </>
                            )}
                            {!keyDecorations?.[key.id] && advancedIcon}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="hero68-case-lip" aria-hidden="true" />
          <div className="hero68-badge">{keyboard.model.name.toUpperCase()}</div>
        </div>
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
      {keyTooltip &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`hero-key-tooltip is-${keyTooltip.placement}`}
            role="tooltip"
            style={{
              left: keyTooltip.left,
              top: keyTooltip.top
            }}
            data-key={keyTooltip.keyId}
          >
            <strong>{keyTooltip.title}</strong>
            {keyTooltip.detail && <span>{keyTooltip.detail}</span>}
            {keyTooltip.raw && <code>{keyTooltip.raw}</code>}
          </div>,
          document.body
        )}
    </>
  );
}
