import { useEffect, useRef, useState } from 'react';
import type { ProfileSlot } from '../../protocol/hero68/types';
import type { ProfileDraft } from '../../state/persistence';

export type SlotHistoryEntry = {
  past: ProfileDraft[];
  future: ProfileDraft[];
  committed: ProfileDraft | null;
  committedFp: string;
  pendingBeforeBurst: ProfileDraft | null;
};

export function createEmptySlotHistories(): Record<ProfileSlot, SlotHistoryEntry> {
  return {
    0: { past: [], future: [], committed: null, committedFp: '', pendingBeforeBurst: null },
    1: { past: [], future: [], committed: null, committedFp: '', pendingBeforeBurst: null },
    2: { past: [], future: [], committed: null, committedFp: '', pendingBeforeBurst: null },
    3: { past: [], future: [], committed: null, committedFp: '', pendingBeforeBurst: null }
  };
}

export function draftEditableFingerprint(draft: ProfileDraft): string {
  return JSON.stringify({
    s: draft.assignedSwitchesByKey,
    a: draft.actuationByKey,
    rt: draft.rapidTriggerByKey,
    sp: draft.splitSensitivityByKey,
    rs: draft.rapidSensitivityByKey,
    ps: draft.pressSensitivityByKey,
    rls: draft.releaseSensitivityByKey,
    dz: draft.deadzoneEnabledByKey,
    tdz: draft.topDeadzoneByKey,
    bdz: draft.bottomDeadzoneByKey,
    rm: draft.remapLayers,
    ab: draft.advancedBindings,
    rgb: draft.rgb,
    dk: draft.dirtyKeys,
    dr: draft.dirtyRemaps,
    ui: draft.uiScalarValues
  });
}

export function pushSlotHistoryCommit(
  entry: SlotHistoryEntry,
  latestDraft: ProfileDraft,
  latestFp: string,
  maxDepth = 50
): void {
  if (entry.pendingBeforeBurst) {
    entry.past = [...entry.past.slice(-(maxDepth - 1)), entry.pendingBeforeBurst];
    entry.pendingBeforeBurst = null;
  }
  entry.committed = structuredClone(latestDraft);
  entry.committedFp = latestFp;
}

export function stepSlotUndo(entry: SlotHistoryEntry): ProfileDraft | null {
  if (entry.past.length === 0 || !entry.committed) {
    return null;
  }
  const previous = entry.past[entry.past.length - 1];
  entry.past = entry.past.slice(0, -1);
  entry.future = [...entry.future, structuredClone(entry.committed)];
  const prevClone = structuredClone(previous);
  entry.committed = prevClone;
  entry.committedFp = draftEditableFingerprint(prevClone);
  return prevClone;
}

export function stepSlotRedo(entry: SlotHistoryEntry): ProfileDraft | null {
  if (entry.future.length === 0 || !entry.committed) {
    return null;
  }
  const next = entry.future[entry.future.length - 1];
  entry.future = entry.future.slice(0, -1);
  entry.past = [...entry.past, structuredClone(entry.committed)];
  const nextClone = structuredClone(next);
  entry.committed = nextClone;
  entry.committedFp = draftEditableFingerprint(nextClone);
  return nextClone;
}

export interface UseSlotHistoryOptions {
  profileSlot: ProfileSlot;
  currentProfileDraft: () => ProfileDraft;
  applySnapshot: (target: ProfileDraft) => void;
  isBusy: () => boolean;
  trackDeps: readonly unknown[];
}

export function useSlotHistory({
  profileSlot,
  currentProfileDraft,
  applySnapshot,
  isBusy,
  trackDeps
}: UseSlotHistoryOptions) {
  const slotHistoriesRef = useRef<Record<ProfileSlot, SlotHistoryEntry>>(
    createEmptySlotHistories()
  );
  const suppressHistoryRef = useRef(false);
  const pointerDownRef = useRef(false);
  const burstTimerRef = useRef<number | null>(null);
  const [, setHistoryTick] = useState(0);

  function clearBurstTimer() {
    if (burstTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
    }
  }

  function flushPendingBurst(slot: ProfileSlot, latestDraft: ProfileDraft, latestFp: string) {
    clearBurstTimer();
    pushSlotHistoryCommit(slotHistoriesRef.current[slot], latestDraft, latestFp);
    setHistoryTick(v => v + 1);
  }

  function resetSlotHistoryBaseline(slot: ProfileSlot, baselineDraft?: ProfileDraft) {
    clearBurstTimer();
    const snap = structuredClone(baselineDraft ?? currentProfileDraft());
    const entry = slotHistoriesRef.current[slot];
    entry.past = [];
    entry.future = [];
    entry.pendingBeforeBurst = null;
    entry.committed = snap;
    entry.committedFp = draftEditableFingerprint(snap);
    setHistoryTick(v => v + 1);
  }

  function suppressNextHistoryRecord() {
    suppressHistoryRef.current = true;
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const onDown = (event: PointerEvent) => {
      if (event.target instanceof HTMLInputElement && event.target.type === 'color') {
        return;
      }
      pointerDownRef.current = true;
    };
    const onUp = () => {
      if (!pointerDownRef.current) {
        return;
      }
      pointerDownRef.current = false;
      const entry = slotHistoriesRef.current[profileSlot];
      if (entry.pendingBeforeBurst) {
        clearBurstTimer();
        burstTimerRef.current = window.setTimeout(() => {
          const snap = currentProfileDraft();
          flushPendingBurst(profileSlot, snap, draftEditableFingerprint(snap));
        }, 120);
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    window.addEventListener('blur', onUp);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      window.removeEventListener('blur', onUp);
    };
  });

  useEffect(() => {
    const draft = currentProfileDraft();
    const fp = draftEditableFingerprint(draft);
    const entry = slotHistoriesRef.current[profileSlot];
    if (suppressHistoryRef.current || entry.committed === null) {
      suppressHistoryRef.current = false;
      clearBurstTimer();
      entry.pendingBeforeBurst = null;
      entry.committed = structuredClone(draft);
      entry.committedFp = fp;
      setHistoryTick(v => v + 1);
      return;
    }
    if (fp === entry.committedFp) {
      return;
    }
    if (!entry.pendingBeforeBurst) {
      entry.pendingBeforeBurst = entry.committed;
      entry.future = [];
      setHistoryTick(v => v + 1);
    }
    clearBurstTimer();
    if (!pointerDownRef.current && typeof window !== 'undefined') {
      burstTimerRef.current = window.setTimeout(() => {
        flushPendingBurst(profileSlot, draft, fp);
      }, 240);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileSlot, ...trackDeps]);

  function undoProfileChange() {
    if (isBusy()) {
      return;
    }
    const entry = slotHistoriesRef.current[profileSlot];
    if (entry.pendingBeforeBurst) {
      const snap = currentProfileDraft();
      flushPendingBurst(profileSlot, snap, draftEditableFingerprint(snap));
    }
    const prevClone = stepSlotUndo(entry);
    if (!prevClone) {
      return;
    }
    suppressHistoryRef.current = true;
    applySnapshot(prevClone);
    setHistoryTick(v => v + 1);
  }

  function redoProfileChange() {
    if (isBusy()) {
      return;
    }
    const entry = slotHistoriesRef.current[profileSlot];
    const nextClone = stepSlotRedo(entry);
    if (!nextClone) {
      return;
    }
    suppressHistoryRef.current = true;
    applySnapshot(nextClone);
    setHistoryTick(v => v + 1);
  }

  const activeSlotHistory = slotHistoriesRef.current[profileSlot];
  const canUndo =
    activeSlotHistory.past.length > 0 || activeSlotHistory.pendingBeforeBurst !== null;
  const canRedo = activeSlotHistory.future.length > 0;

  return {
    suppressHistoryRef,
    suppressNextHistoryRecord,
    resetSlotHistoryBaseline,
    undoProfileChange,
    redoProfileChange,
    canUndo,
    canRedo
  };
}
