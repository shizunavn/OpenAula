import { useState, type ChangeEvent } from 'react';
import { AlertTriangle, Check, Upload, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { HeroDeviceModelId } from '../../keyboard/devices';
import { decodeProfileShareCode, type StoredProfileRecord } from '../../state/profileTypes';

export interface ImportProfileModalProps {
  currentDeviceModel: HeroDeviceModelId;
  onClose: () => void;
  onImport: (record: StoredProfileRecord) => void;
}

export function ImportProfileModal({
  currentDeviceModel,
  onClose,
  onImport
}: ImportProfileModalProps) {
  const { tr } = useI18n();
  const [codeInput, setCodeInput] = useState('');
  const [parsedRecord, setParsedRecord] = useState<StoredProfileRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  function tryDecode(raw: string) {
    setCodeInput(raw);
    if (!raw.trim()) {
      setParsedRecord(null);
      setError(null);
      return;
    }
    try {
      const rec = decodeProfileShareCode(raw);
      setParsedRecord(rec);
      setError(null);
    } catch {
      setParsedRecord(null);
      setError('Invalid profile share code or JSON file.');
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        tryDecode(reader.result);
      }
    };
    reader.readAsText(file);
  }

  const isDifferentModel =
    parsedRecord && parsedRecord.metadata.createdFor !== currentDeviceModel;

  return (
    <div className="woot-modal-backdrop" onClick={onClose}>
      <div
        className="woot-modal-dialog is-compact"
        role="dialog"
        aria-modal="true"
        aria-label={tr('Import a Profile')}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--woot-border-default)'
          }}
        >
          <h2 style={{ margin: 0, fontSize: 17 }}>{tr('Import a Profile')}</h2>
          <button type="button" className="icon-button compact" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="woot-editor-body">
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--woot-text-subtle)',
                marginBottom: 6
              }}
            >
              Paste Share Code (`OA2-...`) or JSON
            </label>
            <textarea
              rows={4}
              placeholder="OA2-eyJzY2hlbWEiOi..."
              value={codeInput}
              onChange={e => tryDecode(e.target.value)}
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 8,
                border: '1px solid var(--woot-border-default)',
                background: 'var(--woot-elevation-sunken)',
                color: 'var(--woot-text-strong)',
                fontSize: 12.5,
                resize: 'vertical'
              }}
            />
          </div>

          <div>
            <label
              className="secondary-button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontSize: 12.5
              }}
            >
              <Upload size={14} /> Upload `.json` profile file
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </label>
          </div>

          {parsedRecord && (
            <div className="woot-linked-app-row">
              <div>
                <strong style={{ display: 'block', fontSize: 14 }}>
                  {parsedRecord.metadata.name}
                </strong>
                <small style={{ color: 'var(--woot-text-subtle)', fontSize: 11.5 }}>
                  Target model: {parsedRecord.metadata.createdFor} ·{' '}
                  {parsedRecord.metadata.linkedApps.length} linked apps
                </small>
              </div>
              <span className="woot-badge-default">READY</span>
            </div>
          )}

          {/* Compatibility warning (Profiles_ImportModal_CompatibilityWarning, L63495) */}
          {isDifferentModel && (
            <div className="woot-bg-warning-banner">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <AlertTriangle size={16} />
                <span>
                  This profile was created for <strong>{parsedRecord.metadata.createdFor}</strong>.
                  Keys that do not exist on <strong>{currentDeviceModel}</strong> will be ignored.
                </span>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--woot-danger-bg)' }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="ghost-button" onClick={onClose}>
              {tr('Cancel')}
            </button>
            <button
              type="button"
              className="apply-button"
              disabled={!parsedRecord}
              onClick={() => {
                if (parsedRecord) {
                  onImport(parsedRecord);
                  onClose();
                }
              }}
            >
              <Check size={14} /> {tr('Import')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default ImportProfileModal;
