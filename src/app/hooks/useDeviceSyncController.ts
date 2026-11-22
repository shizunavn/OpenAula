import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react';
import type { RgbTab } from '../../components/RgbSettingsPage';
import type { LanguagePreference } from '../../i18n';
import { heroLayout } from '../../keyboard/layout';
import type { HeroDeviceModelId } from '../../keyboard/devices';
import { getBoard } from '../../keyboard/registry';
import {
  autoConnectAnyProtocol,
  disconnectAllProtocols,
  getActiveConnectedDriver,
  getProtocolDriver,
  isAnyProtocolConnected,
  type KeyboardProtocolDriver
} from '../../protocol/driver';
import { useSlotHistory } from './useSlotHistory';
import { makeKeyDeviceSettings } from '../../protocol/deviceBridge';
import { gamepadService } from '../../protocol/gamepadService';
import { mergeAdvanced, type AdvancedBinding } from '../../protocol/hero68/advanced';
import { hero68HallStream, type Hero68HallStreamState } from '../../protocol/hero68/hallStream';
import type { HydratedKeySettings } from '../../protocol/hero68/hero68Encoder';
import {
  defaultRemapLayers,
  isMacroRemapValue,
  REMAP_LAYERS,
  type RemapLayer,
  type RemapLayers
} from '../../protocol/hero68/remap';
import { restoreStoredRgb, type RgbChanges, type RgbProfile } from '../../protocol/hero68/rgb';
import type { PollingRate, ProfileSlot } from '../../protocol/hero68/types';
import type { Hero68ConnectionState } from '../../protocol/hero68/webhid';
import { rgbService } from '../../protocol/rgbService';
import { publishRgbServiceStatus } from '../../protocol/rgbServiceState';
import { BRAND } from '../../brand';
import { loadMacroLibrary } from '../../state/macros';
import {
  saveOpenHeroState,
  type PersistedOpenHeroState,
  type ProfileDraft
} from '../../state/persistence';
import type { StoredProfileRecord, WootProfileMetadata } from '../../state/profileTypes';
import type { SwitchTone } from '../switchAssets';

/**
 * Coordinates two-way synchronization between the React UI state, browser LocalStorage drafts,
 * and the keyboard's 3 onboard profile slots (P1–P3).
 *
 * When a keyboard connects or switches slots, onboard settings are hydrated first and merged with
 * any unsaved local draft keys (`dirtyKeys`). If the USB connection drops mid-operation, local edits
 * remain preserved in the profile draft so the user can retry saving after reconnecting.
 */
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
  setSelectedKeys?: Dispatch<SetStateAction<Set<string>>>;
  actuation?: number;
  rapidTrigger?: boolean;
  splitSensitivity?: boolean;
  rapidSensitivity?: number;
  pressSensitivity?: number;
  releaseSensitivity?: number;
  deadzoneEnabled?: boolean;
  topDeadzone?: number;
  bottomDeadzone?: number;
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
  restorePerformanceFromDraft: (
    draft: ProfileDraft | undefined,
    keyIds?: readonly string[]
  ) => void;
  applyHydratedPerformance: (
    hydrated: Map<string, HydratedKeySettings>,
    draft?: ProfileDraft
  ) => void;
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
  onboardMetadata?: Record<ProfileSlot, WootProfileMetadata>;
  linkedProfiles?: StoredProfileRecord[];
  inactiveProfiles?: StoredProfileRecord[];
  autoProfileEnabled?: boolean;
  revertToDefaultOnFocusLoss?: boolean;
  notifyOnProfileSwitch?: boolean;
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
  setDeviceSettingsState: Dispatch<
    SetStateAction<'idle' | 'reading' | 'ready' | 'saving' | 'error'>
  >;
  setDeviceReadState: Dispatch<SetStateAction<'idle' | 'reading' | 'success' | 'error'>>;
  setDeviceActionError: Dispatch<SetStateAction<string | null>>;
  readDeviceGeneralSettings: () => Promise<void>;
};

async function withHallStreamPaused<T>(
  driver: KeyboardProtocolDriver,
  keyIds: readonly string[],
  work: () => Promise<T>
): Promise<T> {
  if (!driver.pausesHallStreamDuringProfileIo) {
    return work();
  }
  const snapshotHall = hero68HallStream.getSnapshot();
  const shouldResumeHall = snapshotHall.active || snapshotHall.starting;
  const requestedHallKeys = hero68HallStream.getRequestedKeys();
  const hallSource = snapshotHall.source;
  if (shouldResumeHall) {
    await hero68HallStream.stop();
  }
  try {
    return await work();
  } finally {
    if (shouldResumeHall && driver.connected) {
      await hero68HallStream.start(requestedHallKeys, hallSource, keyIds).catch(() => {});
    }
  }
}

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
  setSelectedKeys,
  actuation = 1.6,
  rapidTrigger = false,
  splitSensitivity = false,
  rapidSensitivity = 0.65,
  pressSensitivity = 0.5,
  releaseSensitivity = 0.55,
  deadzoneEnabled = true,
  topDeadzone = 0,
  bottomDeadzone = 0,
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
  onboardMetadata,
  linkedProfiles,
  inactiveProfiles,
  autoProfileEnabled,
  revertToDefaultOnFocusLoss,
  notifyOnProfileSwitch,
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
  const isAnyDeviceConnected = () => isAnyProtocolConnected();
  const resolveActiveDriver = (model: HeroDeviceModelId = deviceModel) =>
    getActiveConnectedDriver() ?? getProtocolDriver(getBoard(model).protocol);

  function currentProfileDraft(): ProfileDraft {
    return {
      selectedKeys: Array.from(selectedKeys),
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
      remapBaseline: remapBaselineRef.current,
      uiScalarValues: {
        actuation,
        rapidTrigger,
        splitSensitivity,
        rapidSensitivity,
        pressSensitivity,
        releaseSensitivity,
        deadzoneEnabled,
        topDeadzone,
        bottomDeadzone,
        selectedSwitchId
      }
    };
  }

  function restoreProfileDraft(draft?: ProfileDraft, keyIds: readonly string[] = modelKeyIds) {
    restoreWorkspaceDraft(draft, keyIds);
    restorePerformanceFromDraft(draft, keyIds);
  }

  function applyHistorySnapshot(target: ProfileDraft) {
    const cloned = structuredClone(target);
    if (setSelectedKeys && cloned.selectedKeys?.length) {
      setSelectedKeys(new Set(cloned.selectedKeys));
    }
    restorePerformanceFromDraft(cloned, modelKeyIds);
    if (cloned.remapLayers) {
      setRemapLayers(cloned.remapLayers);
    }
    setDirtyRemaps(new Set(cloned.dirtyRemaps ?? []));
    setAdvancedBindings(cloned.advancedBindings ?? []);
    if (cloned.rgb) {
      setRgb(cloned.rgb);
      getProtocolDriver(getBoard(deviceModel).protocol).cacheSlotRgb?.(profileSlot, cloned.rgb);
    }
    setSaveState('idle');
    setDeviceActionError(null);
  }

  const {
    suppressHistoryRef,
    resetSlotHistoryBaseline,
    undoProfileChange,
    redoProfileChange,
    canUndo,
    canRedo
  } = useSlotHistory({
    profileSlot,
    currentProfileDraft,
    applySnapshot: applyHistorySnapshot,
    isBusy: () => profileBusyRef.current,
    trackDeps: [
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
      advancedBindings,
      rgb,
      dirtyKeys,
      dirtyRemaps,
      actuation,
      rapidTrigger,
      splitSensitivity,
      rapidSensitivity,
      pressSensitivity,
      releaseSensitivity,
      deadzoneEnabled,
      topDeadzone,
      bottomDeadzone,
      selectedSwitchId
    ]
  });

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
      },
      onboardMetadata,
      linkedProfiles,
      inactiveProfiles,
      autoProfileEnabled,
      revertToDefaultOnFocusLoss,
      notifyOnProfileSwitch
    };
  }

  useEffect(() => {
    saveOpenHeroState(buildPersistedSnapshot());
  }, [
    activeRail,
    activePage,
    activeSettingsPage,
    deviceModel,
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
    profileNames,
    remapLayers,
    profileDrafts,
    onboardMetadata,
    linkedProfiles,
    inactiveProfiles,
    autoProfileEnabled,
    revertToDefaultOnFocusLoss,
    notifyOnProfileSwitch,
    dirtyKeys,
    dirtyRemaps,
    rgb,
    rgbBaseline,
    advancedBindings,
    advancedBaseline
  ]);

  useEffect(() => {
    if (autoConnectStartedRef.current) {
      return;
    }
    autoConnectStartedRef.current = true;
    void (async () => {
      try {
        const connectedDriver = await autoConnectAnyProtocol();
        if (connectedDriver) {
          await hydrateConnectedDevice();
        }
      } catch (error) {
        setDeviceActionError(error instanceof Error ? error.message : String(error));
      }
    })();
  }, []);

  async function readCurrentProfileSlot(): Promise<ProfileSlot> {
    const activeDriver = resolveActiveDriver();
    if (activeDriver.family === 'xsyd') {
      try {
        const slot = await activeDriver.readProfileSlot();
        if (slot === 0 || slot === 1 || slot === 2 || slot === 3) {
          return slot;
        }
      } catch {
        // Keep current workspace slot if the board does not reply.
      }
      return profileSlot;
    }
    return activeDriver.readProfileSlot();
  }

  async function hydrateConnectedDevice() {
    setDeviceActionError(null);
    setDeviceReadState('idle');
    setLoadedProfileSlot(null);
    const activeDriver = getActiveConnectedDriver() ?? getProtocolDriver('bytetech');
    const detectedModel = await activeDriver.detectModel().catch(() => null);
    const unitMm = activeDriver.connected ? await activeDriver.syncPrecision() : 0.01;
    const targetModel = activeDriver.resolveConnectedModel(detectedModel, deviceModel, unitMm);
    setDeviceActionError(
      detectedModel
        ? null
        : 'Could not verify whether this keyboard is a HERO68 or HERO84. Writes are blocked until it reconnects.'
    );
    if (targetModel !== deviceModel) {
      selectDeviceModel(targetModel);
    }
    const activeSlot = await readCurrentProfileSlot().catch(() => profileSlot);
    setProfileDrafts(previous => ({
      ...previous,
      [profileSlot]: currentProfileDraft()
    }));
    const savedDraft =
      activeSlot === profileSlot ? currentProfileDraft() : profileDrafts[activeSlot];
    const draft = savedDraft
      ? {
          ...savedDraft,
          dirtyKeys: []
        }
      : undefined;
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
          const activeDriver = getActiveConnectedDriver();
          await activeDriver?.sendLiveIdle();
          setRgbStreamActive(false);
        }
        await disconnectAllProtocols();
        setLoadedProfileSlot(null);
        setDeviceSettingsState('idle');
      } else {
        const preferredDriver = getProtocolDriver(getBoard(deviceModel).protocol);
        const xsydDriver = getProtocolDriver('xsyd');
        if (preferredDriver.family === 'xsyd' || (await xsydDriver.hasAuthorizedDevice())) {
          await xsydDriver.connect(true);
        } else {
          try {
            await preferredDriver.connect(true);
          } catch (error) {
            if (await xsydDriver.hasAuthorizedDevice()) {
              await xsydDriver.connect(false);
            } else {
              throw error;
            }
          }
        }
        await hydrateConnectedDevice();
      }
    } catch (error) {
      setDeviceActionError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleReadFromDevice(
    slot: ProfileSlot = profileSlot,
    draft?: ProfileDraft,
    targetModel: HeroDeviceModelId = deviceModel
  ) {
    if (!isAnyDeviceConnected() || profileBusyRef.current) {
      return;
    }
    profileBusyRef.current = true;
    setProfileBusy(true);
    try {
      await readAndApplyProfile(
        slot,
        draft ?? (slot === profileSlot ? currentProfileDraft() : profileDrafts[slot]),
        targetModel
      );
    } finally {
      profileBusyRef.current = false;
      setProfileBusy(false);
    }
  }

  async function readAndApplyProfile(
    slot: ProfileSlot,
    draft?: ProfileDraft,
    targetModel: HeroDeviceModelId = deviceModel
  ) {
    suppressHistoryRef.current = true;
    setDeviceActionError(null);
    setDeviceReadState('reading');
    setLoadedProfileSlot(null);
    const activeDriver = getActiveConnectedDriver() ?? getProtocolDriver('bytetech');
    const detectedModel = await activeDriver.detectModel().catch(() => null);
    if (!detectedModel) {
      setDeviceReadState('error');
      setDeviceActionError(
        'Could not verify whether this keyboard is a HERO68 or HERO84. Reconnect it and try again.'
      );
      return false;
    }
    const unitMm = activeDriver.connected ? await activeDriver.syncPrecision() : 0.01;
    targetModel = activeDriver.resolveConnectedModel(detectedModel, targetModel, unitMm);
    if (targetModel !== deviceModel) {
      selectDeviceModel(targetModel);
    }
    const activeKeyIds = heroLayout(targetModel).keyIds;
    try {
      return await withHallStreamPaused(activeDriver, activeKeyIds, async () => {
        if (!activeDriver.pausesHallStreamDuringProfileIo) {
          await activeDriver.syncPrecision();
        }
        const hydrated = await activeDriver.hydrate(slot, activeKeyIds, targetModel);
        const mappings = await activeDriver.readRemapLayers(activeKeyIds, targetModel);
        const hydratedRgb = await activeDriver.readRgbProfile(slot, activeKeyIds, targetModel, {
          rgb: draft?.rgb,
          rgbDirty: draft?.rgbDirty
        });
        if (activeDriver.readAdvancedBindings) {
          setAdvancedHydratedSlot(null);
          try {
            const freshAdvanced = await activeDriver.readAdvancedBindings(targetModel);
            setAdvancedBindings(
              mergeAdvanced(freshAdvanced, draft?.advancedBindings, draft?.advancedBaseline)
            );
            setAdvancedBaseline(freshAdvanced);
            setAdvancedHydratedSlot(slot);
            setAdvancedReadError(null);
          } catch (error) {
            setAdvancedReadError(error instanceof Error ? error.message : String(error));
          }
        } else {
          setAdvancedHydratedSlot(slot);
          setAdvancedReadError(null);
          if (draft?.advancedBindings) {
            setAdvancedBindings(draft.advancedBindings);
          }
        }
        setRgbBaseline(hydratedRgb.baseline);
        setRgb(hydratedRgb.current);
        setRgbHydratedSlot(slot);
        remapBaselineRef.current = structuredClone(mappings);
        if (activeDriver.readProfileName) {
          const names: Partial<Record<ProfileSlot, string>> = {};
          for (const nameSlot of REMAP_LAYERS) {
            try {
              names[nameSlot] =
                (await activeDriver.readProfileName(nameSlot)) ?? `Onboard Profile ${nameSlot}`;
            } catch {} /* performance/remap reads remain authoritative */
          }
          setProfileNames(previous => ({
            ...previous,
            ...names
          }));
        }
        applyHydratedPerformance(hydrated, draft);
        for (const layer of REMAP_LAYERS) {
          for (const keyId of activeKeyIds) {
            if (
              draft?.dirtyRemaps?.includes(`${layer}:${keyId}`) &&
              draft.remapLayers?.[layer][keyId] !== undefined
            ) {
              mappings[layer][keyId] = draft.remapLayers[layer][keyId];
            }
          }
        }
        setRemapLayers(mappings);
        setDirtyRemaps(
          new Set(
            (draft?.dirtyRemaps ?? []).filter(change => {
              const [layer, keyId] = change.split(':');
              return (
                mappings[Number(layer) as RemapLayer]?.[keyId] !==
                remapBaselineRef.current[Number(layer) as RemapLayer]?.[keyId]
              );
            })
          )
        );
        suppressHistoryRef.current = true;
        resetSlotHistoryBaseline(slot);
        setLoadedProfileSlot(slot);
        setSaveState('idle');
        setDeviceReadState('success');
        window.setTimeout(
          () => setDeviceReadState(current => (current === 'success' ? 'idle' : current)),
          1800
        );
        return true;
      });
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
    const activeDriver = getActiveConnectedDriver();
    if (activeDriver?.viaService) {
      await gamepadService.profile(slot).catch(e => setDeviceActionError(String(e)));
    }
    setProfileDrafts(previous => ({
      ...previous,
      [profileSlot]: currentProfileDraft()
    }));
    suppressHistoryRef.current = true;
    const draft = profileDrafts[slot];
    restoreProfileDraft(draft);
    setProfileSlot(slot);
    setLoadedProfileSlot(null);
    setDeviceReadState('idle');
    setDeviceActionError(null);
    if (isAnyDeviceConnected()) {
      await handleReadFromDevice(slot, draft);
    }
  }

  async function renameProfile(name: string) {
    if (profileBusyRef.current) {
      return false;
    }
    const activeDriver = getActiveConnectedDriver();
    if (!activeDriver?.saveProfileName) {
      setProfileNames(previous => ({
        ...previous,
        [profileSlot]: name
      }));
      return true;
    }
    if (loadedProfileSlot !== profileSlot) {
      return false;
    }
    profileBusyRef.current = true;
    setProfileBusy(true);
    setDeviceActionError(null);
    try {
      await activeDriver.saveProfileName(profileSlot, name);
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
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `hero68-profile-${profileSlot}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function resetProfileToDefaults(): () => void {
    const previousDraft = structuredClone(currentProfileDraft());
    restorePerformanceFromDraft(undefined, modelKeyIds);
    setDirtyKeys(new Set(modelKeyIds));
    const factoryRemap = defaultRemapLayers(modelKeyIds);
    setRemapLayers(factoryRemap);
    const nextDirtyRemaps = new Set<string>();
    for (const layer of REMAP_LAYERS) {
      for (const keyId of modelKeyIds) {
        if (remapBaselineRef.current[layer]?.[keyId] !== factoryRemap[layer]?.[keyId]) {
          nextDirtyRemaps.add(`${layer}:${keyId}`);
        }
      }
    }
    setDirtyRemaps(nextDirtyRemaps);
    setAdvancedBindings(advancedBaseline.filter(b => b.kind === 'UNKNOWN'));
    setRgb(
      getBoard(deviceModel).protocol === 'xsyd'
        ? getProtocolDriver('xsyd').defaultRgb()
        : restoreStoredRgb(undefined)
    );
    setSaveState('idle');
    setDeviceActionError(null);
    return () => {
      restorePerformanceFromDraft(previousDraft, modelKeyIds);
      if (previousDraft.remapLayers) {
        setRemapLayers(previousDraft.remapLayers);
      }
      setDirtyRemaps(new Set(previousDraft.dirtyRemaps ?? []));
      setAdvancedBindings(previousDraft.advancedBindings ?? []);
      if (previousDraft.rgb) {
        setRgb(previousDraft.rgb);
      }
      setSaveState('idle');
    };
  }

  function discardProfileDraftChanges() {
    if (profileBusyRef.current) {
      return;
    }
    setDeviceActionError(null);
    if (isAnyDeviceConnected() && loadedProfileSlot === profileSlot) {
      void handleReadFromDevice(profileSlot);
      return;
    }
    setRemapLayers(structuredClone(remapBaselineRef.current));
    setDirtyRemaps(new Set());
    setAdvancedBindings(structuredClone(advancedBaseline));
    setRgb(structuredClone(rgbBaseline));
    setDirtyKeys(new Set());
    setSaveState('idle');
  }

  async function handleSaveAll() {
    if (profileBusyRef.current) {
      return;
    }
    const activeDriver = getActiveConnectedDriver();
    if (!activeDriver) {
      setDeviceActionError('Connect HERO68 before saving.');
      return;
    }
    if (loadedProfileSlot !== profileSlot) {
      setDeviceActionError(
        `Profile ${profileSlot} has not been read from the keyboard yet. Read it before saving to avoid overwriting unknown per-key values.`
      );
      return;
    }
    const customRgbChanged =
      activeDriver.family === 'xsyd' &&
      JSON.stringify(rgb.custom ?? null) !== JSON.stringify(rgbBaseline.custom ?? null);
    if (
      dirtyKeys.size === 0 &&
      dirtyRemaps.size === 0 &&
      rgbPending === 0 &&
      !customRgbChanged &&
      !advancedPending
    ) {
      return;
    }
    if (advancedPending && advancedHydratedSlot !== profileSlot) {
      setDeviceActionError(
        'Read Advanced Keys from this profile before saving. ' + (advancedReadError ?? '')
      );
      return;
    }
    if (rgbHydratedSlot !== profileSlot && activeDriver.requiresRgbHydrationBeforeSave) {
      setDeviceActionError('Read RGB from this profile before saving.');
      return;
    }
    saveOpenHeroState(buildPersistedSnapshot());
    const snapshot = {
      keys: Array.from(dirtyKeys).map(keyId =>
        makeKeyDeviceSettings(
          keyId,
          {
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
          },
          deviceModel
        )
      ),
      tachyon,
      profileSlot,
      model: deviceModel
    };
    try {
      profileBusyRef.current = true;
      setProfileBusy(true);
      setDeviceActionError(null);
      await withHallStreamPaused(activeDriver, modelKeyIds, async () => {
        if (dirtyKeys.size) {
          const readback = await activeDriver.savePerformanceAndVerify(snapshot);
          applyHydratedPerformance(readback);
        }
        if (dirtyRemaps.size) {
          const hasMacroRemap = [...dirtyRemaps].some(change => {
            const [layerText, keyId] = change.split(':');
            const remapLayer = Number(layerText) as RemapLayer;
            return isMacroRemapValue(remapLayers[remapLayer]?.[keyId]);
          });
          if (hasMacroRemap && activeDriver.syncMacroLibrary) {
            const macroLibrary = loadMacroLibrary();
            if (!macroLibrary.length) {
              throw new Error(
                'This mapping references a macro, but the local macro library is empty.'
              );
            }
            await activeDriver.syncMacroLibrary(profileSlot, macroLibrary);
          }
          await activeDriver.saveRemapChanges(
            profileSlot,
            remapLayers,
            dirtyRemaps,
            modelKeyIds,
            deviceModel
          );
        }
        if (advancedPending) {
          const verified = await activeDriver.saveAdvancedBindings(
            profileSlot,
            advancedBindings,
            advancedBaseline,
            deviceModel
          );
          setAdvancedBaseline(verified);
        }
        if ((rgbPending || customRgbChanged) && !tachyon) {
          if (activePage === 'rgb' && activeRgbTab === 'onboard' && activeDriver.viaService) {
            const result = await rgbService.mode('onboard');
            publishRgbServiceStatus(result);
          }
          const savedRgb = await activeDriver.saveRgb(rgb, {
            baseline: rgbBaseline,
            slot: profileSlot,
            keyIds: modelKeyIds,
            model: deviceModel,
            onBaselineUpdate: setRgbBaseline
          });
          if (activeDriver.family === 'xsyd') {
            setRgb(savedRgb);
          }
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
      });
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
    resetProfileToDefaults,
    discardProfileDraftChanges,
    canUndo,
    canRedo,
    undoProfileChange,
    redoProfileChange,
    handleSaveAll
  };
}
