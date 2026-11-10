import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { version as uiVersion } from '../../../package.json';
import {
  Activity,
  ArrowDownToLine,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Gamepad2,
  Keyboard,
  Lightbulb,
  Link2,
  ListOrdered,
  Loader2,
  Palette,
  Save,
  Settings,
  Sparkles,
  Stethoscope,
  Zap
} from 'lucide-react';
import logo from '../../assets/openhero68-logo.png';
import { BRAND } from '../../brand';
import LegacyHostBanner from '../../components/LegacyHostBanner';
import LocalServicePermissionGuide from '../../components/LocalServicePermissionGuide';
import type { RgbTab } from '../../components/RgbSettingsPage';
import { CreateProfileWizard } from '../../components/profile/CreateProfileWizard';
import { DeleteProfileDialog } from '../../components/profile/DeleteProfileDialog';
import { ImportProfileModal } from '../../components/profile/ImportProfileModal';
import { MyProfilesDrawer } from '../../components/profile/MyProfilesDrawer';
import { renderProfileAvatarIcon } from '../../components/profile/ProfileCard';
import { ProfileEditorModal } from '../../components/profile/ProfileEditorModal';
import { useT } from '../../i18n';
import { isWin68HeMaxModel, type HeroDeviceModelId } from '../../keyboard/devices';
import { useBgService } from '../../protocol/bgServiceClient';
import type { ProfileSlot } from '../../protocol/hero68/types';
import {
  createDefaultOnboardMetadata,
  type ProfileNamespace,
  type StoredProfileRecord,
  type WootPresetDefinition,
  type WootProfileMetadata
} from '../../state/profileTypes';
import { AdvancedKeysMenuIcon } from './AdvancedKeysMenuIcon';
import { KeyRemapMenuIcon } from './KeyRemapMenuIcon';
import { KeyboardMenuIcon } from './KeyboardMenuIcon';
import { RailItem } from './RailItem';
import { RapidTriggerMenuIcon } from './RapidTriggerMenuIcon';
import { SidebarItem } from './SidebarItem';
import { SwitchStemMenuIcon } from './SwitchStemMenuIcon';
import { UndoRedoButtons } from './UndoRedoButtons';

export type AppShellProps = {
  activeRail: 'keyboard' | 'settings' | 'help';
  onSelectRail: (rail: 'keyboard' | 'settings' | 'help') => void;
  activePage: string;
  onSelectPage: (page: string) => void;
  activeSettingsPage: string;
  onSelectSettingsPage: (page: string) => void;
  compactSidebar: boolean;
  onToggleCompactSidebar: () => void;
  showAdvancedPages: boolean;
  devicePanel: ReactNode;
  deviceModel?: HeroDeviceModelId;
  profileSlot: ProfileSlot;
  profileNames: Record<ProfileSlot, string>;
  onSelectProfileSlot: (slot: ProfileSlot) => void;
  activeRgbTab: RgbTab;
  deviceConnected: boolean;
  profileBusy: boolean;
  canSaveAll: boolean;
  saveState: 'idle' | 'sent';
  onSaveAll: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  // Optional Wootility v5 Profile Workspace bindings
  onboardMetadata?: Record<ProfileSlot, WootProfileMetadata>;
  linkedProfiles?: StoredProfileRecord[];
  inactiveProfiles?: StoredProfileRecord[];
  activeProfileNamespace?: ProfileNamespace;
  activeProfileUid?: string;
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
  children: ReactNode;
};

export function AppShell({
  activeRail,
  onSelectRail,
  activePage,
  onSelectPage,
  activeSettingsPage,
  onSelectSettingsPage,
  compactSidebar,
  onToggleCompactSidebar,
  showAdvancedPages,
  devicePanel,
  deviceModel = 'hero68',
  profileSlot,
  profileNames,
  onSelectProfileSlot,
  activeRgbTab,
  deviceConnected,
  profileBusy,
  canSaveAll,
  saveState,
  onSaveAll,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onboardMetadata,
  linkedProfiles = [],
  inactiveProfiles = [],
  activeProfileNamespace = 'onboard',
  activeProfileUid,
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
  children
}: AppShellProps) {
  const tr = useT();
  const { autoProfile, hasBgService, isServiceOutdated, requiredServiceVersion } = useBgService();
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<WootProfileMetadata | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState<WootProfileMetadata | null>(null);
  const showKeyboardArea = activeRail === 'keyboard';
  const maxOnboardSlots: 3 | 4 = isWin68HeMaxModel(deviceModel) ? 4 : 3;

  const resolvedOnboardMeta = useMemo<Record<ProfileSlot, WootProfileMetadata>>(
    () => ({
      0:
        onboardMetadata?.[0] ??
        createDefaultOnboardMetadata(0, profileNames[0] || 'Onboard Profile 0', deviceModel),
      1:
        onboardMetadata?.[1] ??
        createDefaultOnboardMetadata(1, profileNames[1] || 'Onboard Profile 1', deviceModel),
      2:
        onboardMetadata?.[2] ??
        createDefaultOnboardMetadata(2, profileNames[2] || 'Onboard Profile 2', deviceModel),
      3:
        onboardMetadata?.[3] ??
        createDefaultOnboardMetadata(3, profileNames[3] || 'Onboard Profile 3', deviceModel)
    }),
    [deviceModel, onboardMetadata, profileNames]
  );

  const currentProfileMeta = useMemo<WootProfileMetadata>(() => {
    if (activeProfileUid && !activeProfileUid.startsWith('onboard-')) {
      const found = [...linkedProfiles, ...inactiveProfiles].find(
        p => p.metadata.uid === activeProfileUid
      );
      if (found) {
        return found.metadata;
      }
    }
    return resolvedOnboardMeta[profileSlot] ?? resolvedOnboardMeta[0];
  }, [activeProfileUid, inactiveProfiles, linkedProfiles, profileSlot, resolvedOnboardMeta]);

  const allStoredProfiles = useMemo<StoredProfileRecord[]>(() => {
    const slots: readonly ProfileSlot[] =
      maxOnboardSlots === 4 ? ([0, 1, 2, 3] as const) : ([0, 1, 2] as const);
    const onboardRecs: StoredProfileRecord[] = slots.map(s => ({
      metadata: resolvedOnboardMeta[s],
      draft: {}
    }));
    return [...onboardRecs, ...linkedProfiles, ...inactiveProfiles];
  }, [inactiveProfiles, linkedProfiles, maxOnboardSlots, resolvedOnboardMeta]);

  // Global Ctrl+S / Cmd+S shortcut for Save (Pp in wootility.readable.js L93310-L93420)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (deviceConnected && !profileBusy && canSaveAll) {
          onSaveAll();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canSaveAll, deviceConnected, onSaveAll, profileBusy]);

  const sidebarItems = useMemo(() => {
    const items = [
      {
        id: 'actuation',
        label: tr('Actuation Point'),
        icon: <ArrowDownToLine size={18} />,
        advanced: false
      },
      { id: 'rapid', label: tr('Rapid Trigger'), icon: <RapidTriggerMenuIcon />, advanced: false },
      { id: 'stream', label: tr('Hall Stream'), icon: <Activity size={18} />, advanced: true },
      { id: 'rgb', label: tr('RGB Settings'), icon: <Lightbulb size={18} />, advanced: false },
      { id: 'remap', label: tr('Key Remap'), icon: <KeyRemapMenuIcon />, advanced: false },
      {
        id: 'advanced',
        label: tr('Advanced Keys'),
        icon: <AdvancedKeysMenuIcon />,
        advanced: false
      },
      { id: 'macros', label: tr('Macros'), icon: <ListOrdered size={18} />, advanced: false },
      { id: 'gamepad', label: tr('Gamepad'), icon: <Gamepad2 size={18} />, advanced: true }
    ];
    return items.filter(item => showAdvancedPages || !item.advanced);
  }, [showAdvancedPages, tr]);

  const keyboardSettingsItems = useMemo(
    () => [
      { id: 'general', label: tr('General Settings'), icon: <KeyboardMenuIcon /> },
      { id: 'switches', label: tr('Switch Selector'), icon: <SwitchStemMenuIcon /> }
    ],
    [tr]
  );

  const uiSettingsItems = useMemo(
    () => [
      { id: 'interface', label: tr('Interface'), icon: <Palette size={18} /> },
      { id: 'background-service', label: tr('Background Service'), icon: <Activity size={18} /> },
      { id: 'diagnostics', label: tr('Diagnostics'), icon: <Stethoscope size={18} /> }
    ],
    [tr]
  );

  // 4-state Save button class & label (Pp, L93310-L93420)
  const saveButtonState = profileBusy
    ? 'is-saving'
    : saveState === 'sent'
      ? 'is-saved'
      : canSaveAll && deviceConnected
        ? 'is-can-save'
        : 'is-idle';

  return (
    <div className={`app-shell ${compactSidebar ? 'is-sidebar-compact' : ''}`}>
      <LegacyHostBanner />
      <LocalServicePermissionGuide />
      <aside className="rail">
        <div className="brand-mark">
          <img src={logo} alt={BRAND.displayName} />
        </div>
        <div className="rail-stack">
          <RailItem
            icon={<Keyboard size={22} />}
            label={tr('Keyboard')}
            active={activeRail === 'keyboard'}
            onClick={() => onSelectRail('keyboard')}
          />
          <RailItem
            icon={<Settings size={22} />}
            label={tr('Settings')}
            active={activeRail === 'settings'}
            onClick={() => onSelectRail('settings')}
          />
          <RailItem
            icon={<CircleHelp size={22} />}
            label={tr('Help')}
            active={activeRail === 'help'}
            onClick={() => onSelectRail('help')}
          />
        </div>
      </aside>

      <aside className="sidebar">
        {showKeyboardArea ? (
          <>
            <div className="sidebar-title">
              <strong>{tr('Keyboard Configuration')}</strong>
              <button
                type="button"
                className="icon-button compact"
                aria-label={compactSidebar ? tr('Expand sidebar') : tr('Collapse sidebar')}
                title={compactSidebar ? tr('Expand sidebar') : tr('Collapse sidebar')}
                onClick={onToggleCompactSidebar}
              >
                {compactSidebar ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            </div>

            {devicePanel}

            <div className="sidebar-section-label">{tr('Profiles')}</div>
            <SidebarItem
              icon={<Zap size={18} />}
              label={tr('Quick Settings')}
              active={activePage === 'quick'}
              onClick={() => onSelectPage('quick')}
            />
            <SidebarItem
              icon={<Sparkles size={18} />}
              label={tr('My Profile')}
              active={activePage === 'profile'}
              onClick={() => onSelectPage('profile')}
            />

            <div className="sidebar-section-label">{tr('Keyboard Configuration')}</div>
            {sidebarItems.map(item => (
              <SidebarItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activePage === item.id}
                onClick={() => onSelectPage(item.id)}
              />
            ))}

            <div className="sidebar-version">
              {BRAND.displayName} <span>v{uiVersion} UI</span>
            </div>
          </>
        ) : activeRail === 'settings' ? (
          <>
            <div className="sidebar-title">
              <strong>{tr('Settings')}</strong>
              <button
                type="button"
                className="icon-button compact"
                aria-label={compactSidebar ? tr('Expand sidebar') : tr('Collapse sidebar')}
                title={compactSidebar ? tr('Expand sidebar') : tr('Collapse sidebar')}
                onClick={onToggleCompactSidebar}
              >
                {compactSidebar ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            </div>

            {devicePanel}

            <div className="sidebar-section-label">{tr('Keyboard settings')}</div>
            {keyboardSettingsItems.map(item => (
              <SidebarItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activeSettingsPage === item.id}
                onClick={() => onSelectSettingsPage(item.id)}
              />
            ))}

            <div className="sidebar-section-label">{tr('Interface settings')}</div>
            {uiSettingsItems.map(item => (
              <SidebarItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activeSettingsPage === item.id}
                onClick={() => onSelectSettingsPage(item.id)}
              />
            ))}

            <div className="sidebar-version">
              {BRAND.displayName} <span>v{uiVersion} UI</span>
            </div>
          </>
        ) : (
          <>
            <div className="sidebar-title">
              <strong>{tr('Help')}</strong>
            </div>
            <div className="help-sidebar-copy">
              <p>{tr('Connection, profile saving and background service help.')}</p>
            </div>
          </>
        )}
      </aside>

      <main className={`workspace ${activeRail === 'settings' ? 'workspace-settings' : ''}`}>
        {activeRail !== 'settings' && (
          <header className="topbar">
            <div className="profile-control-wrap">
              {showKeyboardArea && activePage === 'macros' ? (
                <div className="page-title-bar">
                  <span className="profile-icon">
                    <ListOrdered size={17} />
                  </span>
                  <strong>{tr('Macro library')}</strong>
                </div>
              ) : showKeyboardArea ? (
                <>
                  {/* Wootility v5 TopBar Profile Bar (xae, L93098-L93245) */}
                  <div
                    className="woot-topbar-profile-bar"
                    style={
                      {
                        '--profile-color': currentProfileMeta.color || '#ffd45c'
                      } as React.CSSProperties
                    }
                  >
                    <span className="woot-topbar-accent-arch" aria-hidden="true" />

                    {/* Clickable avatar button opens ProfileEditorModal directly (h4 -> aw) */}
                    <button
                      type="button"
                      className="woot-topbar-avatar-btn"
                      disabled={profileBusy}
                      title={tr('Edit Profile')}
                      aria-label={tr('Edit Profile')}
                      onClick={() => setEditingProfile(currentProfileMeta)}
                    >
                      {renderProfileAvatarIcon(currentProfileMeta.icon, 18)}
                    </button>

                    {/* Body button opens MyProfilesDrawer (bae) */}
                    <button
                      type="button"
                      className="woot-topbar-body-btn"
                      disabled={profileBusy}
                      onClick={() => setProfileOpen(prev => !prev)}
                      aria-expanded={profileOpen}
                    >
                      <span className="woot-topbar-title-group">
                        <strong className="woot-topbar-name">{currentProfileMeta.name}</strong>

                        {activeProfileNamespace === 'inactive' ? (
                          <span className="woot-badge-inactive">{tr('INACTIVE')}</span>
                        ) : autoProfile.activeApp?.exe ? (
                          <span className="woot-badge-active-app">
                            <Link2 size={11} />
                            {autoProfile.activeApp.exe}
                          </span>
                        ) : (
                          <kbd className="woot-shortcut-pill">Fn + P{profileSlot + 1}</kbd>
                        )}
                        {linkedProfiles.length > 0 && !hasBgService && (
                          <span
                            className="woot-shortcut-pill"
                            style={{
                              color: '#facc15',
                              borderColor: 'rgba(250, 204, 21, 0.38)',
                              background: 'rgba(250, 204, 21, 0.1)'
                            }}
                            title={
                              isServiceOutdated
                                ? tr('Background Service update to v1.8.0 required')
                                : tr('Background Service v1.8.0 is not running')
                            }
                          >
                            ! Service v{requiredServiceVersion}
                          </span>
                        )}
                      </span>
                      <ChevronDown size={17} className={profileOpen ? 'rotate' : ''} />
                    </button>
                  </div>

                  {/* Wootility v5 MyProfilesDrawer (bae, L92807-L93096) */}
                  <MyProfilesDrawer
                    isOpen={profileOpen}
                    onClose={() => setProfileOpen(false)}
                    activeSlot={profileSlot}
                    activeProfileUid={activeProfileUid ?? `onboard-${profileSlot}`}
                    maxOnboardSlots={maxOnboardSlots}
                    onboardProfiles={resolvedOnboardMeta}
                    linkedProfiles={linkedProfiles}
                    inactiveProfiles={inactiveProfiles}
                    onSelectOnboard={slot => onSelectProfileSlot(slot)}
                    onSelectStoredProfile={(rec, ns) => onSelectStoredProfile?.(rec, ns)}
                    onEditProfile={meta => setEditingProfile(meta)}
                    onDuplicateProfile={meta => onDuplicateProfile?.(meta)}
                    onExportProfile={meta => onExportAnyProfile?.(meta)}
                    onMoveToInactive={(meta, slot) => onMoveToInactive?.(meta, slot)}
                    onMoveToOnboard={(rec, slot) => onMoveToOnboard?.(rec, slot)}
                    onSetAsDefault={slot => onSwapDefaultSlot?.(slot)}
                    onDeleteProfile={meta => setDeletingProfile(meta)}
                    onOpenNewProfile={() => setCreateOpen(true)}
                    onOpenImportProfile={() => setImportOpen(true)}
                    onOpenMyProfilesPage={() => onSelectPage('profile')}
                    onOpenBgServiceSettings={() => {
                      onSelectRail('settings');
                      onSelectSettingsPage('background-service');
                    }}
                  />
                </>
              ) : (
                <div className="page-title-bar">
                  <span className="profile-icon">
                    <Settings size={17} />
                  </span>
                  <strong>{tr('Help')}</strong>
                </div>
              )}
            </div>

            <div className="topbar-actions">
              {showKeyboardArea &&
              (activePage === 'gamepad' || (activePage === 'rgb' && activeRgbTab === 'rhythm')) ? (
                <span className="profile-status">{tr('Changes apply automatically')}</span>
              ) : showKeyboardArea && activePage === 'macros' ? (
                <span className="profile-status">{tr('Local + HERO68 macro library')}</span>
              ) : (
                <>
                  {showKeyboardArea && activePage !== 'stream' && onUndo && onRedo && (
                    <UndoRedoButtons
                      canUndo={canUndo}
                      canRedo={canRedo}
                      onUndo={onUndo}
                      onRedo={onRedo}
                      disabled={profileBusy}
                      enableShortcuts
                    />
                  )}
                  <button
                    type="button"
                    className={`woot-save-btn apply-button ${saveButtonState}`}
                    onClick={onSaveAll}
                    disabled={!deviceConnected || profileBusy || !canSaveAll}
                    title="Ctrl+S"
                  >
                    {profileBusy ? (
                      <>
                        <Loader2 size={15} className="bs-spinning" />
                        {tr('Saving…')}
                      </>
                    ) : saveState === 'sent' ? (
                      <>
                        <Check size={15} />
                        {tr('Changes saved')}
                      </>
                    ) : (
                      <>
                        {canSaveAll && deviceConnected && <span className="woot-save-dot" />}
                        <Save size={15} />
                        {activeProfileNamespace === 'inactive'
                          ? tr('Save profile')
                          : tr('Save to keyboard')}
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </header>
        )}

        <div
          key={`${activeRail}:${activePage}:${activeSettingsPage}`}
          className="workspace-content"
          inert={profileBusy || undefined}
        >
          {children}
        </div>
      </main>

      {/* Modals rendered at AppShell level for instant access from TopBar or Drawer */}
      {editingProfile && (
        <ProfileEditorModal
          profile={editingProfile}
          maxOnboardSlots={maxOnboardSlots}
          allProfiles={allStoredProfiles}
          onClose={() => setEditingProfile(null)}
          onSave={updated => onUpdateProfileMetadata?.(updated)}
          onOpenBgServiceSettings={() => {
            setEditingProfile(null);
            onSelectRail('settings');
            onSelectSettingsPage('background-service');
          }}
        />
      )}

      {createOpen && (
        <CreateProfileWizard
          deviceModel={deviceModel}
          usedOnboardSlots={maxOnboardSlots}
          totalOnboardSlots={maxOnboardSlots}
          usedLinkedSlots={linkedProfiles.length}
          usedInactiveSlots={inactiveProfiles.length}
          allProfiles={allStoredProfiles}
          onClose={() => setCreateOpen(false)}
          onCreate={(ns, meta, preset) => onCreateNewProfile?.(ns, meta, preset)}
          onOpenBgServiceSettings={() => {
            setCreateOpen(false);
            onSelectRail('settings');
            onSelectSettingsPage('background-service');
          }}
        />
      )}

      {importOpen && (
        <ImportProfileModal
          currentDeviceModel={deviceModel}
          onClose={() => setImportOpen(false)}
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

export default AppShell;
