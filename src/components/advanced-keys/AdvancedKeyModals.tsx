import { useI18n } from '../../i18n';
import type { AdvancedBinding } from '../../protocol/hero68/advanced';
import { presetConflicts, type AdvancedPreset } from '../../protocol/hero68/advancedPresets';
import { keyLabel } from './advancedKeysMeta';

type AdvancedKeyModalsProps = {
  bindings: AdvancedBinding[];
  presetReview: AdvancedPreset | null;
  removeOpen: boolean;
  draft: AdvancedBinding | null;
  onClosePresetReview: () => void;
  onConfirmPreset: (preset: AdvancedPreset) => void;
  onCloseRemove: () => void;
  onConfirmRemove: () => void;
};

export function AdvancedKeyModals({
  bindings,
  presetReview,
  removeOpen,
  draft,
  onClosePresetReview,
  onConfirmPreset,
  onCloseRemove,
  onConfirmRemove
}: AdvancedKeyModalsProps) {
  const { tr } = useI18n();
  return (
    <>
      {presetReview && (
        <div className="ak-modal-backdrop" onClick={onClosePresetReview}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ak-preset-title"
            className="ak-remove-modal"
            onClick={e => e.stopPropagation()}
          >
            <h2 id="ak-preset-title">{tr('Replace existing bindings?')}</h2>
            <p>
              {tr(
                '{name} will replace bindings on {keys}. Paired keys in a replaced binding are removed together.',
                {
                  name: tr(presetReview.title),
                  keys: presetConflicts(bindings, presetReview)
                    .flatMap(b => b.keys)
                    .map(keyLabel)
                    .join(', ')
                }
              )}
            </p>
            <p>{tr('Changes stay in your profile draft until you save.')}</p>
            <div>
              <button autoFocus className="secondary-button" onClick={onClosePresetReview}>
                {tr('Cancel')}
              </button>
              <button className="apply-button" onClick={() => onConfirmPreset(presetReview)}>
                {tr('Apply preset')}
              </button>
            </div>
          </section>
        </div>
      )}
      {removeOpen && (
        <div className="ak-modal-backdrop" onClick={onCloseRemove}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ak-remove-title"
            className="ak-remove-modal"
            onClick={e => e.stopPropagation()}
          >
            <h2 id="ak-remove-title">{tr('Remove this binding?')}</h2>
            <p>
              {tr('{keys} will return to its normal key behavior after the profile is saved.', {
                keys: draft?.keys.map(keyLabel).join(' + ') ?? ''
              })}
            </p>
            <div>
              <button autoFocus className="secondary-button" onClick={onCloseRemove}>
                {tr('Cancel')}
              </button>
              <button className="apply-button" onClick={onConfirmRemove}>
                {tr('Remove binding')}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
