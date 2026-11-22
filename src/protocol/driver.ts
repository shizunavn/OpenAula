import type { HeroDeviceModelId, ProtocolFamilyId } from '../keyboard/registry/types';
import {
  saveDeviceConfiguration,
  type DeviceConfigurationSnapshot,
  type Hero68Transport
} from './deviceBridge';
import {
  readActiveProfile,
  selectProfile,
  writeOsMode,
  writePollingRate,
  writeWinLock
} from './hero68/commands';
import { hydrateFromDevice, type HydratedKeySettings } from './hero68/hero68Encoder';
import { defaultRgb, type RgbProfile } from './hero68/rgb';
import type { PollingRate, ProfileSlot } from './hero68/types';
import { hero68DeviceManager, type Hero68DeviceSnapshot } from './hero68/webhid';
import { buildXsydSelectProfileFrame, readXsydProfileSlot } from './xsyd/commands';
import { hydrateFromXsydDevice } from './xsyd/hydrate';
import { defaultXsydRgb, readXsydRgbProfile, saveXsydRgbProfile } from './xsyd/rgb';
import { xsydDeviceManager } from './xsyd/webhid';

export type SaveConfigurationOutcome = {
  mode: 'sent';
  packets: string[];
};

export interface KeyboardProtocolDriver {
  readonly family: ProtocolFamilyId;
  readonly transport: Hero68Transport;
  readonly connected: boolean;
  getSnapshot(): Hero68DeviceSnapshot;
  subscribe(listener: () => void): () => void;
  hasAuthorizedDevice(): Promise<boolean>;
  connect(requestPermission?: boolean): Promise<boolean>;
  disconnect(): Promise<void>;
  detectModel(): Promise<HeroDeviceModelId | null>;
  hydrate(
    slot: ProfileSlot,
    keyIds?: readonly string[],
    model?: HeroDeviceModelId,
    precisionMm?: number
  ): Promise<Map<string, HydratedKeySettings>>;
  saveConfiguration(snapshot: DeviceConfigurationSnapshot): Promise<SaveConfigurationOutcome>;
  selectProfile(slot: ProfileSlot): Promise<void>;
  readProfileSlot(): Promise<ProfileSlot>;
  setPollingRate(rate: PollingRate): Promise<void>;
  setWinLock(enabled: boolean): Promise<boolean>;
  setOsMode(mac: boolean): Promise<boolean>;
  saveRgb?(draft: RgbProfile, baseline?: RgbProfile, slot?: ProfileSlot): Promise<RgbProfile>;
  defaultRgb(): RgbProfile;
}

export const bytetechDriver: KeyboardProtocolDriver = {
  family: 'bytetech',
  transport: hero68DeviceManager,
  get connected() {
    return hero68DeviceManager.connected;
  },
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
  hydrate: (slot, keyIds, model, precisionMm) =>
    hydrateFromDevice(hero68DeviceManager, slot, keyIds, model, precisionMm),
  saveConfiguration: snapshot => saveDeviceConfiguration(snapshot),
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
  getSnapshot: () => xsydDeviceManager.getSnapshot(),
  subscribe: listener => xsydDeviceManager.subscribe(listener),
  hasAuthorizedDevice: () => xsydDeviceManager.hasAuthorizedDevice(),
  connect: (requestPermission = true) => xsydDeviceManager.connect(requestPermission),
  disconnect: () => xsydDeviceManager.disconnect(),
  detectModel: () => xsydDeviceManager.detectConnectedModel(),
  hydrate: (slot, keyIds) => hydrateFromXsydDevice(xsydDeviceManager, slot, keyIds),
  saveConfiguration: snapshot => saveDeviceConfiguration(snapshot),
  selectProfile: async slot => {
    await xsydDeviceManager.send(buildXsydSelectProfileFrame(slot));
  },
  readProfileSlot: async () => (await readXsydProfileSlot(xsydDeviceManager)) as ProfileSlot,
  setPollingRate: async rate => {
    await xsydDeviceManager.writePollingRate(rate);
  },
  setWinLock: enabled => xsydDeviceManager.writeWinLock(enabled),
  setOsMode: mac => xsydDeviceManager.writeOsModeMac(mac),
  saveRgb: async (draft, baseline, slot) => {
    const current =
      baseline ?? (await readXsydRgbProfile(xsydDeviceManager).catch(() => defaultXsydRgb()));
    return saveXsydRgbProfile(xsydDeviceManager, draft, current, () => {}, undefined, slot);
  },
  defaultRgb: () => defaultXsydRgb()
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
