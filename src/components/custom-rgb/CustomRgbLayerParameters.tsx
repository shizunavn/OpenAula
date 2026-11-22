import { useI18n } from '../../i18n';
import {
  CUSTOM_RGB_DIRECTIONS,
  RGB_EFFECT_METADATA,
  RGB_GRADIENT_PALETTES,
  type CustomRgbDirection,
  type CustomRgbEffect,
  type CustomRgbLayer,
  type RgbGradientPalette
} from '../../keyboard/customRgb';
import type { RgbColor } from '../../protocol/hero68/rgb';
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

type CustomRgbLayerParametersProps = {
  layer: CustomRgbLayer;
  metadata: (typeof RGB_EFFECT_METADATA)[CustomRgbEffect];
  detailText: string;
  layerHex: string;
  disabled: boolean;
  live: boolean;
  onPatchLayer: (patch: Partial<CustomRgbLayer>) => void;
  onMoveAuroraToBase: () => void;
};

export function CustomRgbLayerParameters({
  layer,
  metadata,
  detailText,
  layerHex,
  disabled,
  live,
  onPatchLayer,
  onMoveAuroraToBase
}: CustomRgbLayerParametersProps) {
  const { tr } = useI18n();
  return (
    <>
      <p className="custom-rgb-description">{tr(detailText)}</p>
      {layer.effect === 'aurora' && (
        <div className="custom-rgb-base-migration">
          <p>
            {tr(
              'Aurora is now a Base effect. Move this layer to cover all keys and control its brightness directly.'
            )}
          </p>
          <button className="secondary-button" disabled={disabled} onClick={onMoveAuroraToBase}>
            {tr('Move Aurora to Base')}
          </button>
        </div>
      )}
      {!metadata.semanticColor &&
        (metadata.gradient ? (
          <>
            <div className="custom-palette-options">
              {Object.entries(RGB_GRADIENT_PALETTES).map(([id, palette]) => (
                <button
                  key={id}
                  disabled={disabled}
                  aria-pressed={
                    layer.multicolor &&
                    (layer.palette ?? metadata.defaults?.palette ?? 'aurora') === id
                  }
                  onClick={() =>
                    onPatchLayer({
                      multicolor: true,
                      palette: id as RgbGradientPalette
                    })
                  }
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
            {(layer.effect === 'wave' || layer.effect === 'trigger') && (
              <CustomRgbColorControls
                label="Effect color"
                pickerLabel="Layer color"
                valueHex={layerHex}
                multicolor={Boolean(layer.multicolor)}
                disabled={disabled}
                onPickHex={v => onPatchLayer({ color: rgb(v), multicolor: false })}
                onSelectMulticolor={() => onPatchLayer({ multicolor: true })}
                onSelectPreset={(_slotIndex, color) => onPatchLayer({ color, multicolor: false })}
              />
            )}
          </>
        ) : (
          <>
            <div className="custom-rgb-direction">
              <span>{tr('Color mode')}</span>
              <div>
                <button
                  disabled={disabled}
                  aria-pressed={!layer.multicolor}
                  onClick={() => onPatchLayer({ multicolor: false })}
                >
                  {tr('Single color')}
                </button>
                <button
                  disabled={disabled}
                  aria-pressed={layer.multicolor}
                  onClick={() => onPatchLayer({ multicolor: true })}
                >
                  {tr('Multicolor')}
                </button>
              </div>
            </div>
            <CustomRgbColorControls
              label="Effect color"
              pickerLabel="Layer color"
              valueHex={layerHex}
              multicolor={Boolean(layer.multicolor)}
              disabled={disabled}
              onPickHex={v => onPatchLayer({ color: rgb(v), multicolor: false })}
              onSelectMulticolor={() => onPatchLayer({ multicolor: true })}
              onSelectPreset={(_slotIndex, color) => onPatchLayer({ color, multicolor: false })}
            />
          </>
        ))}
      <div className="custom-slider-grid">
        <Slider
          label="Opacity"
          value={layer.opacity}
          min={0}
          max={100}
          unit="%"
          disabled={disabled}
          onChange={v => onPatchLayer({ opacity: v })}
        />
        {metadata.width && (
          <Slider
            label={metadata.width}
            value={layer.width}
            min={metadata.widthRange?.[0] ?? 0.25}
            max={metadata.widthRange?.[1] ?? 12}
            step={metadata.widthRange?.[2] ?? 0.25}
            unit={metadata.widthUnit ?? 'keys'}
            disabled={disabled}
            onChange={v => onPatchLayer({ width: v })}
          />
        )}
        {metadata.speed && (
          <Slider
            label={metadata.speedLabel ?? 'Speed'}
            value={layer.speed}
            min={metadata.speedRange?.[0] ?? 0.5}
            max={metadata.speedRange?.[1] ?? 30}
            step={metadata.speedRange?.[2] ?? 0.5}
            unit={metadata.speed}
            disabled={disabled}
            onChange={v => onPatchLayer({ speed: v })}
          />
        )}
        {metadata.scanPause && (
          <Slider
            label={metadata.scanPause}
            value={layer.scanPauseMs ?? 0}
            min={0}
            max={5000}
            step={50}
            unit="ms"
            disabled={disabled}
            onChange={v => onPatchLayer({ scanPauseMs: v })}
          />
        )}
        {metadata.duration && (
          <Slider
            label={metadata.duration}
            value={layer.duration}
            min={100}
            max={4000}
            step={50}
            unit="ms"
            disabled={disabled}
            onChange={v => onPatchLayer({ duration: v })}
          />
        )}
      </div>
      {metadata.direction &&
        (metadata.multiDirection ? (
          <div className="custom-rgb-direction is-grid">
            <span>{tr('Direction')}</span>
            <div className="custom-rgb-direction-grid">
              {CUSTOM_RGB_DIRECTIONS.map(dirItem => (
                <button
                  key={dirItem.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={normalizeDirection9(layer.direction) === dirItem.id}
                  onClick={() => onPatchLayer({ direction: dirItem.id })}
                >
                  {tr(dirItem.label)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="custom-rgb-direction">
            <span>{tr('Direction')}</span>
            <div>
              {(['horizontal', 'vertical'] as const).map(direction => (
                <button
                  key={direction}
                  disabled={disabled}
                  aria-pressed={layer.direction === direction}
                  onClick={() => onPatchLayer({ direction })}
                >
                  {direction === 'horizontal' ? tr('Horizontal') : tr('Vertical')}
                </button>
              ))}
            </div>
          </div>
        ))}
      {metadata.hall && (
        <p className="custom-rgb-description">
          {live
            ? tr('Analog feedback runs automatically in the background app.')
            : tr('Use Try effect to simulate presses. Start Custom for actual analog feedback.')}
        </p>
      )}
    </>
  );
}
