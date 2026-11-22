import { useI18n } from '../../i18n';
import type { AdvancedBinding, AdvancedKind } from '../../protocol/hero68/advanced';
import { remapLabel } from '../../protocol/hero68/remap';
import { ActionPicker } from './ActionPicker';
import { ADVANCED_KIND_INFO, keyLabel, SOCD_OPTIONS, XSYD_SOCD_OPTIONS } from './advancedKeysMeta';
import { Depth, DksGrid } from './DksGrid';

type AdvancedKeyEditorPanelProps = {
  view: 'assign' | 'edit';
  kind: AdvancedKind;
  required: number;
  keys: (string | null)[];
  slot: number;
  modelKeyIds: readonly string[];
  draft: AdvancedBinding | null;
  isWin68: boolean;
  onSelectSlot: (slot: number) => void;
  onAssignKey: (keyId: string) => void;
  onDraftChange: (next: AdvancedBinding) => void;
};

export function AdvancedKeyEditorPanel({
  view,
  kind,
  required,
  keys,
  slot,
  modelKeyIds,
  draft,
  isWin68,
  onSelectSlot,
  onAssignKey,
  onDraftChange
}: AdvancedKeyEditorPanelProps) {
  const { tr } = useI18n();
  const info = ADVANCED_KIND_INFO[kind];

  const renderAction = (index: number, title: string) =>
    draft && (
      <label className="ak-action-field">
        <span>{tr(title)}</span>
        <ActionPicker
          title={tr(title)}
          value={draft.actions[index] ?? 0}
          onChange={v =>
            onDraftChange({
              ...draft,
              actions: draft.actions.map((a, i) => (i === index ? v : a))
            })
          }
        />
      </label>
    );

  return (
    <article className="ak-editor">
      {view === 'assign' ? (
        <>
          <h3>
            {tr(
              required === 2
                ? 'Select two keys from the keyboard preview above'
                : 'Select a key from the keyboard preview above'
            )}
          </h3>
          <p>{tr(info.description)}</p>
          <div className="ak-assign-slots">
            {Array.from({ length: required }, (_, i) => (
              <label key={i}>
                <span>
                  {tr('Key')} {i + 1}
                </span>
                <button
                  className={`ak-assign-slot ${keys[i] ? 'is-filled' : ''} ${slot === i ? 'is-active' : ''}`}
                  aria-label={tr('Assign key {count}', {
                    count: i + 1
                  })}
                  onClick={() => onSelectSlot(i)}
                >
                  {keys[i] ? keyLabel(keys[i]) : tr('Assign')}
                </button>
              </label>
            ))}
          </div>
          <div
            className="ak-physical-input"
            tabIndex={0}
            aria-label={tr('Assign using physical keyboard')}
            onKeyDown={e => {
              if (e.key === 'Tab') {
                return;
              }
              if (modelKeyIds.includes(e.code)) {
                e.preventDefault();
                if (!e.repeat) {
                  onAssignKey(e.code);
                }
              }
            }}
          >
            {tr('Or click here and press a physical key to assign it.')}
          </div>
        </>
      ) : (
        draft && (
          <>
            <div className="ak-target-keys">
              {draft.keys.map(k => (
                <kbd key={k}>{keyLabel(k)}</kbd>
              ))}
              <span>{tr(info.title)}</span>
            </div>
            {kind === 'SOCD' ? (
              <div className="ak-socd-options">
                <h3>{tr('When both keys are pressed')}</h3>
                {isWin68 ? (
                  XSYD_SOCD_OPTIONS.map(o => (
                    <label key={o.value} className={draft.mode === o.value ? 'is-active' : ''}>
                      <input
                        type="radio"
                        name="socd"
                        checked={draft.mode === o.value}
                        onChange={() =>
                          onDraftChange({
                            ...draft,
                            mode: o.value
                          })
                        }
                      />
                      <span>
                        <strong>
                          {tr(o.title)}
                          {o.value === 1
                            ? ` (${keyLabel(draft.keys[0])})`
                            : o.value === 2
                              ? ` (${keyLabel(draft.keys[1])})`
                              : ''}
                        </strong>
                        <span>{tr(o.desc)}</span>
                      </span>
                    </label>
                  ))
                ) : (
                  <>
                    {SOCD_OPTIONS.map(o => (
                      <label key={o.value} className={draft.mode === o.value ? 'is-active' : ''}>
                        <input
                          type="radio"
                          name="socd"
                          checked={draft.mode === o.value}
                          onChange={() =>
                            onDraftChange({
                              ...draft,
                              mode: o.value
                            })
                          }
                        />
                        <span>
                          <strong>
                            {tr(o.title)}
                            {o.value === 3
                              ? ` (${keyLabel(draft.keys[0])})`
                              : o.value === 4
                                ? ` (${keyLabel(draft.keys[1])})`
                                : ''}
                          </strong>
                          <span>{tr(o.desc)}</span>
                        </span>
                      </label>
                    ))}
                    {draft.mode === 2 && (
                      <p>
                        {tr(
                          'Mode 2 is retained from the keyboard; choose a verified mode to change it.'
                        )}
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : kind === 'DKS' ? (
              <DksGrid binding={draft} onChange={onDraftChange} isWin68={isWin68} />
            ) : kind === 'MPT' ? (
              <div className="ak-mpt">
                <h3>{tr('Depth-triggered actions')}</h3>
                <p>
                  {tr(
                    'Deeper presses add actions. Releasing the key removes them in reverse order.'
                  )}
                </p>
                {draft.actions.map((_, i) => (
                  <div key={i}>
                    <span>
                      {tr('Point {count}', {
                        count: i + 1
                      })}
                    </span>
                    {renderAction(
                      i,
                      tr('Action {count}', {
                        count: i + 1
                      })
                    )}
                    <Depth
                      title={tr('Point {count} depth', {
                        count: i + 1
                      })}
                      value={draft.thresholds[i]}
                      onChange={v =>
                        onDraftChange({
                          ...draft,
                          thresholds: draft.thresholds.map((d, j) => (i === j ? v : d))
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <p>{tr(info.description)}</p>
                <div className="ak-simple-actions">
                  {kind === 'MT' ? (
                    <>
                      {renderAction(0, 'Hold action')}
                      {renderAction(1, 'Tap action')}
                    </>
                  ) : (
                    renderAction(0, kind === 'END' ? 'Action on release' : 'Toggle action')
                  )}
                </div>
                {['MT', 'TGL'].includes(kind) && (
                  <label className="ak-delay">
                    <span>{tr(kind === 'MT' ? 'Hold duration' : 'Tap / hold duration')}</span>
                    <div>
                      <input
                        type="number"
                        aria-label={tr('Tap hold delay')}
                        min={isWin68 ? '10' : '1'}
                        max={isWin68 ? '2550' : '65535'}
                        step={isWin68 ? '10' : '1'}
                        value={draft.delay}
                        onChange={e =>
                          onDraftChange({
                            ...draft,
                            delay: Number(e.target.value)
                          })
                        }
                      />
                      <span>ms</span>
                    </div>
                  </label>
                )}
                {['MT', 'TGL'].includes(kind) && (
                  <p className="ak-hint">
                    {kind === 'MT'
                      ? tr('Release within {delay} ms to send {tap}. Hold longer to send {hold}.', {
                          delay: draft.delay,
                          tap: remapLabel(draft.actions[1]),
                          hold: remapLabel(draft.actions[0])
                        })
                      : tr(
                          'Release within {delay} ms to toggle {action}. Hold longer for a normal press and release.',
                          {
                            delay: draft.delay,
                            action: remapLabel(draft.actions[0])
                          }
                        )}
                  </p>
                )}
              </>
            )}
          </>
        )
      )}
    </article>
  );
}
