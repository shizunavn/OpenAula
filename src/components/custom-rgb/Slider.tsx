import { useI18n } from '../../i18n';

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const { tr } = useI18n();
  const translatedLabel = tr(label);
  return (
    <label className="custom-rgb-slider">
      <span>{translatedLabel}</span>
      <div>
        <input
          aria-label={translatedLabel}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={e => onChange(Number(e.target.value))}
        />
        <input
          aria-label={`${translatedLabel} value`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={e => {
            const n = e.target.valueAsNumber;
            if (Number.isFinite(n)) {
              onChange(Math.max(min, Math.min(max, n)));
            }
          }}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}
