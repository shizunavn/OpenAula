import { useEffect, useState } from 'react';
import type * as React from 'react';
import { formatMillimeters, snapToStep } from '../helpers';

function VerticalRangeControl({
  value,
  min,
  max,
  step,
  suffix,
  disabled = false,
  direction = 'bottom',
  mixed = false,
  mixedPlaceholder = 'Mixed',
  onChange
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  disabled?: boolean;
  direction?: 'top' | 'bottom';
  mixed?: boolean;
  mixedPlaceholder?: string;
  onChange: (value: number) => void;
}) {
  const effectiveStep = step;
  const effectiveValue = snapToStep(value, min, max, effectiveStep);
  const pct = ((effectiveValue - min) / (max - min)) * 100;
  const markerStyle = direction === 'bottom' ? { bottom: `${pct}%` } : { top: `${pct}%` };
  const fillStyle =
    direction === 'bottom'
      ? { height: `${pct}%`, bottom: 0, top: 'auto' }
      : { height: `${pct}%`, top: 0, bottom: 'auto' };
  const [draftValue, setDraftValue] = useState(() =>
    mixed ? '' : formatMillimeters(effectiveValue)
  );

  useEffect(() => {
    setDraftValue(mixed ? '' : formatMillimeters(effectiveValue));
  }, [effectiveValue, mixed]);

  const commitNumberInput = () => {
    const normalized = draftValue.trim().replace(',', '.');
    const parsed = Number(normalized);
    if (!normalized || Number.isNaN(parsed)) {
      setDraftValue(mixed ? '' : formatMillimeters(effectiveValue));
      return;
    }
    const committed = snapToStep(parsed, min, max, effectiveStep);
    onChange(committed);
    setDraftValue(formatMillimeters(committed));
  };

  const isWideValue = draftValue.length >= 5;

  return (
    <div
      className={`vertical-meter ${disabled ? 'is-disabled' : ''} ${mixed ? 'is-mixed' : ''} ${mixed && mixedPlaceholder !== '—' ? 'has-mixed-label' : ''} ${direction === 'top' ? 'is-top-oriented' : ''} ${isWideValue ? 'has-wide-value' : ''}`}
    >
      <span className="vertical-range-shell">
        <input
          className="vertical-range-input"
          type="range"
          min={min}
          max={max}
          step={effectiveStep}
          value={effectiveValue}
          disabled={disabled}
          aria-label="Vertical value"
          onChange={e => {
            const nextVal = snapToStep(Number(e.target.value), min, max, effectiveStep);
            onChange(nextVal);
            setDraftValue(formatMillimeters(nextVal));
          }}
        />
        <span className="meter-track" aria-hidden="true">
          <span className="meter-fill" style={fillStyle as React.CSSProperties} />
          <span className="meter-marker" style={markerStyle as React.CSSProperties} />
        </span>
      </span>
      <div className="meter-readout compact-meter-readout">
        <label
          className={`meter-value meter-value-input compact-meter-value ${isWideValue ? 'is-wide' : ''}`}
        >
          {mixed && !draftValue && <span className="mixed-value-label">{mixedPlaceholder}</span>}
          <input
            type="text"
            inputMode="decimal"
            value={draftValue}
            disabled={disabled}
            aria-label="Vertical value input"
            onFocus={e => e.currentTarget.select()}
            onChange={e => setDraftValue(e.target.value)}
            onBlur={commitNumberInput}
            onKeyDown={e => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const delta = e.key === 'ArrowUp' ? 1 : -1;
                const parsed = Number(draftValue.trim().replace(',', '.'));
                const baseValue = Number.isFinite(parsed) ? parsed : effectiveValue;
                const nextValue = snapToStep(
                  baseValue + delta * effectiveStep,
                  min,
                  max,
                  effectiveStep
                );
                setDraftValue(formatMillimeters(nextValue));
                onChange(nextValue);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                commitNumberInput();
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setDraftValue(mixed ? '' : formatMillimeters(effectiveValue));
                e.currentTarget.blur();
              }
            }}
          />
        </label>
        <b className="value-suffix">{suffix}</b>
      </div>
    </div>
  );
}

export { VerticalRangeControl };
