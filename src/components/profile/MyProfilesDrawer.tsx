import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Plus, Search, Settings2 } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useBgService } from '../../protocol/bgServiceClient';
import type { ProfileSlot } from '../../protocol/hero68/types';
import type { StoredProfileRecord, WootProfileMetadata } from '../../state/profileTypes';
import { ProfileCard } from './ProfileCard';

export interface MyProfilesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeSlot: ProfileSlot;
  activeProfileUid: string;
  maxOnboardSlots?: 3 | 4;
  onboardProfiles: Record<ProfileSlot, WootProfileMetadata>;
  linkedProfiles: StoredProfileRecord[];
  inactiveProfiles: StoredProfileRecord[];
  onSelectOnboard: (slot: ProfileSlot) => void;
  onSelectStoredProfile: (record: StoredProfileRecord, namespace: 'linked' | 'inactive') => void;
  onEditProfile: (profile: WootProfileMetadata) => void;
  onDuplicateProfile: (profile: WootProfileMetadata) => void;
  onExportProfile: (profile: WootProfileMetadata) => void;
  onMoveToInactive: (profile: WootProfileMetadata, sourceSlot?: ProfileSlot) => void;
  onMoveToOnboard: (record: StoredProfileRecord, targetSlot?: ProfileSlot) => void;
  onSetAsDefault: (slot: ProfileSlot) => void;
  onDeleteProfile: (profile: WootProfileMetadata) => void;
  onOpenNewProfile: () => void;
  onOpenImportProfile: () => void;
  onOpenMyProfilesPage: () => void;
  onOpenBgServiceSettings: () => void;
}

export function MyProfilesDrawer({
  isOpen,
  onClose,
  activeSlot,
  activeProfileUid,
  maxOnboardSlots = 3,
  onboardProfiles,
  linkedProfiles,
  inactiveProfiles,
  onSelectOnboard,
  onSelectStoredProfile,
  onEditProfile,
  onDuplicateProfile,
  onExportProfile,
  onMoveToInactive,
  onMoveToOnboard,
  onSetAsDefault,
  onDeleteProfile,
  onOpenNewProfile,
  onOpenImportProfile,
  onOpenMyProfilesPage,
  onOpenBgServiceSettings
}: MyProfilesDrawerProps) {
  const { tr } = useI18n();
  const {
    hasBgService,
    isServiceOutdated,
    serviceVersion,
    requiredServiceVersion
  } = useBgService();
  const [query, setQuery] = useState('');

  // Reset search query when drawer closes (wootility.readable.js L92870)
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  const normalizedQuery = query.trim().toLowerCase();

  const onboardList = useMemo(() => {
    const slots: ProfileSlot[] = maxOnboardSlots === 4 ? [0, 1, 2, 3] : [0, 1, 2];
    return slots
      .map(slot => ({ slot, meta: onboardProfiles[slot] }))
      .filter(
        ({ meta }) =>
          Boolean(meta) && (!normalizedQuery || meta.name.toLowerCase().includes(normalizedQuery))
      );
  }, [maxOnboardSlots, normalizedQuery, onboardProfiles]);

  const filteredLinked = useMemo(() => {
    return linkedProfiles.filter(
      rec =>
        !normalizedQuery ||
        rec.metadata.name.toLowerCase().includes(normalizedQuery) ||
        rec.metadata.linkedApps.some(app => app.name.toLowerCase().includes(normalizedQuery))
    );
  }, [linkedProfiles, normalizedQuery]);

  const filteredInactive = useMemo(() => {
    return inactiveProfiles.filter(
      rec => !normalizedQuery || rec.metadata.name.toLowerCase().includes(normalizedQuery)
    );
  }, [inactiveProfiles, normalizedQuery]);

  if (!isOpen) {
    return null;
  }

  const totalCards = onboardList.length + filteredLinked.length + filteredInactive.length;

  return (
    <div className="woot-profiles-drawer" role="dialog" aria-label={tr('My Profiles')}>
      {/* Header (L92905-L92939): Search + Import + New Profile */}
      <div className="woot-drawer-header">
        <div className="woot-search-box">
          <Search size={15} />
          <input
            type="search"
            placeholder={tr('Search...')}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="woot-drawer-import-btn"
          title={tr('Import a Profile')}
          aria-label={tr('Import a Profile')}
          onClick={() => {
            onClose();
            onOpenImportProfile();
          }}
        >
          <Download size={16} />
        </button>
        <button
          type="button"
          className="woot-drawer-new-btn"
          onClick={() => {
            onClose();
            onOpenNewProfile();
          }}
        >
          <Plus size={15} />
          {tr('New Profile')}
        </button>
      </div>

      {/* Scrollable Body (maxH: 420px, L92941) */}
      <div className="woot-drawer-scroll-wrap">
        <div className="woot-drawer-scroll">
          {totalCards === 0 && (
            <div
              style={{
                padding: '28px 12px',
                textAlign: 'center',
                color: 'var(--woot-text-subtle)',
                fontSize: 13
              }}
            >
              {tr('No profiles found')}
            </div>
          )}

          {/* Section 1: ONBOARD PROFILES (L92954-L93004) */}
          {onboardList.length > 0 && (
            <section className="woot-profile-section" aria-label={tr('ONBOARD PROFILES')}>
              <div className="woot-profile-section-header">
                <span>{tr('ONBOARD PROFILES')}</span>
                <span>
                  {onboardList.length} / {maxOnboardSlots}
                </span>
              </div>
              {onboardList.map(({ slot, meta }) => (
                <ProfileCard
                  key={meta.uid}
                  profile={meta}
                  onboardIndex={slot}
                  isSelected={activeProfileUid === meta.uid || activeSlot === slot}
                  shortcutKeys={['Fn', `P${slot + 1}`]}
                  onSelect={() => {
                    onSelectOnboard(slot);
                    onClose();
                  }}
                  onEdit={() => {
                    onClose();
                    onEditProfile(meta);
                  }}
                  onDuplicate={() => onDuplicateProfile(meta)}
                  onExport={() => onExportProfile(meta)}
                  onMoveToInactive={() => onMoveToInactive(meta, slot)}
                  onSetAsDefault={slot !== 0 ? () => onSetAsDefault(slot) : undefined}
                />
              ))}
            </section>
          )}

          {/* Section 2: LINKED WITH AN APPLICATION (L93005-L93048) */}
          {filteredLinked.length > 0 && (
            <section className="woot-profile-section" aria-label={tr('LINKED WITH AN APPLICATION')}>
              <div className="woot-profile-section-header">
                <span>{tr('LINKED WITH AN APPLICATION')}</span>
                <span>{filteredLinked.length} / 10</span>
              </div>

              {!hasBgService && (
                <div className="woot-bg-warning-banner">
                  <div>
                    <strong style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <AlertTriangle size={13} />
                      {isServiceOutdated
                        ? tr('Background Service update to v1.8.0 required')
                        : tr('Background Service v1.8.0 is not running')}
                    </strong>
                    <span>
                      {isServiceOutdated
                        ? `${tr('Detected service')} v${serviceVersion} — ${tr('update to')} v${requiredServiceVersion} ${tr('for Auto-Profile & Zero-Flash-Wear.')}`
                        : tr(
                            "Your linked profiles won't switch automatically until Background Service v1.8.0 is connected."
                          )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenBgServiceSettings();
                    }}
                  >
                    {tr('Go to Background Service')}
                  </button>
                </div>
              )}

              {filteredLinked.map(rec => (
                <ProfileCard
                  key={rec.metadata.uid}
                  profile={rec.metadata}
                  isSelected={activeProfileUid === rec.metadata.uid}
                  onSelect={() => {
                    onSelectStoredProfile(rec, 'linked');
                    onClose();
                  }}
                  onEdit={() => {
                    onClose();
                    onEditProfile(rec.metadata);
                  }}
                  onDuplicate={() => onDuplicateProfile(rec.metadata)}
                  onExport={() => onExportProfile(rec.metadata)}
                  onMoveToInactive={() => onMoveToInactive(rec.metadata)}
                  onMoveToOnboard={() => onMoveToOnboard(rec)}
                  onDelete={() => onDeleteProfile(rec.metadata)}
                />
              ))}
            </section>
          )}

          {/* Section 3: INACTIVE PROFILES (L93049-L93090) */}
          {filteredInactive.length > 0 && (
            <section className="woot-profile-section" aria-label={tr('INACTIVE PROFILES')}>
              <div className="woot-profile-section-header">
                <span>{tr('INACTIVE PROFILES')}</span>
                <span>{filteredInactive.length}</span>
              </div>
              {filteredInactive.map(rec => (
                <ProfileCard
                  key={rec.metadata.uid}
                  profile={rec.metadata}
                  isSelected={activeProfileUid === rec.metadata.uid}
                  onSelect={() => {
                    onSelectStoredProfile(rec, 'inactive');
                    onClose();
                  }}
                  onEdit={() => {
                    onClose();
                    onEditProfile(rec.metadata);
                  }}
                  onDuplicate={() => onDuplicateProfile(rec.metadata)}
                  onExport={() => onExportProfile(rec.metadata)}
                  onMoveToOnboard={() => onMoveToOnboard(rec)}
                  onDelete={() => onDeleteProfile(rec.metadata)}
                />
              ))}
            </section>
          )}
        </div>

        {/* Bottom gradient fade when totalCards > 4 (L92893) */}
        {totalCards > 4 && <div className="woot-drawer-bottom-fade" />}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--woot-border-default)',
          paddingTop: 10
        }}
      >
        <button
          type="button"
          className="ghost-button"
          style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => {
            onClose();
            onOpenMyProfilesPage();
          }}
        >
          <Settings2 size={14} /> {tr('Manage profile')}
        </button>
        <span style={{ fontSize: 11, color: 'var(--woot-text-subtlest)', fontWeight: 700 }}>
          Auto-Profile v{requiredServiceVersion}
        </span>
      </div>
    </div>
  );
}
export default MyProfilesDrawer;
