import AdvancedKeyIcon from '../AdvancedKeyIcon';
import { useI18n } from '../../i18n';
import type { AdvancedBinding, AdvancedKind } from '../../protocol/hero68/advanced';
import { ADVANCED_PRESETS, type AdvancedPreset } from '../../protocol/hero68/advancedPresets';
import { keyLabel } from './advancedKeysMeta';

type AdvancedKeySidePanelProps = {
  view: 'assign' | 'edit';
  kind: AdvancedKind;
  occupied: ReadonlyMap<string, AdvancedBinding>;
  busy: boolean;
  editingId: string | null;
  connected: boolean;
  onSelectSocdPair: (pair: string[]) => void;
  onApplyPreset: (preset: AdvancedPreset) => void;
};

const SOCD_SUGGESTED_PAIRS = [
  ['KeyA', 'KeyD'],
  ['ArrowLeft', 'ArrowRight']
];

export function AdvancedKeySidePanel({
  view,
  kind,
  occupied,
  busy,
  editingId,
  connected,
  onSelectSocdPair,
  onApplyPreset
}: AdvancedKeySidePanelProps) {
  const { tr } = useI18n();
  const presetsForKind = ADVANCED_PRESETS.filter(p => p.kind === kind);

  return (
    <aside className="ak-side-panel">
      {view === 'assign' ? (
        <>
          <h3>{tr(kind === 'SOCD' ? 'Suggested key pairs' : 'Ready-made bindings')}</h3>
          {kind === 'SOCD' ? (
            <>
              {SOCD_SUGGESTED_PAIRS.map(pair => (
                <button
                  className="ak-preset"
                  key={pair[0]}
                  disabled={pair.some(k => occupied.has(k))}
                  onClick={() => onSelectSocdPair(pair)}
                >
                  <div>
                    {pair.map(k => (
                      <kbd key={k}>{keyLabel(k)}</kbd>
                    ))}
                  </div>
                  <strong>
                    {tr(pair[0] === 'KeyA' ? 'Instant direction switching' : 'Left / right pair')}
                  </strong>
                  <span>{tr('Use this pair, then choose its priority behavior.')}</span>
                  <small className="ak-preset-cta">{tr('Select this pair')}</small>
                </button>
              ))}
            </>
          ) : presetsForKind.length > 0 ? (
            <>
              {presetsForKind.map(p => (
                <button
                  key={p.id}
                  className="ak-preset"
                  disabled={busy}
                  onClick={() => onApplyPreset(p)}
                >
                  <div>
                    {p.badges.map(b => (
                      <kbd key={b}>{b}</kbd>
                    ))}
                  </div>
                  <strong>{tr(p.title)}</strong>
                  <span>{tr(p.description)}</span>
                  <small className="ak-preset-cta">{tr('Add preset to draft')}</small>
                </button>
              ))}
              <p className="ak-hint">
                {tr(
                  'Apply a preset to your profile draft in one click. Save to the keyboard when ready.'
                )}
              </p>
            </>
          ) : (
            <div className="ak-preset-info">
              <AdvancedKeyIcon kind={kind} />
              <p>
                {tr(
                  'Choose one physical key to start. You can select its action in the next step.'
                )}
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <h3>{tr('Finish & save')}</h3>
          <ol className="ak-finish-steps">
            <li>{tr('Choose the actions and settings on the left.')}</li>
            <li>
              {tr('Click {action} to keep them in your profile draft.', {
                action: tr(editingId ? 'Apply changes' : 'Add binding')
              })}
            </li>
            <li>
              {tr(
                connected
                  ? 'Use Save to profile above to apply them to the keyboard.'
                  : 'Connect HERO68, then use Save to profile above.'
              )}
            </li>
          </ol>
          <p className="ak-hint">
            {tr('After saving, test the binding from the configured bindings list.')}
          </p>
        </>
      )}
    </aside>
  );
}
