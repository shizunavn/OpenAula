import { useI18n } from '../../i18n';

type MacroDiscardModalProps = {
  draftName: string;
  deviceSaving: boolean;
  error: string;
  onCancel: () => void;
  onDiscard: () => void;
  onSaveAndContinue: () => void;
};

export function MacroDiscardModal({
  draftName,
  deviceSaving,
  error,
  onCancel,
  onDiscard,
  onSaveAndContinue
}: MacroDiscardModalProps) {
  const { tr } = useI18n();
  return (
    <div className="macro-modal-backdrop">
      <section
        className="macro-discard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="macro-draft-title"
      >
        <h2 id="macro-draft-title">{tr('Keep this draft?')}</h2>
        <p>
          {tr('Save “{name}” to your library before switching, or discard its unsaved edits.', {
            name: draftName
          })}
        </p>
        <div>
          <button autoFocus className="secondary-button" onClick={onCancel}>
            {tr('Cancel')}
          </button>
          <button className="secondary-button" onClick={onDiscard}>
            {tr('Discard edits')}
          </button>
          <button className="apply-button" disabled={deviceSaving} onClick={onSaveAndContinue}>
            {deviceSaving ? tr('Saving…') : tr('Save & continue')}
          </button>
        </div>
        {error && <p role="alert">{tr(error)}</p>}
      </section>
    </div>
  );
}
