import { XSYD_DKS_DOC_URL } from '../../keyboard/registry';
import { useI18n } from '../../i18n';

export function DksUnsupportedModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tr } = useI18n();
  if (!open) {
    return null;
  }
  return (
    <div className="ak-modal-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ak-dks-unsupported-title"
        className="ak-remove-modal ak-dks-unsupported-modal"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="ak-dks-unsupported-title">{tr('DKS is not supported on WIN 68 HE MAX')}</h2>
        <p>
          {tr(
            'The firmware supports DKS, but its frame layout has not been verified by USB capture yet, so OpenAula blocks writing it to avoid corrupting your key configuration.'
          )}
        </p>
        <p>{tr('MT, TGL, MPT, and END are verified and ready to use.')}</p>
        <div>
          <a
            className="secondary-button ak-doc-link"
            href={XSYD_DKS_DOC_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {tr('View documentation')}
          </a>
          <button type="button" autoFocus className="apply-button" onClick={onClose}>
            {tr('Close')}
          </button>
        </div>
      </section>
    </div>
  );
}
