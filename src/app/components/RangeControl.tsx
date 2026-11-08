import { useEffect, useState } from 'react';
import type * as React from 'react';
import {
  clampNumber,
  formatMillimeters,
  RAPID_TRIGGER_VALUES_XS,
  snapToAllowedValue,
  snapToStep
} from '../helpers';

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
  // Automatically promote to 0.005 mm discrete table if current value has a .xx5 step
  // or if step <= 0.005 so a 0.025 value never snaps to 0.03 -> 0.04.
  const valueHasFiveUmStep = Math.round(value * 1000) % 10 !== 0;
  const resolvedAllowedValues =
    allowedValues?.length && (valueHasFiveUmStep || step <= 0.005) && allowedValues.length < 680
      ? RAPID_TRIGGER_VALUES_XS
      : allowedValues;
  const hasAllowedValues = Boolean(resolvedAllowedValues?.length);
  const effectiveValue = hasAllowedValues
    ? snapToAllowedValue(value, resolvedAllowedValues!)
    : value;
  const minAllowed = hasAllowedValues ? resolvedAllowedValues![0] : min;
  const maxAllowed = hasAllowedValues
    ? resolvedAllowedValues![resolvedAllowedValues!.length - 1]
    : max;
  const stepAllowed = hasAllowedValues
    ? resolvedAllowedValues!.length > 1
      ? Number((resolvedAllowedValues![1] - resolvedAllowedValues![0]).toFixed(3))
      : 0.005
    : step;
  const discreteIndex = hasAllowedValues
    ? resolvedAllowedValues!.reduce(
        (bestIndex, candidate, index) =>
          Math.abs(Math.round(candidate * 1000) - Math.round(effectiveValue * 1000)) <
          Math.abs(
            Math.round(resolvedAllowedValues![bestIndex] * 1000) - Math.round(effectiveValue * 1000)
          )
            ? index
            : bestIndex,
        0
      )
    : 0;
  const pct = hasAllowedValues
    ? (discreteIndex / Math.max(1, resolvedAllowedValues!.length - 1)) * 100
    : ((effectiveValue - minAllowed) / (maxAllowed - minAllowed)) * 100;
  const recommendedPct =
    recommendedValue == null
      ? null
      : hasAllowedValues
        ? (resolvedAllowedValues!.reduce(
            (bestIndex, candidate, index) =>
              Math.abs(candidate - recommendedValue) <
              Math.abs(resolvedAllowedValues![bestIndex] - recommendedValue)
                ? index
                : bestIndex,
            0
          ) /
            Math.max(1, resolvedAllowedValues!.length - 1)) *
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
    const activeTable =
      hasAllowedValues &&
      Math.round(parsed * 1000) % 10 !== 0 &&
      resolvedAllowedValues!.length < 680
        ? RAPID_TRIGGER_VALUES_XS
        : resolvedAllowedValues;
    const committed = activeTable?.length
      ? snapToAllowedValue(
          clampNumber(parsed, activeTable[0], activeTable[activeTable.length - 1]),
          activeTable
        )
      : snapToStep(parsed, min, max, step);
    onChange(committed);
    setDraftValue(formatMillimeters(committed));
  };

  const isWideValue = draftValue.length >= 5;

  return (
    <div
      className={`range-wrap ${disabled ? 'is-disabled' : ''} ${mixed ? 'is-mixed' : ''} ${mixed && mixedPlaceholder !== '—' ? 'has-mixed-label' : ''} ${isWideValue ? 'has-wide-value' : ''}`}
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
          max={hasAllowedValues ? resolvedAllowedValues!.length - 1 : maxAllowed}
          step={hasAllowedValues ? 1 : step}
          value={hasAllowedValues ? discreteIndex : value}
          disabled={disabled}
          style={{ '--range-progress': `${pct}%` } as React.CSSProperties}
          onChange={e => {
            if (hasAllowedValues) {
              const index = clampNumber(
                Math.round(Number(e.target.value)),
                0,
                resolvedAllowedValues!.length - 1
              );
              const nextVal = resolvedAllowedValues![index];
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
        <label className={`value-pill value-pill-input ${isWideValue ? 'is-wide' : ''}`}>
          {mixed && !draftValue && <span className="mixed-value-label">{mixedPlaceholder}</span>}
          <input
            type="text"
            inputMode="decimal"
            value={draftValue}
            aria-label={mixed ? 'Value input, mixed values' : 'Value input'}
            disabled={disabled}
            onFocus={e => e.currentTarget.select()}
            onChange={e => setDraftValue(e.target.value)}
            onBlur={commitNumberInput}
            onKeyDown={e => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const delta = e.key === 'ArrowUp' ? 1 : -1;
                if (hasAllowedValues) {
                  const parsed = Number(draftValue.trim().replace(',', '.'));
                  const baseValue = Number.isFinite(parsed)
                    ? snapToAllowedValue(parsed, resolvedAllowedValues!)
                    : effectiveValue;
                  const baseIndex = resolvedAllowedValues!.reduce(
                    (bestIndex, candidate, index) =>
                      Math.abs(Math.round(candidate * 1000) - Math.round(baseValue * 1000)) <
                      Math.abs(
                        Math.round(resolvedAllowedValues![bestIndex] * 1000) -
                          Math.round(baseValue * 1000)
                      )
                        ? index
                        : bestIndex,
                    0
                  );
                  const nextIndex = clampNumber(
                    baseIndex + delta,
                    0,
                    resolvedAllowedValues!.length - 1
                  );
                  const nextValue = resolvedAllowedValues![nextIndex];
                  setDraftValue(formatMillimeters(nextValue));
                  onChange(nextValue);
                } else {
                  const parsed = Number(draftValue.trim().replace(',', '.'));
                  const baseValue = Number.isFinite(parsed) ? parsed : value;
                  const nextValue = snapToStep(
                    baseValue + delta * stepAllowed,
                    min,
                    max,
                    stepAllowed
                  );
                  setDraftValue(formatMillimeters(nextValue));
                  onChange(nextValue);
                }
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
