import { ArrowLeftRight } from 'lucide-react';
import RgbColorPicker from '../RgbColorPicker';
import { useI18n } from '../../i18n';
import type { RgbColor, RgbZone } from '../../protocol/hero68/rgb';
import { XSYD_COLOR_SLOTS } from '../../protocol/xsyd/device';
import type { SavedRgbPresetItem } from './rgbPresetStorage';
import { SavedRgbPresetsSection } from './SavedRgbPresetsSection';

export type RgbModeCapabilityView = {
  name: string;
  color?: boolean;
  speed?: boolean;
  reactive?: boolean;
  reverse?: boolean;
};

type RgbParametersCardProps = {
  isWin68: boolean;
  activeZone: 'keys' | 'side';
  config: RgbZone;
  capability?: RgbModeCapabilityView;
  supportsReverse: boolean;
  darkReason: string | null;
  effectiveBrightness: number;
  brightnessMax: number;
  activeHex: string;
  activeColorIndex: number;
  matchesPresetColor: boolean;
  hexInput: string;
  onHexInputChange: (next: string) => void;
  paletteSlots: RgbColor[];
  busy: boolean;
  error: string | null;
  savedPresets: SavedRgbPresetItem[];
  onChangeZone: (patch: Partial<RgbZone>) => void;
  onApplyCustomColor: (hex: string) => void;
  onApplySavedPreset: (item: SavedRgbPresetItem) => void;
  onDeleteSavedPreset: (id: string) => void;
};

const colorHex = (color: RgbColor) =>
  '#' + color.map(v => v.toString(16).padStart(2, '0')).join('');

export function RgbParametersCard({
  isWin68,
  activeZone,
  config,
  capability,
  supportsReverse,
  darkReason,
  effectiveBrightness,
  brightnessMax,
  activeHex,
  activeColorIndex,
  matchesPresetColor,
  hexInput,
  onHexInputChange,
  paletteSlots,
  busy,
  error,
  savedPresets,
  onChangeZone,
  onApplyCustomColor,
  onApplySavedPreset,
  onDeleteSavedPreset
}: RgbParametersCardProps) {
  const { tr } = useI18n();
  return (
    <section className="settings-card rgb-basic-card">
      <div className="rgb-section-heading">
        <h2>{tr(capability?.name ?? 'Unrecognized onboard mode')}</h2>
        <span>
          {isWin68
            ? `XSYD Mode 0x${config.mode.toString(16).padStart(2, '0').toUpperCase()}`
            : activeZone === 'keys'
              ? tr('Key lighting')
              : tr('Side lighting')}
        </span>
      </div>
      {!capability && (
        <p className="rgb-inline-note">
          {tr('Unrecognized onboard mode')} {config.mode}.{' '}
          {tr('It is preserved until you select another effect.')}
        </p>
      )}
      {darkReason && (
        <div className="rgb-dark-preview-note" role="status">
          <span>
            {tr('Lighting is dark')} · {darkReason}
          </span>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              onChangeZone({
                mix: true,
                colorIndex: 0,
                brightness: effectiveBrightness || brightnessMax
              })
            }
          >
            {tr('Use Multicolor')}
          </button>
        </div>
      )}
      <div className="rgb-parameters">
        <label>
          {tr('Brightness')}{' '}
          <strong>
            {effectiveBrightness <= brightnessMax
              ? `${effectiveBrightness * (isWin68 || activeZone === 'side' ? 25 : 5)}%`
              : tr('Unknown ({value})', {
                  value: config.brightness
                })}
          </strong>
          <input
            aria-label={tr('RGB brightness')}
            type="range"
            min="0"
            max={brightnessMax}
            value={Math.min(effectiveBrightness, brightnessMax)}
            disabled={busy || !capability || (!isWin68 && config.mode === 0)}
            onChange={e =>
              onChangeZone({
                brightness: Number(e.target.value)
              })
            }
          />
        </label>
        {capability?.speed && (
          <label>
            {tr('Speed')} <strong>{config.speed + 1} / 5</strong>
            <input
              aria-label={tr('RGB speed')}
              type="range"
              min="0"
              max="4"
              value={config.speed}
              disabled={busy}
              onChange={e =>
                onChangeZone({
                  speed: Number(e.target.value)
                })
              }
            />
          </label>
        )}
        {supportsReverse && (
          <div className="rgb-reverse-row">
            <label className="rgb-reverse-toggle">
              <span className="rgb-reverse-label">
                <ArrowLeftRight size={15} />
                <span>{tr('Reverse direction')}</span>
              </span>
              <input
                type="checkbox"
                checked={Boolean(config.reverse)}
                disabled={busy}
                onChange={e => onChangeZone({ reverse: e.target.checked })}
              />
            </label>
          </div>
        )}
        {capability?.color && (
          <div className="rgb-color-controls">
            <div className="rgb-color-header">
              <span className="rgb-color-label">{tr('Color')}</span>
              <div
                className={`rgb-custom-color-box ${!config.mix ? (matchesPresetColor ? 'is-active' : 'is-custom-active') : 'is-multicolor'}`}
              >
                <label className="rgb-color-picker-trigger" title={tr('Effect color')}>
                  <RgbColorPicker
                    label={tr('Effect color')}
                    value={activeHex}
                    disabled={busy}
                    onChange={onApplyCustomColor}
                  />
                </label>
                <input
                  type="text"
                  className="rgb-color-hex-input"
                  aria-label="HEX color"
                  value={hexInput}
                  maxLength={7}
                  spellCheck={false}
                  disabled={busy}
                  onChange={e => {
                    const next = e.target.value;
                    onHexInputChange(next);
                    if (/^#?[0-9a-f]{6}$/i.test(next)) {
                      onApplyCustomColor(next);
                    }
                  }}
                  onBlur={() => onHexInputChange(activeHex.toUpperCase())}
                />
              </div>
            </div>
            <div className="rgb-swatch-grid" role="group" aria-label={tr('Color slot')}>
              {XSYD_COLOR_SLOTS.map(slotInfo => {
                const isMulticolor = slotInfo.index === 0;
                const presetHex = colorHex(slotInfo.rgb);
                const selectedSlot = isMulticolor
                  ? Boolean(config.mix)
                  : !config.mix &&
                    activeColorIndex === slotInfo.index &&
                    activeHex.toLowerCase() === presetHex.toLowerCase();
                return (
                  <button
                    key={slotInfo.index}
                    type="button"
                    className={`rgb-swatch-chip ${isMulticolor ? 'is-multicolor' : ''}`}
                    disabled={busy}
                    aria-pressed={selectedSlot}
                    title={tr(slotInfo.name)}
                    onClick={() => {
                      if (isMulticolor) {
                        onChangeZone({ mix: true, colorIndex: 0 });
                      } else {
                        const presetRgb: RgbColor = [...slotInfo.rgb] as RgbColor;
                        const nextPalette = paletteSlots.map((c, idx) =>
                          idx === slotInfo.index - 1 ? presetRgb : ([...c] as RgbColor)
                        );
                        onChangeZone({
                          mix: false,
                          colorIndex: slotInfo.index,
                          rgb: presetRgb,
                          palette: nextPalette
                        });
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
        )}
      </div>
      <SavedRgbPresetsSection
        presets={savedPresets}
        disabled={busy}
        onApply={onApplySavedPreset}
        onDelete={onDeleteSavedPreset}
      />
      {capability?.reactive && (
        <p className="rgb-inline-note">
          {tr(
            'Preview only · sample key presses repeat automatically. Click or type to try your own keys.'
          )}
        </p>
      )}
      {!isWin68 && config.brightness > brightnessMax && (
        <p className="rgb-inline-note">
          {tr(
            'This draft has an unrecognized brightness value. Choose a supported level before saving this zone.'
          )}
        </p>
      )}
      {error && (
        <p className="stream-error">
          {tr('Preview unavailable')}: {error}
        </p>
      )}
      <details className="service-details">
        <summary>{tr('Details')}</summary>
        <p>
          {isWin68
            ? tr(
                'Preview uses WIN 68 HE MAX firmware v1.1.4 (XSYD 0x18 / 0x2A) integer RGB & HSV calculations.'
              )
            : tr(
                'Preview uses firmware V3.20 RGB calculations. Screen colors may differ from the LEDs.'
              )}
        </p>
      </details>
    </section>
  );
}
