import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import Hero68Preview from './Hero68Preview';
import FeatureHelp from './FeatureHelp';
import { useI18n } from '../i18n';
import { heroLayout } from '../keyboard/layout';
import { getBoard, resolveEffectiveTravelLimits } from '../keyboard/registry';
import { DeviceModelContext, type HeroDeviceModelId } from '../app/DeviceModelContext';
import {
  ADVANCED_LIMIT,
  newAdvanced,
  validateAdvanced,
  type AdvancedBinding,
  type AdvancedKind
} from '../protocol/hero68/advanced';
import {
  applyAdvancedPreset,
  presetConflicts,
  type AdvancedPreset
} from '../protocol/hero68/advancedPresets';
import { UndoRedoButtons, useUndoRedoState } from '../app/components/UndoRedoButtons';
import './AdvancedKeysPage.css';
import { dksVisualTrackState, DKS_PALETTE_CATEGORIES } from './advanced-keys/DksGrid';
import { DksUnsupportedModal } from './advanced-keys/DksUnsupportedModal';
import {
  ADVANCED_KIND_INFO as INFO,
  keyLabel as label,
  XSYD_SOCD_OPTIONS
} from './advanced-keys/advancedKeysMeta';
import { AdvancedKeysOverview } from './advanced-keys/AdvancedKeysOverview';
import { AdvancedKeyEditorPanel } from './advanced-keys/AdvancedKeyEditorPanel';
import { AdvancedKeySidePanel } from './advanced-keys/AdvancedKeySidePanel';
import { AdvancedKeyModals } from './advanced-keys/AdvancedKeyModals';
export { dksVisualTrackState, DksUnsupportedModal, DKS_PALETTE_CATEGORIES, XSYD_SOCD_OPTIONS };
/**
 * Advanced key binding modes supported by HERO68/HERO84 and WIN 68 HE MAX firmware (up to ADVANCED_LIMIT bindings per profile):
 * - SOCD: Pairs exactly 2 physical keys and resolves simultaneous opposite cardinal directions (Last/Key1/Key2/Neutral).
 * - DKS (Dynamic Keystroke): Binds 1 physical key to up to 4 actions across 4 travel phases (down shallow, down deep, up deep, up shallow).
 * - MT (Mod-Tap): Sends a tap action if released within the tap/hold threshold (ms), or holds a secondary modifier action.
 * - TGL (Toggle): Latches an action on/off on quick tap while preserving normal momentary behavior on hold.
 * - MPT (Multi-Point Trigger): Triggers up to 3 distinct actions at 3 ascending actuation depths on a single key.
 * - END (Release Action): Preserves the primary press action and fires an additional keycode upon release.
 */
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
        <AdvancedKeysOverview
          bindings={bindings}
          assignedKeys={assignedKeys}
          busy={busy}
          pending={pending}
          connected={connected}
          isWin68={isWin68}
          onBeginMode={begin}
          onSelectKey={assign}
          onHoverKey={setHovered}
          onRemoveBinding={removeBindingById}
          onClearAll={clearAllBindings}
        />
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
            <AdvancedKeyEditorPanel
              view={view}
              kind={kind}
              required={required}
              keys={keys}
              slot={slot}
              modelKeyIds={modelKeyIds}
              draft={draft}
              isWin68={isWin68}
              onSelectSlot={setSlot}
              onAssignKey={assign}
              onDraftChange={setDraft}
            />
            <AdvancedKeySidePanel
              view={view}
              kind={kind}
              occupied={occupied}
              busy={busy}
              editingId={editingId}
              connected={connected}
              onSelectSocdPair={pair => {
                setKeys([...pair]);
                setSlot(1);
              }}
              onApplyPreset={p => applyPreset(p)}
            />
          </div>
        </section>
      )}
      <AdvancedKeyModals
        bindings={bindings}
        presetReview={presetReview}
        removeOpen={removeOpen}
        draft={draft}
        onClosePresetReview={() => setPresetReview(null)}
        onConfirmPreset={preset => applyPreset(preset, true)}
        onCloseRemove={() => setRemoveOpen(false)}
        onConfirmRemove={() => {
          if (editingId) {
            removeBindingById(editingId);
          }
        }}
      />
    </div>
  );
}
