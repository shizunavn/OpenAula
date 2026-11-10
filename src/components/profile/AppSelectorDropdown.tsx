import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Disc, Gamepad2, HardDrive, Plus, Search, Terminal } from 'lucide-react';
import { useI18n } from '../../i18n';
import {
  fetchLinkableApps,
  fetchOpenWindows,
  useBgService,
  type InstalledLinkableApp,
  type OpenWindowApp
} from '../../protocol/bgServiceClient';
import type { LinkedAppRule } from '../../state/profileTypes';
import { CustomAppForm } from './CustomAppForm';

export interface AppSelectorDropdownProps {
  profileNameByExe: ReadonlyMap<string, string>;
  onSelectRule: (rule: LinkedAppRule) => void;
  onCancel: () => void;
}

export function AppSelectorDropdown({
  profileNameByExe,
  onSelectRule,
  onCancel
}: AppSelectorDropdownProps) {
  const { tr } = useI18n();
  const { openWindows, installedApps } = useBgService();
  const [query, setQuery] = useState('');
  const [customMode, setCustomMode] = useState(false);

  // Refresh openWindows and installedApps when dropdown mounts (mirrors L61550)
  useEffect(() => {
    void fetchOpenWindows();
    void fetchLinkableApps();
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredRunning = useMemo(() => {
    return openWindows.filter(win => {
      if (!normalizedQuery) return true;
      return (
        win.exe.toLowerCase().includes(normalizedQuery) ||
        win.title.toLowerCase().includes(normalizedQuery) ||
        win.path.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [normalizedQuery, openWindows]);

  const filteredInstalled = useMemo(() => {
    const runningExes = new Set(openWindows.map(w => w.exe.toLowerCase()));
    return installedApps.filter(app => {
      if (runningExes.has(app.exe.toLowerCase())) {
        return false;
      }
      if (!normalizedQuery) return true;
      return (
        app.name.toLowerCase().includes(normalizedQuery) ||
        app.exe.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [installedApps, normalizedQuery, openWindows]);

  if (customMode) {
    return (
      <CustomAppForm
        onBackToSearch={() => setCustomMode(false)}
        onCancel={onCancel}
        onConfirm={onSelectRule}
      />
    );
  }

  function handlePickRunning(win: OpenWindowApp) {
    onSelectRule({
      id: `run-${win.exe}-${Date.now()}`,
      name: win.title ? `${win.exe} (${win.title.slice(0, 32)})` : win.exe,
      sourceType: 'running',
      matchType: 'AllMatches',
      filters: [{ kind: 'processName', value: win.exe }]
    });
  }

  function handlePickInstalled(app: InstalledLinkableApp) {
    onSelectRule({
      id: `inst-${app.id}-${Date.now()}`,
      name: app.name || app.exe,
      sourceType: app.sourceType,
      steamAppId: app.steamAppId,
      matchType: 'AllMatches',
      filters: [
        app.exe
          ? { kind: 'processName', value: app.exe }
          : { kind: 'processDirectory', value: app.directory }
      ]
    });
  }

  return (
    <div className="woot-app-selector-box woot-slot-deepen">
      <div className="woot-search-box">
        <Search size={15} />
        <input
          type="search"
          placeholder={tr('Search...')}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="woot-app-group-list">
        {/* Group 1: RUNNING (openWindows) */}
        {filteredRunning.length > 0 && (
          <div>
            <div className="woot-profile-section-header" style={{ marginBottom: 4 }}>
              <span>{tr('Running')}</span>
              <span>{filteredRunning.length}</span>
            </div>
            {filteredRunning.map(win => {
              const conflictProfile = profileNameByExe.get(win.exe.toLowerCase());
              return (
                <button
                  key={`${win.pid}-${win.exe}`}
                  type="button"
                  className="woot-app-option-row"
                  onClick={() => handlePickRunning(win)}
                  title={
                    conflictProfile
                      ? tr('Linked to {name} profile. Selecting will replace the existing link.', {
                          name: conflictProfile
                        })
                      : win.path
                  }
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Terminal size={15} color="#4ade80" />
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block', fontSize: 13 }}>{win.exe}</strong>
                      {win.title && (
                        <small
                          style={{
                            display: 'block',
                            fontSize: 11.5,
                            color: 'var(--woot-text-subtle)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {win.title}
                        </small>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {conflictProfile && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          color: 'var(--woot-warning-bg)'
                        }}
                      >
                        <AlertTriangle size={13} />
                        {conflictProfile}
                      </span>
                    )}
                    <span className="woot-shortcut-pill">EXE</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Group 2: INSTALLED (Steam + Disk) */}
        {filteredInstalled.length > 0 && (
          <div style={{ marginTop: filteredRunning.length > 0 ? 8 : 0 }}>
            <div className="woot-profile-section-header" style={{ marginBottom: 4 }}>
              <span>{tr('Installed')}</span>
              <span>{filteredInstalled.length}</span>
            </div>
            {filteredInstalled.map(app => {
              const conflictProfile = profileNameByExe.get(app.exe.toLowerCase());
              return (
                <button
                  key={app.id}
                  type="button"
                  className="woot-app-option-row"
                  onClick={() => handlePickInstalled(app)}
                  title={
                    conflictProfile
                      ? tr('Linked to {name} profile. Selecting will replace the existing link.', {
                          name: conflictProfile
                        })
                      : app.path
                  }
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {app.sourceType === 'steam' ? (
                      <Gamepad2 size={15} color="#60a5fa" />
                    ) : (
                      <HardDrive size={15} color="#a6adb5" />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block', fontSize: 13 }}>{app.name}</strong>
                      <small style={{ fontSize: 11.5, color: 'var(--woot-text-subtle)' }}>
                        {app.exe}
                      </small>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {conflictProfile && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          color: 'var(--woot-warning-bg)'
                        }}
                      >
                        <AlertTriangle size={13} />
                        {conflictProfile}
                      </span>
                    )}
                    <span className="woot-shortcut-pill">
                      {app.sourceType === 'steam' ? 'STEAM' : 'DISK'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {filteredRunning.length === 0 && filteredInstalled.length === 0 && (
          <div
            style={{
              padding: '16px 10px',
              textAlign: 'center',
              color: 'var(--woot-text-subtle)',
              fontSize: 12.5
            }}
          >
            <Disc size={18} style={{ marginBottom: 4, opacity: 0.65 }} />
            <div>{tr('No matching apps')}</div>
          </div>
        )}
      </div>

      {/* Footer trigger: "App not listed? Add it manually." (L61420) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--woot-border-default)',
          paddingTop: 8
        }}
      >
        <button
          type="button"
          className="secondary-button"
          onClick={() => setCustomMode(true)}
          style={{ fontSize: 12.5 }}
        >
          <Plus size={14} /> {tr('App not listed? Add it manually.')}
        </button>
        <button type="button" className="ghost-button" onClick={onCancel}>
          {tr('Cancel')}
        </button>
      </div>
    </div>
  );
}
export default AppSelectorDropdown;
