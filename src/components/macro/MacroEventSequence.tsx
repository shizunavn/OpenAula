import { ArrowDown, ArrowUp, Play, Plus, Square, Trash2 } from 'lucide-react';
import { AppSelect } from '../../app/components/AppSelect';
import { useI18n } from '../../i18n';
import { MACRO_ACTIONS, heldMacroKeys, macroKeyLabel, type MacroEvent } from '../../state/macros';

type MacroEventSequenceProps = {
  events: MacroEvent[];
  durationMs: number;
  locked: boolean;
  recording: boolean;
  playing: boolean;
  previewIndex: number | null;
  previewHeld: string[];
  addKey: string;
  eventType: 'down' | 'up';
  fixedDelay: number;
  onAddKeyChange: (key: string) => void;
  onEventTypeChange: (type: 'down' | 'up') => void;
  onUpdateEvents: (events: MacroEvent[]) => void;
  onMoveEvent: (index: number, delta: -1 | 1) => void;
  onAppendKeystroke: () => void;
  onStartPreview: () => void;
  onStopPreview: () => void;
};

export function MacroEventSequence({
  events,
  durationMs,
  locked,
  recording,
  playing,
  previewIndex,
  previewHeld,
  addKey,
  eventType,
  fixedDelay,
  onAddKeyChange,
  onEventTypeChange,
  onUpdateEvents,
  onMoveEvent,
  onAppendKeystroke,
  onStartPreview,
  onStopPreview
}: MacroEventSequenceProps) {
  const { tr } = useI18n();
  const heldKeys = heldMacroKeys(events);
  const actionOptions = MACRO_ACTIONS.map(action => ({
    value: action.name,
    label: action.label
  }));

  return (
    <>
      <div className="macro-sequence-heading">
        <div>
          <h2>{tr('Sequence')}</h2>
          <span>
            {tr(events.length === 1 ? '{count} event' : '{count} events', {
              count: events.length
            })}{' '}
            ·{' '}
            {tr('{seconds} s per cycle', {
              seconds: (durationMs / 1000).toFixed(2)
            })}
          </span>
        </div>
        <button
          className="secondary-button"
          disabled={recording || !events.length}
          onClick={playing ? onStopPreview : onStartPreview}
        >
          {playing ? <Square size={14} /> : <Play size={14} />}{' '}
          {playing ? tr('Stop preview') : tr('Preview one cycle')}
        </button>
      </div>
      {(playing || previewIndex !== null) && (
        <div className="macro-preview" role="status">
          <span>
            {playing ? tr('Previewing') : tr('Preview complete')} ·{' '}
            {tr('Event {count} / {total}', {
              count: (previewIndex ?? -1) + 1,
              total: events.length
            })}
          </span>
          <div>
            {previewHeld.length ? (
              previewHeld.map(key => <kbd key={key}>{macroKeyLabel(key)}</kbd>)
            ) : (
              <span>{tr('No keys held')}</span>
            )}
          </div>
          <small>{tr('Visual preview only — no keys are sent to applications.')}</small>
        </div>
      )}
      {!events.length ? (
        <div className="macro-sequence-empty">
          <p>{tr('No events yet. Record your keys or add a keystroke below.')}</p>
        </div>
      ) : (
        <div className="macro-event-list">
          <div className="macro-event-columns">
            <span>#</span>
            <span>{tr('Wait before')}</span>
            <span>{tr('Action')}</span>
            <span>{tr('Key / button')}</span>
            <span />
          </div>
          {events.map((event, index) => (
            <div
              key={index}
              className={`macro-event-row ${previewIndex === index ? 'is-previewed' : ''}`}
            >
              <span className="macro-event-index">{index + 1}</span>
              <label className="macro-delay-input">
                <input
                  type="number"
                  min={0}
                  max={60000}
                  aria-label={tr('Event {count} delay', {
                    count: index + 1
                  })}
                  value={event.delayMs}
                  disabled={locked}
                  onChange={e =>
                    onUpdateEvents(
                      events.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              delayMs: Number(e.target.value)
                            }
                          : item
                      )
                    )
                  }
                />
                <span>ms</span>
              </label>
              <AppSelect<'down' | 'up'>
                label={tr('Event {count} action', {
                  count: index + 1
                })}
                value={event.type}
                disabled={locked}
                onChange={type =>
                  onUpdateEvents(
                    events.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            type
                          }
                        : item
                    )
                  )
                }
                options={[
                  {
                    value: 'down',
                    label: '↓ ' + tr('Press')
                  },
                  {
                    value: 'up',
                    label: '↑ ' + tr('Release')
                  }
                ]}
              />
              <AppSelect
                label={tr('Event {count} key', {
                  count: index + 1
                })}
                value={event.key}
                disabled={locked}
                onChange={key =>
                  onUpdateEvents(
                    events.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            key
                          }
                        : item
                    )
                  )
                }
                options={actionOptions}
              />
              <div className="macro-row-actions">
                <button
                  className="icon-button"
                  aria-label={tr('Move event {count} up', {
                    count: index + 1
                  })}
                  disabled={locked || index === 0}
                  onClick={() => onMoveEvent(index, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={tr('Move event {count} down', {
                    count: index + 1
                  })}
                  disabled={locked || index === events.length - 1}
                  onClick={() => onMoveEvent(index, 1)}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={tr('Remove event {count}', {
                    count: index + 1
                  })}
                  disabled={locked}
                  onClick={() => onUpdateEvents(events.filter((_, i) => i !== index))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="macro-add-controls">
        <AppSelect
          label={tr('Key to add')}
          value={addKey}
          disabled={locked}
          onChange={onAddKeyChange}
          options={actionOptions}
        />
        <button className="secondary-button" disabled={locked} onClick={onAppendKeystroke}>
          <Plus size={15} />
          {tr('Add keystroke')}
        </button>
        {heldKeys.length > 0 && !recording && (
          <button
            className="secondary-button"
            disabled={locked}
            onClick={() =>
              onUpdateEvents([
                ...events,
                ...heldKeys.map(key => ({
                  key,
                  type: 'up' as const,
                  delayMs: 0
                }))
              ])
            }
          >
            {tr('Release held keys')}
          </button>
        )}
      </div>
      <details className="macro-single-event">
        <summary>{tr('Add a single press or release')}</summary>
        <AppSelect<'down' | 'up'>
          label={tr('Single event action')}
          value={eventType}
          disabled={locked}
          onChange={onEventTypeChange}
          options={[
            {
              value: 'down',
              label: tr('Press')
            },
            {
              value: 'up',
              label: tr('Release')
            }
          ]}
        />
        <button
          className="secondary-button"
          disabled={locked}
          onClick={() =>
            onUpdateEvents([
              ...events,
              {
                key: addKey,
                type: eventType,
                delayMs: fixedDelay
              }
            ])
          }
        >
          {tr(eventType === 'down' ? 'Add press of {key}' : 'Add release of {key}', {
            key: macroKeyLabel(addKey)
          })}
        </button>
      </details>
    </>
  );
}
