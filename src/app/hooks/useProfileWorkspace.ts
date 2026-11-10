import { useEffect, useRef, useState } from 'react';
import { advancedEqual, type AdvancedBinding } from '../../protocol/hero68/advanced';
import { defaultRemapLayers, type RemapLayer, type RemapLayers } from '../../protocol/hero68/remap';
import {
  restoreStoredRgb,
  rgbChanges,
  rgbDirtyCount,
  type RgbProfile
} from '../../protocol/hero68/rgb';
import type { ProfileSlot } from '../../protocol/hero68/types';
import { syncProfilesToBgService } from '../../protocol/bgServiceClient';
import type { PersistedOpenHeroState, ProfileDraft } from '../../state/persistence';
import {
  createDefaultOnboardMetadata,
  encodeProfileShareCode,
  type ProfileNamespace,
  type StoredProfileRecord,
  type WootPresetDefinition,
  type WootProfileMetadata
} from '../../state/profileTypes';

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
  const [rgbBaseline, setRgbBaseline] = useState<RgbProfile>(() => {
    const base = restoreStoredRgb(initialDraft?.rgbBaseline, initialDraft?.rgbFormat);
    if (!base.custom && initialDraft?.rgb?.custom) {
      base.custom = structuredClone(initialDraft.rgb.custom);
    }
    return base;
  });
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
    3: 'Onboard Profile 3',
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

  // === Wootility v5 + OpenMAD 3-Tier Profile State (supports 4 onboard slots 0..3 for WIN 68 HE MAX) ===
  const [onboardMetadata, setOnboardMetadata] = useState<Record<ProfileSlot, WootProfileMetadata>>(
    () => ({
      0:
        persistedState?.onboardMetadata?.[0] ??
        createDefaultOnboardMetadata(
          0,
          persistedState?.profileNames?.[0] ?? 'Onboard Profile 0',
          persistedState?.deviceModel ?? 'hero68'
        ),
      1:
        persistedState?.onboardMetadata?.[1] ??
        createDefaultOnboardMetadata(
          1,
          persistedState?.profileNames?.[1] ?? 'Onboard Profile 1',
          persistedState?.deviceModel ?? 'hero68'
        ),
      2:
        persistedState?.onboardMetadata?.[2] ??
        createDefaultOnboardMetadata(
          2,
          persistedState?.profileNames?.[2] ?? 'Onboard Profile 2',
          persistedState?.deviceModel ?? 'hero68'
        ),
      3:
        persistedState?.onboardMetadata?.[3] ??
        createDefaultOnboardMetadata(
          3,
          persistedState?.profileNames?.[3] ?? 'Onboard Profile 3',
          persistedState?.deviceModel ?? 'win68HeMax'
        )
    })
  );
  const [linkedProfiles, setLinkedProfiles] = useState<StoredProfileRecord[]>(
    () => persistedState?.linkedProfiles ?? []
  );
  const [inactiveProfiles, setInactiveProfiles] = useState<StoredProfileRecord[]>(
    () => persistedState?.inactiveProfiles ?? []
  );
  const [activeProfileNamespace, setActiveProfileNamespace] =
    useState<ProfileNamespace>('onboard');
  const [activeProfileUid, setActiveProfileUid] = useState<string>(
    () => `onboard-${persistedState?.profileSlot ?? 1}`
  );
  const [autoProfileEnabled, setAutoProfileEnabled] = useState<boolean>(
    () => persistedState?.autoProfileEnabled ?? true
  );
  const [revertToDefaultOnFocusLoss, setRevertToDefaultOnFocusLoss] = useState<boolean>(
    () => persistedState?.revertToDefaultOnFocusLoss ?? true
  );
  const [notifyOnProfileSwitch, setNotifyOnProfileSwitch] = useState<boolean>(
    () => persistedState?.notifyOnProfileSwitch ?? true
  );

  // Keep onboardMetadata names in sync when profileNames updates from hardware readback
  useEffect(() => {
    setOnboardMetadata(prev => ({
      0: { ...prev[0], name: profileNames[0] || prev[0].name },
      1: { ...prev[1], name: profileNames[1] || prev[1].name },
      2: { ...prev[2], name: profileNames[2] || prev[2].name },
      3: { ...prev[3], name: profileNames[3] || prev[3].name }
    }));
  }, [profileNames]);

  // Automatically sync Linked + Onboard profiles to Local Background Service whenever rules change
  useEffect(() => {
    const onboardRecords: StoredProfileRecord[] = ([0, 1, 2, 3] as const).map(slot => ({
      metadata: onboardMetadata[slot],
      draft: profileDrafts[slot] ?? {}
    }));
    void syncProfilesToBgService({
      enabled: autoProfileEnabled,
      revertToDefault: revertToDefaultOnFocusLoss,
      notifyOnSwitch: notifyOnProfileSwitch,
      defaultProfileUid: revertToDefaultOnFocusLoss ? 'onboard-0' : null,
      profiles: [...linkedProfiles, ...onboardRecords]
    });
  }, [
    autoProfileEnabled,
    revertToDefaultOnFocusLoss,
    notifyOnProfileSwitch,
    linkedProfiles,
    onboardMetadata,
    profileDrafts
  ]);

  function updateProfileMetadata(updated: WootProfileMetadata) {
    if (updated.uid.startsWith('onboard-')) {
      const slot = Number(updated.uid.replace('onboard-', '')) as ProfileSlot;
      if (slot === 0 || slot === 1 || slot === 2 || slot === 3) {
        setOnboardMetadata(prev => ({ ...prev, [slot]: updated }));
        setProfileNames(prev => ({ ...prev, [slot]: updated.name }));
        return;
      }
    }
    setLinkedProfiles(prev => {
      const existsInLinked = prev.some(p => p.metadata.uid === updated.uid);
      if (existsInLinked) {
        if (updated.linkedApps.length === 0) {
          // Moved from Linked -> Inactive when all apps unlinked
          const target = prev.find(p => p.metadata.uid === updated.uid)!;
          setInactiveProfiles(inact => [...inact, { ...target, metadata: updated }]);
          return prev.filter(p => p.metadata.uid !== updated.uid);
        }
        return prev.map(p => (p.metadata.uid === updated.uid ? { ...p, metadata: updated } : p));
      }
      return prev;
    });
    setInactiveProfiles(prev => {
      const existsInInactive = prev.some(p => p.metadata.uid === updated.uid);
      if (existsInInactive) {
        if (updated.linkedApps.length > 0) {
          // Promote from Inactive -> Linked when apps are linked
          const target = prev.find(p => p.metadata.uid === updated.uid)!;
          setLinkedProfiles(lnk => [...lnk, { ...target, metadata: updated }]);
          return prev.filter(p => p.metadata.uid !== updated.uid);
        }
        return prev.map(p => (p.metadata.uid === updated.uid ? { ...p, metadata: updated } : p));
      }
      return prev;
    });
  }

  function buildPresetDraft(preset: WootPresetDefinition): ProfileDraft {
    const actuationByKey: Record<string, number> = {};
    const rapidTriggerByKey: Record<string, boolean> = {};
    const rapidSensitivityByKey: Record<string, number> = {};
    for (const keyId of modelKeyIds) {
      actuationByKey[keyId] = preset.actuationMm;
      rapidTriggerByKey[keyId] = preset.rapidTrigger;
      rapidSensitivityByKey[keyId] = preset.rapidSensitivityMm;
    }
    return {
      actuationByKey,
      rapidTriggerByKey,
      rapidSensitivityByKey,
      remapLayers: defaultRemapLayers(modelKeyIds)
    };
  }

  function createNewProfile(
    namespace: ProfileNamespace,
    metadata: WootProfileMetadata,
    preset: WootPresetDefinition
  ) {
    const draft = buildPresetDraft(preset);
    if (namespace === 'onboard') {
      const targetSlot: ProfileSlot = (Math.max(
        0,
        Math.min(2, metadata.mappedOnboardSlot ?? profileSlot)
      )) as ProfileSlot;
      const onboardMeta: WootProfileMetadata = {
        ...metadata,
        uid: `onboard-${targetSlot}`,
        mappedOnboardSlot: targetSlot
      };
      setOnboardMetadata(prev => ({ ...prev, [targetSlot]: onboardMeta }));
      setProfileNames(prev => ({ ...prev, [targetSlot]: onboardMeta.name }));
      setProfileDrafts(prev => ({ ...prev, [targetSlot]: draft }));
      setProfileSlot(targetSlot);
      setActiveProfileNamespace('onboard');
      setActiveProfileUid(onboardMeta.uid);
      restoreWorkspaceDraft(draft);
      return;
    }
    const record: StoredProfileRecord = { metadata, draft };
    if (namespace === 'linked' || metadata.linkedApps.length > 0) {
      setLinkedProfiles(prev => [...prev, record]);
      setActiveProfileNamespace('linked');
    } else {
      setInactiveProfiles(prev => [...prev, record]);
      setActiveProfileNamespace('inactive');
    }
    setActiveProfileUid(metadata.uid);
    restoreWorkspaceDraft(draft);
  }

  function duplicateProfile(sourceMeta: WootProfileMetadata) {
    let sourceDraft: ProfileDraft = {};
    if (sourceMeta.uid.startsWith('onboard-')) {
      const slot = Number(sourceMeta.uid.replace('onboard-', '')) as ProfileSlot;
      sourceDraft = structuredClone(profileDrafts[slot] ?? {});
    } else {
      const found = [...linkedProfiles, ...inactiveProfiles].find(
        p => p.metadata.uid === sourceMeta.uid
      );
      if (found) {
        sourceDraft = structuredClone(found.draft);
      }
    }
    const copyMeta: WootProfileMetadata = {
      ...structuredClone(sourceMeta),
      uid: `inactive-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${sourceMeta.name} Copy`.slice(0, 50),
      linkedApps: [],
      updatedAt: Date.now()
    };
    setInactiveProfiles(prev => [...prev, { metadata: copyMeta, draft: sourceDraft }]);
  }

  function moveProfileToInactive(sourceMeta: WootProfileMetadata, sourceSlot?: ProfileSlot) {
    if (typeof sourceSlot === 'number') {
      const draft = structuredClone(profileDrafts[sourceSlot] ?? {});
      const movedMeta: WootProfileMetadata = {
        ...structuredClone(sourceMeta),
        uid: `inactive-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        linkedApps: [],
        updatedAt: Date.now()
      };
      setInactiveProfiles(prev => [...prev, { metadata: movedMeta, draft }]);
      return;
    }
    const foundLinked = linkedProfiles.find(p => p.metadata.uid === sourceMeta.uid);
    if (foundLinked) {
      setLinkedProfiles(prev => prev.filter(p => p.metadata.uid !== sourceMeta.uid));
      setInactiveProfiles(prev => [
        ...prev,
        {
          metadata: { ...foundLinked.metadata, linkedApps: [], updatedAt: Date.now() },
          draft: foundLinked.draft
        }
      ]);
    }
  }

  function moveProfileToOnboard(record: StoredProfileRecord, targetSlot: ProfileSlot = profileSlot) {
    const nextMeta: WootProfileMetadata = {
      ...record.metadata,
      uid: `onboard-${targetSlot}`,
      mappedOnboardSlot: targetSlot,
      updatedAt: Date.now()
    };
    setOnboardMetadata(prev => ({ ...prev, [targetSlot]: nextMeta }));
    setProfileNames(prev => ({ ...prev, [targetSlot]: nextMeta.name }));
    setProfileDrafts(prev => ({ ...prev, [targetSlot]: structuredClone(record.draft) }));
    setLinkedProfiles(prev => prev.filter(p => p.metadata.uid !== record.metadata.uid));
    setInactiveProfiles(prev => prev.filter(p => p.metadata.uid !== record.metadata.uid));
    setProfileSlot(targetSlot);
    setActiveProfileNamespace('onboard');
    setActiveProfileUid(nextMeta.uid);
    restoreWorkspaceDraft(record.draft);
  }

  function swapDefaultSlot(slot: ProfileSlot) {
    if (slot === 0) return;
    setOnboardMetadata(prev => {
      const slot0 = { ...prev[slot], uid: 'onboard-0', mappedOnboardSlot: 0 as ProfileSlot };
      const slotOther = { ...prev[0], uid: `onboard-${slot}`, mappedOnboardSlot: slot };
      return {
        ...prev,
        0: slot0,
        [slot]: slotOther
      };
    });
    setProfileNames(prev => ({
      ...prev,
      0: prev[slot],
      [slot]: prev[0]
    }));
    setProfileDrafts(prev => ({
      ...prev,
      0: prev[slot],
      [slot]: prev[0]
    }));
  }

  function deleteStoredProfile(uid: string) {
    if (uid === 'onboard-0') return;
    setLinkedProfiles(prev => prev.filter(p => p.metadata.uid !== uid));
    setInactiveProfiles(prev => prev.filter(p => p.metadata.uid !== uid));
    if (activeProfileUid === uid) {
      setActiveProfileNamespace('onboard');
      setActiveProfileUid(`onboard-${profileSlot}`);
    }
  }

  function importProfileRecord(record: StoredProfileRecord) {
    if (record.metadata.linkedApps.length > 0) {
      setLinkedProfiles(prev => [...prev, record]);
      setActiveProfileNamespace('linked');
    } else {
      setInactiveProfiles(prev => [...prev, record]);
      setActiveProfileNamespace('inactive');
    }
    setActiveProfileUid(record.metadata.uid);
    restoreWorkspaceDraft(record.draft);
  }

  function exportAnyProfile(meta: WootProfileMetadata) {
    let draft: ProfileDraft = {};
    if (meta.uid.startsWith('onboard-')) {
      const s = Number(meta.uid.replace('onboard-', '')) as ProfileSlot;
      draft = profileDrafts[s] ?? {};
    } else {
      const rec = [...linkedProfiles, ...inactiveProfiles].find(p => p.metadata.uid === meta.uid);
      if (rec) draft = rec.draft;
    }
    const record: StoredProfileRecord = { metadata: meta, draft };
    const shareCode = encodeProfileShareCode(record);
    const payload = {
      schema: 'openaula-woot-profile',
      version: 2,
      shareCode,
      metadata: meta,
      draft,
      settings: draft
    };
    if (typeof window !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'profile'}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

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
    const restoredRgb = restoreStoredRgb(draft?.rgb, draft?.rgbFormat);
    const restoredBaseline = restoreStoredRgb(draft?.rgbBaseline, draft?.rgbFormat);
    if (!restoredBaseline.custom && restoredRgb.custom) {
      restoredBaseline.custom = structuredClone(restoredRgb.custom);
    }
    setRgb(restoredRgb);
    setRgbBaseline(restoredBaseline);
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
    restoreWorkspaceDraft,
    // Wootility v5 + OpenMAD 3-Tier Profile Management
    onboardMetadata,
    setOnboardMetadata,
    linkedProfiles,
    setLinkedProfiles,
    inactiveProfiles,
    setInactiveProfiles,
    activeProfileNamespace,
    setActiveProfileNamespace,
    activeProfileUid,
    setActiveProfileUid,
    autoProfileEnabled,
    setAutoProfileEnabled,
    revertToDefaultOnFocusLoss,
    setRevertToDefaultOnFocusLoss,
    notifyOnProfileSwitch,
    setNotifyOnProfileSwitch,
    updateProfileMetadata,
    createNewProfile,
    duplicateProfile,
    moveProfileToInactive,
    moveProfileToOnboard,
    swapDefaultSlot,
    deleteStoredProfile,
    importProfileRecord,
    exportAnyProfile
  };
}
