import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Copy, Download, ListOrdered, Plus, Square, Trash2, Upload } from 'lucide-react';
import FeatureHelp from './FeatureHelp';
import {
  MACRO_ACTIONS,
  MACRO_DRAFT_KEY,
  MACRO_EVENT_LIMIT,
  MACRO_LIBRARY_LIMIT,
  heldMacroKeys,
  loadMacroLibrary,
  macroExport,
  newMacro,
  parseMacroImport,
  saveMacroLibrary,
  validateMacro,
  type MacroDefinition,
  type MacroEvent
} from '../state/macros';
import { syncHero68MacroLibrary } from '../protocol/hero68/macroDevice';
import { hero68DeviceManager, useHero68Device } from '../protocol/hero68/webhid';
import { UndoRedoButtons, useUndoRedoState } from '../app/components/UndoRedoButtons';
import './MacroPage.css';
import { useI18n } from '../i18n';
import { BRAND } from '../brand';
import { loadWorkspace } from './macro/macroWorkspace';
import { MacroLibrarySidebar } from './macro/MacroLibrarySidebar';
import { MacroEventSequence } from './macro/MacroEventSequence';
import { MacroPlaybackFooter } from './macro/MacroPlaybackFooter';
import { MacroDiscardModal } from './macro/MacroDiscardModal';
const mouseButtonToMacroKey: Record<number, string> = {
  0: 'MouseKey0',
  1: 'MouseKey2',
  2: 'MouseKey1',
  3: 'MouseKey3',
  4: 'MouseKey4'
};
/**
 * Macro Editor and Onboard Library Manager (CMD 0x05 protocol).
 *
 * Each macro stores an ordered sequence of key/mouse down-up events with per-event millisecond delays
 * (up to MACRO_EVENT_LIMIT events per macro and MACRO_LIBRARY_LIMIT macros total).
 * Saving writes both to browser LocalStorage and, when HERO68/HERO84 is connected, directly to the
 * keyboard's onboard macro memory. Key assignment and playback mode (Once, Repeat N, Hold, Toggle)
 * are configured per key in Key Remap -> Macros.
 */
export default function MacroPage() {
  const { tr } = useI18n();
  const initial = useMemo(loadWorkspace, []);
  const [macros, setMacros] = useState(initial.macros);
  const [draft, setDraft] = useState<MacroDefinition | null>(
    initial.draft ?? initial.macros[0] ?? null
  );
  const [query, setQuery] = useState('');
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState('');
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewHeld, setPreviewHeld] = useState<string[]>([]);
  const [addKey, setAddKey] = useState('KeyA');
  const [eventType, setEventType] = useState<'down' | 'up'>('down');
  const [fixedDelay, setFixedDelay] = useState(50);
  const [useRecordedDelay, setUseRecordedDelay] = useState(true);
  const [switchTarget, setSwitchTarget] = useState<MacroDefinition | null>(null);
  const [undoDelete, setUndoDelete] = useState<MacroDefinition | null>(null);
  const macroStateValue = useMemo(() => ({ macros, draft }), [macros, draft]);
  const macroHistory = useUndoRedoState(macroStateValue, next => {
    try {
      saveMacroLibrary(next.macros);
      setMacros(next.macros);
      setDraft(next.draft);
      setNotice('');
      setError('');
    } catch {
      /* ignore storage errors */
    }
  });
  const [deviceSaving, setDeviceSaving] = useState(false);
  const [deviceSynced, setDeviceSynced] = useState(false);
  const device = useHero68Device();
  const recorder = useRef<{
    events: MacroEvent[];
    held: Set<string>;
    last: number;
  } | null>(null);
  const recordArea = useRef<HTMLDivElement>(null);
  const recordToggleButton = useRef<HTMLButtonElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = macros.find(macro => macro.id === draft?.id);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  const locked = recording || playing || deviceSaving;
  const duration = draft?.events.reduce((sum, event) => sum + event.delayMs, 0) ?? 0;
  useEffect(() => {
    try {
      if (!draft) {
        localStorage.removeItem(MACRO_DRAFT_KEY);
        return;
      }
      validateMacro(draft, false);
      localStorage.setItem(MACRO_DRAFT_KEY, JSON.stringify(draft));
    } catch {} /* Keep the last valid draft while an input is incomplete. */
  }, [draft]);
  useEffect(
    () => () => {
      if (previewTimer.current) {
        clearTimeout(previewTimer.current);
      }
    },
    []
  );
  useEffect(() => {
    if (!recording) {
      return;
    }
    const shouldIgnorePointerTarget = (target: EventTarget | null) =>
      target instanceof Node && !!recordToggleButton.current?.contains(target);
    const recordCode = (code: string, type: 'down' | 'up') => {
      if (!recorder.current || !MACRO_ACTIONS.some(action => action.name === code)) {
        return;
      }
      const session = recorder.current;
      if (type === 'down' && session.held.has(code)) {
        return;
      }
      if (type === 'up' && !session.held.has(code)) {
        return;
      }
      if (session.events.length + session.held.size + 2 >= MACRO_EVENT_LIMIT) {
        stopRecording();
        setError(
          tr('Recording reached the event limit. Save this sequence before starting another.')
        );
        return;
      }
      const now = performance.now();
      const delayMs = session.events.length
        ? useRecordedDelay
          ? Math.min(60000, Math.max(0, Math.round(now - session.last)))
          : fixedDelay
        : 0;
      session.events.push({
        key: code,
        type,
        delayMs
      });
      session.last = now;
      if (type === 'down') {
        session.held.add(code);
      } else {
        session.held.delete(code);
      }
      setDraft(previous =>
        previous
          ? {
              ...previous,
              events: [...session.events]
            }
          : previous
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!MACRO_ACTIONS.some(action => action.name === event.code)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) {
        return;
      }
      recordCode(event.code, 'down');
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!MACRO_ACTIONS.some(action => action.name === event.code)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      recordCode(event.code, 'up');
    };
    const onMouseDown = (event: MouseEvent) => {
      if (shouldIgnorePointerTarget(event.target)) {
        return;
      }
      const code = mouseButtonToMacroKey[event.button];
      if (!code) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      recordCode(code, 'down');
    };
    const onMouseUp = (event: MouseEvent) => {
      if (shouldIgnorePointerTarget(event.target)) {
        return;
      }
      const code = mouseButtonToMacroKey[event.button];
      if (!code) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      recordCode(code, 'up');
    };
    const onContextMenu = (event: MouseEvent) => {
      if (!shouldIgnorePointerTarget(event.target)) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown, {
      capture: true
    });
    window.addEventListener('keyup', onKeyUp, {
      capture: true
    });
    window.addEventListener('mousedown', onMouseDown, {
      capture: true
    });
    window.addEventListener('mouseup', onMouseUp, {
      capture: true
    });
    window.addEventListener('contextmenu', onContextMenu, {
      capture: true
    });
    return () => {
      window.removeEventListener('keydown', onKeyDown, {
        capture: true
      });
      window.removeEventListener('keyup', onKeyUp, {
        capture: true
      });
      window.removeEventListener('mousedown', onMouseDown, {
        capture: true
      });
      window.removeEventListener('mouseup', onMouseUp, {
        capture: true
      });
      window.removeEventListener('contextmenu', onContextMenu, {
        capture: true
      });
    };
  }, [recording, useRecordedDelay, fixedDelay]);
  function store(next: MacroDefinition[]) {
    saveMacroLibrary(next);
    setMacros(next);
    setDeviceSynced(false);
  }
  function select(target: MacroDefinition) {
    if (locked) {
      return;
    }
    if (dirty && draft?.events.length) {
      setSwitchTarget(target);
      return;
    }
    setDraft(structuredClone(target));
    setError('');
    setNotice('');
    setPreviewIndex(null);
  }
  async function save() {
    if (!draft || locked) {
      return false;
    }
    try {
      validateMacro(draft);
      if (!saved && macros.length >= MACRO_LIBRARY_LIMIT) {
        throw new Error(`This library can hold ${MACRO_LIBRARY_LIMIT} macros.`);
      }
      const clean = {
        ...draft,
        name: draft.name.trim()
      };
      const currentIndex = macros.findIndex(m => m.id === draft.id);
      const next =
        currentIndex >= 0
          ? macros.map((macro, index) => (index === currentIndex ? clean : macro))
          : [...macros, clean];
      store(next);
      setDraft(clean);
      setError('');
      if (!hero68DeviceManager.connected) {
        setNotice(
          tr(
            'Saved locally. Connect HERO68 and save again to write this macro library to the keyboard.'
          )
        );
        return true;
      }
      setDeviceSaving(true);
      try {
        const packets = await syncHero68MacroLibrary(hero68DeviceManager, next);
        setDeviceSynced(true);
        setNotice(
          tr(
            packets === 1
              ? 'Saved locally and wrote the macro library to HERO68 ({count} packet).'
              : 'Saved locally and wrote the macro library to HERO68 ({count} packets).',
            {
              count: packets
            }
          )
        );
        return true;
      } catch (e) {
        setError(
          tr('Saved locally, but HERO68 macro sync failed: {error}', {
            error: e instanceof Error ? e.message : String(e)
          })
        );
        setNotice('');
        return false;
      } finally {
        setDeviceSaving(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }
  function updateEvents(events: MacroEvent[]) {
    if (!draft) {
      return;
    }
    if (events.length > MACRO_EVENT_LIMIT) {
      setError(`The editor supports up to ${MACRO_EVENT_LIMIT} events.`);
      return;
    }
    setDraft({
      ...draft,
      events
    });
    setError('');
    setNotice('');
    setPreviewIndex(null);
  }
  function stopRecording() {
    const session = recorder.current;
    if (!session) {
      return;
    }
    for (const key of session.held) {
      session.events.push({
        key,
        type: 'up',
        delayMs: 0
      });
    }
    recorder.current = null;
    setRecording(false);
    setDraft(previous =>
      previous
        ? {
            ...previous,
            events: [...session.events]
          }
        : previous
    );
    setNotice(tr('Recording stopped. Any held keys were released automatically.'));
  }
  function startRecording() {
    if (!draft) {
      return;
    }
    setError('');
    setNotice(tr('Recording started. Click Stop recording to finish.'));
    setPreviewIndex(null);
    recorder.current = {
      events: [...draft.events],
      held: new Set(heldMacroKeys(draft.events)),
      last: performance.now()
    };
    setRecording(true);
    recordArea.current?.focus();
  }
  function stopPreview() {
    if (previewTimer.current) {
      clearTimeout(previewTimer.current);
    }
    previewTimer.current = null;
    setPlaying(false);
    setPreviewHeld([]);
    setPreviewIndex(null);
  }
  function preview() {
    if (!draft) {
      return;
    }
    try {
      validateMacro(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setError('');
    setPlaying(true);
    setPreviewHeld([]);
    setPreviewIndex(null);
    const events = structuredClone(draft.events);
    let i = 0;
    const next = () => {
      if (i === events.length) {
        setPlaying(false);
        setPreviewHeld([]);
        previewTimer.current = null;
        return;
      }
      previewTimer.current = setTimeout(() => {
        const event = events[i];
        setPreviewIndex(i);
        setPreviewHeld(keys =>
          event.type === 'down' ? [...keys, event.key] : keys.filter(key => key !== event.key)
        );
        i++;
        next();
      }, events[i].delayMs);
    };
    next();
  }
  function move(index: number, direction: number) {
    if (!draft) {
      return;
    }
    const events = [...draft.events];
    [events[index], events[index + direction]] = [events[index + direction], events[index]];
    updateEvents(events);
  }
  function appendKeystroke() {
    if (!draft) {
      return;
    }
    updateEvents([
      ...draft.events,
      {
        key: addKey,
        type: 'down',
        delayMs: draft.events.length ? fixedDelay : 0
      },
      {
        key: addKey,
        type: 'up',
        delayMs: fixedDelay
      }
    ]);
  }
  async function importFile(file?: File) {
    if (!file) {
      return;
    }
    try {
      if (file.size > 1_000_000) {
        throw new Error('Choose a macro export smaller than 1 MB.');
      }
      const imported = parseMacroImport(await file.text()).map(m => ({
        ...m,
        id: crypto.randomUUID()
      }));
      if (imported.length + macros.length > MACRO_LIBRARY_LIMIT) {
        throw new Error(`The library can hold ${MACRO_LIBRARY_LIMIT} macros.`);
      }
      store([...macros, ...imported]);
      setError('');
      setNotice(
        tr(
          imported.length === 1
            ? 'Imported {count} macro into your local library.'
            : 'Imported {count} macros into your local library.',
          {
            count: imported.length
          }
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (importInput.current) {
        importInput.current.value = '';
      }
    }
  }
  function exportLibrary() {
    const url = URL.createObjectURL(
      new Blob([macroExport(macros)], {
        type: 'application/json'
      })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${BRAND.exportSchemaPrefix}-macros.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const filtered = macros.filter(m => m.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="page macro-page page-enter">
      <div className="macro-heading">
        <div>
          <h1>
            {tr('Macros')}{' '}
            <FeatureHelp
              title="Macros"
              paragraphs={[
                'Build a sequence of key presses, releases and delays. Record a sequence or add keystrokes, then edit each event.',
                'Save keeps an editable local copy and, while HERO68 is connected, also writes the macro definition library with the recovered CMD 0x05 protocol. Assign saved macros to physical keys from Key Remap → Macros; the on-device playback mode and count are selected there. Preview only animates the sequence; it does not send keys to other applications.'
              ]}
            />
          </h1>
          <p>{tr('A sequence of actions, ready when you need it.')}</p>
        </div>
        <div>
          <UndoRedoButtons
            canUndo={macroHistory.canUndo}
            canRedo={macroHistory.canRedo}
            onUndo={macroHistory.undo}
            onRedo={macroHistory.redo}
            disabled={locked}
            enableShortcuts
          />
          <input
            ref={importInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={event => void importFile(event.target.files?.[0])}
          />
          <button
            className="secondary-button"
            disabled={locked}
            onClick={() => importInput.current?.click()}
          >
            <Upload size={15} />
            {tr('Import')}
          </button>
          <button
            className="secondary-button"
            disabled={!macros.length || locked}
            onClick={exportLibrary}
          >
            <Download size={15} />
            {tr('Export')}
          </button>
          <button
            className="apply-button"
            disabled={locked || macros.length >= MACRO_LIBRARY_LIMIT}
            onClick={() => select(newMacro())}
          >
            <Plus size={16} />
            {tr('New macro')}
          </button>
        </div>
      </div>
      {error && (
        <p className="macro-message is-error" role="alert">
          {tr(error)}
        </p>
      )}

      <div className="macro-workspace">
        <MacroLibrarySidebar
          macros={macros}
          filtered={filtered}
          activeMacroId={draft?.id ?? null}
          query={query}
          locked={locked}
          onQueryChange={setQuery}
          onSelect={select}
        />
        {!draft ? (
          <section className="macro-empty">
            <span className="macro-empty-icon">
              <ListOrdered size={36} />
            </span>
            <h2>{tr('Your first macro starts here')}</h2>
            <p>{tr('Record a shortcut or build a sequence one keystroke at a time.')}</p>
            <button className="apply-button" onClick={() => select(newMacro())}>
              <Plus size={16} />
              {tr('Create macro')}
            </button>
            <p className="macro-hardware-note">
              {tr(
                'Connect HERO68 to write saved macro definitions to the keyboard, then use Key Remap → Macros to assign one to a key.'
              )}
            </p>
          </section>
        ) : (
          <section className="macro-editor">
            <header className="macro-editor-head">
              <label>
                <span>{tr('Macro name')}</span>
                <input
                  aria-label={tr('Macro name')}
                  maxLength={48}
                  value={draft.name}
                  disabled={locked}
                  onChange={event => {
                    setDraft({
                      ...draft,
                      name: event.target.value
                    });
                    setNotice('');
                  }}
                />
              </label>
              <span className="macro-draft-badge">
                {deviceSaving
                  ? tr('Writing to HERO68…')
                  : dirty
                    ? tr('Draft')
                    : deviceSynced
                      ? tr('Saved to HERO68')
                      : tr('Saved locally')}
              </span>
              <div>
                <button
                  className="icon-button"
                  disabled={locked}
                  aria-label={tr('Duplicate macro')}
                  onClick={() =>
                    select({
                      ...structuredClone(draft),
                      id: crypto.randomUUID(),
                      name: tr('{name} copy', {
                        name: draft.name
                      }).slice(0, 48)
                    })
                  }
                >
                  <Copy size={17} />
                </button>
                <button
                  className="icon-button"
                  disabled={locked}
                  aria-label={tr('Delete macro')}
                  onClick={() => {
                    try {
                      if (saved) {
                        store(macros.filter(m => m.id !== draft.id));
                        setUndoDelete(saved);
                        setNotice('Macro removed from the local library.');
                      }
                      setDraft(null);
                      setError('');
                    } catch {
                      setError('Could not remove the macro. Check browser storage.');
                    }
                  }}
                >
                  <Trash2 size={17} />
                </button>
                <button
                  className="apply-button"
                  disabled={locked || (!dirty && device.state !== 'connected')}
                  onClick={() => void save()}
                >
                  {deviceSaving
                    ? tr('Saving…')
                    : device.state === 'connected' && !dirty && !deviceSynced
                      ? tr('Sync to HERO68')
                      : tr('Save macro')}
                </button>
              </div>
            </header>
            <div className="macro-record-controls">
              <button
                ref={recordToggleButton}
                className={`secondary-button ${recording ? 'is-recording' : ''}`}
                disabled={playing}
                onClick={recording ? stopRecording : startRecording}
              >
                {recording ? <Square size={15} /> : <Circle size={15} />}{' '}
                {recording ? tr('Stop recording') : tr('Record keys')}
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={useRecordedDelay}
                  disabled={locked}
                  onChange={event => setUseRecordedDelay(event.target.checked)}
                />
                {tr('Use recorded timing')}
              </label>
              {!useRecordedDelay && (
                <label className="macro-delay-input">
                  <input
                    type="number"
                    aria-label={tr('Recording delay')}
                    min={0}
                    max={60000}
                    value={fixedDelay}
                    disabled={locked}
                    onChange={event =>
                      setFixedDelay(Math.max(0, Math.min(60000, Number(event.target.value))))
                    }
                  />
                  <span>ms</span>
                </label>
              )}
              <span>{tr('Recording appends to this sequence.')}</span>
            </div>
            <div
              ref={recordArea}
              tabIndex={0}
              className={`macro-record-area ${recording ? 'is-recording' : ''}`}
              aria-label={tr('Macro recording area')}
            >
              {recording ? (
                <>
                  <span className="macro-record-dot" />
                  {tr(
                    'Recording — press keys or mouse buttons. Recording continues until you click'
                  )}{' '}
                  <strong>{tr('Stop recording')}</strong>.
                </>
              ) : (
                <>
                  {tr('Click')} <strong>{tr('Record keys')}</strong>
                  {tr(', then press your shortcut or sequence.')}
                </>
              )}
            </div>
            <MacroEventSequence
              events={draft.events}
              durationMs={duration}
              locked={locked}
              recording={recording}
              playing={playing}
              previewIndex={previewIndex}
              previewHeld={previewHeld}
              addKey={addKey}
              eventType={eventType}
              fixedDelay={fixedDelay}
              onAddKeyChange={setAddKey}
              onEventTypeChange={setEventType}
              onUpdateEvents={updateEvents}
              onMoveEvent={move}
              onAppendKeystroke={appendKeystroke}
              onStartPreview={preview}
              onStopPreview={stopPreview}
            />
            <MacroPlaybackFooter
              playback={draft.playback}
              repeatCount={draft.repeatCount}
              locked={locked}
              deviceConnected={device.state === 'connected'}
              onPlaybackChange={playback =>
                setDraft({
                  ...draft,
                  playback
                })
              }
              onRepeatCountChange={repeatCount =>
                setDraft({
                  ...draft,
                  repeatCount
                })
              }
            />
          </section>
        )}
      </div>
      {switchTarget && (
        <MacroDiscardModal
          draftName={draft?.name ?? ''}
          deviceSaving={deviceSaving}
          error={error}
          onCancel={() => setSwitchTarget(null)}
          onDiscard={() => {
            setDraft(switchTarget);
            setSwitchTarget(null);
            setError('');
            setNotice('');
          }}
          onSaveAndContinue={() =>
            void (async () => {
              if (await save()) {
                setDraft(switchTarget);
                setSwitchTarget(null);
              }
            })()
          }
        />
      )}
    </div>
  );
}
