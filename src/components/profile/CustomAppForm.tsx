import { useState } from 'react';
import { AppWindow, ArrowLeft, Check, Folder, Terminal } from 'lucide-react';
import { useI18n } from '../../i18n';
import {
  MAX_FILTERS_PER_APP,
  type AppFilterMatchType,
  type CustomAppFilter,
  type LinkedAppRule
} from '../../state/profileTypes';

export interface CustomAppFormProps {
  initialRule?: LinkedAppRule | null;
  onCancel: () => void;
  onBackToSearch?: () => void;
  onConfirm: (rule: LinkedAppRule) => void;
}

/** Validates custom app rule according to Wootility GJ / zJ (L61441-L61465) */
export function validateCustomAppRule(
  appName: string,
  enabledKinds: Record<'processName' | 'processDirectory' | 'windowTitle', boolean>,
  values: Record<'processName' | 'processDirectory' | 'windowTitle', string>
): { valid: boolean; error?: string; filters: CustomAppFilter[] } {
  const filters: CustomAppFilter[] = [];
  if (enabledKinds.processName && values.processName.trim()) {
    filters.push({ kind: 'processName', value: values.processName.trim() });
  }
  if (enabledKinds.processDirectory && values.processDirectory.trim()) {
    filters.push({ kind: 'processDirectory', value: values.processDirectory.trim() });
  }
  if (enabledKinds.windowTitle && values.windowTitle.trim()) {
    filters.push({ kind: 'windowTitle', value: values.windowTitle.trim() });
  }
  if (filters.length === 0) {
    return {
      valid: false,
      error: 'Select at least one detection method and enter a value.',
      filters
    };
  }
  if (filters.length > MAX_FILTERS_PER_APP) {
    return {
      valid: false,
      error: `You can use up to ${MAX_FILTERS_PER_APP} detection methods per app.`,
      filters
    };
  }
  if (new TextEncoder().encode(appName.trim() || 'Unknown App').length > 120) {
    return {
      valid: false,
      error: 'App name is too long.',
      filters
    };
  }
  return { valid: true, filters };
}

export function CustomAppForm({
  initialRule,
  onCancel,
  onBackToSearch,
  onConfirm
}: CustomAppFormProps) {
  const { tr } = useI18n();
  const existingProcessName =
    initialRule?.filters.find(f => f.kind === 'processName')?.value ?? '';
  const existingDirectory =
    initialRule?.filters.find(f => f.kind === 'processDirectory')?.value ?? '';
  const existingWindowTitle =
    initialRule?.filters.find(f => f.kind === 'windowTitle')?.value ?? '';

  const [name, setName] = useState(initialRule?.name ?? '');
  const [matchType, setMatchType] = useState<AppFilterMatchType>(
    initialRule?.matchType ?? 'AllMatches'
  );
  const [enabledKinds, setEnabledKinds] = useState<{
    processName: boolean;
    processDirectory: boolean;
    windowTitle: boolean;
  }>({
    processName: Boolean(existingProcessName) || !initialRule,
    processDirectory: Boolean(existingDirectory),
    windowTitle: Boolean(existingWindowTitle)
  });
  const [values, setValues] = useState({
    processName: existingProcessName,
    processDirectory: existingDirectory,
    windowTitle: existingWindowTitle
  });
  const [error, setError] = useState<string | null>(null);

  function toggleKind(kind: 'processName' | 'processDirectory' | 'windowTitle') {
    setEnabledKinds(prev => ({
      ...prev,
      [kind]: !prev[kind]
    }));
    setError(null);
  }

  function handleSubmit() {
    const check = validateCustomAppRule(name, enabledKinds, values);
    if (!check.valid) {
      setError(check.error ?? 'Invalid rule');
      return;
    }
    const inferredName =
      name.trim() ||
      values.processName.trim() ||
      values.windowTitle.trim() ||
      'Unknown App';
    onConfirm({
      id: initialRule?.id ?? `custom-app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: inferredName,
      sourceType: 'custom',
      matchType,
      filters: check.filters
    });
  }

  return (
    <div className="woot-app-selector-box woot-slot-deepen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {onBackToSearch ? (
          <button type="button" className="ghost-button" onClick={onBackToSearch}>
            <ArrowLeft size={14} /> {tr('Back to search')}
          </button>
        ) : (
          <strong style={{ fontSize: 13 }}>{tr('Detection method')}</strong>
        )}
        <select
          aria-label="Filter match mode"
          value={matchType}
          onChange={e => setMatchType(e.target.value as AppFilterMatchType)}
          style={{
            background: 'var(--woot-elevation-sunken)',
            color: 'var(--woot-text-primary)',
            border: '1px solid var(--woot-border-default)',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 12
          }}
        >
          <option value="AllMatches">Match ALL selected rules (AND)</option>
          <option value="AnyMatches">Match ANY selected rule (OR)</option>
        </select>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--woot-text-subtle)' }}>
          {tr('App name')}
        </label>
        <input
          type="text"
          placeholder="e.g. Valorant / Counter-Strike 2"
          value={name}
          onChange={e => setName(e.target.value)}
          style={{
            width: '100%',
            height: 36,
            padding: '0 10px',
            borderRadius: 7,
            border: '1px solid var(--woot-border-default)',
            background: 'var(--woot-elevation-sunken)',
            color: 'var(--woot-text-strong)',
            fontSize: 13
          }}
        />
      </div>

      <p style={{ margin: 0, fontSize: 12, color: 'var(--woot-text-subtle)' }}>
        {tr('Choose how this app should be detected. You can combine multiple methods.')}
      </p>

      {/* 1. processName */}
      <div className="woot-linked-app-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={enabledKinds.processName}
            onChange={() => toggleKind('processName')}
          />
          <Terminal size={14} />
          <span>{tr('A specific app')}</span>
          <small style={{ color: 'var(--woot-text-subtle)', fontWeight: 400 }}>
            — {tr('Detect by its executable file (.exe).')}
          </small>
        </label>
        {enabledKinds.processName && (
          <input
            type="text"
            placeholder="e.g. Valorant.exe or *cs2*.exe"
            value={values.processName}
            onChange={e => {
              setValues(prev => ({ ...prev, processName: e.target.value }));
              setError(null);
            }}
            style={{
              width: '100%',
              height: 34,
              padding: '0 10px',
              borderRadius: 6,
              border: '1px solid var(--woot-border-default)',
              background: 'var(--woot-elevation-sunken)',
              color: 'var(--woot-text-strong)',
              fontSize: 12.5
            }}
          />
        )}
      </div>

      {/* 2. processDirectory */}
      <div className="woot-linked-app-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={enabledKinds.processDirectory}
            onChange={() => toggleKind('processDirectory')}
          />
          <Folder size={14} />
          <span>{tr('All apps from a folder')}</span>
          <small style={{ color: 'var(--woot-text-subtle)', fontWeight: 400 }}>
            — {tr('Detect any app running from a specific folder.')}
          </small>
        </label>
        {enabledKinds.processDirectory && (
          <input
            type="text"
            placeholder="e.g. C:\Program Files\AppName"
            value={values.processDirectory}
            onChange={e => {
              setValues(prev => ({ ...prev, processDirectory: e.target.value }));
              setError(null);
            }}
            style={{
              width: '100%',
              height: 34,
              padding: '0 10px',
              borderRadius: 6,
              border: '1px solid var(--woot-border-default)',
              background: 'var(--woot-elevation-sunken)',
              color: 'var(--woot-text-strong)',
              fontSize: 12.5
            }}
          />
        )}
      </div>

      {/* 3. windowTitle */}
      <div className="woot-linked-app-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={enabledKinds.windowTitle}
            onChange={() => toggleKind('windowTitle')}
          />
          <AppWindow size={14} />
          <span>{tr('By window title')}</span>
          <small style={{ color: 'var(--woot-text-subtle)', fontWeight: 400 }}>
            — {tr('Detect when the window title contains specific text.')}
          </small>
        </label>
        {enabledKinds.windowTitle && (
          <input
            type="text"
            placeholder="e.g. Minecraft or *Counter-Strike*"
            value={values.windowTitle}
            onChange={e => {
              setValues(prev => ({ ...prev, windowTitle: e.target.value }));
              setError(null);
            }}
            style={{
              width: '100%',
              height: 34,
              padding: '0 10px',
              borderRadius: 6,
              border: '1px solid var(--woot-border-default)',
              background: 'var(--woot-elevation-sunken)',
              color: 'var(--woot-text-strong)',
              fontSize: 12.5
            }}
          />
        )}
      </div>

      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--woot-danger-bg)' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="ghost-button" onClick={onCancel}>
          {tr('Cancel')}
        </button>
        <button type="button" className="apply-button" onClick={handleSubmit}>
          <Check size={14} /> {tr('Confirm')}
        </button>
      </div>
    </div>
  );
}
export default CustomAppForm;
