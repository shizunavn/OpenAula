import { ArrowDown, ArrowUp, Plus, Trash2, Waves } from 'lucide-react';
import { useI18n } from '../../i18n';
import {
  CUSTOM_RGB_EFFECTS,
  MAX_RGB_LAYERS,
  type CustomRgbConfiguration,
  type CustomRgbLayer
} from '../../keyboard/customRgb';
import type { RgbColor } from '../../protocol/hero68/rgb';

const hex = (color: RgbColor) => '#' + color.map(c => c.toString(16).padStart(2, '0')).join('');

type CustomRgbLayerStackProps = {
  config: CustomRgbConfiguration;
  active: string;
  adding: boolean;
  auroraBase: boolean;
  waveBase: boolean;
  baseModeName: string;
  activeLayer: CustomRgbLayer | undefined;
  disabled: boolean;
  onSelectBase: () => void;
  onSelectLayer: (id: string) => void;
  onToggleLayerEnabled: (id: string, enabled: boolean) => void;
  onStartAddLayer: () => void;
  onMoveLayer: (delta: -1 | 1) => void;
  onDeleteActiveLayer: () => void;
};

export function CustomRgbLayerStack({
  config,
  active,
  adding,
  auroraBase,
  waveBase,
  baseModeName,
  activeLayer,
  disabled,
  onSelectBase,
  onSelectLayer,
  onToggleLayerEnabled,
  onStartAddLayer,
  onMoveLayer,
  onDeleteActiveLayer
}: CustomRgbLayerStackProps) {
  const { tr } = useI18n();
  return (
    <aside className="settings-card custom-rgb-stack">
      <h3>{tr('Base layer')}</h3>
      <button
        className={`custom-rgb-layer ${active === 'base' && !adding ? 'active' : ''}`}
        disabled={disabled}
        onClick={onSelectBase}
      >
        <Waves size={16} />
        <span>{auroraBase ? tr('Aurora') : waveBase ? tr('Dynamic Wave') : tr(baseModeName)}</span>
      </button>
      <h3>{tr('Effect layers')}</h3>
      <p className="custom-rgb-stack-note">{tr('Lower layers blend over earlier ones.')}</p>
      {config.layers.map((item, i) => (
        <div
          key={item.id}
          className={`custom-rgb-layer ${active === item.id && !adding ? 'active' : ''} ${!item.enabled ? 'muted' : ''}`}
        >
          <button
            className="custom-rgb-layer-select"
            disabled={disabled}
            onClick={() => onSelectLayer(item.id)}
          >
            <span
              className={`layer-color-dot ${item.multicolor ? 'is-rainbow' : ''}`}
              style={
                item.multicolor
                  ? undefined
                  : {
                      background: hex(item.color)
                    }
              }
            />
            <span>{tr(CUSTOM_RGB_EFFECTS.find(e => e.id === item.effect)?.name ?? '')}</span>
            <small>{i + 1}</small>
          </button>
          <input
            type="checkbox"
            aria-label={`Enable ${CUSTOM_RGB_EFFECTS.find(e => e.id === item.effect)?.name} layer ${i + 1}`}
            checked={item.enabled}
            disabled={disabled}
            onChange={e => onToggleLayerEnabled(item.id, e.target.checked)}
          />
        </div>
      ))}
      <button
        className="custom-rgb-add"
        disabled={disabled || config.layers.length >= MAX_RGB_LAYERS}
        onClick={onStartAddLayer}
      >
        <Plus size={16} /> {tr('Add layer')}
      </button>
      {!config.layers.length && (
        <p className="custom-rgb-empty">
          {tr('Choose a layer to bring your base colors to life.')}
        </p>
      )}
      {activeLayer && !adding && (
        <div className="custom-rgb-order">
          <button
            className="secondary-button"
            aria-label={tr('Move layer up')}
            disabled={disabled || config.layers[0]?.id === active}
            onClick={() => onMoveLayer(-1)}
          >
            <ArrowUp size={15} />
          </button>
          <button
            className="secondary-button"
            aria-label={tr('Move layer down')}
            disabled={disabled || config.layers.at(-1)?.id === active}
            onClick={() => onMoveLayer(1)}
          >
            <ArrowDown size={15} />
          </button>
          <button
            className="secondary-button"
            aria-label={tr('Delete selected layer')}
            disabled={disabled}
            onClick={onDeleteActiveLayer}
          >
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </aside>
  );
}
