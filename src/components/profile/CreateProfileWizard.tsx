import { useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Check, Palette, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { HeroDeviceModelId } from '../../keyboard/devices';
import {
  extractDominantColorFromApp,
  MAX_INACTIVE_PROFILES,
  MAX_LINKED_PROFILES,
  MAX_PROFILE_NAME_BYTES,
  resolveWootProfileIconUrl,
  utf8ByteLength,
  WOOT_ICON_CATEGORIES,
  WOOT_PROFILE_COLORS,
  WOOT_PROFILE_PRESETS,
  type LinkedAppRule,
  type ProfileNamespace,
  type StoredProfileRecord,
  type WootIconCategory,
  type WootPresetDefinition,
  type WootProfileMetadata
} from '../../state/profileTypes';
import { LinkedAppsList } from './LinkedAppsList';
import { renderProfileAvatarIcon } from './ProfileCard';

export interface CreateProfileWizardProps {
  deviceModel: HeroDeviceModelId;
  usedOnboardSlots: number;
  totalOnboardSlots: number;
  usedLinkedSlots: number;
  usedInactiveSlots: number;
  allProfiles?: StoredProfileRecord[];
  onClose: () => void;
  onCreate: (
    namespace: ProfileNamespace,
    metadata: WootProfileMetadata,
    preset: WootPresetDefinition
  ) => void;
  onOpenBgServiceSettings?: () => void;
}

export function CreateProfileWizard({
  deviceModel,
  usedOnboardSlots,
  totalOnboardSlots,
  usedLinkedSlots,
  usedInactiveSlots,
  allProfiles = [],
  onClose,
  onCreate,
  onOpenBgServiceSettings
}: CreateProfileWizardProps) {
  const { tr } = useI18n();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedPreset, setSelectedPreset] = useState<WootPresetDefinition>(
    WOOT_PROFILE_PRESETS[0]
  );
  const [name, setName] = useState(WOOT_PROFILE_PRESETS[0].defaultName);
  const [color, setColor] = useState(WOOT_PROFILE_PRESETS[0].color);
  const [icon, setIcon] = useState(WOOT_PROFILE_PRESETS[0].icon);
  const [iconCategory, setIconCategory] = useState<WootIconCategory>('switchyUwu');
  const [namespace, setNamespace] = useState<ProfileNamespace>('linked');
  const [linkedApps, setLinkedApps] = useState<LinkedAppRule[]>([]);
  const [error, setError] = useState<string | null>(null);

  const activeCategoryIcons =
    WOOT_ICON_CATEGORIES.find(c => c.id === iconCategory)?.icons ??
    WOOT_ICON_CATEGORIES[0].icons;

  function handleSelectPreset(preset: WootPresetDefinition) {
    setSelectedPreset(preset);
    setName(preset.defaultName);
    setColor(preset.color);
    setIcon(preset.icon);
    setStep(2);
  }

  function handleAppsChange(nextApps: LinkedAppRule[]) {
    setLinkedApps(nextApps);
    // Auto-extract dominant color when first app is linked (mirrors iee(iconUrl) in Wootility L61875)
    if (nextApps.length === 1 && linkedApps.length === 0) {
      setColor(extractDominantColorFromApp(nextApps[0].name));
      setNamespace('linked');
    }
  }

  function handleCreate() {
    if (!name.trim()) {
      setError(tr('Enter a profile name.'));
      return;
    }
    if (utf8ByteLength(name.trim()) > MAX_PROFILE_NAME_BYTES) {
      setError(tr('Use a name of at most 55 UTF-8 bytes.'));
      return;
    }
    const targetNamespace: ProfileNamespace =
      linkedApps.length > 0 && namespace === 'inactive' ? 'linked' : namespace;
    const metadata: WootProfileMetadata = {
      uid: `${targetNamespace}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      color,
      icon,
      presetType: selectedPreset.id,
      createdFor: deviceModel,
      updatedAt: Date.now(),
      executionMode: 'slot-switch',
      mappedOnboardSlot: 1,
      linkedApps
    };
    onCreate(targetNamespace, metadata, selectedPreset);
    onClose();
  }

  return (
    <div className="woot-modal-backdrop" onClick={onClose}>
      <div
        className="woot-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={tr('Creating new profile')}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px 12px',
            borderBottom: '1px solid var(--woot-border-default)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {step === 2 && (
              <button
                type="button"
                className="icon-button compact"
                onClick={() => setStep(1)}
                title="Back"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>{tr('Creating new profile')}</h2>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--woot-text-subtle)' }}>
                {step === 1
                  ? tr('Select the type of profile you would like to create')
                  : `Preset: ${selectedPreset.title} (${selectedPreset.actuationMm} mm AP)`}
              </p>
            </div>
          </div>
          <button type="button" className="icon-button compact" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="woot-editor-body">
          {step === 1 ? (
            /* Step 1: 3-column Preset Selection Grid with authentic Wootility Preset Banners (lee, L62030-L62164) */
            <div className="woot-preset-grid woot-slot-shallow">
              {WOOT_PROFILE_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  className={`woot-preset-card ${selectedPreset.id === preset.id ? 'is-selected' : ''}`}
                  onClick={() => handleSelectPreset(preset)}
                >
                  {preset.imageSrc && (
                    <div className="woot-preset-banner">
                      <img src={preset.imageSrc} alt={preset.title} draggable={false} />
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div
                      className="woot-profile-avatar"
                      style={
                        {
                          '--profile-color': preset.color,
                          borderColor: preset.color
                        } as CSSProperties
                      }
                    >
                      {renderProfileAvatarIcon(preset.icon, 18)}
                    </div>
                    <ArrowRight size={15} color="var(--woot-text-subtle)" />
                  </div>
                  <strong style={{ fontSize: 15, color: 'var(--woot-text-strong)' }}>
                    {preset.title}
                  </strong>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--woot-text-subtle)', lineHeight: 1.45 }}>
                    {preset.description}
                  </p>
                  <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 4 }}>
                    <span className="woot-shortcut-pill">AP {preset.actuationMm}mm</span>
                    <span className="woot-shortcut-pill">
                      {preset.rapidTrigger ? `RT ${preset.rapidSensitivityMm}mm` : 'RT Off'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            /* Step 2: Profile details + Wootility Icon Picker + Storage Location + App Linking (oee, L61770-L61994) */
            <div className="woot-slot-deepen" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="woot-editor-top-row">
                <div
                  className="woot-profile-avatar"
                  style={
                    {
                      width: 46,
                      height: 46,
                      flex: '0 0 46px',
                      '--profile-color': color,
                      borderColor: color
                    } as CSSProperties
                  }
                >
                  {renderProfileAvatarIcon(icon, 22)}
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--woot-text-subtle)', marginBottom: 4 }}>
                    {tr('Profile name')}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => {
                      setName(e.target.value);
                      setError(null);
                    }}
                    style={{
                      width: '100%',
                      height: 38,
                      padding: '0 12px',
                      borderRadius: 7,
                      border: '1px solid var(--woot-border-default)',
                      background: 'var(--woot-elevation-sunken)',
                      color: 'var(--woot-text-strong)',
                      fontSize: 14,
                      fontWeight: 700
                    }}
                  />
                </div>
              </div>

              <div className="woot-color-swatches">
                <Palette size={15} color="var(--woot-text-subtle)" />
                {WOOT_PROFILE_COLORS.map(swatch => (
                  <button
                    key={swatch}
                    type="button"
                    className={`woot-color-swatch ${color.toLowerCase() === swatch.toLowerCase() ? 'is-active' : ''}`}
                    style={{ backgroundColor: swatch }}
                    onClick={() => setColor(swatch)}
                  />
                ))}
              </div>

              {/* Visual Wootility Icon Picker */}
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
                    {tr('Profile Icon')}
                  </label>
                  <div className="woot-icon-picker-tabs" style={{ marginBottom: 0 }}>
                    {WOOT_ICON_CATEGORIES.map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        className={`woot-icon-picker-tab ${iconCategory === cat.id ? 'is-active' : ''}`}
                        onClick={() => setIconCategory(cat.id)}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="woot-icon-picker-grid" style={{ maxHeight: 112 }}>
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

              {/* Storage Destination Cards with usedSlots / totalSlots (yJ in Wootility L61905) */}
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--woot-text-subtle)', marginBottom: 6 }}>
                  Storage Namespace
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <button
                    type="button"
                    className={`woot-preset-card ${namespace === 'onboard' ? 'is-selected' : ''}`}
                    style={{ padding: 12 }}
                    onClick={() => setNamespace('onboard')}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <strong style={{ fontSize: 13 }}>Onboard</strong>
                      <span className="woot-shortcut-pill">
                        {usedOnboardSlots} / {totalOnboardSlots}
                      </span>
                    </div>
                    <small style={{ color: 'var(--woot-text-subtle)', fontSize: 11 }}>
                      Stored on keyboard hardware slots
                    </small>
                  </button>

                  <button
                    type="button"
                    className={`woot-preset-card ${namespace === 'linked' ? 'is-selected' : ''}`}
                    style={{ padding: 12 }}
                    disabled={usedLinkedSlots >= MAX_LINKED_PROFILES}
                    onClick={() => setNamespace('linked')}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <strong style={{ fontSize: 13 }}>Linked App</strong>
                      <span className="woot-shortcut-pill">
                        {usedLinkedSlots} / {MAX_LINKED_PROFILES}
                      </span>
                    </div>
                    <small style={{ color: 'var(--woot-text-subtle)', fontSize: 11 }}>
                      Activates automatically on focus
                    </small>
                  </button>

                  <button
                    type="button"
                    className={`woot-preset-card ${namespace === 'inactive' ? 'is-selected' : ''}`}
                    style={{ padding: 12 }}
                    disabled={usedInactiveSlots >= MAX_INACTIVE_PROFILES}
                    onClick={() => setNamespace('inactive')}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <strong style={{ fontSize: 13 }}>Inactive</strong>
                      <span className="woot-shortcut-pill">
                        {usedInactiveSlots} / {MAX_INACTIVE_PROFILES}
                      </span>
                    </div>
                    <small style={{ color: 'var(--woot-text-subtle)', fontSize: 11 }}>
                      Saved locally in OpenAula
                    </small>
                  </button>
                </div>
              </div>

              <LinkedAppsList
                currentProfileUid="new-profile"
                linkedApps={linkedApps}
                allProfiles={allProfiles}
                onChange={handleAppsChange}
                onOpenBgServiceSettings={onOpenBgServiceSettings}
              />

              {error && (
                <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--woot-danger-bg)' }}>
                  {error}
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="ghost-button" onClick={onClose}>
                  {tr('Cancel')}
                </button>
                <button type="button" className="apply-button" onClick={handleCreate}>
                  <Check size={15} /> {tr('New Profile')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default CreateProfileWizard;
