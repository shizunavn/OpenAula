import { useState, type CSSProperties } from 'react';
import { Check, Palette, ShieldCheck, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import { isWin68HeMaxModel } from '../../keyboard/devices';
import type { ProfileSlot } from '../../protocol/hero68/types';
import {
  MAX_PROFILE_NAME_BYTES,
  resolveWootProfileIconUrl,
  utf8ByteLength,
  WOOT_ICON_CATEGORIES,
  WOOT_PROFILE_COLORS,
  type LinkedAppRule,
  type StoredProfileRecord,
  type WootIconCategory,
  type WootProfileMetadata
} from '../../state/profileTypes';
import { LinkedAppsList } from './LinkedAppsList';
import { renderProfileAvatarIcon } from './ProfileCard';

export interface ProfileEditorModalProps {
  profile: WootProfileMetadata;
  maxOnboardSlots?: 3 | 4;
  allProfiles?: StoredProfileRecord[];
  onClose: () => void;
  onSave: (updated: WootProfileMetadata) => void;
  onOpenBgServiceSettings?: () => void;
}

export function ProfileEditorModal({
  profile,
  maxOnboardSlots,
  allProfiles = [],
  onClose,
  onSave,
  onOpenBgServiceSettings
}: ProfileEditorModalProps) {
  const { tr } = useI18n();
  const [name, setName] = useState(profile.name);
  const [color, setColor] = useState(profile.color || '#ffd45c');
  const [icon, setIcon] = useState(profile.icon || 'woot:p:black');
  const [iconCategory, setIconCategory] = useState<WootIconCategory>(() => {
    for (const cat of WOOT_ICON_CATEGORIES) {
      if (cat.icons.includes(profile.icon)) {
        return cat.id;
      }
    }
    return 'switchyUwu';
  });
  const [executionMode, setExecutionMode] = useState<'slot-switch' | 'ram-stream'>(
    profile.executionMode ?? 'slot-switch'
  );
  const [mappedOnboardSlot, setMappedOnboardSlot] = useState<ProfileSlot | 3>(
    profile.mappedOnboardSlot ?? 1
  );
  const [linkedApps, setLinkedApps] = useState<LinkedAppRule[]>(profile.linkedApps ?? []);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedMaxSlots: 3 | 4 =
    maxOnboardSlots ?? (isWin68HeMaxModel(profile.createdFor) ? 4 : 3);
  const slotOptions: readonly ProfileSlot[] =
    resolvedMaxSlots === 4 ? ([0, 1, 2, 3] as const) : ([0, 1, 2] as const);

  const nameBytes = utf8ByteLength(name.trim());
  const activeCategoryIcons =
    WOOT_ICON_CATEGORIES.find(c => c.id === iconCategory)?.icons ??
    WOOT_ICON_CATEGORIES[0].icons;

  function handleSave() {
    if (!name.trim()) {
      setError(tr('Enter a profile name.'));
      return;
    }
    if (nameBytes > MAX_PROFILE_NAME_BYTES) {
      setError(tr('Use a name of at most 55 UTF-8 bytes.'));
      return;
    }
    onSave({
      ...profile,
      name: name.trim(),
      color,
      icon,
      executionMode,
      mappedOnboardSlot,
      linkedApps,
      updatedAt: Date.now()
    });
    onClose();
  }

  return (
    <div className="woot-modal-backdrop" onClick={onClose}>
      <div
        className="woot-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={tr('Edit Profile')}
        onClick={e => e.stopPropagation()}
      >
        {/* Top 64px horizontal color bar with hover "Change Colour" (aw, L92560-L92602) */}
        <div
          className="woot-editor-color-banner"
          style={{ backgroundColor: color }}
          onClick={() => setShowColorPicker(prev => !prev)}
        >
          <div className="woot-editor-color-banner-overlay">
            <Palette size={16} />
            <span>{tr('Change Colour')}</span>
          </div>
          <button
            type="button"
            className="icon-button compact"
            aria-label="Close"
            onClick={e => {
              e.stopPropagation();
              onClose();
            }}
            style={{
              position: 'absolute',
              right: 12,
              top: 12,
              background: 'rgba(17,18,19,0.55)',
              color: '#fff'
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="woot-editor-body">
          {showColorPicker && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 8,
                background: 'var(--woot-elevation-surface)',
                border: '1px solid var(--woot-border-default)'
              }}
            >
              <div className="woot-color-swatches">
                {WOOT_PROFILE_COLORS.map(swatch => (
                  <button
                    key={swatch}
                    type="button"
                    className={`woot-color-swatch ${color.toLowerCase() === swatch.toLowerCase() ? 'is-active' : ''}`}
                    style={{ backgroundColor: swatch }}
                    onClick={() => setColor(swatch)}
                    aria-label={`Color ${swatch}`}
                  />
                ))}
              </div>
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{ width: 34, height: 28, border: 0, background: 'transparent', cursor: 'pointer' }}
              />
            </div>
          )}

          {/* Avatar + Profile Name Input (max 55 UTF-8 bytes, Ss L92630) */}
          <div className="woot-editor-top-row">
            <div
              className="woot-profile-avatar"
              style={
                {
                  width: 48,
                  height: 48,
                  flex: '0 0 48px',
                  '--profile-color': color,
                  borderColor: color
                } as CSSProperties
              }
            >
              {renderProfileAvatarIcon(icon, 24)}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ fontSize: 12, color: 'var(--woot-text-subtle)' }}>
                  {tr('Profile name')}
                </label>
                <small
                  style={{
                    fontSize: 11,
                    color:
                      nameBytes > MAX_PROFILE_NAME_BYTES
                        ? 'var(--woot-danger-bg)'
                        : 'var(--woot-text-subtlest)'
                  }}
                >
                  {nameBytes} / {MAX_PROFILE_NAME_BYTES} bytes
                </small>
              </div>
              <input
                type="text"
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  setError(null);
                }}
                style={{
                  width: '100%',
                  height: 40,
                  padding: '0 12px',
                  borderRadius: 8,
                  border: '1px solid var(--woot-border-default)',
                  background: 'var(--woot-elevation-sunken)',
                  color: 'var(--woot-text-strong)',
                  fontSize: 14,
                  fontWeight: 700
                }}
              />
            </div>
          </div>

          {error && (
            <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--woot-danger-bg)' }}>
              {error}
            </p>
          )}

          {/* Authentic Wootility v5 Visual Icon Picker (89 SVG Icons across 3 categories) */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6
              }}
            >
              <label style={{ fontSize: 12, color: 'var(--woot-text-subtle)' }}>
                {tr('Profile Icon')} (Wootility Assets)
              </label>
              <div className="woot-icon-picker-tabs" style={{ marginBottom: 0 }}>
                {WOOT_ICON_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`woot-icon-picker-tab ${iconCategory === cat.id ? 'is-active' : ''}`}
                    onClick={() => setIconCategory(cat.id)}
                  >
                    {cat.label} ({cat.icons.length})
                  </button>
                ))}
              </div>
            </div>

            <div className="woot-icon-picker-grid">
              {activeCategoryIcons.map(iconId => (
                <button
                  key={iconId}
                  type="button"
                  title={iconId}
                  className={`woot-icon-picker-btn ${icon === iconId ? 'is-active' : ''}`}
                  style={icon === iconId ? { borderColor: color } : undefined}
                  onClick={() => setIcon(iconId)}
                >
                  <img
                    src={resolveWootProfileIconUrl(iconId)}
                    alt={iconId}
                    draggable={false}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      borderRadius: '50%',
                      display: 'block'
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* OpenMAD Zero-Wear Hardware Sync Mode selector */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 9,
              background: 'var(--woot-elevation-surface)',
              border: '1px solid var(--woot-border-default)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={16} color="#4ade80" />
              <strong style={{ fontSize: 13 }}>{tr('Hardware Sync Mode')}</strong>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                className={`woot-icon-pill ${executionMode === 'slot-switch' ? 'is-active' : ''}`}
                style={{ textAlign: 'left', padding: '8px 10px' }}
                onClick={() => setExecutionMode('slot-switch')}
              >
                <div style={{ fontWeight: 700 }}>
                  {tr('Onboard Slot Switch (Recommended - 0 Flash Wear)')}
                </div>
                <small style={{ color: 'var(--woot-text-subtle)', fontSize: 11 }}>
                  Switches hardware slot via CMD 0x10 / 0x00 0x70 (SRAM load only)
                </small>
              </button>
              <button
                type="button"
                className={`woot-icon-pill ${executionMode === 'ram-stream' ? 'is-active' : ''}`}
                style={{ textAlign: 'left', padding: '8px 10px' }}
                onClick={() => setExecutionMode('ram-stream')}
              >
                <div style={{ fontWeight: 700 }}>
                  {tr('Host RAM / Diff Stream (For >3 game profiles)')}
                </div>
                <small style={{ color: 'var(--woot-text-subtle)', fontSize: 11 }}>
                  Streams FlashOp.NORMAL (0x00) or Smart Slot 3 Virtualization
                </small>
              </button>
            </div>
            {executionMode === 'slot-switch' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}>
                <span style={{ color: 'var(--woot-text-subtle)' }}>{tr('Profile slot')}:</span>
                {slotOptions.map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`woot-icon-pill ${mappedOnboardSlot === s ? 'is-active' : ''}`}
                    onClick={() => setMappedOnboardSlot(s)}
                  >
                    Slot {s + 1} (Fn+P{s + 1}) {s === 0 ? `· ${tr('DEFAULT')}` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Linked Applications List (gv, L61478-L61700) */}
          <LinkedAppsList
            currentProfileUid={profile.uid}
            linkedApps={linkedApps}
            allProfiles={allProfiles}
            onChange={setLinkedApps}
            onOpenBgServiceSettings={onOpenBgServiceSettings}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="button" className="ghost-button" onClick={onClose}>
              {tr('Cancel')}
            </button>
            <button type="button" className="apply-button" onClick={handleSave}>
              <Check size={15} /> {tr('Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default ProfileEditorModal;
