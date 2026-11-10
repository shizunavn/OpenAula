import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  Edit3,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Undo2,
  Upload
} from 'lucide-react';
import type { ProfileSlot } from '../protocol/hero68/types';
import { useI18n } from '../i18n';
import {
  heroDeviceModel,
  isWin68HeMaxModel,
  type HeroDeviceModelId
} from '../keyboard/devices';
import { useBgService } from '../protocol/bgServiceClient';
import {
  createDefaultOnboardMetadata,
  type ProfileNamespace,
  type StoredProfileRecord,
  type WootPresetDefinition,
  type WootProfileMetadata
} from '../state/profileTypes';
import { CreateProfileWizard } from './profile/CreateProfileWizard';
import { DeleteProfileDialog } from './profile/DeleteProfileDialog';
import { ImportProfileModal } from './profile/ImportProfileModal';
import { ProfileCard, renderProfileAvatarIcon } from './profile/ProfileCard';
import { ProfileEditorModal } from './profile/ProfileEditorModal';

type Props = {
  model: HeroDeviceModelId;
  slot: ProfileSlot;
  names: Record<ProfileSlot, string>;
  connected: boolean;
  loaded: boolean;
  busy: boolean;
  pending: number;
  rapidKeys: number;
  remappedKeys: number;
  advancedKeys?: number;
  onSelect: (slot: ProfileSlot) => void;
  onRename: (name: string) => Promise<boolean>;
  onExport?: () => void;
  onRemap: () => void;
  onAdvanced?: () => void;
  onRefresh: () => void;
  onResetProfile?: () => () => void;
  onDiscardDraft?: () => void;
  // Wootility v5 + OpenMAD 3-Tier Profile Workspace props
  onboardMetadata?: Record<ProfileSlot, WootProfileMetadata>;
  linkedProfiles?: StoredProfileRecord[];
  inactiveProfiles?: StoredProfileRecord[];
  activeProfileUid?: string;
  autoProfileEnabled?: boolean;
  onToggleAutoProfile?: (enabled: boolean) => void;
  onSelectStoredProfile?: (record: StoredProfileRecord, namespace: 'linked' | 'inactive') => void;
  onUpdateProfileMetadata?: (updated: WootProfileMetadata) => void;
  onCreateNewProfile?: (
    namespace: ProfileNamespace,
    metadata: WootProfileMetadata,
    preset: WootPresetDefinition
  ) => void;
  onDuplicateProfile?: (meta: WootProfileMetadata) => void;
  onExportAnyProfile?: (meta: WootProfileMetadata) => void;
  onMoveToInactive?: (meta: WootProfileMetadata, sourceSlot?: ProfileSlot) => void;
  onMoveToOnboard?: (record: StoredProfileRecord, targetSlot?: ProfileSlot) => void;
  onSwapDefaultSlot?: (slot: ProfileSlot) => void;
  onDeleteStoredProfile?: (uid: string) => void;
  onImportProfileRecord?: (record: StoredProfileRecord) => void;
  onOpenBgServiceSettings?: () => void;
};

export default function MyProfilePage({
  model,
  slot,
  names,
  connected,
  loaded,
  busy,
  pending,
  rapidKeys,
  remappedKeys,
  advancedKeys = 0,
  onSelect,
  onRename,
  onExport,
  onRemap,
  onAdvanced,
  onRefresh,
  onResetProfile,
  onDiscardDraft,
  onboardMetadata,
  linkedProfiles = [],
  inactiveProfiles = [],
  activeProfileUid,
  autoProfileEnabled = true,
  onToggleAutoProfile,
  onSelectStoredProfile,
  onUpdateProfileMetadata,
  onCreateNewProfile,
  onDuplicateProfile,
  onExportAnyProfile,
  onMoveToInactive,
  onMoveToOnboard,
  onSwapDefaultSlot,
  onDeleteStoredProfile,
  onImportProfileRecord,
  onOpenBgServiceSettings
}: Props) {
  const { tr } = useI18n();
  const {
    hasBgService,
    isServiceOutdated,
    serviceVersion,
    requiredServiceVersion,
    autoProfile
  } = useBgService();
  const device = heroDeviceModel(model);
  const onboardSlots = useMemo<readonly ProfileSlot[]>(
    () => (isWin68HeMaxModel(model) ? ([0, 1, 2, 3] as const) : ([0, 1, 2] as const)),
    [model]
  );

  const [name, setName] = useState(names[slot] ?? `Onboard Profile ${slot}`);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [undoReset, setUndoReset] = useState<(() => void) | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingModalMeta, setEditingModalMeta] = useState<WootProfileMetadata | null>(null);
  const [createWizardOpen, setCreateWizardOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState<WootProfileMetadata | null>(null);

  // Drag-and-drop state (bee L63250-L63447 in wootility.readable.js)
  const [dragSourceUid, setDragSourceUid] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [ctrlPressedDuringDrag, setCtrlPressedDuringDrag] = useState(false);

  useEffect(() => {
    setName(names[slot] ?? `Onboard Profile ${slot}`);
    setEditing(false);
    setError('');
    setNotice('');
    setUndoReset(null);
  }, [slot, names]);

  // Listen to Ctrl key while dragging to show "Hold Ctrl to copy profile" / "Release to copy profile" toast (L63400-L63434)
  useEffect(() => {
    if (!dragSourceUid) {
      setCtrlPressedDuringDrag(false);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.ctrlKey) {
        setCtrlPressedDuringDrag(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || !e.ctrlKey) {
        setCtrlPressedDuringDrag(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [dragSourceUid]);

  const resolvedOnboard = useMemo<Record<ProfileSlot, WootProfileMetadata>>(
    () => ({
      0:
        onboardMetadata?.[0] ??
        createDefaultOnboardMetadata(0, names[0] || 'Onboard Profile 0', model),
      1:
        onboardMetadata?.[1] ??
        createDefaultOnboardMetadata(1, names[1] || 'Onboard Profile 1', model),
      2:
        onboardMetadata?.[2] ??
        createDefaultOnboardMetadata(2, names[2] || 'Onboard Profile 2', model),
      3:
        onboardMetadata?.[3] ??
        createDefaultOnboardMetadata(3, names[3] || 'Onboard Profile 3', model)
    }),
    [model, names, onboardMetadata]
  );

  const allProfiles = useMemo<StoredProfileRecord[]>(() => {
    const onboardRecs: StoredProfileRecord[] = onboardSlots.map(s => ({
      metadata: resolvedOnboard[s],
      draft: {}
    }));
    return [...onboardRecs, ...linkedProfiles, ...inactiveProfiles];
  }, [inactiveProfiles, linkedProfiles, onboardSlots, resolvedOnboard]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  async function rename() {
    if (!name.trim()) {
      setError(tr('Enter a profile name.'));
      return;
    }
    if (new TextEncoder().encode(name.trim()).length > 55) {
      setError(tr('Use a name of at most 55 UTF-8 bytes.'));
      return;
    }
    setError('');
    if (await onRename(name.trim())) {
      setEditing(false);
    }
  }

  function handleResetProfile() {
    if (!onResetProfile || busy) {
      return;
    }
    const restore = onResetProfile();
    setUndoReset(() => restore);
    setNotice(
      tr(
        'Profile draft reset to factory defaults. Click Save to profile above to apply to the keyboard.'
      )
    );
  }

  function handleUndoReset() {
    if (!undoReset || busy) {
      return;
    }
    undoReset();
    setUndoReset(null);
    setNotice(tr('Restored previous profile draft settings.'));
  }

  function handleDiscardDraft() {
    if (!onDiscardDraft || busy) {
      return;
    }
    onDiscardDraft();
    setUndoReset(null);
    setNotice(tr('Discarded unsaved draft changes.'));
  }

  function handleDropOnOnboardSlot(targetSlot: ProfileSlot, copyMode: boolean) {
    if (!dragSourceUid) return;
    if (dragSourceUid.startsWith('onboard-')) {
      const sourceSlot = Number(dragSourceUid.replace('onboard-', '')) as ProfileSlot;
      if (sourceSlot !== targetSlot && targetSlot === 0) {
        onSwapDefaultSlot?.(sourceSlot);
      }
    } else {
      const rec = [...linkedProfiles, ...inactiveProfiles].find(
        p => p.metadata.uid === dragSourceUid
      );
      if (rec) {
        if (copyMode) {
          onDuplicateProfile?.(rec.metadata);
        } else {
          onMoveToOnboard?.(rec, targetSlot);
        }
      }
    }
    setDragSourceUid(null);
    setDropTargetKey(null);
  }

  function handleDropOnInactive(copyMode: boolean) {
    if (!dragSourceUid) return;
    if (dragSourceUid.startsWith('onboard-')) {
      const sourceSlot = Number(dragSourceUid.replace('onboard-', '')) as ProfileSlot;
      const meta = resolvedOnboard[sourceSlot];
      if (copyMode) {
        onDuplicateProfile?.(meta);
      } else {
        onMoveToInactive?.(meta, sourceSlot);
      }
    } else {
      const rec = linkedProfiles.find(p => p.metadata.uid === dragSourceUid);
      if (rec) {
        if (copyMode) {
          onDuplicateProfile?.(rec.metadata);
        } else {
          onMoveToInactive?.(rec.metadata);
        }
      }
    }
    setDragSourceUid(null);
    setDropTargetKey(null);
  }

  const activeOnboardMeta = resolvedOnboard[slot] ?? resolvedOnboard[0];

  return (
    <div className="page my-profile-page page-enter">
      <div
        className="profile-page-heading"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <div>
          <h1>{tr('My Profiles')}</h1>
          <p>{tr('Your keyboard settings, together in one profile.')}</p>
        </div>

        {/* Wootility v5 Header Bar: Search + Import + New Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="woot-search-box" style={{ minWidth: 210 }}>
            <Search size={15} />
            <input
              type="search"
              placeholder={tr('Search...')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setImportModalOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Upload size={15} />
            {tr('Import')}
          </button>
          <button
            type="button"
            className="apply-button"
            onClick={() => setCreateWizardOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={15} />
            {tr('New Profile')}
          </button>
        </div>
      </div>

      {/* OpenMAD v1.8.0 Zero-Flash-Wear Auto-Profile Telemetry & Alert Banner */}
      <section
        className="settings-card"
        style={{
          padding: '14px 18px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          border: hasBgService
            ? '1px solid rgba(74, 222, 128, 0.25)'
            : '1px solid rgba(250, 204, 21, 0.32)',
          background: 'rgba(24, 26, 27, 0.88)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {hasBgService ? (
            <ShieldCheck size={22} color="#4ade80" />
          ) : (
            <AlertTriangle size={22} color="#facc15" />
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14 }}>
                {tr('Auto-Profile Switching (Zero Flash Wear)')}
              </strong>
              <span
                className="woot-shortcut-pill"
                style={{
                  color: hasBgService ? '#4ade80' : '#facc15',
                  borderColor: hasBgService
                    ? 'rgba(74, 222, 128, 0.35)'
                    : 'rgba(250, 204, 21, 0.35)'
                }}
              >
                {hasBgService
                  ? `Service v${serviceVersion || requiredServiceVersion} READY`
                  : isServiceOutdated
                    ? `Update Required: v${serviceVersion} → v${requiredServiceVersion}`
                    : `Requires Service v${requiredServiceVersion}+`}
              </span>
            </div>
            <small style={{ color: 'var(--woot-text-subtle)', fontSize: 12 }}>
              {hasBgService
                ? tr(
                    'Active window: {app} · Switches: {switches} · Flash writes saved: {saved}',
                    {
                      app: autoProfile.activeApp?.exe || tr('Desktop'),
                      switches: autoProfile.switchCount,
                      saved: autoProfile.flashWritesSaved
                    }
                  )
                : isServiceOutdated
                  ? `${tr('Detected service')} v${serviceVersion} — ${tr('update to')} v${requiredServiceVersion} ${tr('for Auto-Profile & Zero-Flash-Wear.')}`
                  : tr(
                      "Your linked profiles won't switch automatically until Background Service v1.8.0 is connected."
                    )}
            </small>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {!hasBgService && onOpenBgServiceSettings && (
            <button
              type="button"
              className="secondary-button"
              onClick={onOpenBgServiceSettings}
              style={{
                fontSize: 12.5,
                borderColor: 'rgba(250, 204, 21, 0.4)',
                color: '#fef08a'
              }}
            >
              {tr('Go to Background Service')} (v{requiredServiceVersion})
            </button>
          )}
          {onToggleAutoProfile && (
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={autoProfileEnabled}
                onChange={e => onToggleAutoProfile(e.target.checked)}
              />
              {autoProfileEnabled ? tr('Auto-Switch Enabled') : tr('Paused')}
            </label>
          )}
          <button
            type="button"
            className="secondary-button"
            onClick={() => setEditingModalMeta(activeOnboardMeta)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
          >
            <Edit3 size={14} />
            {tr('Edit Profile')}
          </button>
        </div>
      </section>

      <article className="profile-detail settings-card">
        <div
          className={`profile-detail-icon profile-accent-${slot}`}
          style={{
            backgroundColor: '#181a1b',
            border: `3px solid ${activeOnboardMeta.color || '#ffd45c'}`,
            borderRadius: '50%',
            padding: 3,
            overflow: 'hidden',
            cursor: 'pointer'
          }}
          title={tr('Edit Profile')}
          onClick={() => setEditingModalMeta(activeOnboardMeta)}
        >
          {renderProfileAvatarIcon(activeOnboardMeta.icon, 36)}
        </div>
        <div className="profile-detail-copy">
          <span className="profile-eyebrow">
            {tr('Onboard profile {slot}', {
              slot
            })}{' '}
            · Fn + P{slot + 1}
          </span>
          <h2>{names[slot] ?? activeOnboardMeta.name}</h2>
          <p>
            {connected && loaded
              ? tr('Loaded from your {device}', {
                  device: device.name
                })
              : connected
                ? tr('Read this profile before saving changes.')
                : tr('Local preview · connect your {device} to sync.', {
                    device: device.name
                  })}
          </p>
        </div>
        <span className={`profile-status ${loaded && connected ? 'is-ready' : ''}`}>
          {busy
            ? tr('Syncing…')
            : pending
              ? tr(pending === 1 ? '{count} pending change' : '{count} pending changes', {
                  count: pending
                })
              : connected && loaded
                ? tr('Synced')
                : tr('Local preview')}
        </span>
        <div className="profile-name-field">
          <label htmlFor="onboard-profile-name">{tr('Profile name')}</label>
          <div className="profile-name-input">
            <input
              id="onboard-profile-name"
              value={name}
              readOnly={!editing}
              disabled={busy}
              onChange={event => setName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && editing) {
                  void rename();
                }
                if (event.key === 'Escape') {
                  setName(names[slot] ?? activeOnboardMeta.name);
                  setEditing(false);
                  setError('');
                }
              }}
            />
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => (editing ? void rename() : setEditing(true))}
            >
              {editing ? <Check size={15} /> : <Pencil size={15} />}
              {editing ? tr('Save name') : tr('Rename')}
            </button>
            {editing && (
              <button
                className="ghost-button"
                onClick={() => {
                  setName(names[slot] ?? activeOnboardMeta.name);
                  setEditing(false);
                  setError('');
                }}
              >
                {tr('Cancel')}
              </button>
            )}
          </div>
          {error && (
            <p className="profile-field-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <div className="profile-notice-row" role="status" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12.5, color: 'var(--woot-text-primary)' }}>{notice}</span>
              {undoReset && (
                <button type="button" className="ghost-button" onClick={handleUndoReset}>
                  <Undo2 size={14} /> {tr('Undo')}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="profile-summary">
          <div>
            <strong>{device.capabilities.keyCount}</strong>
            <span>{tr('Keys')}</span>
          </div>
          <div>
            <strong>{rapidKeys}</strong>
            <span>{tr('Rapid Trigger enabled')}</span>
          </div>
          <div>
            <strong>{remappedKeys}</strong>
            <span>{tr('Remapped functions')}</span>
          </div>
          <div>
            <strong>{advancedKeys}</strong>
            <span>{tr('Advanced Keys')}</span>
          </div>
          <div>
            <strong>3</strong>
            <span>{tr('Keyboard layers')}</span>
          </div>
        </div>
        <div className="profile-detail-actions">
          <div className="profile-detail-actions-group">
            <button className="secondary-button" disabled={busy} onClick={onRemap}>
              {tr('Edit key mappings')}
              <ArrowRight size={15} />
            </button>
            {onAdvanced && (
              <button className="secondary-button" disabled={busy} onClick={onAdvanced}>
                {tr('Advanced Keys')}
                <ArrowRight size={15} />
              </button>
            )}
            {onExport && (
              <button className="ghost-button" disabled={busy} onClick={onExport}>
                <Download size={15} />
                {tr('Export profile')}
              </button>
            )}
          </div>
          <div className="profile-detail-actions-group">
            {onDiscardDraft && pending > 0 && (
              <button className="ghost-button" disabled={busy} onClick={handleDiscardDraft}>
                <Undo2 size={15} />
                {tr('Discard draft changes')}
              </button>
            )}
            {onResetProfile && (
              <button
                className="secondary-button profile-reset-button"
                disabled={busy}
                onClick={handleResetProfile}
              >
                <RotateCcw size={15} />
                {tr('Reset to default')}
              </button>
            )}
            <button className="ghost-button" disabled={!connected || busy} onClick={onRefresh}>
              {tr('Refresh from keyboard')}
            </button>
          </div>
        </div>
      </article>

      {/* Section 1: ONBOARD PROFILES (3 slots on HERO68/84, 4 slots on WIN 68 HE MAX) */}
      <div className="profile-section-heading">
        <h2>{tr('ONBOARD PROFILES')}</h2>
        <span>
          {onboardSlots.length === 4
            ? tr('4 slots on your {device}', { device: device.name })
            : tr('3 slots on your {device}', { device: device.name })}
        </span>
      </div>
      <section className="onboard-profile-grid" aria-label={tr('Onboard Profiles')}>
        {onboardSlots
          .filter(
            id =>
              !normalizedSearch ||
              resolvedOnboard[id].name.toLowerCase().includes(normalizedSearch)
          )
          .map(id => {
            const meta = resolvedOnboard[id];
            return (
              <ProfileCard
                key={meta.uid}
                profile={meta}
                onboardIndex={id}
                isSelected={id === slot && (!activeProfileUid || activeProfileUid === meta.uid)}
                isDragSource={dragSourceUid === meta.uid}
                isDropTarget={dropTargetKey === `onboard-${id}`}
                draggable={!busy}
                shortcutKeys={['Fn', `P${id + 1}`]}
                onSelect={() => onSelect(id)}
                onEdit={() => setEditingModalMeta(meta)}
                onDuplicate={() => onDuplicateProfile?.(meta)}
                onExport={() => (onExportAnyProfile ? onExportAnyProfile(meta) : onExport?.())}
                onMoveToInactive={() => onMoveToInactive?.(meta, id)}
                onLinkToApp={() => setEditingModalMeta(meta)}
                onSetAsDefault={id !== 0 ? () => onSwapDefaultSlot?.(id) : undefined}
                onDragStart={() => setDragSourceUid(meta.uid)}
                onDragOver={e => {
                  e.preventDefault();
                  setDropTargetKey(`onboard-${id}`);
                }}
                onDragLeave={() => setDropTargetKey(null)}
                onDrop={e => {
                  e.preventDefault();
                  handleDropOnOnboardSlot(id, e.ctrlKey || ctrlPressedDuringDrag);
                }}
                onDragEnd={() => {
                  setDragSourceUid(null);
                  setDropTargetKey(null);
                }}
              />
            );
          })}
      </section>

      {/* Section 2: LINKED WITH AN APPLICATION */}
      <div className="profile-section-heading" style={{ marginTop: 22 }}>
        <h2>{tr('LINKED WITH AN APPLICATION')}</h2>
        <span>{tr('{count} / 10 slots', { count: linkedProfiles.length })}</span>
      </div>
      <section
        className="onboard-profile-grid"
        aria-label={tr('LINKED WITH AN APPLICATION')}
        style={{ marginBottom: 16 }}
      >
        {linkedProfiles
          .filter(
            rec =>
              !normalizedSearch ||
              rec.metadata.name.toLowerCase().includes(normalizedSearch) ||
              rec.metadata.linkedApps.some(a => a.name.toLowerCase().includes(normalizedSearch))
          )
          .map(rec => (
            <ProfileCard
              key={rec.metadata.uid}
              profile={rec.metadata}
              isSelected={activeProfileUid === rec.metadata.uid}
              isDragSource={dragSourceUid === rec.metadata.uid}
              draggable={!busy}
              onSelect={() => onSelectStoredProfile?.(rec, 'linked')}
              onEdit={() => setEditingModalMeta(rec.metadata)}
              onDuplicate={() => onDuplicateProfile?.(rec.metadata)}
              onExport={() => onExportAnyProfile?.(rec.metadata)}
              onMoveToInactive={() => onMoveToInactive?.(rec.metadata)}
              onMoveToOnboard={() => onMoveToOnboard?.(rec, slot)}
              onUnlinkProfile={() =>
                onUpdateProfileMetadata?.({ ...rec.metadata, linkedApps: [] })
              }
              onDelete={() => setDeletingProfile(rec.metadata)}
              onDragStart={() => setDragSourceUid(rec.metadata.uid)}
              onDragEnd={() => {
                setDragSourceUid(null);
                setDropTargetKey(null);
              }}
            />
          ))}
        <button
          type="button"
          className="woot-dashed-link-btn"
          style={{ minHeight: 62 }}
          onClick={() => setCreateWizardOpen(true)}
        >
          <Plus size={16} />
          {tr('New Profile')} ({tr('Linked Applications')})
        </button>
      </section>

      {/* Section 3: INACTIVE PROFILES */}
      <div className="profile-section-heading" style={{ marginTop: 22 }}>
        <h2>{tr('INACTIVE PROFILES')}</h2>
        <span>{tr('{count} / 25 stored locally', { count: inactiveProfiles.length })}</span>
      </div>
      <section
        className="onboard-profile-grid"
        aria-label={tr('INACTIVE PROFILES')}
        onDragOver={e => {
          e.preventDefault();
          setDropTargetKey('inactive-zone');
        }}
        onDragLeave={() => setDropTargetKey(null)}
        onDrop={e => {
          e.preventDefault();
          handleDropOnInactive(e.ctrlKey || ctrlPressedDuringDrag);
        }}
      >
        {inactiveProfiles
          .filter(
            rec => !normalizedSearch || rec.metadata.name.toLowerCase().includes(normalizedSearch)
          )
          .map(rec => (
            <ProfileCard
              key={rec.metadata.uid}
              profile={rec.metadata}
              isSelected={activeProfileUid === rec.metadata.uid}
              isDragSource={dragSourceUid === rec.metadata.uid}
              isDropTarget={dropTargetKey === 'inactive-zone'}
              draggable={!busy}
              onSelect={() => onSelectStoredProfile?.(rec, 'inactive')}
              onEdit={() => setEditingModalMeta(rec.metadata)}
              onDuplicate={() => onDuplicateProfile?.(rec.metadata)}
              onExport={() => onExportAnyProfile?.(rec.metadata)}
              onMoveToOnboard={() => onMoveToOnboard?.(rec, slot)}
              onLinkToApp={() => setEditingModalMeta(rec.metadata)}
              onDelete={() => setDeletingProfile(rec.metadata)}
              onDragStart={() => setDragSourceUid(rec.metadata.uid)}
              onDragEnd={() => {
                setDragSourceUid(null);
                setDropTargetKey(null);
              }}
            />
          ))}
      </section>

      {/* Drag Hint Toast at bottom of screen (L63400-L63434) */}
      {dragSourceUid && (
        <div className="woot-drag-hint-toast" role="status">
          {ctrlPressedDuringDrag
            ? tr('Release to copy profile')
            : tr('Hold Ctrl to copy profile')}
        </div>
      )}

      {editingModalMeta && (
        <ProfileEditorModal
          profile={editingModalMeta}
          maxOnboardSlots={onboardSlots.length as 3 | 4}
          allProfiles={allProfiles}
          onClose={() => setEditingModalMeta(null)}
          onSave={updated => onUpdateProfileMetadata?.(updated)}
          onOpenBgServiceSettings={onOpenBgServiceSettings}
        />
      )}

      {createWizardOpen && (
        <CreateProfileWizard
          deviceModel={model}
          usedOnboardSlots={onboardSlots.length}
          totalOnboardSlots={onboardSlots.length}
          usedLinkedSlots={linkedProfiles.length}
          usedInactiveSlots={inactiveProfiles.length}
          allProfiles={allProfiles}
          onClose={() => setCreateWizardOpen(false)}
          onCreate={(ns, meta, preset) => onCreateNewProfile?.(ns, meta, preset)}
          onOpenBgServiceSettings={onOpenBgServiceSettings}
        />
      )}

      {importModalOpen && (
        <ImportProfileModal
          currentDeviceModel={model}
          onClose={() => setImportModalOpen(false)}
          onImport={rec => onImportProfileRecord?.(rec)}
        />
      )}

      {deletingProfile && (
        <DeleteProfileDialog
          profileName={deletingProfile.name}
          onCancel={() => setDeletingProfile(null)}
          onConfirm={() => onDeleteStoredProfile?.(deletingProfile.uid)}
        />
      )}
    </div>
  );
}
