import { useMemo, useState, type ReactNode } from 'react'
import { version as uiVersion } from '../../../package.json'
import {
  Activity,
  ArrowDownToLine,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Gamepad2,
  Keyboard,
  Lightbulb,
  ListOrdered,
  Palette,
  Settings,
  Sparkles,
  Stethoscope,
  Zap,
} from 'lucide-react'
import logo from '../../assets/openhero68-logo.png'
import { BRAND } from '../../brand'
import LegacyHostBanner from '../../components/LegacyHostBanner'
import LocalServicePermissionGuide from '../../components/LocalServicePermissionGuide'
import type { RgbTab } from '../../components/RgbSettingsPage'
import { useT } from '../../i18n'
import type { ProfileSlot } from '../../protocol/hero68/types'
import { AdvancedKeysMenuIcon } from './AdvancedKeysMenuIcon'
import { KeyRemapMenuIcon } from './KeyRemapMenuIcon'
import { KeyboardMenuIcon } from './KeyboardMenuIcon'
import { RailItem } from './RailItem'
import { RapidTriggerMenuIcon } from './RapidTriggerMenuIcon'
import { SidebarItem } from './SidebarItem'
import { SwitchStemMenuIcon } from './SwitchStemMenuIcon'

export type AppShellProps = {
  activeRail: 'keyboard' | 'settings' | 'help'
  onSelectRail: (rail: 'keyboard' | 'settings' | 'help') => void
  activePage: string
  onSelectPage: (page: string) => void
  activeSettingsPage: string
  onSelectSettingsPage: (page: string) => void
  compactSidebar: boolean
  onToggleCompactSidebar: () => void
  showAdvancedPages: boolean
  devicePanel: ReactNode
  profileSlot: ProfileSlot
  profileNames: Record<ProfileSlot, string>
  onSelectProfileSlot: (slot: ProfileSlot) => void
  activeRgbTab: RgbTab
  deviceConnected: boolean
  profileBusy: boolean
  canSaveAll: boolean
  saveState: 'idle' | 'sent'
  onSaveAll: () => void
  children: ReactNode
}

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
  profileSlot,
  profileNames,
  onSelectProfileSlot,
  activeRgbTab,
  deviceConnected,
  profileBusy,
  canSaveAll,
  saveState,
  onSaveAll,
  children,
}: AppShellProps) {
  const tr = useT()
  const [profileOpen, setProfileOpen] = useState(false)
  const showKeyboardArea = activeRail === 'keyboard'

  const sidebarItems = useMemo(() => {
    const items = [
      { id: 'actuation', label: tr('Actuation Point'), icon: <ArrowDownToLine size={18} />, advanced: false },
      { id: 'rapid', label: tr('Rapid Trigger'), icon: <RapidTriggerMenuIcon />, advanced: false },
      { id: 'stream', label: tr('Hall Stream'), icon: <Activity size={18} />, advanced: true },
      { id: 'rgb', label: tr('RGB Settings'), icon: <Lightbulb size={18} />, advanced: false },
      { id: 'remap', label: tr('Key Remap'), icon: <KeyRemapMenuIcon />, advanced: false },
      { id: 'advanced', label: tr('Advanced Keys'), icon: <AdvancedKeysMenuIcon />, advanced: false },
      { id: 'macros', label: tr('Macros'), icon: <ListOrdered size={18} />, advanced: false },
      { id: 'gamepad', label: tr('Gamepad'), icon: <Gamepad2 size={18} />, advanced: true },
    ]
    return items.filter((item) => showAdvancedPages || !item.advanced)
  }, [showAdvancedPages, tr])

  const keyboardSettingsItems = useMemo(() => [
    { id: 'general', label: tr('General Settings'), icon: <KeyboardMenuIcon /> },
    { id: 'switches', label: tr('Switch Selector'), icon: <SwitchStemMenuIcon /> },
  ], [tr])

  const uiSettingsItems = useMemo(() => [
    { id: 'interface', label: tr('Interface'), icon: <Palette size={18} /> },
    { id: 'background-service', label: tr('Background Service'), icon: <Activity size={18} /> },
    { id: 'diagnostics', label: tr('Diagnostics'), icon: <Stethoscope size={18} /> },
  ], [tr])

  return (
    <div className={`app-shell ${compactSidebar ? 'is-sidebar-compact' : ''}`}>
      <LegacyHostBanner />
      <LocalServicePermissionGuide />
      <aside className="rail">
        <div className="brand-mark"><img src={logo} alt={BRAND.displayName} /></div>
        <div className="rail-stack">
          <RailItem icon={<Keyboard size={22} />} label={tr('Keyboard')} active={activeRail === 'keyboard'} onClick={() => onSelectRail('keyboard')} />
          <RailItem icon={<Settings size={22} />} label={tr('Settings')} active={activeRail === 'settings'} onClick={() => onSelectRail('settings')} />
          <RailItem icon={<CircleHelp size={22} />} label={tr('Help')} active={activeRail === 'help'} onClick={() => onSelectRail('help')} />
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
            <SidebarItem icon={<Zap size={18} />} label={tr('Quick Settings')} active={activePage === 'quick'} onClick={() => onSelectPage('quick')} />
            <SidebarItem icon={<Sparkles size={18} />} label={tr('My Profile')} active={activePage === 'profile'} onClick={() => onSelectPage('profile')} />

            <div className="sidebar-section-label">{tr('Keyboard Configuration')}</div>
            {sidebarItems.map((item) => (
              <SidebarItem key={item.id} icon={item.icon} label={item.label} active={activePage === item.id} onClick={() => onSelectPage(item.id)} />
            ))}

            <div className="sidebar-version">{BRAND.displayName} <span>v{uiVersion} UI</span></div>
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
            {keyboardSettingsItems.map((item) => (
              <SidebarItem key={item.id} icon={item.icon} label={item.label} active={activeSettingsPage === item.id} onClick={() => onSelectSettingsPage(item.id)} />
            ))}

            <div className="sidebar-section-label">{tr('Interface settings')}</div>
            {uiSettingsItems.map((item) => (
              <SidebarItem key={item.id} icon={item.icon} label={item.label} active={activeSettingsPage === item.id} onClick={() => onSelectSettingsPage(item.id)} />
            ))}

            <div className="sidebar-version">{BRAND.displayName} <span>v{uiVersion} UI</span></div>
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
                <div className="page-title-bar"><span className="profile-icon"><ListOrdered size={17} /></span><strong>{tr('Macro library')}</strong></div>
              ) : showKeyboardArea ? (
                <>
                  <button className="profile-control" disabled={profileBusy} onClick={() => setProfileOpen(!profileOpen)}>
                    <span className="profile-icon"><Keyboard size={17} /></span>
                    <strong>{profileNames[profileSlot]}</strong>
                    <ChevronDown size={17} className={profileOpen ? 'rotate' : ''} />
                  </button>
                  {profileOpen && (
                    <div className="profile-menu">
                      {([0, 1, 2] as const).map((slot) => (
                        <button
                          key={slot}
                          className={profileSlot === slot ? 'is-selected' : ''}
                          disabled={profileBusy}
                          onClick={() => { setProfileOpen(false); onSelectProfileSlot(slot) }}
                        >
                          {profileNames[slot]} {profileSlot === slot && <span>{tr('Current')}</span>}
                        </button>
                      ))}
                      <button onClick={() => { onSelectPage('profile'); setProfileOpen(false) }}>{tr('Manage profile')}</button>
                    </div>
                  )}
                </>
              ) : (
                <div className="page-title-bar">
                  <span className="profile-icon"><Settings size={17} /></span>
                  <strong>{tr('Help')}</strong>
                </div>
              )}
            </div>

            <div className="topbar-actions">
              {showKeyboardArea && (activePage === 'gamepad' || (activePage === 'rgb' && activeRgbTab !== 'onboard')) ? (
                <span className="profile-status">{tr('Changes apply automatically')}</span>
              ) : showKeyboardArea && activePage === 'macros' ? (
                <span className="profile-status">{tr('Local + HERO68 macro library')}</span>
              ) : (
                <button
                  className="apply-button"
                  onClick={onSaveAll}
                  disabled={!deviceConnected || profileBusy || !canSaveAll}
                >
                  {profileBusy ? tr('Syncing…') : saveState === 'sent' ? tr('Saved to profile {slot}', { slot: profileSlot }) : tr('Save to profile {slot}', { slot: profileSlot })}
                </button>
              )}
            </div>
          </header>
        )}

        <div key={`${activeRail}:${activePage}:${activeSettingsPage}`} className="workspace-content" inert={profileBusy || undefined}>
          {children}
        </div>
      </main>
    </div>
  )
}

export default AppShell
