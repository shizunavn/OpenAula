import RgbColorPicker from '../RgbColorPicker';
import { useI18n } from '../../i18n';
import type { RgbColor } from '../../protocol/hero68/rgb';
import { XSYD_COLOR_SLOTS } from '../../protocol/xsyd/device';

const hex = (color: RgbColor) => '#' + color.map(c => c.toString(16).padStart(2, '0')).join('');

type CustomRgbColorControlsProps = {
  label: string;
  pickerLabel: string;
  valueHex: string;
  multicolor: boolean;
  disabled: boolean;
  onPickHex: (nextHex: string) => void;
  onSelectMulticolor: () => void;
  onSelectPreset: (slotIndex: number, color: RgbColor) => void;
};

export function CustomRgbColorControls({
  label,
  pickerLabel,
  valueHex,
  multicolor,
  disabled,
  onPickHex,
  onSelectMulticolor,
  onSelectPreset
}: CustomRgbColorControlsProps) {
  const { tr } = useI18n();
  return (
    <div className="rgb-color-controls">
      <div className="rgb-color-header">
        <span className="rgb-color-label">{tr(label)}</span>
        <div className={`rgb-custom-color-box ${!multicolor ? 'is-active' : 'is-multicolor'}`}>
          <label className="rgb-color-picker-trigger" title={tr(pickerLabel)}>
            <RgbColorPicker
              label={tr(pickerLabel)}
              value={valueHex}
              disabled={disabled}
              onChange={onPickHex}
            />
          </label>
          <span className="rgb-color-hex-readout">{valueHex.toUpperCase()}</span>
        </div>
      </div>
      <div className="rgb-swatch-grid" role="group" aria-label={tr('Color slot')}>
        {XSYD_COLOR_SLOTS.map(slotInfo => {
          const isMulticolor = slotInfo.index === 0;
          const presetHex = hex(slotInfo.rgb);
          const selectedSlot = isMulticolor
            ? multicolor
            : !multicolor && valueHex.toLowerCase() === presetHex.toLowerCase();
          return (
            <button
              key={slotInfo.index}
              type="button"
              className={`rgb-swatch-chip ${isMulticolor ? 'is-multicolor' : ''}`}
              disabled={disabled}
              aria-pressed={selectedSlot}
              title={tr(slotInfo.name)}
              onClick={() => {
                if (isMulticolor) {
                  onSelectMulticolor();
                } else {
                  onSelectPreset(slotInfo.index, [...slotInfo.rgb] as RgbColor);
                }
              }}
            >
              <span
                className={`rgb-swatch-dot ${isMulticolor ? 'is-rainbow' : ''}`}
                style={isMulticolor ? undefined : { background: presetHex }}
                aria-hidden="true"
              />
              <span className="rgb-swatch-name">{tr(slotInfo.name)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
