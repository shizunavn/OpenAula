import { useState } from 'react';
import { isWholeKeyboardSelected, normalizeHero68Selection } from '../helpers';
export type UseKeySelectionOptions = {
  initialSelectedKeys: readonly string[] | undefined;
  initialKeyIds: readonly string[];
  modelKeyIds: readonly string[];
  keyIdSet: ReadonlySet<string>;
  onBeforeDiscardSelection?: () => void;
};
export function useKeySelection({
  initialSelectedKeys,
  initialKeyIds,
  modelKeyIds,
  keyIdSet,
  onBeforeDiscardSelection
}: UseKeySelectionOptions) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() =>
    normalizeHero68Selection(initialSelectedKeys ?? [], initialKeyIds)
  );
  const hasSelection = selectedKeys.size > 0;
  const allSelected = isWholeKeyboardSelected(selectedKeys, modelKeyIds);
  function toggleKey(keyId: string) {
    if (!keyIdSet.has(keyId)) {
      return;
    }
    setSelectedKeys(previous => {
      const next = normalizeHero68Selection(previous, modelKeyIds);
      if (next.has(keyId)) {
        next.delete(keyId);
      } else {
        next.add(keyId);
      }
      return next;
    });
  }
  function selectAll() {
    setSelectedKeys(previous => {
      if (isWholeKeyboardSelected(previous, modelKeyIds) && previous.size === modelKeyIds.length) {
        return previous;
      }
      return new Set(modelKeyIds);
    });
  }
  function discardSelection() {
    onBeforeDiscardSelection?.();
    setSelectedKeys(previous => (previous.size === 0 ? previous : new Set()));
  }
  function normalizeForModel(nextKeyIds: readonly string[]) {
    setSelectedKeys(previous => normalizeHero68Selection(previous, nextKeyIds));
  }
  return {
    selectedKeys,
    setSelectedKeys,
    hasSelection,
    allSelected,
    toggleKey,
    selectAll,
    discardSelection,
    normalizeForModel
  };
}
