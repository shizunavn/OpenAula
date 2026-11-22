import type { HeroDeviceModelId, ProtocolFamilyId } from '../keyboard/registry/types';
import type { MacroDefinition } from '../state/macros';
import {
  saveDeviceConfiguration,
  type DeviceConfigurationSnapshot,
  type Hero68Transport
} from './deviceBridge';
import {
  readAdvancedBindings,
  saveAdvancedBindings,
  type AdvancedBinding
} from './hero68/advanced';
import {
  liveIdle,
  readActiveProfile,
  selectProfile,
  writeOsMode,
  writePollingRate,
  writeWinLock
} from './hero68/commands';
import {
  hydrateFromDevice,
  syncDevicePrecision,
  type HydratedKeySettings
} from './hero68/hero68Encoder';
import { syncHero68MacroLibrary } from './hero68/macroDevice';
import {
  readOnboardProfileName,
  readRemapLayers,
  saveOnboardProfileName,
  saveRemapChanges,
  type RemapLayers
} from './hero68/remap';
import {
  defaultRgb,
  mergeRgb,
  readRgbProfile,
  saveRgbProfile,
  type RgbChanges,
  type RgbProfile
} from './hero68/rgb';
import type { PollingRate, ProfileSlot } from './hero68/types';
import { hero68DeviceManager, type Hero68DeviceSnapshot } from './hero68/webhid';
import { saveXsydAdvancedBindings } from './xsyd/advancedBindings';
import { buildXsydSelectProfileFrame, readXsydProfileSlot } from './xsyd/commands';
import { hydrateFromXsydDevice } from './xsyd/hydrate';
import { readXsydRemapLayers, saveXsydRemapChanges } from './xsyd/remap';
import {
  defaultXsydRgb,
  loadXsydSavedRgb,
  readXsydRgbProfile,
  saveXsydRgbProfile,
  saveXsydSavedRgb
} from './xsyd/rgb';
import { xsydDeviceManager } from './xsyd/webhid';

export type SaveConfigurationOutcome = {
  mode: 'sent';
  packets: string[];
};

export type DriverRgbHydration = {
  baseline: RgbProfile;
  current: RgbProfile;
};

export type DriverRgbDraftContext = {
  rgb?: RgbProfile;
  rgbDirty?: RgbChanges;
};

export type DriverSaveRgbOptions = {
  baseline?: RgbProfile;
  slot?: ProfileSlot;
  keyIds?: readonly string[];
  model?: HeroDeviceModelId;
  onBaselineUpdate?: (next: RgbProfile) => void;
};

export interface KeyboardProtocolDriver {
  readonly family: ProtocolFamilyId;
  readonly transport: Hero68Transport;
  readonly connected: boolean;
  readonly viaService: boolean;
  readonly pausesHallStreamDuringProfileIo: boolean;
  readonly requiresRgbHydrationBeforeSave: boolean;
  getSnapshot(): Hero68DeviceSnapshot;
  subscribe(listener: () => void): () => void;
  hasAuthorizedDevice(): Promise<boolean>;
  connect(requestPermission?: boolean): Promise<boolean>;
  disconnect(): Promise<void>;
  detectModel(): Promise<HeroDeviceModelId | null>;
  syncPrecision(): Promise<number>;
  resolveConnectedModel(
    detectedModel: HeroDeviceModelId | null,
    fallbackModel: HeroDeviceModelId,
    precisionMm: number
  ): HeroDeviceModelId;
  sendLiveIdle(): Promise<void>;
  hydrate(
    slot: ProfileSlot,
    keyIds?: readonly string[],
    model?: HeroDeviceModelId,
    precisionMm?: number
  ): Promise<Map<string, HydratedKeySettings>>;
  saveConfiguration(snapshot: DeviceConfigurationSnapshot): Promise<SaveConfigurationOutcome>;
  savePerformanceAndVerify(
    snapshot: DeviceConfigurationSnapshot
  ): Promise<Map<string, HydratedKeySettings>>;
  selectProfile(slot: ProfileSlot): Promise<void>;
  readProfileSlot(): Promise<ProfileSlot>;
  readProfileName?(slot: ProfileSlot): Promise<string | null>;
  saveProfileName?(slot: ProfileSlot, name: string): Promise<void>;
  readRemapLayers(keyIds: readonly string[], model?: HeroDeviceModelId): Promise<RemapLayers>;
  saveRemapChanges(
    slot: ProfileSlot,
    layers: RemapLayers,
    dirtyRemaps: ReadonlySet<string>,
    keyIds?: readonly string[],
    model?: HeroDeviceModelId
  ): Promise<void>;
  readAdvancedBindings?(model?: HeroDeviceModelId): Promise<AdvancedBinding[]>;
  saveAdvancedBindings(
    slot: ProfileSlot,
    bindings: AdvancedBinding[],
    baseline: AdvancedBinding[],
    model?: HeroDeviceModelId
  ): Promise<AdvancedBinding[]>;
  readRgbProfile(
    slot: ProfileSlot,
    keyIds?: readonly string[],
    model?: HeroDeviceModelId,
    draft?: DriverRgbDraftContext
  ): Promise<DriverRgbHydration>;
  saveRgb(draft: RgbProfile, options?: DriverSaveRgbOptions): Promise<RgbProfile>;
  cacheSlotRgb?(slot: ProfileSlot, rgb: RgbProfile): void;
  syncMacroLibrary?(slot: ProfileSlot, macros: readonly MacroDefinition[]): Promise<void>;
  setPollingRate(rate: PollingRate): Promise<void>;
  setWinLock(enabled: boolean): Promise<boolean>;
  setOsMode(mac: boolean): Promise<boolean>;
  defaultRgb(keyIds?: readonly string[]): RgbProfile;
}

export const bytetechDriver: KeyboardProtocolDriver = {
  family: 'bytetech',
  transport: hero68DeviceManager,
  get connected() {
    return hero68DeviceManager.connected;
  },
  get viaService() {
    return hero68DeviceManager.viaService;
  },
  pausesHallStreamDuringProfileIo: false,
  requiresRgbHydrationBeforeSave: true,
  getSnapshot: () => hero68DeviceManager.getSnapshot(),
  subscribe: listener => hero68DeviceManager.subscribe(listener),
  hasAuthorizedDevice: async () => {
    const nav =
      typeof navigator !== 'undefined'
        ? (navigator as { hid?: { getDevices(): Promise<unknown[]> } })
        : undefined;
    if (!nav?.hid) {
      return false;
    }
    const devices = await nav.hid.getDevices();
    return devices.length > 0;
  },
  connect: (requestPermission = true) => hero68DeviceManager.connect(requestPermission),
  disconnect: () => hero68DeviceManager.disconnect(),
  detectModel: () => hero68DeviceManager.detectConnectedModel(),
  syncPrecision: () => syncDevicePrecision(hero68DeviceManager),
  resolveConnectedModel: (detectedModel, fallbackModel, precisionMm) =>
    detectedModel === 'hero68' && (hero68DeviceManager.getSnapshot().isXs || precisionMm === 0.005)
      ? 'hero68Xs'
      : (detectedModel ?? fallbackModel),
  sendLiveIdle: async () => {
    if (hero68DeviceManager.connected && !hero68DeviceManager.viaService) {
      await hero68DeviceManager.send(liveIdle()).catch(() => {});
    }
  },
  hydrate: (slot, keyIds, model, precisionMm) =>
    hydrateFromDevice(hero68DeviceManager, slot, keyIds, model, precisionMm),
  saveConfiguration: snapshot => saveDeviceConfiguration(snapshot),
  savePerformanceAndVerify: async snapshot => {
    await saveDeviceConfiguration(snapshot);
    const readback = await hydrateFromDevice(
      hero68DeviceManager,
      snapshot.profileSlot,
      snapshot.keys.map(key => key.keyId),
      snapshot.model
    );
    const near = (actual: number | undefined, wanted: number) =>
      actual !== undefined && Math.abs(actual - wanted) <= 0.025;
    for (const expected of snapshot.keys) {
      const actual = readback.get(expected.keyId);
      const expectedRelease = expected.rapidTriggerEnabled
        ? expected.splitSensitivity
          ? expected.releaseSensitivityMm
          : expected.rapidSensitivityMm
        : 0;
      const expectedPress = expected.rapidTriggerEnabled
        ? expected.splitSensitivity
          ? expected.pressSensitivityMm
          : expected.rapidSensitivityMm
        : 0;
      const rtMismatch =
        expected.rapidTriggerEnabled &&
        (!near(actual?.pressSensitivityMm, expectedPress) ||
          !near(actual?.releaseSensitivityMm, expectedRelease));
      if (
        !actual ||
        !near(actual.actuationMm, expected.actuationMm) ||
        actual.rapidTriggerEnabled !== expected.rapidTriggerEnabled ||
        rtMismatch
      ) {
        throw Error(`Key setting readback mismatch: ${expected.keyId}`);
      }
    }
    return readback;
  },
  selectProfile: async slot => {
    await hero68DeviceManager.send(selectProfile(slot));
  },
  readProfileSlot: async () => {
    const report = await hero68DeviceManager.request(readActiveProfile(), 0x90, 0, 1000);
    const slot = report.data[0];
    if (slot !== 0 && slot !== 1 && slot !== 2) {
      throw new Error(`Unsupported active profile returned by HERO68: ${slot}`);
    }
    return slot;
  },
  readProfileName: slot => readOnboardProfileName(hero68DeviceManager, slot),
  saveProfileName: async (slot, name) => {
    await saveOnboardProfileName(hero68DeviceManager, slot, name);
  },
  readRemapLayers: (keyIds, model) => readRemapLayers(hero68DeviceManager, keyIds, model),
  saveRemapChanges: async (slot, layers, dirtyRemaps, keyIds, model) => {
    await saveRemapChanges(hero68DeviceManager, slot, layers, new Set(dirtyRemaps), keyIds, model);
  },
  readAdvancedBindings: model => readAdvancedBindings(hero68DeviceManager, model),
  saveAdvancedBindings: (slot, bindings, baseline, model) =>
    saveAdvancedBindings(hero68DeviceManager, slot, bindings, baseline, model),
  readRgbProfile: async (_slot, keyIds, model, draft) => {
    const freshRgb = await readRgbProfile(hero68DeviceManager, keyIds, model);
    const baseline = draft?.rgb?.custom
      ? { ...freshRgb, custom: structuredClone(draft.rgb.custom) }
      : freshRgb;
    return {
      baseline,
      current: mergeRgb(freshRgb, draft?.rgb, draft?.rgbDirty)
    };
  },
  saveRgb: async (draft, options) => {
    const baseline =
      options?.baseline ??
      (await readRgbProfile(hero68DeviceManager, options?.keyIds, options?.model).catch(() =>
        defaultRgb()
      ));
    return saveRgbProfile(
      hero68DeviceManager,
      draft,
      baseline,
      options?.onBaselineUpdate ?? (() => {}),
      options?.keyIds,
      options?.model
    );
  },
  syncMacroLibrary: async (slot, macros) => {
    await hero68DeviceManager.request(selectProfile(slot), 0x10, 0);
    await syncHero68MacroLibrary(hero68DeviceManager, macros);
  },
  setPollingRate: async rate => {
    await hero68DeviceManager.sendReenumerating(writePollingRate(rate));
  },
  setWinLock: async enabled => {
    await hero68DeviceManager.send(writeWinLock(enabled));
    return enabled;
  },
  setOsMode: async mac => {
    await hero68DeviceManager.send(writeOsMode(mac));
    return mac;
  },
  defaultRgb: () => defaultRgb()
};

export const xsydDriver: KeyboardProtocolDriver = {
  family: 'xsyd',
  transport: xsydDeviceManager,
  get connected() {
    return xsydDeviceManager.connected;
  },
  viaService: false,
  pausesHallStreamDuringProfileIo: true,
  requiresRgbHydrationBeforeSave: false,
  getSnapshot: () => xsydDeviceManager.getSnapshot(),
  subscribe: listener => xsydDeviceManager.subscribe(listener),
  hasAuthorizedDevice: () => xsydDeviceManager.hasAuthorizedDevice(),
  connect: (requestPermission = true) => xsydDeviceManager.connect(requestPermission),
  disconnect: () => xsydDeviceManager.disconnect(),
  detectModel: () => xsydDeviceManager.detectConnectedModel(),
  syncPrecision: async () => 0.01,
  resolveConnectedModel: (detectedModel, fallbackModel) => detectedModel ?? fallbackModel,
  sendLiveIdle: async () => {},
  hydrate: (slot, keyIds) => hydrateFromXsydDevice(xsydDeviceManager, slot, keyIds),
  saveConfiguration: snapshot => saveDeviceConfiguration(snapshot),
  savePerformanceAndVerify: async snapshot => {
    await saveDeviceConfiguration(snapshot);
    return hydrateFromXsydDevice(
      xsydDeviceManager,
      snapshot.profileSlot,
      snapshot.keys.map(key => key.keyId)
    );
  },
  selectProfile: async slot => {
    await xsydDeviceManager.send(buildXsydSelectProfileFrame(slot));
  },
  readProfileSlot: async () => (await readXsydProfileSlot(xsydDeviceManager)) as ProfileSlot,
  readRemapLayers: keyIds => readXsydRemapLayers(xsydDeviceManager, keyIds),
  saveRemapChanges: async (slot, layers, dirtyRemaps) => {
    if (dirtyRemaps.size) {
      await saveXsydRemapChanges(xsydDeviceManager, slot, layers, new Set(dirtyRemaps));
    }
  },
  saveAdvancedBindings: (slot, bindings, baseline) =>
    saveXsydAdvancedBindings(xsydDeviceManager, slot, bindings, baseline),
  readRgbProfile: async (slot, keyIds) => {
    const savedSlotRgb = loadXsydSavedRgb(slot);
    const rawFreshRgb = await readXsydRgbProfile(xsydDeviceManager, keyIds).catch(
      () => savedSlotRgb ?? defaultXsydRgb(keyIds)
    );
    const baseline = savedSlotRgb
      ? {
          ...rawFreshRgb,
          keys: savedSlotRgb.keys ?? rawFreshRgb.keys,
          colors: {
            ...rawFreshRgb.colors,
            ...(savedSlotRgb.colors ?? {})
          },
          ...(savedSlotRgb.custom ? { custom: savedSlotRgb.custom } : {})
        }
      : rawFreshRgb;
    return {
      baseline,
      current: savedSlotRgb ? mergeRgb(baseline, savedSlotRgb) : baseline
    };
  },
  saveRgb: async (draft, options) => {
    const baseline =
      options?.baseline ??
      (await readXsydRgbProfile(xsydDeviceManager, options?.keyIds).catch(() =>
        defaultXsydRgb(options?.keyIds)
      ));
    return saveXsydRgbProfile(
      xsydDeviceManager,
      draft,
      baseline,
      options?.onBaselineUpdate ?? (() => {}),
      options?.keyIds,
      options?.slot
    );
  },
  cacheSlotRgb: (slot, rgb) => {
    saveXsydSavedRgb(slot, rgb);
  },
  setPollingRate: async rate => {
    await xsydDeviceManager.writePollingRate(rate);
  },
  setWinLock: enabled => xsydDeviceManager.writeWinLock(enabled),
  setOsMode: mac => xsydDeviceManager.writeOsModeMac(mac),
  defaultRgb: keyIds => defaultXsydRgb(keyIds)
};

const DRIVERS = new Map<ProtocolFamilyId, KeyboardProtocolDriver>();

export function registerProtocolDriver(driver: KeyboardProtocolDriver): KeyboardProtocolDriver {
  DRIVERS.set(driver.family, driver);
  return driver;
}

registerProtocolDriver(bytetechDriver);
registerProtocolDriver(xsydDriver);

export const PROTOCOL_REGISTRY: ReadonlyMap<ProtocolFamilyId, KeyboardProtocolDriver> = DRIVERS;

export function getProtocolDriver(family: ProtocolFamilyId): KeyboardProtocolDriver {
  const driver = DRIVERS.get(family);
  if (!driver) {
    throw new RangeError(`Unknown protocol driver: ${family}`);
  }
  return driver;
}

export function getActiveConnectedDriver(): KeyboardProtocolDriver | null {
  for (const driver of DRIVERS.values()) {
    if (driver.connected) {
      return driver;
    }
  }
  return null;
}

export function isAnyProtocolConnected(): boolean {
  return getActiveConnectedDriver() !== null;
}

export async function disconnectAllProtocols(): Promise<void> {
  for (const driver of DRIVERS.values()) {
    if (driver.connected) {
      await driver.disconnect();
    }
  }
}

export async function autoConnectAnyProtocol(): Promise<KeyboardProtocolDriver | null> {
  if (await xsydDriver.hasAuthorizedDevice()) {
    if (await xsydDriver.connect(false)) {
      return xsydDriver;
    }
  }
  if (await bytetechDriver.connect(false)) {
    return bytetechDriver;
  }
  return null;
}
