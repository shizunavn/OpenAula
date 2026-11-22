import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, RotateCcw, Trash2, X } from 'lucide-react';
import Hero68Preview from './Hero68Preview';
import AdvancedKeyIcon from './AdvancedKeyIcon';
import FeatureHelp from './FeatureHelp';
import { useI18n } from '../i18n';
import { HERO68_KEY_LABEL_BY_ID } from '../app/helpers';
import { heroLayout } from '../keyboard/layout';
import { getBoard, resolveEffectiveTravelLimits } from '../keyboard/registry';
import { DeviceModelContext, type HeroDeviceModelId } from '../app/DeviceModelContext';
import {
  ADVANCED_KINDS,
  ADVANCED_LIMIT,
  newAdvanced,
  validateAdvanced,
  type AdvancedBinding,
  type AdvancedKind
} from '../protocol/hero68/advanced';
import { remapLabel } from '../protocol/hero68/remap';
import {
  ADVANCED_PRESETS,
  applyAdvancedPreset,
  presetConflicts,
  type AdvancedPreset
} from '../protocol/hero68/advancedPresets';
import { AppSelect } from '../app/components/AppSelect';
import { UndoRedoButtons, useUndoRedoState } from '../app/components/UndoRedoButtons';
import './AdvancedKeysPage.css';
import { ActionPicker } from './advanced-keys/ActionPicker';
import {
  DksGrid,
  dksVisualTrackState,
  DKS_PALETTE_CATEGORIES,
  Depth
} from './advanced-keys/DksGrid';
import { OutputTester } from './advanced-keys/OutputTester';
import { DksUnsupportedModal } from './advanced-keys/DksUnsupportedModal';
export { dksVisualTrackState, DksUnsupportedModal, DKS_PALETTE_CATEGORIES };
/**
 * Advanced key binding modes supported by HERO68/HERO84 and WIN 68 HE MAX firmware (up to ADVANCED_LIMIT bindings per profile):
 * - SOCD: Pairs exactly 2 physical keys and resolves simultaneous opposite cardinal directions (Last/Key1/Key2/Neutral).
 * - DKS (Dynamic Keystroke): Binds 1 physical key to up to 4 actions across 4 travel phases (down shallow, down deep, up deep, up shallow).
 * - MT (Mod-Tap): Sends a tap action if released within the tap/hold threshold (ms), or holds a secondary modifier action.
 * - TGL (Toggle): Latches an action on/off on quick tap while preserving normal momentary behavior on hold.
 * - MPT (Multi-Point Trigger): Triggers up to 3 distinct actions at 3 ascending actuation depths on a single key.
 * - END (Release Action): Preserves the primary press action and fires an additional keycode upon release.
 */
const INFO: Record<
  AdvancedKind,
  {
    title: string;
    description: string;
  }
> = {
  SOCD: {
    title: 'SOCD',
    description: 'Pair two keys and choose which input takes priority when both are pressed.'
  },
  DKS: {
    title: 'Dynamic Keystroke (DKS)',
    description: 'Assign up to four actions to different points of a key press and release.'
  },
  MT: {
    title: 'Mod Tap',
    description: 'Two actions on one key. Hold for the first action, or tap for the second.'
  },
  TGL: {
    title: 'Toggle Key',
    description: 'Tap to lock an action on or off. Hold the key for normal press and release.'
  },
  MPT: {
    title: 'Multi-point Trigger (MPT)',
    description: 'Activate three actions at three different depths of a single key.'
  },
  END: {
    title: 'Release Action (END)',
    description: 'Keep the normal key press and send an additional action when you release it.'
  }
};
const label = (key: string) => HERO68_KEY_LABEL_BY_ID[key] ?? key;

const SOCD_OPTIONS = [
  {
    value: 1,
    title: 'Last input priority',
    desc: 'The last key pressed overrides the first.'
  },
  {
    value: 3,
    title: 'First key priority',
    desc: 'Key 1 wins whenever both keys are active.'
  },
  {
    value: 4,
    title: 'Second key priority',
    desc: 'Key 2 wins whenever both keys are active.'
  },
  {
    value: 0,
    title: 'Neutral',
    desc: 'Neither key is active while both are pressed.'
  }
];
export const XSYD_SOCD_OPTIONS = [
  {
    value: 0,
    verified: true,
    title: 'Last input priority',
    desc: 'The last key pressed overrides the first.'
  },
  {
    value: 1,
    verified: true,
    title: 'First key priority',
    desc: 'Key 1 wins whenever both keys are active.'
  },
  {
    value: 2,
    verified: true,
    title: 'Second key priority',
    desc: 'Key 2 wins whenever both keys are active.'
  },
  {
    value: 3,
    verified: true,
    title: 'Neutral',
    desc: 'Neither key is active while both are pressed.'
  }
];
export const XSYD_DKS_DOC_URL = 'docs/xsyd-protocol.md#5-advanced-keys';
type Props = {
  model?: HeroDeviceModelId;
  bindings: AdvancedBinding[];
  busy: boolean;
  pending: boolean;
  connected: boolean;
  initialDksModalOpen?: boolean;
  onSave?: () => void;
  onChange: (bindings: AdvancedBinding[]) => void;
};
type View = 'overview' | 'assign' | 'edit';
function bindingSummary(
  binding: AdvancedBinding,
  tr: ReturnType<typeof useI18n>['tr'],
  isWin68 = false
) {
  const actions = binding.actions.map(remapLabel);
  if (binding.kind === 'SOCD') {
    if (isWin68) {
      return tr(
        XSYD_SOCD_OPTIONS.find(o => o.value === binding.mode)?.title ?? 'Existing keyboard priority'
      );
    }
    return tr(
      SOCD_OPTIONS.find(o => o.value === binding.mode)?.title ?? 'Existing keyboard priority'
    );
  }
  if (binding.kind === 'MT') {
    return tr('Hold: {hold} · Tap: {tap}', {
      hold: actions[0],
      tap: actions[1]
    });
  }
  if (binding.kind === 'TGL') {
    return tr('Toggle: {action}', {
      action: actions[0]
    });
  }
  if (binding.kind === 'END') {
    return tr('On release: {action}', {
      action: actions[0]
    });
  }
  if (binding.kind === 'MPT') {
    return binding.thresholds
      .map((depth, i) => `${depth.toFixed(2)} mm: ${actions[i]}`)
      .join(' · ');
  }
  if (binding.kind === 'DKS') {
    return (
      actions.filter((_, i) => binding.states[i]?.some(Boolean)).join(' · ') ||
      tr('No actions assigned')
    );
  }
  return tr('Preserved from the keyboard; editing unavailable');
}
export default function AdvancedKeysPage({
  model: modelProp,
  bindings,
  busy,
  pending,
  connected,
  onSave,
  onChange
}: Props) {
  const { tr } = useI18n();
  const contextModel = useContext(DeviceModelContext);
  const model = modelProp ?? contextModel;
  const board = getBoard(model);
  const isWin68 = board.protocol === 'xsyd';
  const _travelLimits = useMemo(() => resolveEffectiveTravelLimits(board), [board]);
  void _travelLimits;
  const modelKeyIds = useMemo(() => board.keyIds, [board]);
  const neutral = useMemo(
    () => Object.fromEntries(modelKeyIds.map(k => [k, '#292d2f'])),
    [modelKeyIds]
  );
  const [view, setView] = useState<View>('overview');
  const [kind, setKind] = useState<AdvancedKind>('SOCD');
  const [presetReview, setPresetReview] = useState<AdvancedPreset | null>(null);
  const page = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef<number | null>(null);
  const captureScrollPosition = () => {
    const scrollEl = page.current?.closest('.workspace') as HTMLElement | null;
    if (scrollEl) {
      savedScrollTop.current = scrollEl.scrollTop;
    }
  };
  useLayoutEffect(() => {
    if (savedScrollTop.current === null) {
      return;
    }
    const scrollEl = page.current?.closest('.workspace') as HTMLElement | null;
    const targetScroll = savedScrollTop.current;
    savedScrollTop.current = null;
    if (scrollEl) {
      scrollEl.scrollTop = targetScroll;
    }
  }, [view]);
  const [keys, setKeys] = useState<(string | null)[]>([]);
  const [slot, setSlot] = useState(0);
  const [draft, setDraft] = useState<AdvancedBinding | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [removeOpen, setRemoveOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const draftHistory = useUndoRedoState<AdvancedBinding | null>(
    draft,
    next => setDraft(next),
    `${view}:${editingId ?? kind}:${draft?.keys.join(',') ?? ''}`
  );
  useEffect(() => {
    if (error) {
      page.current?.querySelector('[role="alert"]')?.scrollIntoView({
        block: 'nearest',
        behavior: 'instant'
      });
    }
  }, [error]);
  const required = kind === 'SOCD' ? 2 : 1;
  const info = INFO[kind];
  const [notice, setNotice] = useState('');
  const [undoBindings, setUndoBindings] = useState<AdvancedBinding[] | null>(null);
  const assignedKeys = keys.filter((key): key is string => key !== null);
  const ready = assignedKeys.length === required;
  const occupied = useMemo(
    () => new Map(bindings.flatMap(b => b.keys.map(k => [k, b] as const))),
    [bindings]
  );
  const highlighted = new Set(
    view === 'edit'
      ? draft?.keys
      : view === 'assign'
        ? assignedKeys
        : hovered
          ? occupied.get(hovered)?.keys
          : assignedKeys
  );
  const decorations: Record<string, React.ReactNode> = {};
  for (const key of modelKeyIds) {
    if (!occupied.has(key)) {
      decorations[key] = (
        <span className="ak-preview-key">
          <span>{label(key)}</span>
          <span className={`ak-preview-plus ${keys.includes(key) ? 'is-remove' : ''}`}>
            {keys.includes(key) ? <X size={13} /> : <Plus size={13} />}
          </span>
        </span>
      );
    }
  }
  function assign(key: string) {
    if (busy) {
      return;
    }
    setError('');
    setNotice('');
    if (view === 'edit') {
      return;
    }
    const existing = occupied.get(key);
    if (view === 'overview' && existing) {
      if (existing.kind === 'UNKNOWN') {
        setError(tr('This firmware binding is preserved, but its editor is unavailable.'));
        return;
      }
      captureScrollPosition();
      setKind(existing.kind);
      setDraft(structuredClone(existing));
      setEditingId(existing.id);
      setKeys(existing.keys);
      setView('edit');
      return;
    }
    if (existing) {
      setError(
        tr('{key} already has an Advanced Key. Edit or remove that binding first.', {
          key: label(key)
        })
      );
      return;
    }
    if (view === 'overview') {
      setKeys(keys.includes(key) ? [] : [key]);
      return;
    }
    if (keys.includes(key)) {
      const index = keys.indexOf(key);
      setKeys(keys.map((k, i) => (i === index ? null : k)));
      setSlot(index);
      return;
    }
    const next = Array.from(
      {
        length: required
      },
      (_, i) => keys[i] ?? null
    );
    next[slot] = key;
    setKeys(next);
    const empty = next.indexOf(null);
    if (empty !== -1) {
      setSlot(empty);
    }
  }
  function begin(mode: AdvancedKind, preset?: string[]) {
    captureScrollPosition();
    setKind(mode);
    setEditingId(null);
    setError('');
    setDraft(null);
    const selected = (preset ?? assignedKeys)
      .filter(k => !occupied.has(k))
      .slice(0, mode === 'SOCD' ? 2 : 1);
    setKeys(selected);
    setSlot(selected.length < (mode === 'SOCD' ? 2 : 1) ? selected.length : 0);
    setNotice('');
    setView('assign');
  }
  function cancel() {
    captureScrollPosition();
    setView('overview');
    setDraft(null);
    setKeys([]);
    setError('');
    setEditingId(null);
    setRemoveOpen(false);
    setHovered(null);
  }
  function commit() {
    if (!draft) {
      return;
    }
    try {
      const next = [
        ...bindings.filter(b => b.id !== editingId),
        {
          ...draft,
          id: draft.keys[0],
          raw: undefined
        }
      ];
      validateAdvanced(next, model);
      setUndoBindings(null);
      onChange(next);
      cancel();
      setNotice(
        tr(
          editingId
            ? 'Binding updated in your profile draft. Save the profile to apply it to the keyboard.'
            : 'Binding added to your profile draft. Save the profile to apply it to the keyboard.'
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function removeBindingById(id: string) {
    if (busy) {
      return;
    }
    const target = bindings.find(b => b.id === id);
    if (!target || target.kind === 'UNKNOWN') {
      return;
    }
    setUndoBindings(bindings);
    onChange(bindings.filter(b => b.id !== id));
    cancel();
    setNotice(
      tr('Removed {keys} from your profile draft. Save the profile to apply it to the keyboard.', {
        keys: target.keys.map(label).join(' + ')
      })
    );
  }
  function clearAllBindings() {
    if (busy) {
      return;
    }
    const editableCount = bindings.filter(b => b.kind !== 'UNKNOWN').length;
    if (editableCount === 0) {
      return;
    }
    setUndoBindings(bindings);
    onChange(bindings.filter(b => b.kind === 'UNKNOWN'));
    cancel();
    setNotice(
      tr(
        'Cleared all Advanced Keys from your profile draft. Save the profile to apply it to the keyboard.'
      )
    );
  }
  function handleUndoDelete() {
    if (!undoBindings || busy) {
      return;
    }
    onChange(undoBindings);
    setUndoBindings(null);
    setError('');
    setNotice(tr('Restored deleted Advanced Keys to your profile draft.'));
  }
  function applyPreset(preset: AdvancedPreset, confirmed = false) {
    try {
      const next = applyAdvancedPreset(bindings, preset, model);
      validateAdvanced(next, model);
      if (!confirmed && presetConflicts(bindings, preset).length) {
        setPresetReview(preset);
        return;
      }
      setUndoBindings(null);
      onChange(next);
      setPresetReview(null);
      cancel();
      setNotice(
        tr(
          '{name} added to your profile draft. Use Save to profile above to apply it to the keyboard.',
          {
            name: tr(preset.title)
          }
        )
      );
    } catch (e) {
      setPresetReview(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') {
        return;
      }
      if (presetReview) {
        setPresetReview(null);
        return;
      }
      if (
        !removeOpen &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        cancel();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [removeOpen, presetReview]);
  const action = (index: number, title: string) =>
    draft && (
      <label className="ak-action-field">
        <span>{tr(title)}</span>
        <ActionPicker
          title={tr(title)}
          value={draft.actions[index]}
          onChange={v =>
            setDraft({
              ...draft,
              actions: draft.actions.map((a, i) => (i === index ? v : a))
            })
          }
        />
      </label>
    );
  return (
    <div
      ref={page}
      className="page advanced-keys-page page-enter"
      aria-busy={busy}
      data-model={model}
      data-has-save={onSave ? 'true' : undefined}
    >
      <section
        className={`keyboard-stage ak-keyboard-stage ${view === 'assign' ? 'is-assigning' : ''}`}
      >
        <Hero68Preview
          model={model}
          advancedBindings={bindings}
          selectedKeys={highlighted}
          onToggleKey={assign}
          lightingFrame={neutral}
          keyDecorations={decorations}
        />
      </section>
      {error && (
        <p className="ak-error" role="alert">
          {error}
        </p>
      )}

      {view === 'overview' ? (
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
                      key: label(assignedKeys[0])
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
                    onClick={() => begin(mode)}
                  >
                    <AdvancedKeyIcon kind={mode} />
                    <span>
                      <strong>{tr(INFO[mode].title)}</strong>
                      <span>{tr(INFO[mode].description)}</span>
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
                    onClick={clearAllBindings}
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
                      onMouseEnter={() => setHovered(b.keys[0])}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => assign(b.keys[0])}
                    >
                      <button
                        type="button"
                        className="ak-binding-main"
                        onFocus={() => setHovered(b.keys[0])}
                        onBlur={() => setHovered(null)}
                        onClick={e => {
                          e.stopPropagation();
                          assign(b.keys[0]);
                        }}
                      >
                        <AdvancedKeyIcon kind={b.kind} />
                        <span>
                          <strong>
                            {b.kind === 'UNKNOWN' ? tr('Firmware binding') : tr(INFO[b.kind].title)}
                          </strong>
                          <span>
                            {b.keys.map(k => (
                              <kbd key={k}>{label(k)}</kbd>
                            ))}
                          </span>
                          <small className="ak-binding-summary">
                            {bindingSummary(b, tr, isWin68)}
                          </small>
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
                              keys: b.keys.map(label).join(' + ')
                            })}
                            onClick={e => {
                              e.stopPropagation();
                              removeBindingById(b.id);
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
                            assign(b.keys[0]);
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
      ) : (
        <section className="ak-workbench">
          <header className="ak-workbench-head">
            <h2>{tr(info.title)}</h2>
            <FeatureHelp
              title={info.title}
              paragraphs={[
                info.description,
                kind === 'DKS'
                  ? 'The columns follow the press and release journey. Click a point to trigger once, or drag across points to hold the selected action.'
                  : 'Choose the physical key above and set its behavior below. Save the profile before testing it on your keyboard.'
              ]}
            />
            <div>
              {view === 'edit' && (
                <UndoRedoButtons
                  canUndo={draftHistory.canUndo}
                  canRedo={draftHistory.canRedo}
                  onUndo={draftHistory.undo}
                  onRedo={draftHistory.redo}
                  disabled={busy}
                />
              )}
              <button className="secondary-button" onClick={cancel}>
                {tr('Cancel')}
              </button>
              {view === 'edit' && editingId && (
                <button
                  className="secondary-button ak-delete"
                  onClick={() => removeBindingById(editingId)}
                >
                  <Trash2 size={15} />
                  {tr('Delete')}
                </button>
              )}
              <button
                className="apply-button"
                disabled={busy || (view === 'assign' && !ready)}
                onClick={() => {
                  if (view === 'assign') {
                    captureScrollPosition();
                    setDraft(newAdvanced(kind, assignedKeys, model));
                    setView('edit');
                  } else {
                    commit();
                  }
                }}
              >
                {tr(
                  view === 'assign'
                    ? 'Configure binding'
                    : editingId
                      ? 'Apply changes'
                      : 'Add binding'
                )}
              </button>
            </div>
          </header>
          <p className="ak-step-status">
            {view === 'assign'
              ? tr('Step 1 of 2 · {count} / {required} keys selected', {
                  count: assignedKeys.length,
                  required
                }) + (ready ? ' · ' + tr('Ready to configure') : '')
              : tr('Step 2 of 2 · Configure the behavior, then add it to your profile draft.')}
          </p>
          <div className="ak-workbench-body">
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
                    {Array.from(
                      {
                        length: required
                      },
                      (_, i) => (
                        <label key={i}>
                          <span>
                            {tr('Key')} {i + 1}
                          </span>
                          <button
                            className={`ak-assign-slot ${keys[i] ? 'is-filled' : ''} ${slot === i ? 'is-active' : ''}`}
                            aria-label={tr('Assign key {count}', {
                              count: i + 1
                            })}
                            onClick={() => setSlot(i)}
                          >
                            {keys[i] ? label(keys[i]) : tr('Assign')}
                          </button>
                        </label>
                      )
                    )}
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
                          assign(e.code);
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
                        <kbd key={k}>{label(k)}</kbd>
                      ))}
                      <span>{tr(info.title)}</span>
                    </div>
                    {kind === 'SOCD' ? (
                      <div className="ak-socd-options">
                        <h3>{tr('When both keys are pressed')}</h3>
                        {isWin68 ? (
                          XSYD_SOCD_OPTIONS.map(o => (
                            <label
                              key={o.value}
                              className={draft.mode === o.value ? 'is-active' : ''}
                            >
                              <input
                                type="radio"
                                name="socd"
                                checked={draft.mode === o.value}
                                onChange={() =>
                                  setDraft({
                                    ...draft,
                                    mode: o.value
                                  })
                                }
                              />
                              <span>
                                <strong>
                                  {tr(o.title)}
                                  {o.value === 1
                                    ? ` (${label(draft.keys[0])})`
                                    : o.value === 2
                                      ? ` (${label(draft.keys[1])})`
                                      : ''}
                                </strong>
                                <span>{tr(o.desc)}</span>
                              </span>
                            </label>
                          ))
                        ) : (
                          <>
                            {SOCD_OPTIONS.map(o => (
                              <label
                                key={o.value}
                                className={draft.mode === o.value ? 'is-active' : ''}
                              >
                                <input
                                  type="radio"
                                  name="socd"
                                  checked={draft.mode === o.value}
                                  onChange={() =>
                                    setDraft({
                                      ...draft,
                                      mode: o.value
                                    })
                                  }
                                />
                                <span>
                                  <strong>
                                    {tr(o.title)}
                                    {o.value === 3
                                      ? ` (${label(draft.keys[0])})`
                                      : o.value === 4
                                        ? ` (${label(draft.keys[1])})`
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
                      <DksGrid binding={draft} onChange={setDraft} isWin68={isWin68} />
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
                            {action(
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
                                setDraft({
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
                              {action(0, 'Hold action')}
                              {action(1, 'Tap action')}
                            </>
                          ) : (
                            action(0, kind === 'END' ? 'Action on release' : 'Toggle action')
                          )}
                        </div>
                        {['MT', 'TGL'].includes(kind) && (
                          <label className="ak-delay">
                            <span>
                              {tr(kind === 'MT' ? 'Hold duration' : 'Tap / hold duration')}
                            </span>
                            <div>
                              <input
                                type="number"
                                aria-label={tr('Tap hold delay')}
                                min={isWin68 ? '10' : '1'}
                                max={isWin68 ? '2550' : '65535'}
                                step={isWin68 ? '10' : '1'}
                                value={draft.delay}
                                onChange={e =>
                                  setDraft({
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
                              ? tr(
                                  'Release within {delay} ms to send {tap}. Hold longer to send {hold}.',
                                  {
                                    delay: draft.delay,
                                    tap: remapLabel(draft.actions[1]),
                                    hold: remapLabel(draft.actions[0])
                                  }
                                )
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
            <aside className="ak-side-panel">
              {view === 'assign' ? (
                <>
                  <h3>{tr(kind === 'SOCD' ? 'Suggested key pairs' : 'Ready-made bindings')}</h3>
                  {kind === 'SOCD' ? (
                    <>
                      {[
                        ['KeyA', 'KeyD'],
                        ['ArrowLeft', 'ArrowRight']
                      ].map(pair => (
                        <button
                          className="ak-preset"
                          key={pair[0]}
                          disabled={pair.some(k => occupied.has(k))}
                          onClick={() => {
                            setKeys(pair);
                            setSlot(1);
                          }}
                        >
                          <div>
                            {pair.map(k => (
                              <kbd key={k}>{label(k)}</kbd>
                            ))}
                          </div>
                          <strong>
                            {tr(
                              pair[0] === 'KeyA'
                                ? 'Instant direction switching'
                                : 'Left / right pair'
                            )}
                          </strong>
                          <span>{tr('Use this pair, then choose its priority behavior.')}</span>
                          <small className="ak-preset-cta">{tr('Select this pair')}</small>
                        </button>
                      ))}
                    </>
                  ) : ADVANCED_PRESETS.some(p => p.kind === kind) ? (
                    <>
                      {ADVANCED_PRESETS.filter(p => p.kind === kind).map(p => (
                        <button
                          key={p.id}
                          className="ak-preset"
                          disabled={busy}
                          onClick={() => applyPreset(p)}
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
          </div>
        </section>
      )}
      {presetReview && (
        <div className="ak-modal-backdrop" onClick={() => setPresetReview(null)}>
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
                    .map(label)
                    .join(', ')
                }
              )}
            </p>
            <p>{tr('Changes stay in your profile draft until you save.')}</p>
            <div>
              <button autoFocus className="secondary-button" onClick={() => setPresetReview(null)}>
                {tr('Cancel')}
              </button>
              <button className="apply-button" onClick={() => applyPreset(presetReview, true)}>
                {tr('Apply preset')}
              </button>
            </div>
          </section>
        </div>
      )}
      {removeOpen && (
        <div className="ak-modal-backdrop" onClick={() => setRemoveOpen(false)}>
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
                keys: draft?.keys.map(label).join(' + ') ?? ''
              })}
            </p>
            <div>
              <button autoFocus className="secondary-button" onClick={() => setRemoveOpen(false)}>
                {tr('Cancel')}
              </button>
              <button
                className="apply-button"
                onClick={() => {
                  if (editingId) {
                    removeBindingById(editingId);
                  }
                }}
              >
                {tr('Remove binding')}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
