import { Plus, Trash2 } from 'lucide-react';
import AdvancedKeyIcon from '../AdvancedKeyIcon';
import FeatureHelp from '../FeatureHelp';
import { useI18n } from '../../i18n';
import {
  ADVANCED_KINDS,
  ADVANCED_LIMIT,
  type AdvancedBinding,
  type AdvancedKind
} from '../../protocol/hero68/advanced';
import { ADVANCED_KIND_INFO, bindingSummary, keyLabel } from './advancedKeysMeta';
import { OutputTester } from './OutputTester';

type AdvancedKeysOverviewProps = {
  bindings: AdvancedBinding[];
  assignedKeys: string[];
  busy: boolean;
  pending: boolean;
  connected: boolean;
  isWin68: boolean;
  onBeginMode: (mode: AdvancedKind) => void;
  onSelectKey: (keyId: string) => void;
  onHoverKey: (keyId: string | null) => void;
  onRemoveBinding: (id: string) => void;
  onClearAll: () => void;
};

export function AdvancedKeysOverview({
  bindings,
  assignedKeys,
  busy,
  pending,
  connected,
  isWin68,
  onBeginMode,
  onSelectKey,
  onHoverKey,
  onRemoveBinding,
  onClearAll
}: AdvancedKeysOverviewProps) {
  const { tr } = useI18n();
  return (
    <>
      <div className="ak-page-heading">
        <h1>{tr('Advanced Keys')}</h1>
        <FeatureHelp
          title="Advanced Keys"
          paragraphs={[
            'Assign different actions to a key based on how you press it, or pair two keys to control simultaneous inputs.',
            'Choose a mode, select its physical key or keys, then configure the binding. Add binding or Apply changes keeps your edits locally; Save to profile sends them to the keyboard.'
          ]}
        />
        <span>{tr(pending ? 'Draft changes · not saved to keyboard' : 'Main Layer')}</span>
      </div>
      <div className="ak-overview">
        <article className="ak-card">
          <h2>{tr('Add an Advanced Key')}</h2>
          <p>
            {assignedKeys.length
              ? tr('{key} selected. Choose what it should do below.', {
                  key: keyLabel(assignedKeys[0])
                })
              : tr('Choose a type below, then select the key or keys you want to configure.')}
          </p>
          <div className="ak-mode-list">
            {ADVANCED_KINDS.map(mode => (
              <button
                key={mode}
                type="button"
                data-mode={mode}
                aria-disabled={bindings.length >= ADVANCED_LIMIT || busy ? 'true' : undefined}
                disabled={bindings.length >= ADVANCED_LIMIT || busy}
                onClick={() => onBeginMode(mode)}
              >
                <AdvancedKeyIcon kind={mode} />
                <span>
                  <strong>{tr(ADVANCED_KIND_INFO[mode].title)}</strong>
                  <span>{tr(ADVANCED_KIND_INFO[mode].description)}</span>
                </span>
              </button>
            ))}
          </div>
        </article>
        <article className="ak-card ak-current">
          <div className="ak-current-head">
            <h2>
              {tr('Configured Advanced Keys')}{' '}
              <small>
                {bindings.length} / {ADVANCED_LIMIT}
              </small>
            </h2>
            {bindings.some(b => b.kind !== 'UNKNOWN') && (
              <button
                type="button"
                className="secondary-button ak-clear-all-btn"
                disabled={busy}
                onClick={onClearAll}
              >
                <Trash2 size={14} />
                {tr('Clear all')}
              </button>
            )}
          </div>
          {!bindings.length ? (
            <div className="ak-empty">
              <p>
                {tr(
                  'No Advanced Keys configured yet. Select a type on the left to add your first binding.'
                )}
              </p>
              <div className="ak-empty-symbol">
                <Plus size={28} />
              </div>
            </div>
          ) : (
            <div className="ak-binding-list">
              {bindings.map(b => (
                <div
                  key={b.id}
                  className="ak-binding-row"
                  onMouseEnter={() => onHoverKey(b.keys[0])}
                  onMouseLeave={() => onHoverKey(null)}
                  onClick={() => onSelectKey(b.keys[0])}
                >
                  <button
                    type="button"
                    className="ak-binding-main"
                    onFocus={() => onHoverKey(b.keys[0])}
                    onBlur={() => onHoverKey(null)}
                    onClick={e => {
                      e.stopPropagation();
                      onSelectKey(b.keys[0]);
                    }}
                  >
                    <AdvancedKeyIcon kind={b.kind} />
                    <span>
                      <strong>
                        {b.kind === 'UNKNOWN'
                          ? tr('Firmware binding')
                          : tr(ADVANCED_KIND_INFO[b.kind].title)}
                      </strong>
                      <span>
                        {b.keys.map(k => (
                          <kbd key={k}>{keyLabel(k)}</kbd>
                        ))}
                      </span>
                      <small className="ak-binding-summary">{bindingSummary(b, tr, isWin68)}</small>
                    </span>
                  </button>
                  <div className="ak-binding-actions">
                    {b.kind !== 'UNKNOWN' && (
                      <button
                        type="button"
                        className="ak-inline-delete"
                        disabled={busy}
                        title={tr('Remove binding')}
                        aria-label={tr('Remove {keys} binding', {
                          keys: b.keys.map(keyLabel).join(' + ')
                        })}
                        onClick={e => {
                          e.stopPropagation();
                          onRemoveBinding(b.id);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="ak-edit-label"
                      disabled={busy}
                      onClick={e => {
                        e.stopPropagation();
                        onSelectKey(b.keys[0]);
                      }}
                    >
                      {tr(b.kind === 'UNKNOWN' ? 'Read only' : 'Edit')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="ak-save-note">
            {tr(
              pending
                ? connected
                  ? 'Draft changes are ready. Use Save to profile above to apply them to the keyboard.'
                  : 'Draft changes are kept locally. Connect HERO68, then use Save to profile above.'
                : 'Select a binding to edit its behavior.'
            )}
          </p>
          {connected && !pending && bindings.length > 0 && (
            <details className="ak-test-disclosure">
              <summary>{tr('Test saved keyboard output')}</summary>
              <OutputTester />
            </details>
          )}
        </article>
      </div>
    </>
  );
}
