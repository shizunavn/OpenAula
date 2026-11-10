import { Trash2, X } from 'lucide-react';
import { useI18n } from '../../i18n';

export interface DeleteProfileDialogProps {
  profileName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteProfileDialog({
  profileName,
  onCancel,
  onConfirm
}: DeleteProfileDialogProps) {
  const { tr } = useI18n();

  return (
    <div className="woot-modal-backdrop" onClick={onCancel}>
      <div
        className="woot-modal-dialog is-compact"
        role="alertdialog"
        aria-modal="true"
        aria-label={tr('Delete profile')}
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
          <h2 style={{ margin: 0, fontSize: 17 }}>{tr('Delete profile')}</h2>
          <button type="button" className="icon-button compact" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>

        <div className="woot-editor-body">
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--woot-text-primary)', lineHeight: 1.5 }}>
            {tr('Are you sure you want to remove this profile? This action cannot be undone.')}
          </p>
          <div className="woot-linked-app-row">
            <strong>{profileName}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="ghost-button" onClick={onCancel}>
              {tr('Cancel')}
            </button>
            <button
              type="button"
              className="secondary-button"
              style={{
                background: 'var(--woot-danger-secondary-bg)',
                borderColor: 'var(--woot-border-danger)',
                color: 'var(--woot-danger-bg)'
              }}
              onClick={() => {
                onConfirm();
                onCancel();
              }}
            >
              <Trash2 size={14} /> {tr('Delete')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default DeleteProfileDialog;
