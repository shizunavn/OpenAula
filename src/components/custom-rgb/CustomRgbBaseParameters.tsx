import { useI18n } from '../../i18n';
import {
  CUSTOM_RGB_DIRECTIONS,
  RGB_GRADIENT_PALETTES,
  type CustomRgbConfiguration,
  type CustomRgbDirection,
  type RgbGradientPalette
} from '../../keyboard/customRgb';
import type { RgbColor, RgbZone } from '../../protocol/hero68/rgb';
import { closestXsydColorSlot } from '../../protocol/xsyd/device';
import { CustomRgbColorControls } from './CustomRgbColorControls';
import { Slider } from './Slider';

const rgb = (value: string): RgbColor =>
  [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)) as RgbColor;

const normalizeDirection9 = (
  dir?: CustomRgbDirection
): (typeof CUSTOM_RGB_DIRECTIONS)[number]['id'] => {
  if (dir === 'horizontal') return 'right';
  if (dir === 'vertical') return 'bottom';
  if (dir && CUSTOM_RGB_DIRECTIONS.some(d => d.id === dir)) {
    return dir;
  }
  return 'left';
};

type CustomRgbBaseParametersProps = {
  config: CustomRgbConfiguration;
  isWin68: boolean;
  effectiveBaseBrightness: number;
  customBase: boolean;
  waveBase: boolean;
  mode: { speed?: boolean; color?: boolean };
  baseHex: string;
  disabled: boolean;
  onPatchBase: (patch: Partial<RgbZone>) => void;
  onPatchAnimation: (patch: Partial<NonNullable<CustomRgbConfiguration['baseEffect']>>) => void;
};

export function CustomRgbBaseParameters({
  config,
  isWin68,
  effectiveBaseBrightness,
  customBase,
  waveBase,
  mode,
  baseHex,
  disabled,
  onPatchBase,
  onPatchAnimation
}: CustomRgbBaseParametersProps) {
  const { tr } = useI18n();
  return (
    <>
      <Slider
        label="Brightness"
        value={isWin68 ? effectiveBaseBrightness * 25 : config.base.brightness * 5}
        min={0}
        max={100}
        step={isWin68 ? 25 : 5}
        unit="%"
        disabled={disabled}
        onChange={v =>
          onPatchBase({
            brightness: isWin68 ? v / 25 : v / 5
          })
        }
      />
      {customBase && config.baseEffect ? (
        <>
          <p className="custom-rgb-description">
            {waveBase
              ? tr(
                  'Multi-directional color waves across all 9 directions. Add FX layers for key reactions.'
                )
              : tr('Soft color curtains across all keys. Add FX layers for key reactions.')}
          </p>
          <div className="custom-slider-grid">
            <Slider
              label={waveBase ? 'Wave width' : 'Ribbon width'}
              value={config.baseEffect.width}
              min={waveBase ? 0.5 : 0.25}
              max={waveBase ? 8 : 12}
              step={0.25}
              unit="keys"
              disabled={disabled}
              onChange={v => onPatchAnimation({ width: v })}
            />
            <Slider
              label="Speed"
              value={config.baseEffect.speed}
              min={waveBase ? 0.25 : 0.5}
              max={waveBase ? 6 : 3}
              step={waveBase ? 0.25 : 0.5}
              unit="×"
              disabled={disabled}
              onChange={v => onPatchAnimation({ speed: v })}
            />
          </div>
          {waveBase && (
            <div className="custom-rgb-direction is-grid">
              <span>{tr('Direction')}</span>
              <div className="custom-rgb-direction-grid">
                {CUSTOM_RGB_DIRECTIONS.map(dirItem => (
                  <button
                    key={dirItem.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={normalizeDirection9(config.baseEffect?.direction) === dirItem.id}
                    onClick={() => onPatchAnimation({ direction: dirItem.id })}
                  >
                    {tr(dirItem.label)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="custom-palette-options">
            {Object.entries(RGB_GRADIENT_PALETTES).map(([id, palette]) => (
              <button
                key={id}
                disabled={disabled}
                aria-pressed={config.baseEffect?.palette === id}
                onClick={() => onPatchAnimation({ palette: id as RgbGradientPalette })}
              >
                <span
                  style={{
                    background: `linear-gradient(90deg,${palette.colors.join(',')})`
                  }}
                />
                {tr(palette.name)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {mode.speed && (
            <Slider
              label="Base speed"
              value={config.base.speed + 1}
              min={1}
              max={5}
              unit="/ 5"
              disabled={disabled}
              onChange={v => onPatchBase({ speed: v - 1 })}
            />
          )}{' '}
          {mode.color && (
            <CustomRgbColorControls
              label="Base color"
              pickerLabel="Base effect color"
              valueHex={baseHex}
              multicolor={Boolean(config.base.mix)}
              disabled={disabled}
              onPickHex={v =>
                onPatchBase({
                  rgb: rgb(v),
                  mix: false,
                  colorIndex: closestXsydColorSlot(rgb(v))
                })
              }
              onSelectMulticolor={() => onPatchBase({ mix: true, colorIndex: 0 })}
              onSelectPreset={(slotIndex, color) =>
                onPatchBase({
                  mix: false,
                  colorIndex: slotIndex,
                  rgb: color
                })
              }
            />
          )}
        </>
      )}
    </>
  );
}
