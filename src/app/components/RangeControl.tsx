import { useEffect, useState } from 'react';
import type * as React from 'react';
import { clampNumber, formatMillimeters, snapToAllowedValue, snapToStep } from '../helpers';

function RangeControl({
  value,
  min,
  max,
  step,
  suffix,
  allowedValues,
  disabled = false,
  recommendedValue,
  mixed = false,
  mixedPlaceholder = 'Mixed',
  onChange
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  allowedValues?: readonly number[];
  disabled?: boolean;
  recommendedValue?: number;
  mixed?: boolean;
  mixedPlaceholder?: string;
  onChange: (value: number) => void;
}) {
  const hasAllowedValues = Boolean(allowedValues?.length);
  const effectiveValue = hasAllowedValues ? snapToAllowedValue(value, allowedValues!) : value;
  const minAllowed = hasAllowedValues ? allowedValues![0] : min;
  const maxAllowed = hasAllowedValues ? allowedValues![allowedValues!.length - 1] : max;
  const stepAllowed = hasAllowedValues
    ? allowedValues!.length > 1
      ? Number((allowedValues![1] - allowedValues![0]).toFixed(3))
      : 0.005
    : step;
  const discreteIndex = hasAllowedValues
    ? allowedValues!.reduce(
        (bestIndex, candidate, index) =>
          Math.abs(candidate - effectiveValue) <
          Math.abs(allowedValues![bestIndex] - effectiveValue)
            ? index
            : bestIndex,
        0
      )
    : 0;
  const pct = hasAllowedValues
    ? (discreteIndex / Math.max(1, allowedValues!.length - 1)) * 100
    : ((effectiveValue - minAllowed) / (maxAllowed - minAllowed)) * 100;
  const recommendedPct =
    recommendedValue == null
      ? null
      : hasAllowedValues
        ? (allowedValues!.reduce(
            (bestIndex, candidate, index) =>
              Math.abs(candidate - recommendedValue) <
              Math.abs(allowedValues![bestIndex] - recommendedValue)
                ? index
                : bestIndex,
            0
          ) /
            Math.max(1, allowedValues!.length - 1)) *
          100
        : ((recommendedValue - minAllowed) / (maxAllowed - minAllowed)) * 100;
  const [draftValue, setDraftValue] = useState(() => (mixed ? '' : formatMillimeters(value)));

  useEffect(() => {
    setDraftValue(mixed ? '' : formatMillimeters(value));
  }, [value, mixed]);

  const commitNumberInput = () => {
    const normalized = draftValue.trim().replace(',', '.');
    const parsed = Number(normalized);
    if (!normalized || Number.isNaN(parsed)) {
      setDraftValue(mixed ? '' : formatMillimeters(value));
      return;
    }
    const committed = hasAllowedValues
      ? snapToAllowedValue(clampNumber(parsed, minAllowed, maxAllowed), allowedValues!)
      : snapToStep(parsed, min, max, step);
    onChange(committed);
    setDraftValue(formatMillimeters(committed));
  };

  return (
    <div
      className={`range-wrap ${disabled ? 'is-disabled' : ''} ${mixed ? 'is-mixed' : ''} ${mixed && mixedPlaceholder !== '—' ? 'has-mixed-label' : ''}`}
    >
      <div className="range-slider-shell">
        {recommendedPct != null && (
          <span
            className="recommend-marker"
            style={{ left: `${recommendedPct}%` }}
            aria-hidden="true"
          />
        )}
        <input
          type="range"
          min={hasAllowedValues ? 0 : minAllowed}
          max={hasAllowedValues ? allowedValues!.length - 1 : maxAllowed}
          step={hasAllowedValues ? 1 : step}
          value={hasAllowedValues ? discreteIndex : value}
          disabled={disabled}
          style={{ '--range-progress': `${pct}%` } as React.CSSProperties}
          onChange={e => {
            if (hasAllowedValues) {
              const index = clampNumber(
                Math.round(Number(e.target.value)),
                0,
                allowedValues!.length - 1
              );
              const nextVal = allowedValues![index];
              onChange(nextVal);
              setDraftValue(formatMillimeters(nextVal));
              return;
            }
            const nextVal = snapToStep(Number(e.target.value), minAllowed, maxAllowed, step);
            onChange(nextVal);
            setDraftValue(formatMillimeters(nextVal));
          }}
        />
      </div>
      <div className="value-readout">
        <label className="value-pill value-pill-input">
          {mixed && !draftValue && <span className="mixed-value-label">{mixedPlaceholder}</span>}
          <input
            type="number"
            inputMode="decimal"
            min={minAllowed}
            max={maxAllowed}
            step={stepAllowed}
            value={draftValue}
            aria-label={mixed ? 'Value input, mixed values' : 'Value input'}
            disabled={disabled}
            onFocus={e => e.currentTarget.select()}
            onChange={e => setDraftValue(e.target.value)}
            onBlur={commitNumberInput}
            onKeyDown={e => {
              if (hasAllowedValues && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                const parsed = Number(draftValue.trim().replace(',', '.'));
                const baseValue = Number.isFinite(parsed)
                  ? snapToAllowedValue(parsed, allowedValues!)
                  : effectiveValue;
                const baseIndex = allowedValues!.reduce(
                  (bestIndex, candidate, index) =>
                    Math.abs(candidate - baseValue) <
                    Math.abs(allowedValues![bestIndex] - baseValue)
                      ? index
                      : bestIndex,
                  0
                );
                const nextIndex = clampNumber(
                  baseIndex + (e.key === 'ArrowUp' ? 1 : -1),
                  0,
                  allowedValues!.length - 1
                );
                const nextValue = allowedValues![nextIndex];
                setDraftValue(formatMillimeters(nextValue));
                onChange(nextValue);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                commitNumberInput();
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setDraftValue(mixed ? '' : formatMillimeters(value));
                e.currentTarget.blur();
              }
            }}
          />
        </label>
        <span className="value-suffix">{suffix}</span>
      </div>
    </div>
  );
}

export { RangeControl };
