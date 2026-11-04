import type { DeviceConfigurationSnapshot, Hero68ProtocolEncoder } from '../deviceBridge';
import { HERO68_KEY_IDS } from '../../keyboard/hero68Layout';
import type { HeroDeviceModelId } from '../../keyboard/devices';
import { bytesToHex } from '../hex';
import { readActuation, readDeadZone, readRapidTrigger, readSwitchType, selectProfile, writeActuationBatch, writeDeadZoneBatch, writeRapidTriggerBatch, writeSwitchTypeBatch } from './commands';
import { decodeActuationRecords, decodeDeadZoneRecords, decodeRapidTriggerRecords, decodeSwitchTypeRecords } from './codec';
import { keyIdToPos, posToKeyId } from './keyPositions';
import type { DecodedReport, ProfileSlot } from './types';
import { HERO68_DISTANCE_UNIT_MM } from './precision';
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
  request(report: Uint8Array, expectedCommand: number, expectedZone?: number, timeoutMs?: number): Promise<DecodedReport>;
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
export const hero68ProtocolEncoder: Hero68ProtocolEncoder = {
  encodeSave(snapshot: DeviceConfigurationSnapshot): string[] {
    const packets: Uint8Array[] = [selectProfile(snapshot.profileSlot)];
    const model = snapshot.model;

    // Mirror the official AULA sync functions instead of sending one HID
    // transaction per key. Keep the exact batch ordering:
    // 0x15 -> 0x13 -> 0x19 -> 0x16. Writing 0x15 last can cause the firmware
    // to reload switch-dependent state after sensitivity values were applied.
    const switchRecords = snapshot.keys.map(key => ([keyIdToPos(key.keyId, model), switchFirmwareId(key.switchProfile)] as const));
    packets.push(...writeSwitchTypeBatch(switchRecords));
    const actuationConfigs = snapshot.keys.map(key => ({
      profile: snapshot.profileSlot,
      layer: (0 as const),
      keyId: keyIdToPos(key.keyId, model),
      distanceMm: key.actuationMm,
      precisionMm: HERO68_DISTANCE_UNIT_MM,
      global: true
    }));
    packets.push(...writeActuationBatch(actuationConfigs));
    const rapidTriggerConfigs = snapshot.keys.map(key => {
      const releaseMm = key.rapidTriggerEnabled ? key.splitSensitivity ? key.releaseSensitivityMm : key.rapidSensitivityMm : 0;
      const pressMm = key.rapidTriggerEnabled ? key.splitSensitivity ? key.pressSensitivityMm : key.rapidSensitivityMm : 0;
      return {
        profile: snapshot.profileSlot,
        layer: (0 as const),
        keyId: keyIdToPos(key.keyId, model),
        enabled: key.rapidTriggerEnabled,
        releaseMm,
        pressMm,
        precisionMm: HERO68_DISTANCE_UNIT_MM,
        global: true
      };
    });
    packets.push(...writeRapidTriggerBatch(rapidTriggerConfigs));
    packets.push(...writeDeadZoneBatch(snapshot.keys.map(key => ({
      layer: (0 as const),
      keyId: keyIdToPos(key.keyId, model),
      topMm: key.topDeadzoneMm,
      bottomMm: key.bottomDeadzoneMm,
      precisionMm: HERO68_DISTANCE_UNIT_MM,
      global: true,
      enabled: key.deadzoneEnabled
    }))));
    return packets.map(reportHex);
  }
};
export async function hydrateFromDevice(requester: Hero68Requester, profileSlot: ProfileSlot, keyIds: readonly string[] = HERO68_KEY_IDS, model?: HeroDeviceModelId): Promise<Map<string, HydratedKeySettings>> {
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
        target.actuationMm = record.distanceUnits * HERO68_DISTANCE_UNIT_MM;
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
      const releaseMm = record.releaseUnits * HERO68_DISTANCE_UNIT_MM;
      const pressMm = record.pressUnits * HERO68_DISTANCE_UNIT_MM;
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
      target.topDeadzoneMm = record.topUnits * HERO68_DISTANCE_UNIT_MM;
      target.bottomDeadzoneMm = record.bottomUnits * HERO68_DISTANCE_UNIT_MM;
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
