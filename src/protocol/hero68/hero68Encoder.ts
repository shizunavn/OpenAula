import type { DeviceConfigurationSnapshot, Hero68ProtocolEncoder } from '../deviceBridge';
import { HERO68_KEY_IDS } from '../../keyboard/hero68Layout';
import type { HeroDeviceModelId } from '../../keyboard/devices';
import { bytesToHex } from '../hex';
import {
  readActuation,
  readDeadZone,
  readPrecisionDistance,
  readPrecisionRt,
  readRapidTrigger,
  readSwitchType,
  selectProfile,
  writeActuationBatch,
  writeDeadZoneBatch,
  writeRapidTriggerBatch,
  writeSwitchTypeBatch
} from './commands';
import {
  decodeActuationRecords,
  decodeDeadZoneRecords,
  decodeRapidTriggerRecords,
  decodeSwitchTypeRecords
} from './codec';
import { keyIdToPos, posToKeyId } from './keyPositions';
import type { DecodedReport, ProfileSlot } from './types';
import {
  getHero68DistanceUnitMm,
  HERO68_DISTANCE_UNIT_MM,
  setHero68DistanceUnitMm
} from './precision';
import { switchFirmwareId, switchProfileId } from './switchProfiles';
export type HydratedKeySettings = {
  actuationMm?: number;
  rapidTriggerEnabled?: boolean;
  splitSensitivity?: boolean;
  rapidSensitivityMm?: number;
  pressSensitivityMm?: number;
  releaseSensitivityMm?: number;
  deadzoneEnabled?: boolean;
  topDeadzoneMm?: number;
  bottomDeadzoneMm?: number;
  switchProfile?: string;
};
export interface Hero68Requester {
  request(
    report: Uint8Array,
    expectedCommand: number,
    expectedZone?: number,
    timeoutMs?: number
  ): Promise<DecodedReport>;
}
function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    chunks.push(values.slice(offset, offset + size));
  }
  return chunks;
}
function reportHex(report: Uint8Array): string {
  return bytesToHex(report, '');
}
function scaleUnitsToMm(units: number, precisionMm: number): number {
  return Math.round(units * precisionMm * 1000) / 1000;
}

/**
 * Queries CMD `0x82` zone `6` (`precision_rt`) and zone `8` (`precision_distance`)
 * matching official `fetch_feature_key_precision()` (`app-CPb3bToC.js`):
 * - HERO 68 HE (`0320`/`0323`): returns `10` (`10 µm = 0.01 mm`)
 * - HERO 68 XS (`0117`): returns `5` (`5 µm = 0.005 mm`)
 */
export async function syncDevicePrecision(requester: Hero68Requester): Promise<number> {
  try {
    const rtReply = await requester.request(readPrecisionRt(), 0x82, 6, 300);
    const distReply = await requester
      .request(readPrecisionDistance(), 0x82, 8, 300)
      .catch(() => null);
    const rtUm = rtReply.data[0] ?? 0;
    const distUm = distReply?.data[0] ? distReply.data[0] : rtUm;
    if (distUm === 5 || distUm === 10 || distUm === 1) {
      const unitMm = distUm / 1000;
      setHero68DistanceUnitMm(unitMm);
      return unitMm;
    }
  } catch {
    // Fallback to active/default precision if device does not answer 0x82 zone 6/8.
  }
  return getHero68DistanceUnitMm();
}

export const hero68ProtocolEncoder: Hero68ProtocolEncoder = {
  encodeSave(snapshot: DeviceConfigurationSnapshot): string[] {
    const packets: Uint8Array[] = [selectProfile(snapshot.profileSlot)];
    const model = snapshot.model;
    const precisionMm =
      snapshot.precisionMm ??
      (model != null ? (model === 'hero68Xs' ? 0.005 : 0.01) : getHero68DistanceUnitMm());
    const minRtMm = precisionMm <= 0.005 ? 0.005 : 0.01;

    // Mirror the official AULA sync functions instead of sending one HID
    // transaction per key. Keep the exact batch ordering:
    // 0x15 -> 0x13 -> 0x19 -> 0x16. Writing 0x15 last can cause the firmware
    // to reload switch-dependent state after sensitivity values were applied.
    const switchRecords = snapshot.keys.map(
      key => [keyIdToPos(key.keyId, model), switchFirmwareId(key.switchProfile)] as const
    );
    packets.push(...writeSwitchTypeBatch(switchRecords));
    const actuationConfigs = snapshot.keys.map(key => ({
      profile: snapshot.profileSlot,
      layer: 0 as const,
      keyId: keyIdToPos(key.keyId, model),
      distanceMm: key.actuationMm,
      precisionMm,
      global: true
    }));
    packets.push(...writeActuationBatch(actuationConfigs));
    const rapidTriggerConfigs = snapshot.keys.map(key => {
      const releaseRaw = key.splitSensitivity ? key.releaseSensitivityMm : key.rapidSensitivityMm;
      const pressRaw = key.splitSensitivity ? key.pressSensitivityMm : key.rapidSensitivityMm;
      const releaseMm = key.rapidTriggerEnabled ? Math.max(minRtMm, releaseRaw) : 0;
      const pressMm = key.rapidTriggerEnabled ? Math.max(minRtMm, pressRaw) : 0;
      return {
        profile: snapshot.profileSlot,
        layer: 0 as const,
        keyId: keyIdToPos(key.keyId, model),
        enabled: key.rapidTriggerEnabled,
        releaseMm,
        pressMm,
        precisionMm,
        global: true
      };
    });
    packets.push(...writeRapidTriggerBatch(rapidTriggerConfigs));
    packets.push(
      ...writeDeadZoneBatch(
        snapshot.keys.map(key => ({
          layer: 0 as const,
          keyId: keyIdToPos(key.keyId, model),
          topMm: key.topDeadzoneMm,
          bottomMm: key.bottomDeadzoneMm,
          precisionMm,
          global: true,
          enabled: key.deadzoneEnabled
        }))
      )
    );
    return packets.map(reportHex);
  }
};
export async function hydrateFromDevice(
  requester: Hero68Requester,
  profileSlot: ProfileSlot,
  keyIds: readonly string[] = HERO68_KEY_IDS,
  model?: HeroDeviceModelId,
  precisionMm: number = getHero68DistanceUnitMm() || HERO68_DISTANCE_UNIT_MM
): Promise<Map<string, HydratedKeySettings>> {
  // Profile is session state: select it first, then read layer 0.
  await requester.request(selectProfile(profileSlot), 0x10, 0);
  const positions = keyIds.map(keyId => keyIdToPos(keyId, model));
  const hydrated = new Map<string, HydratedKeySettings>();
  const settingsForPos = (pos: number) => {
    const keyId = posToKeyId(pos, model);
    if (!keyId) {
      return undefined;
    }
    const current = hydrated.get(keyId) ?? {};
    hydrated.set(keyId, current);
    return current;
  };
  for (const keys of chunk(positions, 11)) {
    const reply = await requester.request(readActuation(keys), 0x93, 0);
    for (const record of decodeActuationRecords(reply.data)) {
      const target = settingsForPos(record.keyId);
      if (target) {
        target.actuationMm = scaleUnitsToMm(record.distanceUnits, precisionMm);
      }
    }
  }
  for (const keys of chunk(positions, 6)) {
    const reply = await requester.request(readRapidTrigger(keys), 0x99, 0);
    for (const record of decodeRapidTriggerRecords(reply.data)) {
      const target = settingsForPos(record.keyId);
      if (!target) {
        continue;
      }
      const releaseMm = scaleUnitsToMm(record.releaseUnits, precisionMm);
      const pressMm = scaleUnitsToMm(record.pressUnits, precisionMm);
      target.rapidTriggerEnabled = record.enabled !== 0;
      target.releaseSensitivityMm = releaseMm;
      target.pressSensitivityMm = pressMm;
      target.splitSensitivity = record.enabled !== 0 && releaseMm !== pressMm;
      target.rapidSensitivityMm = releaseMm === pressMm ? releaseMm : Math.max(releaseMm, pressMm);
    }
  }
  for (const keys of chunk(positions, 6)) {
    const reply = await requester.request(readDeadZone(keys), 0x96, 0);
    for (const record of decodeDeadZoneRecords(reply.data)) {
      const target = settingsForPos(record.keyId);
      if (!target) {
        continue;
      }
      target.deadzoneEnabled = record.enabled !== 0;
      target.topDeadzoneMm = scaleUnitsToMm(record.topUnits, precisionMm);
      target.bottomDeadzoneMm = scaleUnitsToMm(record.bottomUnits, precisionMm);
    }
  }
  for (const keys of chunk(positions, 18)) {
    const reply = await requester.request(readSwitchType(keys), 0x95, 0);
    const records = decodeSwitchTypeRecords(reply.data);
    const seen = new Set<number>();
    if (reply.data.length !== keys.length * 3) {
      throw new Error('Incomplete switch profile readback');
    }
    for (const record of records) {
      if (!keys.includes(record.keyId) || seen.has(record.keyId)) {
        throw new Error('Unexpected switch profile readback position');
      }
      seen.add(record.keyId);
      const target = settingsForPos(record.keyId);
      if (target) {
        target.switchProfile = switchProfileId(record.switchType);
      }
    }
  }
  return hydrated;
}
