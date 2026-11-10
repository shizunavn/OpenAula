import { useMemo, useState } from 'react';
import { CheckCircle2, Edit3, Link2, Plus, Trash2, AlertCircle } from 'lucide-react';
import { useI18n } from '../../i18n';
import {
  loadCachedLinkedApps,
  rememberLinkedAppRule,
  useBgService
} from '../../protocol/bgServiceClient';
import type { LinkedAppRule, StoredProfileRecord } from '../../state/profileTypes';
import { AppSelectorDropdown } from './AppSelectorDropdown';
import { CustomAppForm } from './CustomAppForm';

export interface LinkedAppsListProps {
  currentProfileUid: string;
  linkedApps: LinkedAppRule[];
  allProfiles?: StoredProfileRecord[];
  onChange: (nextApps: LinkedAppRule[]) => void;
  onOpenBgServiceSettings?: () => void;
}

export function LinkedAppsList({
  currentProfileUid,
  linkedApps,
  allProfiles = [],
  onChange,
  onOpenBgServiceSettings
}: LinkedAppsListProps) {
  const { tr } = useI18n();
  const {
    hasBgService,
    isServiceOutdated,
    serviceVersion,
    requiredServiceVersion
  } = useBgService();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [cachedApps, setCachedApps] = useState<LinkedAppRule[]>(() => loadCachedLinkedApps());

  // Map exe -> profile name across other profiles (mirrors L61500-L61515 in wootility.readable.js)
  const profileNameByExe = useMemo(() => {
    const map = new Map<string, string>();
    for (const rec of allProfiles) {
      if (rec.metadata.uid === currentProfileUid) continue;
      for (const app of rec.metadata.linkedApps ?? []) {
        for (const f of app.filters) {
          if (f.kind === 'processName') {
            map.set(f.value.toLowerCase(), rec.metadata.name);
          }
        }
      }
    }
    return map;
  }, [allProfiles, currentProfileUid]);

  // Filter cached apps that are not already in linkedApps
  const availableCachedApps = useMemo(() => {
    const existingNames = new Set(linkedApps.map(a => a.name.toLowerCase()));
    return cachedApps.filter(a => !existingNames.has(a.name.toLowerCase())).slice(0, 6);
  }, [cachedApps, linkedApps]);

  function handleAddRule(rule: LinkedAppRule) {
    const updatedCache = rememberLinkedAppRule(rule);
    setCachedApps(updatedCache);
    onChange([...linkedApps, rule]);
    setSelectorOpen(false);
  }

  function handleUpdateRule(updated: LinkedAppRule) {
    const updatedCache = rememberLinkedAppRule(updated);
    setCachedApps(updatedCache);
    onChange(linkedApps.map(item => (item.id === updated.id ? updated : item)));
    setEditingRuleId(null);
  }

  function handleRemoveRule(id: string) {
    onChange(linkedApps.filter(item => item.id !== id));
  }

  return (
    <div className="woot-linked-apps-panel">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>
            {tr('Linked Applications')}
          </h3>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--woot-text-subtle)' }}>
            {tr(
              'Your device will automatically switch to this profile when a linked application is your active window.'
            )}
          </p>
        </div>

        {/* Service status badge (Y0 status success/warning, L61680) */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            borderRadius: 999,
            fontSize: 11.5,
            fontWeight: 700,
            background: hasBgService
              ? 'rgba(74, 222, 128, 0.12)'
              : 'rgba(250, 204, 21, 0.12)',
            color: hasBgService ? '#4ade80' : '#facc15',
            whiteSpace: 'nowrap'
          }}
        >
          {hasBgService ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {hasBgService
            ? `${tr('Background service is running. App detection is active.')} (v${serviceVersion || requiredServiceVersion})`
            : isServiceOutdated
              ? `${tr('Background Service update to v1.8.0 required')} (v${serviceVersion})`
              : `${tr('Background service is not running. App detection will not work.')} (v${requiredServiceVersion}+)`}
        </span>
      </div>

      {!hasBgService && onOpenBgServiceSettings && (
        <div className="woot-bg-warning-banner">
          <div>
            <strong>
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
          <button type="button" onClick={onOpenBgServiceSettings}>
            {tr('Go to Background Service')}
          </button>
        </div>
      )}

      {/* Existing linked apps list */}
      {linkedApps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {linkedApps.map(rule =>
            editingRuleId === rule.id ? (
              <CustomAppForm
                key={rule.id}
                initialRule={rule}
                onCancel={() => setEditingRuleId(null)}
                onConfirm={handleUpdateRule}
              />
            ) : (
              <div key={rule.id} className="woot-linked-app-row woot-slot-shallow">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Link2 size={15} color="var(--woot-cta-bg)" />
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: 13.5 }}>
                      {rule.name || 'Unknown App'}
                    </strong>
                    <small style={{ color: 'var(--woot-text-subtle)', fontSize: 11.5 }}>
                      {rule.filters
                        .map(f => `${f.kind}: ${f.value}`)
                        .join(rule.matchType === 'AnyMatches' ? ' OR ' : ' AND ')}
                    </small>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    className="icon-button compact"
                    title={tr('Edit')}
                    onClick={() => setEditingRuleId(rule.id)}
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button compact"
                    title={tr('Remove')}
                    onClick={() => handleRemoveRule(rule.id)}
                  >
                    <Trash2 size={14} color="var(--woot-danger-bg)" />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Smooth transition between dashed button and AppSelectorDropdown (B7 deepen/shallow, L61630-L61670) */}
      {selectorOpen ? (
        <AppSelectorDropdown
          profileNameByExe={profileNameByExe}
          onSelectRule={handleAddRule}
          onCancel={() => setSelectorOpen(false)}
        />
      ) : (
        <button
          type="button"
          className="woot-dashed-link-btn woot-slot-shallow"
          onClick={() => setSelectorOpen(true)}
        >
          <Plus size={16} />
          {linkedApps.length === 0
            ? tr('Link an application')
            : tr('Link another application')}
        </button>
      )}

      {/* Previously linked apps quick chips (L92668-L92708) */}
      {availableCachedApps.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <small
            style={{
              display: 'block',
              fontSize: 11.5,
              color: 'var(--woot-text-subtle)',
              marginBottom: 6
            }}
          >
            {tr('Previously linked apps')}
          </small>
          <div className="woot-prev-apps-chips">
            {availableCachedApps.map(app => (
              <button
                key={app.id}
                type="button"
                className="woot-prev-app-chip"
                onClick={() =>
                  handleAddRule({
                    ...app,
                    id: `cached-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
                  })
                }
              >
                <span>{app.name}</span>
                <Plus size={12} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
export default LinkedAppsList;
