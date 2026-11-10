import { useEffect } from 'react';
import { useI18n } from '../../i18n';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
    return true;
  }
  return Boolean(target.closest('[contenteditable="true"], .ak-physical-input, .ak-tester'));
}

export interface SelectionActionsProps {
  hasSelection: boolean;
  allSelected: boolean;
  onSelectAll: () => void;
  onDiscardSelection: () => void;
  enableShortcuts?: boolean;
}

export function SelectionActions({
  hasSelection,
  allSelected,
  onSelectAll,
  onDiscardSelection,
  enableShortcuts = true
}: SelectionActionsProps) {
  const { tr } = useI18n();

  useEffect(() => {
    if (!enableShortcuts) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || document.querySelector('.is-recording')) {
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'a'
      ) {
        event.preventDefault();
        if (!allSelected) {
          onSelectAll();
        }
      } else if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (hasSelection) {
          event.preventDefault();
          onDiscardSelection();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [allSelected, enableShortcuts, hasSelection, onDiscardSelection, onSelectAll]);

  return (
    <div className="selection-actions">
      <span className="selection-action-wrap">
        <span className="selection-shortcut-tooltip" aria-hidden="true">
          <kbd>L-Ctrl</kbd>
          <kbd>A</kbd>
        </span>
        <button
          type="button"
          className="secondary-button"
          disabled={allSelected}
          aria-pressed={allSelected}
          aria-keyshortcuts="Control+A"
          onClick={onSelectAll}
        >
          {tr('Select all keys')}
        </button>
      </span>
      <span className="selection-action-wrap">
        <span className="selection-shortcut-tooltip" aria-hidden="true">
          <kbd>Esc</kbd>
        </span>
        <button
          type="button"
          className={hasSelection ? 'secondary-button' : 'ghost-button'}
          disabled={!hasSelection}
          aria-keyshortcuts="Escape"
          onClick={onDiscardSelection}
        >
          {tr('Discard selection')}
        </button>
      </span>
    </div>
  );
}
