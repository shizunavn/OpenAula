import { useEffect, useMemo, useState } from 'react';
import {
  clampRapidTriggerForModel,
  formatMillimeters,
  isXsPrecisionModel,
  mergeHydratedBooleans,
  mergeHydratedNumbers,
  mergePerKeyState,
  selectionHasMixedValues,
  snapToStep
} from '../helpers';
import {
  SWITCH_IMAGES,
  SWITCH_OPTIONS,
  WIN68_SWITCH_OPTIONS,
  type SwitchOption,
  type SwitchTone
} from '../switchAssets';
import type { HydratedKeySettings } from '../../protocol/hero68/hero68Encoder';
import {
  isSwitchProfileId,
  normalizeSwitchProfileId,
  switchProfileLabel
} from '../../protocol/hero68/switchProfiles';
import type { PersistedOpenHeroState, ProfileDraft } from '../../state/persistence';
import type { HeroDeviceModelId } from '../../keyboard/registry/types';
export type UsePerKeyPerformanceOptions = {
  persistedState: PersistedOpenHeroState | null | undefined;
  modelKeyIds: readonly string[];
  selectedKeys: Set<string>;
  model?: HeroDeviceModelId;
};
/**
 * Manages per-key Actuation Point, Rapid Trigger, Split Sensitivity, Dead Zone, and Switch Profile state.
 *
 * Multi-key selection rules:
 * - A parameter reports `mixed = true` (`selectionHasMixedValues`) when two or more selected keys
 *   hold different values for that parameter.
 * - Dependent sliders (Rapid Trigger Sensitivity, Split Press/Release, and Top/Bottom Dead Zone)
 *   are enabled only when all selected keys share an explicit common `ON` state (`!mixed && enabled`).
 */
export function usePerKeyPerformance({
  persistedState,
  modelKeyIds,
  selectedKeys,
  model
}: UsePerKeyPerformanceOptions) {
  const isXs = isXsPrecisionModel(model);
  const [actuation, setActuation] = useState(1.6);
  const [rapidTrigger, setRapidTrigger] = useState(false);
  const [splitSensitivity, setSplitSensitivity] = useState(false);
  const [rapidSensitivity, setRapidSensitivity] = useState(0.65);
  const [pressSensitivity, setPressSensitivity] = useState(0.5);
  const [releaseSensitivity, setReleaseSensitivity] = useState(0.55);
  const [deadzoneEnabled, setDeadzoneEnabled] = useState(true);
  const [topDeadzone, setTopDeadzone] = useState(0);
  const [bottomDeadzone, setBottomDeadzone] = useState(0);
  const [actuationByKey, setActuationByKey] = useState<Record<string, number>>(() =>
    mergePerKeyState(persistedState?.actuationByKey, 1.6, modelKeyIds)
  );
  const [rapidTriggerByKey, setRapidTriggerByKey] = useState<Record<string, boolean>>(() =>
    mergePerKeyState(persistedState?.rapidTriggerByKey, false, modelKeyIds)
  );
  const [splitSensitivityByKey, setSplitSensitivityByKey] = useState<Record<string, boolean>>(() =>
    mergePerKeyState(persistedState?.splitSensitivityByKey, false, modelKeyIds)
  );
  const [rapidSensitivityByKey, setRapidSensitivityByKey] = useState<Record<string, number>>(() =>
    mergePerKeyState(persistedState?.rapidSensitivityByKey, 0.65, modelKeyIds)
  );
  const [pressSensitivityByKey, setPressSensitivityByKey] = useState<Record<string, number>>(() =>
    mergePerKeyState(persistedState?.pressSensitivityByKey, 0.5, modelKeyIds)
  );
  const [releaseSensitivityByKey, setReleaseSensitivityByKey] = useState<Record<string, number>>(
    () => mergePerKeyState(persistedState?.releaseSensitivityByKey, 0.55, modelKeyIds)
  );
  const [deadzoneEnabledByKey, setDeadzoneEnabledByKey] = useState<Record<string, boolean>>(() =>
    mergePerKeyState(persistedState?.deadzoneEnabledByKey, true, modelKeyIds)
  );
  const [topDeadzoneByKey, setTopDeadzoneByKey] = useState<Record<string, number>>(() =>
    mergePerKeyState(persistedState?.topDeadzoneByKey, 0, modelKeyIds)
  );
  const [bottomDeadzoneByKey, setBottomDeadzoneByKey] = useState<Record<string, number>>(() =>
    mergePerKeyState(persistedState?.bottomDeadzoneByKey, 0, modelKeyIds)
  );
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(
    () =>
      new Set(persistedState?.profileDrafts?.[persistedState?.profileSlot ?? 1]?.dirtyKeys ?? [])
  );
  const [selectedSwitchId, setSelectedSwitchId] = useState<SwitchTone>(() =>
    isSwitchProfileId(persistedState?.selectedSwitchId)
      ? normalizeSwitchProfileId(persistedState.selectedSwitchId)
      : 'white'
  );
  const [assignedSwitchesByKey, setAssignedSwitchesByKey] = useState<Record<string, SwitchTone>>(
    () =>
      mergePerKeyState(
        persistedState?.assignedSwitchesByKey as Record<string, SwitchTone> | undefined,
        'white' as SwitchTone,
        modelKeyIds
      )
  );
  const normalizedSelectedSwitchId = normalizeSwitchProfileId(selectedSwitchId);
  const selectedSwitch: SwitchOption = WIN68_SWITCH_OPTIONS.find(
    option => option.id === normalizedSelectedSwitchId
  ) ??
    SWITCH_OPTIONS.find(option => option.id === normalizedSelectedSwitchId) ?? {
      id: normalizedSelectedSwitchId,
      name: switchProfileLabel(normalizedSelectedSwitchId),
      fullName: switchProfileLabel(normalizedSelectedSwitchId),
      brand: 'Stored keyboard profile',
      accent: '#9ba3a8',
      note: '',
      ...SWITCH_IMAGES[normalizedSelectedSwitchId]
    };
  const switchTopImageById = useMemo(() => {
    const entries: Record<string, string> = {};
    for (const option of [...SWITCH_OPTIONS, ...WIN68_SWITCH_OPTIONS]) {
      entries[option.id] = option.top ?? '';
    }
    for (const [key, img] of Object.entries(SWITCH_IMAGES)) {
      if (img?.top) {
        entries[key] = img.top;
      }
    }
    return entries as Record<SwitchTone, string>;
  }, []);
  const switchPreviewByKey = useMemo(
    () =>
      Object.fromEntries(
        modelKeyIds.map(keyId => {
          const sw = normalizeSwitchProfileId(assignedSwitchesByKey[keyId] ?? 'white');
          return [keyId, switchTopImageById[sw] ?? switchTopImageById.white ?? ''];
        })
      ) as Record<string, string>,
    [modelKeyIds, assignedSwitchesByKey, switchTopImageById]
  );
  const rapidPreviewByKey = useMemo(
    () =>
      Object.fromEntries(
        modelKeyIds.map(keyId => {
          const split = splitSensitivityByKey[keyId] ?? false;
          const primaryRaw = split
            ? (pressSensitivityByKey[keyId] ?? 0.5)
            : (rapidSensitivityByKey[keyId] ?? 0.65);
          const primary = clampRapidTriggerForModel(primaryRaw, model);
          const release = clampRapidTriggerForModel(releaseSensitivityByKey[keyId] ?? 0.55, model);
          return [
            keyId,
            {
              primary: formatMillimeters(primary),
              secondary: split ? formatMillimeters(release) : undefined,
              active: rapidTriggerByKey[keyId] ?? false
            }
          ];
        })
      ) as Record<
        string,
        {
          primary: string;
          secondary?: string;
          active: boolean;
        }
      >,
    [
      model,
      modelKeyIds,
      splitSensitivityByKey,
      pressSensitivityByKey,
      releaseSensitivityByKey,
      rapidSensitivityByKey,
      rapidTriggerByKey
    ]
  );
  const deadzonePreviewByKey = useMemo(
    () =>
      Object.fromEntries(
        modelKeyIds.map(keyId => {
          const dzStep = isXs ? 0.005 : 0.01;
          return [
            keyId,
            {
              top: formatMillimeters(snapToStep(topDeadzoneByKey[keyId] ?? 0, 0, 1, dzStep)),
              bottom: formatMillimeters(snapToStep(bottomDeadzoneByKey[keyId] ?? 0, 0, 1, dzStep)),
              active: deadzoneEnabledByKey[keyId] ?? true
            }
          ];
        })
      ) as Record<
        string,
        {
          top: string;
          bottom: string;
          active: boolean;
        }
      >,
    [isXs, modelKeyIds, topDeadzoneByKey, bottomDeadzoneByKey, deadzoneEnabledByKey]
  );
  const hasSelection = selectedKeys.size > 0;
  const actuationMixed = selectionHasMixedValues(selectedKeys, actuationByKey);
  const rapidTriggerMixed = selectionHasMixedValues(selectedKeys, rapidTriggerByKey);
  const splitSensitivityMixed = selectionHasMixedValues(selectedKeys, splitSensitivityByKey);
  const rapidSensitivityMixed = selectionHasMixedValues(selectedKeys, rapidSensitivityByKey);
  const pressSensitivityMixed = selectionHasMixedValues(selectedKeys, pressSensitivityByKey);
  const releaseSensitivityMixed = selectionHasMixedValues(selectedKeys, releaseSensitivityByKey);
  const deadzoneEnabledMixed = selectionHasMixedValues(selectedKeys, deadzoneEnabledByKey);
  const topDeadzoneMixed = selectionHasMixedValues(selectedKeys, topDeadzoneByKey);
  const bottomDeadzoneMixed = selectionHasMixedValues(selectedKeys, bottomDeadzoneByKey);
  const switchProfileMixed = selectionHasMixedValues(selectedKeys, assignedSwitchesByKey);
  const rapidTriggerControlsEnabled = hasSelection && rapidTrigger && !rapidTriggerMixed;
  const splitSensitivityControlsEnabled = rapidTriggerControlsEnabled && !splitSensitivityMixed;
  const deadzoneControlsEnabled = hasSelection && deadzoneEnabled && !deadzoneEnabledMixed;
  useEffect(() => {
    const step = isXs ? 0.005 : 0.01;
    const clampRtMap = (record: Record<string, number>) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [keyId, val] of Object.entries(record)) {
        const clamped = clampRapidTriggerForModel(val, model);
        next[keyId] = clamped;
        if (clamped !== val) {
          changed = true;
        }
      }
      return changed ? next : record;
    };
    const clampStepMap = (record: Record<string, number>, min: number, max: number) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [keyId, val] of Object.entries(record)) {
        const snapped = snapToStep(val, min, max, step);
        next[keyId] = snapped;
        if (snapped !== val) {
          changed = true;
        }
      }
      return changed ? next : record;
    };
    setRapidSensitivity(prev => clampRapidTriggerForModel(prev, model));
    setPressSensitivity(prev => clampRapidTriggerForModel(prev, model));
    setReleaseSensitivity(prev => clampRapidTriggerForModel(prev, model));
    setActuation(prev => snapToStep(prev, 0.1, 3.4, step));
    setTopDeadzone(prev => snapToStep(prev, 0, 1, step));
    setBottomDeadzone(prev => snapToStep(prev, 0, 1, step));
    setRapidSensitivityByKey(clampRtMap);
    setPressSensitivityByKey(clampRtMap);
    setReleaseSensitivityByKey(clampRtMap);
    setActuationByKey(prev => clampStepMap(prev, 0.1, 3.4));
    setTopDeadzoneByKey(prev => clampStepMap(prev, 0, 1));
    setBottomDeadzoneByKey(prev => clampStepMap(prev, 0, 1));
  }, [isXs, model]);
  useEffect(() => {
    if (!selectedKeys.size) {
      return;
    }
    const firstSelectedKey = Array.from(selectedKeys)[0];
    const step = isXs ? 0.005 : 0.01;
    setActuation(snapToStep(actuationByKey[firstSelectedKey] ?? 1.6, 0.1, 3.4, step));
    setRapidTrigger(rapidTriggerByKey[firstSelectedKey] ?? false);
    setSplitSensitivity(splitSensitivityByKey[firstSelectedKey] ?? false);
    setRapidSensitivity(
      clampRapidTriggerForModel(rapidSensitivityByKey[firstSelectedKey] ?? 0.65, model)
    );
    setPressSensitivity(
      clampRapidTriggerForModel(pressSensitivityByKey[firstSelectedKey] ?? 0.5, model)
    );
    setReleaseSensitivity(
      clampRapidTriggerForModel(releaseSensitivityByKey[firstSelectedKey] ?? 0.55, model)
    );
    setDeadzoneEnabled(deadzoneEnabledByKey[firstSelectedKey] ?? true);
    setTopDeadzone(snapToStep(topDeadzoneByKey[firstSelectedKey] ?? 0, 0, 1, step));
    setBottomDeadzone(snapToStep(bottomDeadzoneByKey[firstSelectedKey] ?? 0, 0, 1, step));
    const assignedSwitch = assignedSwitchesByKey[firstSelectedKey];
    if (assignedSwitch) {
      setSelectedSwitchId(normalizeSwitchProfileId(assignedSwitch));
    }
  }, [
    isXs,
    model,
    selectedKeys,
    actuationByKey,
    rapidTriggerByKey,
    splitSensitivityByKey,
    rapidSensitivityByKey,
    pressSensitivityByKey,
    releaseSensitivityByKey,
    deadzoneEnabledByKey,
    topDeadzoneByKey,
    bottomDeadzoneByKey,
    assignedSwitchesByKey
  ]);
  function markSelectedKeysDirty() {
    if (!selectedKeys.size) {
      return;
    }
    setDirtyKeys(previous => {
      const next = new Set(previous);
      selectedKeys.forEach(keyId => next.add(keyId));
      return next;
    });
  }
  function assignSwitchProfile(switchId: SwitchTone) {
    const normalized = normalizeSwitchProfileId(switchId);
    setSelectedSwitchId(normalized);
    if (selectedKeys.size === 0) {
      return;
    }
    markSelectedKeysDirty();
    setAssignedSwitchesByKey(previous => {
      const next = {
        ...previous
      };
      selectedKeys.forEach(keyId => {
        next[keyId] = normalized;
      });
      return next;
    });
  }
  function setActuationForSelection(value: number) {
    const step = isXsPrecisionModel(model) ? 0.005 : 0.01;
    const nextValue = snapToStep(value, 0.1, 3.4, step);
    setActuation(nextValue);
    if (!selectedKeys.size) {
      return;
    }
    markSelectedKeysDirty();
    setActuationByKey(previous => {
      const next = {
        ...previous
      };
      selectedKeys.forEach(keyId => {
        next[keyId] = nextValue;
      });
      return next;
    });
  }
  function setRapidTriggerForSelection(value: boolean) {
    setRapidTrigger(value);
    if (!selectedKeys.size) {
      return;
    }
    markSelectedKeysDirty();
    setRapidTriggerByKey(previous => {
      const next = {
        ...previous
      };
      selectedKeys.forEach(keyId => {
        next[keyId] = value;
      });
      return next;
    });
  }
  function setSplitSensitivityForSelection(value: boolean) {
    setSplitSensitivity(value);
    if (!selectedKeys.size) {
      return;
    }
    markSelectedKeysDirty();
    setSplitSensitivityByKey(previous => {
      const next = {
        ...previous
      };
      selectedKeys.forEach(keyId => {
        next[keyId] = value;
      });
      return next;
    });
  }
  function setRapidSensitivityForSelection(value: number) {
    const nextValue = clampRapidTriggerForModel(value, model);
    setRapidSensitivity(nextValue);
    if (!selectedKeys.size) {
      return;
    }
    markSelectedKeysDirty();
    setRapidSensitivityByKey(previous => {
      const next = {
        ...previous
      };
      selectedKeys.forEach(keyId => {
        next[keyId] = nextValue;
      });
      return next;
    });
  }
  function setPressSensitivityForSelection(value: number) {
    const nextValue = clampRapidTriggerForModel(value, model);
    setPressSensitivity(nextValue);
    if (!selectedKeys.size) {
      return;
    }
    markSelectedKeysDirty();
    setPressSensitivityByKey(previous => {
      const next = {
        ...previous
      };
      selectedKeys.forEach(keyId => {
        next[keyId] = nextValue;
      });
      return next;
    });
  }
  function setReleaseSensitivityForSelection(value: number) {
    const nextValue = clampRapidTriggerForModel(value, model);
    setReleaseSensitivity(nextValue);
    if (!selectedKeys.size) {
      return;
    }
    markSelectedKeysDirty();
    setReleaseSensitivityByKey(previous => {
      const next = {
        ...previous
      };
      selectedKeys.forEach(keyId => {
        next[keyId] = nextValue;
      });
      return next;
    });
  }
  function setDeadzoneEnabledForSelection(value: boolean) {
    setDeadzoneEnabled(value);
    if (!selectedKeys.size) {
      return;
    }
    markSelectedKeysDirty();
    setDeadzoneEnabledByKey(previous => {
      const next = {
        ...previous
      };
      selectedKeys.forEach(keyId => {
        next[keyId] = value;
      });
      return next;
    });
  }
  function setTopDeadzoneForSelection(value: number) {
    const step = isXsPrecisionModel(model) ? 0.005 : 0.01;
    const nextValue = snapToStep(value, 0, 1, step);
    setTopDeadzone(nextValue);
    if (!selectedKeys.size) {
      return;
    }
    markSelectedKeysDirty();
    setTopDeadzoneByKey(previous => {
      const next = {
        ...previous
      };
      selectedKeys.forEach(keyId => {
        next[keyId] = nextValue;
      });
      return next;
    });
  }
  function setBottomDeadzoneForSelection(value: number) {
    const step = isXsPrecisionModel(model) ? 0.005 : 0.01;
    const nextValue = snapToStep(value, 0, 1, step);
    setBottomDeadzone(nextValue);
    if (!selectedKeys.size) {
      return;
    }
    markSelectedKeysDirty();
    setBottomDeadzoneByKey(previous => {
      const next = {
        ...previous
      };
      selectedKeys.forEach(keyId => {
        next[keyId] = nextValue;
      });
      return next;
    });
  }
  function expandForModel(nextKeyIds: readonly string[]) {
    setActuationByKey(previous => mergePerKeyState(previous, 1.6, nextKeyIds));
    setRapidTriggerByKey(previous => mergePerKeyState(previous, false, nextKeyIds));
    setSplitSensitivityByKey(previous => mergePerKeyState(previous, false, nextKeyIds));
    setRapidSensitivityByKey(previous => mergePerKeyState(previous, 0.65, nextKeyIds));
    setPressSensitivityByKey(previous => mergePerKeyState(previous, 0.5, nextKeyIds));
    setReleaseSensitivityByKey(previous => mergePerKeyState(previous, 0.55, nextKeyIds));
    setDeadzoneEnabledByKey(previous => mergePerKeyState(previous, true, nextKeyIds));
    setTopDeadzoneByKey(previous => mergePerKeyState(previous, 0, nextKeyIds));
    setBottomDeadzoneByKey(previous => mergePerKeyState(previous, 0, nextKeyIds));
    setAssignedSwitchesByKey(previous =>
      mergePerKeyState(previous, 'white' as SwitchTone, nextKeyIds)
    );
  }
  function restoreFromDraft(
    draft: ProfileDraft | undefined,
    keyIds: readonly string[] = modelKeyIds
  ) {
    const step = isXsPrecisionModel(model) ? 0.005 : 0.01;
    const snapMap = (record: Record<string, number>, min: number, max: number) =>
      Object.fromEntries(
        Object.entries(record).map(([k, v]) => [k, snapToStep(v, min, max, step)])
      );
    const snapRtMap = (record: Record<string, number>) =>
      Object.fromEntries(
        Object.entries(record).map(([k, v]) => [k, clampRapidTriggerForModel(v, model)])
      );
    const nextSwitches = mergePerKeyState(
      draft?.assignedSwitchesByKey as Record<string, SwitchTone> | undefined,
      'white' as SwitchTone,
      keyIds
    );
    const nextActuation = snapMap(mergePerKeyState(draft?.actuationByKey, 1.6, keyIds), 0.1, 3.4);
    const nextRapidTrigger = mergePerKeyState(draft?.rapidTriggerByKey, false, keyIds);
    const nextSplitSensitivity = mergePerKeyState(draft?.splitSensitivityByKey, false, keyIds);
    const nextRapidSensitivity = snapRtMap(
      mergePerKeyState(draft?.rapidSensitivityByKey, 0.65, keyIds)
    );
    const nextPressSensitivity = snapRtMap(
      mergePerKeyState(draft?.pressSensitivityByKey, 0.5, keyIds)
    );
    const nextReleaseSensitivity = snapRtMap(
      mergePerKeyState(draft?.releaseSensitivityByKey, 0.55, keyIds)
    );
    const nextDeadzoneEnabled = mergePerKeyState(draft?.deadzoneEnabledByKey, true, keyIds);
    const nextTopDeadzone = snapMap(mergePerKeyState(draft?.topDeadzoneByKey, 0, keyIds), 0, 1);
    const nextBottomDeadzone = snapMap(
      mergePerKeyState(draft?.bottomDeadzoneByKey, 0, keyIds),
      0,
      1
    );

    setAssignedSwitchesByKey(nextSwitches);
    setActuationByKey(nextActuation);
    setRapidTriggerByKey(nextRapidTrigger);
    setSplitSensitivityByKey(nextSplitSensitivity);
    setRapidSensitivityByKey(nextRapidSensitivity);
    setPressSensitivityByKey(nextPressSensitivity);
    setReleaseSensitivityByKey(nextReleaseSensitivity);
    setDeadzoneEnabledByKey(nextDeadzoneEnabled);
    setTopDeadzoneByKey(nextTopDeadzone);
    setBottomDeadzoneByKey(nextBottomDeadzone);
    setDirtyKeys(new Set(draft?.dirtyKeys ?? []));

    const refKey =
      Array.from(selectedKeys)[0] ?? draft?.dirtyKeys?.[draft.dirtyKeys.length - 1] ?? keyIds[0];
    if (draft?.uiScalarValues) {
      setActuation(snapToStep(draft.uiScalarValues.actuation, 0.1, 3.4, step));
      setRapidTrigger(draft.uiScalarValues.rapidTrigger);
      setSplitSensitivity(draft.uiScalarValues.splitSensitivity);
      setRapidSensitivity(clampRapidTriggerForModel(draft.uiScalarValues.rapidSensitivity, model));
      setPressSensitivity(clampRapidTriggerForModel(draft.uiScalarValues.pressSensitivity, model));
      setReleaseSensitivity(
        clampRapidTriggerForModel(draft.uiScalarValues.releaseSensitivity, model)
      );
      setDeadzoneEnabled(draft.uiScalarValues.deadzoneEnabled);
      setTopDeadzone(snapToStep(draft.uiScalarValues.topDeadzone, 0, 1, step));
      setBottomDeadzone(snapToStep(draft.uiScalarValues.bottomDeadzone, 0, 1, step));
      setSelectedSwitchId(normalizeSwitchProfileId(draft.uiScalarValues.selectedSwitchId));
    } else if (refKey) {
      setActuation(nextActuation[refKey] ?? 1.6);
      setRapidTrigger(nextRapidTrigger[refKey] ?? false);
      setSplitSensitivity(nextSplitSensitivity[refKey] ?? false);
      setRapidSensitivity(nextRapidSensitivity[refKey] ?? 0.65);
      setPressSensitivity(nextPressSensitivity[refKey] ?? 0.5);
      setReleaseSensitivity(nextReleaseSensitivity[refKey] ?? 0.55);
      setDeadzoneEnabled(nextDeadzoneEnabled[refKey] ?? true);
      setTopDeadzone(nextTopDeadzone[refKey] ?? 0);
      setBottomDeadzone(nextBottomDeadzone[refKey] ?? 0);
      if (nextSwitches[refKey]) {
        setSelectedSwitchId(normalizeSwitchProfileId(nextSwitches[refKey]));
      }
    }
  }
  function applyHydratedPerformance(
    hydrated: Map<string, HydratedKeySettings>,
    draft?: ProfileDraft
  ) {
    function preserveEdits<T>(fresh: Record<string, T>, saved?: Record<string, T>) {
      for (const keyId of draft?.dirtyKeys ?? []) {
        if (saved?.[keyId] !== undefined) {
          fresh[keyId] = saved[keyId];
        }
      }
      return fresh;
    }
    setActuationByKey(previous =>
      preserveEdits(mergeHydratedNumbers(previous, hydrated, 'actuationMm'), draft?.actuationByKey)
    );
    setRapidTriggerByKey(previous =>
      preserveEdits(
        mergeHydratedBooleans(previous, hydrated, 'rapidTriggerEnabled'),
        draft?.rapidTriggerByKey
      )
    );
    setSplitSensitivityByKey(previous =>
      preserveEdits(
        mergeHydratedBooleans(previous, hydrated, 'splitSensitivity'),
        draft?.splitSensitivityByKey
      )
    );
    setRapidSensitivityByKey(previous =>
      preserveEdits(
        mergeHydratedNumbers(previous, hydrated, 'rapidSensitivityMm'),
        draft?.rapidSensitivityByKey
      )
    );
    setPressSensitivityByKey(previous =>
      preserveEdits(
        mergeHydratedNumbers(previous, hydrated, 'pressSensitivityMm'),
        draft?.pressSensitivityByKey
      )
    );
    setReleaseSensitivityByKey(previous =>
      preserveEdits(
        mergeHydratedNumbers(previous, hydrated, 'releaseSensitivityMm'),
        draft?.releaseSensitivityByKey
      )
    );
    setDeadzoneEnabledByKey(previous =>
      preserveEdits(
        mergeHydratedBooleans(previous, hydrated, 'deadzoneEnabled'),
        draft?.deadzoneEnabledByKey
      )
    );
    setTopDeadzoneByKey(previous =>
      preserveEdits(
        mergeHydratedNumbers(previous, hydrated, 'topDeadzoneMm'),
        draft?.topDeadzoneByKey
      )
    );
    setBottomDeadzoneByKey(previous =>
      preserveEdits(
        mergeHydratedNumbers(previous, hydrated, 'bottomDeadzoneMm'),
        draft?.bottomDeadzoneByKey
      )
    );
    setAssignedSwitchesByKey(previous => {
      const next = {
        ...previous
      };
      for (const [keyId, settings] of hydrated) {
        if (isSwitchProfileId(settings.switchProfile)) {
          next[keyId] = normalizeSwitchProfileId(settings.switchProfile);
        }
      }
      return preserveEdits(
        next,
        draft?.assignedSwitchesByKey as Record<string, SwitchTone> | undefined
      );
    });
    setDirtyKeys(new Set(draft?.dirtyKeys ?? []));
  }
  return {
    actuation,
    rapidTrigger,
    splitSensitivity,
    rapidSensitivity,
    pressSensitivity,
    releaseSensitivity,
    deadzoneEnabled,
    topDeadzone,
    bottomDeadzone,
    selectedSwitchId,
    selectedSwitch,
    assignedSwitchesByKey,
    actuationByKey,
    rapidTriggerByKey,
    splitSensitivityByKey,
    rapidSensitivityByKey,
    pressSensitivityByKey,
    releaseSensitivityByKey,
    deadzoneEnabledByKey,
    topDeadzoneByKey,
    bottomDeadzoneByKey,
    dirtyKeys,
    setDirtyKeys,
    switchPreviewByKey,
    rapidPreviewByKey,
    deadzonePreviewByKey,
    actuationMixed,
    rapidTriggerMixed,
    splitSensitivityMixed,
    rapidSensitivityMixed,
    pressSensitivityMixed,
    releaseSensitivityMixed,
    deadzoneEnabledMixed,
    topDeadzoneMixed,
    bottomDeadzoneMixed,
    switchProfileMixed,
    rapidTriggerControlsEnabled,
    splitSensitivityControlsEnabled,
    deadzoneControlsEnabled,
    assignSwitchProfile,
    setActuationForSelection,
    setRapidTriggerForSelection,
    setSplitSensitivityForSelection,
    setRapidSensitivityForSelection,
    setPressSensitivityForSelection,
    setReleaseSensitivityForSelection,
    setDeadzoneEnabledForSelection,
    setTopDeadzoneForSelection,
    setBottomDeadzoneForSelection,
    expandForModel,
    restoreFromDraft,
    applyHydratedPerformance
  };
}
