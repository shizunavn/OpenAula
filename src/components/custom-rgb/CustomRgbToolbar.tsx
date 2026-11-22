import { Play, Save, Square } from 'lucide-react';
import { RgbToolbarSlot } from '../RgbWorkspace';
import { UndoRedoButtons } from '../../app/components/UndoRedoButtons';
import { useI18n } from '../../i18n';
import type { useCustomRgbPlayback } from '../useCustomRgbPlayback';

type CustomRgbToolbarProps = {
  visible: boolean;
  isWin68: boolean;
  demo: boolean;
  disabled: boolean;
  locked: boolean;
  playback: ReturnType<typeof useCustomRgbPlayback>;
  previewError: string | null;
  canUndo: boolean;
  canRedo: boolean;
  enableUndoShortcuts: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onStartCustom: () => void;
  onSaveRgbPreset?: () => void;
  savedNotice?: string | null;
};

export function CustomRgbToolbar({
  visible,
  isWin68,
  demo,
  disabled,
  locked,
  playback,
  previewError,
  canUndo,
  canRedo,
  enableUndoShortcuts,
  onUndo,
  onRedo,
  onStartCustom,
  onSaveRgbPreset,
  savedNotice
}: CustomRgbToolbarProps) {
  const { tr } = useI18n();
  const { status, checking, applied, updateRequired } = playback;
  return (
    <>
      <RgbToolbarSlot visible={visible}>
        <span
          className="rgb-sync-note"
          data-attention={
            playback.reconnecting ||
            playback.conflict ||
            (!applied && status?.mode === 'custom') ||
            undefined
          }
          role="status"
        >
          {playback.reconnecting
            ? tr('Reconnecting to background app…')
            : playback.conflict
              ? tr('Changes paused')
              : applied
                ? tr(playback.syncing ? 'Syncing changes…' : 'Auto sync')
                : status?.mode === 'custom'
                  ? tr('Joining running Custom…')
                  : demo
                    ? tr('Simulation')
                    : null}
        </span>
        {onUndo && onRedo && (
          <UndoRedoButtons
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
            disabled={disabled}
            enableShortcuts={visible && enableUndoShortcuts}
          />
        )}
        {!applied && (
          <button
            className="apply-button"
            disabled={disabled || (!isWin68 && (checking || locked))}
            onClick={onStartCustom}
          >
            <Play size={15} />
            {playback.busy
              ? tr('Working…')
              : !isWin68 && updateRequired
                ? tr('Update app')
                : tr('Start Custom')}
          </button>
        )}
        {(status?.enabled || (isWin68 && applied)) && (
          <button
            className="secondary-button"
            title={tr('Return to onboard')}
            disabled={disabled}
            onClick={() => void playback.onboard()}
          >
            <Square size={14} />
            {tr('Back to onboard')}
          </button>
        )}
        {onSaveRgbPreset && (
          <button
            type="button"
            className="secondary-button"
            disabled={disabled}
            onClick={onSaveRgbPreset}
          >
            <Save size={15} /> {savedNotice ?? tr('Save')}
          </button>
        )}
      </RgbToolbarSlot>
      <RgbToolbarSlot visible={visible} notice>
        {playback.backup && (
          <div className="rgb-draft-recovery">
            <span>
              {tr(
                playback.conflict
                  ? 'Changes paused · restore your draft to continue'
                  : 'Your previous draft is available.'
              )}
            </span>
            <button
              className="secondary-button"
              disabled={disabled}
              onClick={playback.restoreDraft}
            >
              {tr('Restore draft')}
            </button>
          </div>
        )}
        {(playback.error || previewError) && (
          <p className="stream-error" role="alert">
            {tr(playback.error || previewError || '')}
          </p>
        )}
        {status?.enabled &&
          status.mode === 'custom' &&
          status.lastError &&
          !(isWin68 && status.lastError.includes('RGB write failed')) && (
            <p className="stream-error" role="alert">
              {status.lastError}
            </p>
          )}
      </RgbToolbarSlot>
    </>
  );
}
