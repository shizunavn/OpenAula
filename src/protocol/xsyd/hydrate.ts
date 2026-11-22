import type { DeviceConfigurationSnapshot, Hero68ProtocolEncoder } from '../deviceBridge';
import { bytesToHex } from '../hex';
import type { HydratedKeySettings } from '../hero68/hero68Encoder';
import type { ProfileSlot } from '../hero68/types';
import {
  buildFieldWriteFrame,
  buildGlobalActuationReadFrame,
  chunkFieldWrites,
  codeForKeyValue,
  decodeGlobalActuationReply,
  keyValueForCode,
  mmToUm,
  requireXsydKeyValue,
  umToMm,
  XSYD_KEYS,
  XsydFeatureField,
  type XsydFieldWrite
} from './features';
import {
  buildXsydSelectProfileFrame,
  readXsydFieldTable,
  readXsydHandshake,
  xsydSwitchMaxTravelUm,
  xsydSwitchProfileId,
  xsydSwitchTypeId,
  type XsydRequester
} from './commands';
import { xsydWrittenFieldCache } from './remap';

export const xsydProtocolEncoder: Hero68ProtocolEncoder = {
  encodeSave(snapshot: DeviceConfigurationSnapshot): string[] {
    const frames: Uint8Array[] = [buildXsydSelectProfileFrame(snapshot.profileSlot)];
    const writes: XsydFieldWrite[] = [];
    for (const key of snapshot.keys) {
      const pos = requireXsydKeyValue(key.keyId);
      const travelUm = mmToUm(key.actuationMm);
      if (travelUm < 100 || travelUm > 3400) {
        throw new RangeError(
          `Actuation depth ${key.actuationMm} mm (${travelUm} µm) is outside 100..3400 µm`
        );
      }
      const swId = xsydSwitchTypeId(key.switchProfile);
      const switchMaxUm = xsydSwitchMaxTravelUm(swId);
      const effectiveTravelUm = Math.max(100, Math.min(switchMaxUm, travelUm));
      const headerValue = key.rapidTriggerEnabled ? 0x20 : 0x00;

      const rawPressMm = key.splitSensitivity ? key.pressSensitivityMm : key.rapidSensitivityMm;
      const rawReleaseMm = key.splitSensitivity ? key.releaseSensitivityMm : key.rapidSensitivityMm;
      const pressRtUm = Math.max(
        10,
        Math.min(switchMaxUm, Math.round(mmToUm(rawPressMm > 0 ? rawPressMm : 0.3) / 10) * 10)
      );
      const releaseRtUm = Math.max(
        10,
        Math.min(switchMaxUm, Math.round(mmToUm(rawReleaseMm > 0 ? rawReleaseMm : 0.3) / 10) * 10)
      );

      const topDzUm = key.deadzoneEnabled
        ? Math.max(0, Math.min(1000, mmToUm(key.topDeadzoneMm)))
        : 0;
      const bottomDzUm = key.deadzoneEnabled
        ? Math.max(0, Math.min(1000, mmToUm(key.bottomDeadzoneMm)))
        : 0;

      const keyWrites: XsydFieldWrite[] = [
        { pos, field: XsydFeatureField.Header, value: headerValue },
        { pos, field: XsydFeatureField.Travel, value: effectiveTravelUm },
        { pos, field: XsydFeatureField.RapidTriggerPress, value: pressRtUm },
        { pos, field: XsydFeatureField.RapidTriggerRelease, value: releaseRtUm },
        { pos, field: XsydFeatureField.TopDeadzone, value: topDzUm },
        { pos, field: XsydFeatureField.BottomDeadzone, value: bottomDzUm },
        { pos, field: XsydFeatureField.SwitchType, value: swId }
      ];
      for (const w of keyWrites) {
        xsydWrittenFieldCache.set(`${snapshot.profileSlot}:${w.pos}:${w.field}`, w.value);
        xsydWrittenFieldCache.set(`${w.pos}:${w.field}`, w.value);
        writes.push(w);
      }
    }
    for (const batch of chunkFieldWrites(writes)) {
      frames.push(buildFieldWriteFrame(batch));
    }
    return frames.map(frame => bytesToHex(frame, ''));
  }
};

/**
 * Hydrate per-key actuation (`0x04`), Rapid Trigger (`0x08`, `0x14`, `0x15`),
 * Top/Bottom deadzone (`0x16`, `0x17`), and switch settings (`0x19`) from
 * a WIN 68 HE MAX via `0x23` (`payload[0] = 0x00`), converting µm -> mm.
 */
export async function hydrateFromXsydDevice(
  requester: XsydRequester,
  profileSlot: ProfileSlot,
  keyIds: readonly string[] = XSYD_KEYS.map(k => (k.code === 'F1' ? 'Fn' : k.code))
): Promise<Map<string, HydratedKeySettings>> {
  const handshake = await readXsydHandshake(requester);
  await requester.request(buildXsydSelectProfileFrame(profileSlot));

  let globalActuationUm: number | undefined;
  try {
    const globalReply = await requester.request(buildGlobalActuationReadFrame());
    globalActuationUm = decodeGlobalActuationReply(globalReply);
  } catch {
    // Optional if mock requester does not implement 0x29
  }

  const queries: { pos: number; field: number }[] = [];
  for (const keyId of keyIds) {
    const pos = keyValueForCode(keyId);
    if (pos === undefined) continue;
    queries.push(
      { pos, field: XsydFeatureField.Header },
      { pos, field: XsydFeatureField.Travel },
      { pos, field: XsydFeatureField.RapidTriggerPress },
      { pos, field: XsydFeatureField.RapidTriggerRelease },
      { pos, field: XsydFeatureField.TopDeadzone },
      { pos, field: XsydFeatureField.BottomDeadzone },
      { pos, field: XsydFeatureField.SwitchType }
    );
  }

  const records = await readXsydFieldTable(requester, queries);
  const fieldsByPos = new Map<number, Map<number, number>>();
  for (const record of records) {
    let fieldMap = fieldsByPos.get(record.pos);
    if (!fieldMap) {
      fieldMap = new Map<number, number>();
      fieldsByPos.set(record.pos, fieldMap);
    }
    fieldMap.set(record.field, record.value);
  }

  const hydrated = new Map<string, HydratedKeySettings>();
  for (const [pos, fieldMap] of fieldsByPos) {
    const keyId = codeForKeyValue(pos);
    if (!keyId) continue;
    const entry: HydratedKeySettings = {};
    hydrated.set(keyId, entry);

    const swVal = fieldMap.get(XsydFeatureField.SwitchType);
    if (swVal !== undefined) {
      entry.switchProfile = xsydSwitchProfileId(swVal);
    }

    const rawTravel = fieldMap.get(XsydFeatureField.Travel);
    const fallbackTravel =
      globalActuationUm ??
      xsydWrittenFieldCache.get(`${profileSlot}:${pos}:${XsydFeatureField.Travel}`) ??
      xsydWrittenFieldCache.get(`${pos}:${XsydFeatureField.Travel}`);
    const effectiveTravel = rawTravel && rawTravel > 0 ? rawTravel : fallbackTravel;
    if (effectiveTravel !== undefined && effectiveTravel > 0) {
      const clampedUm = Math.max(
        handshake.minTravelUm,
        Math.min(handshake.maxTravelUm, effectiveTravel)
      );
      entry.actuationMm = umToMm(clampedUm);
    }

    const headerVal = fieldMap.get(XsydFeatureField.Header);
    const pressVal = fieldMap.get(XsydFeatureField.RapidTriggerPress);
    const releaseVal = fieldMap.get(XsydFeatureField.RapidTriggerRelease);
    if (headerVal !== undefined || pressVal !== undefined || releaseVal !== undefined) {
      const rtEnabled = headerVal !== undefined ? (headerVal & 0x30) === 0x20 : (pressVal ?? 0) > 0;
      const pressUm = pressVal && pressVal > 0 ? pressVal : 300;
      const releaseUm = releaseVal && releaseVal > 0 ? releaseVal : pressUm;
      const pressMm = umToMm(pressUm);
      const releaseMm = umToMm(releaseUm);
      entry.rapidTriggerEnabled = rtEnabled;
      entry.splitSensitivity = Math.abs(pressMm - releaseMm) >= 0.005;
      entry.rapidSensitivityMm = pressMm;
      entry.pressSensitivityMm = pressMm;
      entry.releaseSensitivityMm = releaseMm;
    }

    const topDzVal = fieldMap.get(XsydFeatureField.TopDeadzone);
    const bottomDzVal = fieldMap.get(XsydFeatureField.BottomDeadzone);
    if (topDzVal !== undefined || bottomDzVal !== undefined) {
      const topUm = topDzVal ?? 0;
      const bottomUm = bottomDzVal ?? topUm;
      entry.topDeadzoneMm = umToMm(topUm);
      entry.bottomDeadzoneMm = umToMm(bottomUm);
      entry.deadzoneEnabled = topUm > 0 || bottomUm > 0;
    }
  }
  return hydrated;
}
