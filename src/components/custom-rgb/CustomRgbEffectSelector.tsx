import { Sparkles, Waves } from 'lucide-react';
import { useI18n } from '../../i18n';
import { CUSTOM_RGB_EFFECTS, type CustomRgbEffect } from '../../keyboard/customRgb';

type CustomRgbEffectSelectorProps = {
  isBaseSelection: boolean;
  adding: boolean;
  auroraBase: boolean;
  waveBase: boolean;
  customBase: boolean;
  baseModeId: number;
  baseCatalog: readonly { id: number; name: string }[];
  activeLayerEffect?: CustomRgbEffect;
  disabled: boolean;
  onCancel: () => void;
  onChooseBase: (choice: 'aurora' | 'wave' | number) => void;
  onChooseLayerEffect: (effect: CustomRgbEffect) => void;
};

export function CustomRgbEffectSelector({
  isBaseSelection,
  adding,
  auroraBase,
  waveBase,
  customBase,
  baseModeId,
  baseCatalog,
  activeLayerEffect,
  disabled,
  onCancel,
  onChooseBase,
  onChooseLayerEffect
}: CustomRgbEffectSelectorProps) {
  const { tr } = useI18n();
  return (
    <section className="custom-rgb-selection">
      <div className="custom-inspector-heading">
        <h3>{tr(adding ? 'Add an effect' : 'Choose effect')}</h3>
        <button className="secondary-button" onClick={onCancel}>
          {tr('Cancel')}
        </button>
      </div>
      <div className="custom-rgb-effect-grid">
        {isBaseSelection ? (
          <>
            <button
              disabled={disabled}
              aria-pressed={auroraBase}
              onClick={() => onChooseBase('aurora')}
            >
              <Sparkles size={15} />
              {tr('Aurora')}
            </button>
            <button
              disabled={disabled}
              aria-pressed={waveBase}
              onClick={() => onChooseBase('wave')}
            >
              <Waves size={15} />
              {tr('Dynamic Wave')}
            </button>
            {baseCatalog.map(item => (
              <button
                key={item.id}
                disabled={disabled}
                aria-pressed={!customBase && baseModeId === item.id}
                onClick={() => onChooseBase(item.id)}
              >
                <Waves size={15} />
                {tr(item.name)}
              </button>
            ))}
          </>
        ) : (
          CUSTOM_RGB_EFFECTS.filter(
            effect => effect.id !== 'aurora' || (activeLayerEffect === 'aurora' && !adding)
          ).map(effect => (
            <button
              key={effect.id}
              disabled={disabled}
              aria-pressed={!adding && activeLayerEffect === effect.id}
              onClick={() => onChooseLayerEffect(effect.id)}
            >
              <Sparkles size={15} />
              {tr(effect.name)}
            </button>
          ))
        )}
      </div>
    </section>
  );
}
