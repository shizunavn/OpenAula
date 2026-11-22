import { Lightbulb, Palette, Sparkles, Waves } from 'lucide-react';
import { useI18n } from '../../i18n';

export type RgbEffectOption = {
  id: number;
  name: string;
};

type RgbEffectLibraryPanelProps = {
  isWin68: boolean;
  zone: 'keys' | 'side';
  onZoneChange: (zone: 'keys' | 'side') => void;
  effects: readonly RgbEffectOption[];
  activeModeId: number;
  busy: boolean;
  onSelectMode: (modeId: number) => void;
};

const EFFECT_ICONS = [Lightbulb, Waves, Sparkles, Palette] as const;

export function RgbEffectLibraryPanel({
  isWin68,
  zone,
  onZoneChange,
  effects,
  activeModeId,
  busy,
  onSelectMode
}: RgbEffectLibraryPanelProps) {
  const { tr } = useI18n();
  return (
    <aside className="settings-card rgb-effect-library">
      {!isWin68 ? (
        <div className="rgb-zone-tabs" role="group" aria-label={tr('Lighting zone')}>
          {(['keys', 'side'] as const).map(id => (
            <button key={id} aria-pressed={zone === id} onClick={() => onZoneChange(id)}>
              {id === 'keys' ? tr('Keys') : tr('Side Light')}
            </button>
          ))}
        </div>
      ) : (
        <div className="rgb-section-heading">
          <h2>{tr('WIN 68 HE MAX Effects')}</h2>
          <span>
            {effects.length} {tr('effects stored on your keyboard')}
          </span>
        </div>
      )}
      {!isWin68 && <h2>{tr('Choose effect')}</h2>}
      <div className="rgb-mode-grid">
        {effects.map((mode, i) => {
          const Icon = EFFECT_ICONS[i % EFFECT_ICONS.length];
          return (
            <button
              key={mode.id}
              disabled={busy}
              className={activeModeId === mode.id ? 'active' : ''}
              aria-pressed={activeModeId === mode.id}
              onClick={() => onSelectMode(mode.id)}
            >
              <Icon size={16} />
              <span>{tr(mode.name)}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
