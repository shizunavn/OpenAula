import { useEffect, useState } from 'react';
import { Keyboard, Pencil, Check, ArrowRight, Download, RotateCcw, Undo2 } from 'lucide-react';
import type { ProfileSlot } from '../protocol/hero68/types';
import { useI18n } from '../i18n';
import { heroDeviceModel, type HeroDeviceModelId } from '../keyboard/devices';

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
  onDiscardDraft
}: Props) {
  const { tr } = useI18n();
  const device = heroDeviceModel(model);
  const [name, setName] = useState(names[slot]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [undoReset, setUndoReset] = useState<(() => void) | null>(null);

  useEffect(() => {
    setName(names[slot]);
    setEditing(false);
    setError('');
    setNotice('');
    setUndoReset(null);
  }, [slot, names]);

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

  return (
    <div className="page my-profile-page page-enter">
      <div className="profile-page-heading">
        <div>
          <h1>{tr('My Profile')}</h1>
          <p>{tr('Your keyboard settings, together in one profile.')}</p>
        </div>
      </div>

      <article className="profile-detail settings-card">
        <div className={`profile-detail-icon profile-accent-${slot}`}>
          <Keyboard size={32} />
        </div>
        <div className="profile-detail-copy">
          <span className="profile-eyebrow">
            {tr('Onboard profile {slot}', {
              slot
            })}
          </span>
          <h2>{names[slot]}</h2>
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
                  setName(names[slot]);
                  setEditing(false);
                  setError('');
                }
              }}
            />
            <button
              className="secondary-button"
              disabled={!connected || !loaded || busy}
              onClick={() => (editing ? void rename() : setEditing(true))}
            >
              {editing ? <Check size={15} /> : <Pencil size={15} />}
              {editing ? tr('Save name') : tr('Rename')}
            </button>
            {editing && (
              <button
                className="ghost-button"
                onClick={() => {
                  setName(names[slot]);
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
      <div className="profile-section-heading">
        <h2>{tr('Onboard Profiles')}</h2>
        <span>
          {tr('3 slots on your {device}', {
            device: device.name
          })}
        </span>
      </div>
      <section className="onboard-profile-grid" aria-label={tr('Onboard Profiles')}>
        {([0, 1, 2] as const).map(id => (
          <button
            key={id}
            disabled={busy}
            className={`onboard-profile-card ${id === slot ? 'is-active' : ''}`}
            onClick={() => onSelect(id)}
            aria-pressed={id === slot}
          >
            <span className={`onboard-profile-icon profile-accent-${id}`}>
              <Keyboard size={23} />
            </span>
            <span className="onboard-profile-copy">
              <small>
                {tr('Onboard profile {slot}', {
                  slot: id
                })}
              </small>
              <strong>{names[id]}</strong>
            </span>
            <span className="onboard-profile-action">
              {id === slot ? (
                <>
                  <Check size={14} />
                  {tr('Current')}
                </>
              ) : (
                <ArrowRight size={17} />
              )}
            </span>
          </button>
        ))}
      </section>
    </div>
  );
}
