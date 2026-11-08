import { useRef, useState } from 'react';
import { advancedEqual, type AdvancedBinding } from '../../protocol/hero68/advanced';
import { defaultRemapLayers, type RemapLayer, type RemapLayers } from '../../protocol/hero68/remap';
import {
  restoreStoredRgb,
  rgbChanges,
  rgbDirtyCount,
  type RgbProfile
} from '../../protocol/hero68/rgb';
import type { ProfileSlot } from '../../protocol/hero68/types';
import type { PersistedOpenHeroState, ProfileDraft } from '../../state/persistence';
export type UseProfileWorkspaceOptions = {
  persistedState: PersistedOpenHeroState | null | undefined;
  modelKeyIds: readonly string[];
};
export function useProfileWorkspace({ persistedState, modelKeyIds }: UseProfileWorkspaceOptions) {
  const [saveState, setSaveState] = useState<'idle' | 'sent'>('idle');
  const [profileSlot, setProfileSlot] = useState<ProfileSlot>(
    () => persistedState?.profileSlot ?? 1
  );
  const initialDraft = persistedState?.profileDrafts?.[persistedState?.profileSlot ?? 1];
  const [rgb, setRgb] = useState<RgbProfile>(() =>
    restoreStoredRgb(initialDraft?.rgb, initialDraft?.rgbFormat)
  );
  const [rgbBaseline, setRgbBaseline] = useState<RgbProfile>(() =>
    restoreStoredRgb(initialDraft?.rgbBaseline, initialDraft?.rgbFormat)
  );
  const [rgbHydratedSlot, setRgbHydratedSlot] = useState<ProfileSlot | null>(null);
  const rgbDirty = rgbChanges(rgb, rgbBaseline, modelKeyIds);
  const rgbPending = rgbDirtyCount(rgbDirty);
  const [loadedProfileSlot, setLoadedProfileSlot] = useState<ProfileSlot | null>(null);
  const [remapLayers, setRemapLayers] = useState<RemapLayers>(() => {
    const base = defaultRemapLayers(modelKeyIds);
    if (!persistedState?.remapLayers) {
      return base;
    }
    return {
      0: {
        ...base[0],
        ...persistedState.remapLayers[0]
      },
      1: {
        ...base[1],
        ...persistedState.remapLayers[1]
      },
      2: {
        ...base[2],
        ...persistedState.remapLayers[2]
      }
    };
  });
  const [dirtyRemaps, setDirtyRemaps] = useState<Set<string>>(
    () => new Set(initialDraft?.dirtyRemaps ?? [])
  );
  const [profileNames, setProfileNames] = useState<Record<ProfileSlot, string>>(() => ({
    0: 'Onboard Profile 0',
    1: 'Onboard Profile 1',
    2: 'Onboard Profile 2',
    ...persistedState?.profileNames
  }));
  const [profileDrafts, setProfileDrafts] = useState<Partial<Record<ProfileSlot, ProfileDraft>>>(
    () => persistedState?.profileDrafts ?? {}
  );
  const [profileBusy, setProfileBusy] = useState(false);
  const [advancedBindings, setAdvancedBindings] = useState<AdvancedBinding[]>(
    () => initialDraft?.advancedBindings ?? []
  );
  const [advancedBaseline, setAdvancedBaseline] = useState<AdvancedBinding[]>(
    () => initialDraft?.advancedBaseline ?? []
  );
  const [advancedHydratedSlot, setAdvancedHydratedSlot] = useState<ProfileSlot | null>(null);
  const [advancedReadError, setAdvancedReadError] = useState<string | null>(null);
  const advancedPending = !advancedEqual(advancedBindings, advancedBaseline);
  const profileBusyRef = useRef(false);
  const remapBaselineRef = useRef<RemapLayers>(
    initialDraft?.remapBaseline ?? defaultRemapLayers(modelKeyIds)
  );
  function assignRemap(layer: RemapLayer, keyId: string, value: number) {
    if (profileBusyRef.current || remapLayers[layer][keyId] === value) {
      return;
    }
    setRemapLayers(previous => ({
      ...previous,
      [layer]: {
        ...previous[layer],
        [keyId]: value
      }
    }));
    setDirtyRemaps(previous => {
      const next = new Set(previous);
      if (remapBaselineRef.current[layer][keyId] === value) {
        next.delete(`${layer}:${keyId}`);
      } else {
        next.add(`${layer}:${keyId}`);
      }
      return next;
    });
    setSaveState('idle');
  }
  function copyRemapLayer(source: RemapLayer, target: RemapLayer) {
    if (profileBusyRef.current) {
      return;
    }
    const keys = modelKeyIds.filter(
      keyId => remapLayers[source][keyId] !== remapLayers[target][keyId]
    );
    setRemapLayers(previous => ({
      ...previous,
      [target]: {
        ...previous[source]
      }
    }));
    setDirtyRemaps(previous => {
      const next = new Set(previous);
      for (const keyId of keys) {
        if (remapBaselineRef.current[target][keyId] === remapLayers[source][keyId]) {
          next.delete(`${target}:${keyId}`);
        } else {
          next.add(`${target}:${keyId}`);
        }
      }
      return next;
    });
    setSaveState('idle');
  }
  function expandWorkspaceForModel(nextKeyIds: readonly string[]) {
    const fallbackRemap = defaultRemapLayers(nextKeyIds);
    setRemapLayers(previous => ({
      0: {
        ...fallbackRemap[0],
        ...previous[0]
      },
      1: {
        ...fallbackRemap[1],
        ...previous[1]
      },
      2: {
        ...fallbackRemap[2],
        ...previous[2]
      }
    }));
    remapBaselineRef.current = {
      0: {
        ...fallbackRemap[0],
        ...remapBaselineRef.current[0]
      },
      1: {
        ...fallbackRemap[1],
        ...remapBaselineRef.current[1]
      },
      2: {
        ...fallbackRemap[2],
        ...remapBaselineRef.current[2]
      }
    };
    setRgb(previous => {
      const colors = {
        ...previous.colors
      };
      for (const id of nextKeyIds) {
        if (!colors[id]) {
          colors[id] = [255, 255, 255];
        }
      }
      return {
        ...previous,
        colors
      };
    });
    setRgbBaseline(previous => {
      const colors = {
        ...previous.colors
      };
      for (const id of nextKeyIds) {
        if (!colors[id]) {
          colors[id] = [255, 255, 255];
        }
      }
      return {
        ...previous,
        colors
      };
    });
  }
  function restoreWorkspaceDraft(draft?: ProfileDraft, keyIds: readonly string[] = modelKeyIds) {
    setAdvancedBindings(draft?.advancedBindings ?? []);
    setAdvancedBaseline(draft?.advancedBaseline ?? []);
    setAdvancedHydratedSlot(null);
    setAdvancedReadError(null);
    setRgb(restoreStoredRgb(draft?.rgb, draft?.rgbFormat));
    setRgbBaseline(restoreStoredRgb(draft?.rgbBaseline, draft?.rgbFormat));
    setRgbHydratedSlot(null);
    remapBaselineRef.current = draft?.remapBaseline ?? defaultRemapLayers(keyIds);
    setRemapLayers(draft?.remapLayers ?? defaultRemapLayers(keyIds));
    setDirtyRemaps(new Set(draft?.dirtyRemaps ?? []));
  }
  return {
    saveState,
    setSaveState,
    profileSlot,
    setProfileSlot,
    loadedProfileSlot,
    setLoadedProfileSlot,
    rgb,
    setRgb,
    rgbBaseline,
    setRgbBaseline,
    rgbHydratedSlot,
    setRgbHydratedSlot,
    rgbDirty,
    rgbPending,
    remapLayers,
    setRemapLayers,
    dirtyRemaps,
    setDirtyRemaps,
    profileNames,
    setProfileNames,
    profileDrafts,
    setProfileDrafts,
    profileBusy,
    setProfileBusy,
    profileBusyRef,
    remapBaselineRef,
    advancedBindings,
    setAdvancedBindings,
    advancedBaseline,
    setAdvancedBaseline,
    advancedHydratedSlot,
    setAdvancedHydratedSlot,
    advancedReadError,
    setAdvancedReadError,
    advancedPending,
    assignRemap,
    copyRemapLayer,
    expandWorkspaceForModel,
    restoreWorkspaceDraft
  };
}
