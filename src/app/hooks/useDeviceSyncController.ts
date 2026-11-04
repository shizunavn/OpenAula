import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { RgbTab } from '../../components/RgbSettingsPage';
import type { LanguagePreference } from '../../i18n';
import { heroLayout } from '../../keyboard/layout';
import type { HeroDeviceModelId } from '../../keyboard/devices';
import { makeKeyDeviceSettings, saveDeviceConfiguration } from '../../protocol/deviceBridge';
import { gamepadService } from '../../protocol/gamepadService';
import { mergeAdvanced, readAdvancedBindings, saveAdvancedBindings, type AdvancedBinding } from '../../protocol/hero68/advanced';
import { liveIdle, readActiveProfile, selectProfile } from '../../protocol/hero68/commands';
import { hero68HallStream, type Hero68HallStreamState } from '../../protocol/hero68/hallStream';
import { hydrateFromDevice, type HydratedKeySettings } from '../../protocol/hero68/hero68Encoder';
import { syncHero68MacroLibrary } from '../../protocol/hero68/macroDevice';
import { isMacroRemapValue, readOnboardProfileName, readRemapLayers, REMAP_LAYERS, saveOnboardProfileName, saveRemapChanges, type RemapLayer, type RemapLayers } from '../../protocol/hero68/remap';
import { mergeRgb, readRgbProfile, saveRgbProfile, type RgbChanges, type RgbProfile } from '../../protocol/hero68/rgb';
import type { PollingRate, ProfileSlot } from '../../protocol/hero68/types';
import { hero68DeviceManager, type Hero68ConnectionState } from '../../protocol/hero68/webhid';
import { rgbService } from '../../protocol/rgbService';
import { publishRgbServiceStatus } from '../../protocol/rgbServiceState';
import { BRAND } from '../../brand';
import { loadMacroLibrary } from '../../state/macros';
import { saveOpenHeroState, type PersistedOpenHeroState, type ProfileDraft } from '../../state/persistence';
import type { SwitchTone } from '../switchAssets';
export type UseDeviceSyncControllerOptions = {
  deviceConnectionState: Hero68ConnectionState;
  deviceModel: HeroDeviceModelId;
  modelKeyIds: readonly string[];
  selectDeviceModel: (nextModel: HeroDeviceModelId) => void;
  hallStream: Hero68HallStreamState;
  rgbStreamActive: boolean;
  setRgbStreamActive: Dispatch<SetStateAction<boolean>>;
  activeRail: 'keyboard' | 'settings' | 'help';
  activePage: string;
  activeSettingsPage: string;
  activeRgbTab: RgbTab;
  selectedKeys: Set<string>;
  selectedSwitchId: SwitchTone;
  assignedSwitchesByKey: Record<string, SwitchTone>;
  actuationByKey: Record<string, number>;
  rapidTriggerByKey: Record<string, boolean>;
  splitSensitivityByKey: Record<string, boolean>;
  rapidSensitivityByKey: Record<string, number>;
  pressSensitivityByKey: Record<string, number>;
  releaseSensitivityByKey: Record<string, number>;
  deadzoneEnabledByKey: Record<string, boolean>;
  topDeadzoneByKey: Record<string, number>;
  bottomDeadzoneByKey: Record<string, number>;
  dirtyKeys: Set<string>;
  setDirtyKeys: Dispatch<SetStateAction<Set<string>>>;
  restorePerformanceFromDraft: (draft: ProfileDraft | undefined, keyIds?: readonly string[]) => void;
  applyHydratedPerformance: (hydrated: Map<string, HydratedKeySettings>, draft?: ProfileDraft) => void;
  tachyon: boolean;
  tachyonPreviousPollingRate: PollingRate | null;
  compactSidebar: boolean;
  showAdvancedPages: boolean;
  rememberSelection: boolean;
  languagePreference: LanguagePreference;
  languageManuallySet: boolean;
  languageRegionDetected: boolean;
  devicePollingRate: PollingRate | null;
  deviceOsModeMac: boolean;
  deviceWinLock: boolean;
  deviceHallDebounce: boolean;
  deviceAutoCalibration: boolean;
  switchSearch: string;
  switchBrandFilter: string;
  profileSlot: ProfileSlot;
  setProfileSlot: Dispatch<SetStateAction<ProfileSlot>>;
  loadedProfileSlot: ProfileSlot | null;
  setLoadedProfileSlot: Dispatch<SetStateAction<ProfileSlot | null>>;
  profileNames: Record<ProfileSlot, string>;
  setProfileNames: Dispatch<SetStateAction<Record<ProfileSlot, string>>>;
  profileDrafts: Partial<Record<ProfileSlot, ProfileDraft>>;
  setProfileDrafts: Dispatch<SetStateAction<Partial<Record<ProfileSlot, ProfileDraft>>>>;
  profileBusyRef: MutableRefObject<boolean>;
  setProfileBusy: Dispatch<SetStateAction<boolean>>;
  saveState: 'idle' | 'sent';
  setSaveState: Dispatch<SetStateAction<'idle' | 'sent'>>;
  remapLayers: RemapLayers;
  setRemapLayers: Dispatch<SetStateAction<RemapLayers>>;
  dirtyRemaps: Set<string>;
  setDirtyRemaps: Dispatch<SetStateAction<Set<string>>>;
  remapBaselineRef: MutableRefObject<RemapLayers>;
  rgb: RgbProfile;
  setRgb: Dispatch<SetStateAction<RgbProfile>>;
  rgbBaseline: RgbProfile;
  setRgbBaseline: Dispatch<SetStateAction<RgbProfile>>;
  rgbHydratedSlot: ProfileSlot | null;
  setRgbHydratedSlot: Dispatch<SetStateAction<ProfileSlot | null>>;
  rgbDirty: RgbChanges;
  rgbPending: number;
  advancedBindings: AdvancedBinding[];
  setAdvancedBindings: Dispatch<SetStateAction<AdvancedBinding[]>>;
  advancedBaseline: AdvancedBinding[];
  setAdvancedBaseline: Dispatch<SetStateAction<AdvancedBinding[]>>;
  advancedHydratedSlot: ProfileSlot | null;
  setAdvancedHydratedSlot: Dispatch<SetStateAction<ProfileSlot | null>>;
  advancedReadError: string | null;
  setAdvancedReadError: Dispatch<SetStateAction<string | null>>;
  advancedPending: boolean;
  restoreWorkspaceDraft: (draft?: ProfileDraft, keyIds?: readonly string[]) => void;
  setDeviceSettingsState: Dispatch<SetStateAction<'idle' | 'reading' | 'ready' | 'saving' | 'error'>>;
  setDeviceReadState: Dispatch<SetStateAction<'idle' | 'reading' | 'success' | 'error'>>;
  setDeviceActionError: Dispatch<SetStateAction<string | null>>;
  readDeviceGeneralSettings: () => Promise<void>;
};
export function useDeviceSyncController({
  deviceConnectionState,
  deviceModel,
  modelKeyIds,
  selectDeviceModel,
  hallStream,
  rgbStreamActive,
  setRgbStreamActive,
  activeRail,
  activePage,
  activeSettingsPage,
  activeRgbTab,
  selectedKeys,
  selectedSwitchId,
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
  restorePerformanceFromDraft,
  applyHydratedPerformance,
  tachyon,
  tachyonPreviousPollingRate,
  compactSidebar,
  showAdvancedPages,
  rememberSelection,
  languagePreference,
  languageManuallySet,
  languageRegionDetected,
  devicePollingRate,
  deviceOsModeMac,
  deviceWinLock,
  deviceHallDebounce,
  deviceAutoCalibration,
  switchSearch,
  switchBrandFilter,
  profileSlot,
  setProfileSlot,
  loadedProfileSlot,
  setLoadedProfileSlot,
  profileNames,
  setProfileNames,
  profileDrafts,
  setProfileDrafts,
  profileBusyRef,
  setProfileBusy,
  setSaveState,
  remapLayers,
  setRemapLayers,
  dirtyRemaps,
  setDirtyRemaps,
  remapBaselineRef,
  rgb,
  setRgb,
  rgbBaseline,
  setRgbBaseline,
  rgbHydratedSlot,
  setRgbHydratedSlot,
  rgbDirty,
  rgbPending,
  advancedBindings,
  setAdvancedBindings,
  advancedBaseline,
  setAdvancedBaseline,
  advancedHydratedSlot,
  setAdvancedHydratedSlot,
  advancedReadError,
  setAdvancedReadError,
  advancedPending,
  restoreWorkspaceDraft,
  setDeviceSettingsState,
  setDeviceReadState,
  setDeviceActionError,
  readDeviceGeneralSettings
}: UseDeviceSyncControllerOptions) {
  const autoConnectStartedRef = useRef(false);
  const profileSwitchAllowedAtRef = useRef(0);
  function currentProfileDraft(): ProfileDraft {
    return {
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
      remapLayers,
      rgb,
      rgbBaseline,
      rgbDirty,
      rgbFormat: 1,
      advancedBindings,
      advancedBaseline,
      dirtyKeys: Array.from(dirtyKeys),
      dirtyRemaps: Array.from(dirtyRemaps),
      remapBaseline: remapBaselineRef.current
    };
  }
  function restoreProfileDraft(draft?: ProfileDraft, keyIds: readonly string[] = modelKeyIds) {
    restoreWorkspaceDraft(draft, keyIds);
    restorePerformanceFromDraft(draft, keyIds);
  }
  function buildPersistedSnapshot(): PersistedOpenHeroState {
    return {
      activeRail,
      activePage,
      activeSettingsPage,
      deviceModel,
      selectedKeys: rememberSelection ? Array.from(selectedKeys) : [],
      selectedSwitchId,
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
      tachyon,
      tachyonPreviousPollingRate: tachyonPreviousPollingRate ?? undefined,
      compactSidebar,
      showAdvancedPages,
      rememberSelection,
      languagePreference,
      languageManuallySet,
      languageRegionDetected,
      pollingRate: devicePollingRate ?? undefined,
      osModeMac: deviceOsModeMac,
      winLock: deviceWinLock,
      hallDebounce: deviceHallDebounce,
      autoCalibration: deviceAutoCalibration,
      switchSearch,
      switchBrandFilter,
      profileSlot,
      profileNames,
      remapLayers,
      profileDrafts: {
        ...profileDrafts,
        [profileSlot]: currentProfileDraft()
      }
    };
  }
  useEffect(() => {
    saveOpenHeroState(buildPersistedSnapshot());
  }, [activeRail, activePage, activeSettingsPage, deviceModel, selectedKeys, selectedSwitchId, assignedSwitchesByKey, actuationByKey, rapidTriggerByKey, splitSensitivityByKey, rapidSensitivityByKey, pressSensitivityByKey, releaseSensitivityByKey, deadzoneEnabledByKey, topDeadzoneByKey, bottomDeadzoneByKey, tachyon, tachyonPreviousPollingRate, compactSidebar, showAdvancedPages, rememberSelection, languagePreference, languageManuallySet, languageRegionDetected, devicePollingRate, deviceOsModeMac, deviceWinLock, deviceHallDebounce, deviceAutoCalibration, switchSearch, switchBrandFilter, profileSlot, profileNames, remapLayers, profileDrafts, dirtyKeys, dirtyRemaps, rgb, rgbBaseline, advancedBindings, advancedBaseline]);
  useEffect(() => {
    if (autoConnectStartedRef.current) {
      return;
    }
    autoConnectStartedRef.current = true;
    void (async () => {
      try {
        const restored = await hero68DeviceManager.connect(false);
        if (restored) {
          await hydrateConnectedDevice();
        }
      } catch (error) {
        setDeviceActionError(error instanceof Error ? error.message : String(error));
      }
    })();
  }, []);
  async function readCurrentProfileSlot(): Promise<ProfileSlot> {
    const report = await hero68DeviceManager.request(readActiveProfile(), 0x90, 0, 1000);
    const slot = report.data[0];
    if (slot !== 0 && slot !== 1 && slot !== 2) {
      throw new Error(`Unsupported active profile returned by HERO68: ${slot}`);
    }
    return slot;
  }
  async function hydrateConnectedDevice() {
    setDeviceActionError(null);
    setDeviceReadState('idle');
    setLoadedProfileSlot(null);
    const detectedModel = await hero68DeviceManager.detectConnectedModel().catch(() => null);
    const targetModel: HeroDeviceModelId = detectedModel ?? deviceModel;
    setDeviceActionError(detectedModel ? null : 'Could not verify whether this keyboard is a HERO68 or HERO84. Writes are blocked until it reconnects.');
    if (targetModel !== deviceModel) {
      selectDeviceModel(targetModel);
    }
    const activeSlot = await readCurrentProfileSlot().catch(() => profileSlot);
    setProfileDrafts(previous => ({
      ...previous,
      [profileSlot]: currentProfileDraft()
    }));
    const savedDraft = activeSlot === profileSlot ? currentProfileDraft() : profileDrafts[activeSlot];
    const draft = savedDraft ? {
      ...savedDraft,
      dirtyKeys: []
    } : undefined;
    restoreProfileDraft(draft, heroLayout(targetModel).keyIds);
    setProfileSlot(activeSlot);
    await handleReadFromDevice(activeSlot, draft, targetModel);
    await readDeviceGeneralSettings();
  }
  async function handleDeviceConnection() {
    setDeviceActionError(null);
    setDeviceReadState('idle');
    try {
      if (deviceConnectionState === 'connected') {
        if (hallStream.active || hallStream.starting) {
          await hero68HallStream.stop();
        }
        if (rgbStreamActive) {
          if (!hero68DeviceManager.viaService) {
            await hero68DeviceManager.send(liveIdle()).catch(ignoredError => {
              void ignoredError;
            });
          }
          setRgbStreamActive(false);
        }
        await hero68DeviceManager.disconnect();
        setLoadedProfileSlot(null);
        setDeviceSettingsState('idle');
      } else {
        await hero68DeviceManager.connect(true);
        await hydrateConnectedDevice();
      }
    } catch (error) {
      setDeviceActionError(error instanceof Error ? error.message : String(error));
    }
  }
  async function handleReadFromDevice(slot: ProfileSlot = profileSlot, draft?: ProfileDraft, targetModel: HeroDeviceModelId = deviceModel) {
    if (!hero68DeviceManager.connected || profileBusyRef.current) {
      return;
    }
    profileBusyRef.current = true;
    setProfileBusy(true);
    try {
      await readAndApplyProfile(slot, draft ?? (slot === profileSlot ? currentProfileDraft() : profileDrafts[slot]), targetModel);
    } finally {
      profileBusyRef.current = false;
      setProfileBusy(false);
    }
  }
  async function readAndApplyProfile(slot: ProfileSlot, draft?: ProfileDraft, targetModel: HeroDeviceModelId = deviceModel) {
    setDeviceActionError(null);
    setDeviceReadState('reading');
    setLoadedProfileSlot(null);
    const detectedModel = await hero68DeviceManager.detectConnectedModel().catch(() => null);
    if (!detectedModel) {
      setDeviceReadState('error');
      setDeviceActionError('Could not verify whether this keyboard is a HERO68 or HERO84. Reconnect it and try again.');
      return false;
    }
    targetModel = detectedModel;
    const activeKeyIds = heroLayout(targetModel).keyIds;
    try {
      const hydrated = await hydrateFromDevice(hero68DeviceManager, slot, activeKeyIds, targetModel);
      const mappings = await readRemapLayers(hero68DeviceManager, activeKeyIds, targetModel);
      const freshRgb = await readRgbProfile(hero68DeviceManager, activeKeyIds, targetModel);
      setAdvancedHydratedSlot(null);
      try {
        const freshAdvanced = await readAdvancedBindings(hero68DeviceManager, targetModel);
        setAdvancedBindings(mergeAdvanced(freshAdvanced, draft?.advancedBindings, draft?.advancedBaseline));
        setAdvancedBaseline(freshAdvanced);
        setAdvancedHydratedSlot(slot);
        setAdvancedReadError(null);
      } catch (error) {
        setAdvancedReadError(error instanceof Error ? error.message : String(error));
      }
      setRgbBaseline(freshRgb);
      setRgb(mergeRgb(freshRgb, draft?.rgb, draft?.rgbDirty));
      setRgbHydratedSlot(slot);
      remapBaselineRef.current = structuredClone(mappings);
      const names: Partial<Record<ProfileSlot, string>> = {};
      for (const nameSlot of REMAP_LAYERS) {
        try {
          names[nameSlot] = (await readOnboardProfileName(hero68DeviceManager, nameSlot)) ?? `Onboard Profile ${nameSlot}`;
        } catch (ignoredError) {
          void ignoredError;
        } /* performance/remap reads remain authoritative */
      }

      setProfileNames(previous => ({
        ...previous,
        ...names
      }));
      applyHydratedPerformance(hydrated, draft);
      for (const layer of REMAP_LAYERS) {
        for (const keyId of activeKeyIds) {
          if (draft?.dirtyRemaps?.includes(`${layer}:${keyId}`) && draft.remapLayers?.[layer][keyId] !== undefined) {
            mappings[layer][keyId] = draft.remapLayers[layer][keyId];
          }
        }
      }
      setRemapLayers(mappings);
      setDirtyRemaps(new Set((draft?.dirtyRemaps ?? []).filter(change => {
        const [layer, keyId] = change.split(':');
        return mappings[(Number(layer) as RemapLayer)]?.[keyId] !== remapBaselineRef.current[(Number(layer) as RemapLayer)]?.[keyId];
      })));
      setLoadedProfileSlot(slot);
      setSaveState('idle');
      setDeviceReadState('success');
      window.setTimeout(() => setDeviceReadState(current => current === 'success' ? 'idle' : current), 1800);
      return true;
    } catch (error) {
      setLoadedProfileSlot(null);
      setDeviceReadState('error');
      setDeviceActionError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  async function selectOnboardProfile(slot: ProfileSlot) {
    if (profileBusyRef.current || slot === profileSlot) {
      return;
    }
    const now = performance.now();
    if (now < profileSwitchAllowedAtRef.current) {
      return;
    }
    profileSwitchAllowedAtRef.current = now + 200;
    if (hero68DeviceManager.viaService) {
      await gamepadService.profile(slot).catch(e => setDeviceActionError(String(e)));
    }
    setProfileDrafts(previous => ({
      ...previous,
      [profileSlot]: currentProfileDraft()
    }));
    const draft = profileDrafts[slot];
    restoreProfileDraft(draft);
    setProfileSlot(slot);
    setLoadedProfileSlot(null);
    setDeviceReadState('idle');
    setDeviceActionError(null);
    if (hero68DeviceManager.connected) {
      await handleReadFromDevice(slot, draft);
    }
  }
  async function renameProfile(name: string) {
    if (profileBusyRef.current || !hero68DeviceManager.connected || loadedProfileSlot !== profileSlot) {
      return false;
    }
    profileBusyRef.current = true;
    setProfileBusy(true);
    setDeviceActionError(null);
    try {
      await saveOnboardProfileName(hero68DeviceManager, profileSlot, name);
      setProfileNames(previous => ({
        ...previous,
        [profileSlot]: name
      }));
      return true;
    } catch (error) {
      setDeviceActionError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      profileBusyRef.current = false;
      setProfileBusy(false);
    }
  }
  function exportProfile() {
    const data = {
      schema: `${BRAND.exportSchemaPrefix}-profile`,
      version: 1,
      name: profileNames[profileSlot],
      profileSlot,
      settings: currentProfileDraft()
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `hero68-profile-${profileSlot}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function handleSaveAll() {
    if (profileBusyRef.current) {
      return;
    }
    if (!hero68DeviceManager.connected) {
      setDeviceActionError('Connect HERO68 before saving.');
      return;
    }
    if (loadedProfileSlot !== profileSlot) {
      setDeviceActionError(`Profile ${profileSlot} has not been read from the keyboard yet. Read it before saving to avoid overwriting unknown per-key values.`);
      return;
    }
    if (dirtyKeys.size === 0 && dirtyRemaps.size === 0 && rgbPending === 0 && !advancedPending) {
      return;
    }
    if (advancedPending && advancedHydratedSlot !== profileSlot) {
      setDeviceActionError('Read Advanced Keys from this profile before saving. ' + (advancedReadError ?? ''));
      return;
    }
    if (rgbHydratedSlot !== profileSlot) {
      setDeviceActionError('Read RGB from this profile before saving.');
      return;
    }
    saveOpenHeroState(buildPersistedSnapshot());
    const snapshot = {
      keys: Array.from(dirtyKeys).map(keyId => makeKeyDeviceSettings(keyId, {
        actuationMm: actuationByKey[keyId] ?? 1.6,
        rapidTriggerEnabled: rapidTriggerByKey[keyId] ?? false,
        splitSensitivity: splitSensitivityByKey[keyId] ?? false,
        rapidSensitivityMm: rapidSensitivityByKey[keyId] ?? 0.65,
        pressSensitivityMm: pressSensitivityByKey[keyId] ?? 0.5,
        releaseSensitivityMm: releaseSensitivityByKey[keyId] ?? 0.55,
        deadzoneEnabled: deadzoneEnabledByKey[keyId] ?? true,
        topDeadzoneMm: topDeadzoneByKey[keyId] ?? 0,
        bottomDeadzoneMm: bottomDeadzoneByKey[keyId] ?? 0,
        switchProfile: assignedSwitchesByKey[keyId] ?? 'white'
      }, deviceModel)),
      tachyon,
      profileSlot,
      model: deviceModel
    };
    try {
      profileBusyRef.current = true;
      setProfileBusy(true);
      setDeviceActionError(null);
      if (dirtyKeys.size) {
        await saveDeviceConfiguration(snapshot);
        const readback = await hydrateFromDevice(hero68DeviceManager, profileSlot, [...dirtyKeys], deviceModel);
        const near = (actual: number | undefined, wanted: number) => actual !== undefined && Math.abs(actual - wanted) <= 0.011;
        for (const expected of snapshot.keys) {
          const actual = readback.get(expected.keyId);
          const expectedRelease = expected.rapidTriggerEnabled ? expected.splitSensitivity ? expected.releaseSensitivityMm : expected.rapidSensitivityMm : 0;
          const expectedPress = expected.rapidTriggerEnabled ? expected.splitSensitivity ? expected.pressSensitivityMm : expected.rapidSensitivityMm : 0;
          if (!actual || !near(actual.actuationMm, expected.actuationMm) || actual.rapidTriggerEnabled !== expected.rapidTriggerEnabled || !near(actual.pressSensitivityMm, expectedPress) || !near(actual.releaseSensitivityMm, expectedRelease) || actual.deadzoneEnabled !== expected.deadzoneEnabled || !near(actual.topDeadzoneMm, expected.topDeadzoneMm) || !near(actual.bottomDeadzoneMm, expected.bottomDeadzoneMm) || actual.switchProfile !== expected.switchProfile) {
            throw Error(`Key setting readback mismatch: ${expected.keyId}`);
          }
        }
      }
      if ([...dirtyRemaps].some(change => {
        const [layerText, keyId] = change.split(':');
        const remapLayer = (Number(layerText) as RemapLayer);
        return isMacroRemapValue(remapLayers[remapLayer]?.[keyId]);
      })) {
        const macroLibrary = loadMacroLibrary();
        if (!macroLibrary.length) {
          throw new Error('This mapping references a macro, but the local macro library is empty.');
        }
        await hero68DeviceManager.request(selectProfile(profileSlot), 0x10, 0);
        await syncHero68MacroLibrary(hero68DeviceManager, macroLibrary);
      }
      await saveRemapChanges(hero68DeviceManager, profileSlot, remapLayers, dirtyRemaps, modelKeyIds, deviceModel);
      if (advancedPending) {
        const verified = await saveAdvancedBindings(hero68DeviceManager, profileSlot, advancedBindings, advancedBaseline, deviceModel);
        setAdvancedBaseline(verified);
      }
      if (rgbPending && !tachyon) {
        if (activePage === 'rgb' && activeRgbTab === 'onboard' && hero68DeviceManager.viaService) {
          const result = await rgbService.mode('onboard');
          publishRgbServiceStatus(result);
        }
        await saveRgbProfile(hero68DeviceManager, rgb, rgbBaseline, setRgbBaseline, modelKeyIds, deviceModel);
      }
      if (dirtyKeys.size) {
        setDirtyKeys(new Set());
      }
      if (dirtyRemaps.size) {
        remapBaselineRef.current = structuredClone(remapLayers);
        setDirtyRemaps(new Set());
      }
      setSaveState('sent');
      window.setTimeout(() => setSaveState('idle'), 1200);
    } catch (error) {
      setSaveState('idle');
      setDeviceActionError(error instanceof Error ? error.message : String(error));
    } finally {
      profileBusyRef.current = false;
      setProfileBusy(false);
    }
  }
  return {
    handleDeviceConnection,
    handleReadFromDevice,
    selectOnboardProfile,
    renameProfile,
    exportProfile,
    handleSaveAll
  };
}
