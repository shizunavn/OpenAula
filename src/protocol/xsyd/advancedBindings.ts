import type { AdvancedBinding } from '../hero68/advanced';
import type { ProfileSlot } from '../hero68/types';
import {
  buildDisableAdvancedKeyFrame,
  buildDksFrame,
  buildEndFrame,
  buildMptFrame,
  buildMtFrame,
  buildSocdFrame,
  buildTglFrame,
  encodeXsydDksStateRow,
  XSYD_ADVANCED_DELAY_MAX_MS,
  XSYD_ADVANCED_DELAY_UNIT_MS
} from './advanced';
import {
  mmToUm,
  requireXsydKeyValue,
  umToMm,
  XSYD_FEATURE_SLOTS,
  XsydFeatureField
} from './features';
import {
  buildXsydSelectProfileFrame,
  readXsydFieldTable,
  readXsydHandshake,
  toXsydActionByte,
  type XsydRequester
} from './commands';

export { requireXsydKeyValue };

/**
 * Validate Advanced Key bindings specifically for AULA WIN 68 HE MAX (XSYD `0x5C`).
 *
 * - Supports `SOCD` (modes `0..3`), `DKS` (`0x26`), `MT` (`0x24`), `TGL` (`0x25`),
 *   `MPT` (`0x27`), and `END` (`0x28`).
 * - Rejects `RS` and `DDKS` (unverified).
 * - Validates micrometre travel bounds (`100..3400` µm) and 10 ms delay byte (`10..2550` ms).
 */
export function validateXsydAdvanced(
  bindings: readonly AdvancedBinding[],
  limits: { minTravelUm?: number; maxTravelUm?: number } = {}
): void {
  const minUm = limits.minTravelUm ?? 100;
  const maxUm = limits.maxTravelUm ?? 3400;
  if (bindings.length > 40) {
    throw new Error('Maximum 40 Advanced Keys per profile.');
  }
  const used = new Set<string>();
  for (const b of bindings) {
    if ((b.kind as string) === 'RS' || (b.kind as string) === 'DDKS') {
      throw new Error(`${b.kind} is not supported on WIN 68 HE MAX.`);
    }
    if (b.kind === 'UNKNOWN') {
      if (!b.raw) {
        throw new Error('Missing original binding data.');
      }
      continue;
    }
    if (!['SOCD', 'DKS', 'MT', 'TGL', 'MPT', 'END'].includes(b.kind)) {
      throw new Error(`Unsupported Advanced Key type on WIN 68 HE MAX: ${b.kind}`);
    }
    if (b.keys.length !== (b.kind === 'SOCD' ? 2 : 1)) {
      throw new Error('Select the required physical keys.');
    }
    for (const keyId of b.keys) {
      requireXsydKeyValue(keyId);
      if (used.has(keyId)) {
        throw new Error('A physical key can only have one Advanced Key binding.');
      }
      used.add(keyId);
    }
    if (b.kind === 'SOCD') {
      if (![0, 1, 2, 3].includes(b.mode)) {
        throw new Error('Invalid SOCD mode on WIN 68 HE MAX (expected 0–3).');
      }
      continue;
    }
    const expectedActions = b.kind === 'DKS' ? 4 : b.kind === 'MPT' ? 3 : b.kind === 'MT' ? 2 : 1;
    if (b.actions.length !== expectedActions) {
      throw new Error('Invalid action count.');
    }
    for (const action of b.actions) {
      toXsydActionByte(action);
    }
    if (b.kind === 'MT' || b.kind === 'TGL') {
      if (
        !Number.isInteger(b.delay) ||
        b.delay < XSYD_ADVANCED_DELAY_UNIT_MS ||
        b.delay > XSYD_ADVANCED_DELAY_MAX_MS
      ) {
        throw new Error(
          `Delay must be ${XSYD_ADVANCED_DELAY_UNIT_MS}–${XSYD_ADVANCED_DELAY_MAX_MS} ms on WIN 68 HE MAX.`
        );
      }
    }
    if (b.kind === 'DKS') {
      if (b.thresholds.length !== 4) {
        throw new Error('DKS requires 4 depth thresholds.');
      }
      const depthsUm = b.thresholds.map(mmToUm);
      if (depthsUm.some(um => !Number.isInteger(um) || um < minUm || um > maxUm)) {
        throw new Error(
          `Depth must be ${umToMm(minUm).toFixed(2)}–${umToMm(maxUm).toFixed(2)} mm (${minUm}–${maxUm} µm).`
        );
      }
      if (depthsUm[0] >= depthsUm[1] || depthsUm[3] >= depthsUm[2]) {
        throw new Error('Shallow DKS points must be above the deep points.');
      }
      if (!Array.isArray(b.states) || b.states.length !== 4) {
        throw new Error('Invalid DKS action pattern.');
      }
      try {
        for (const row of b.states) {
          encodeXsydDksStateRow(row);
        }
      } catch {
        throw new Error('Invalid DKS action pattern.');
      }
    }
    if (b.kind === 'MPT') {
      if (b.thresholds.length !== 3) {
        throw new Error('MPT requires 3 depth thresholds.');
      }
      const depthsUm = b.thresholds.map(mmToUm);
      if (depthsUm.some(um => !Number.isInteger(um) || um < minUm || um > maxUm)) {
        throw new Error(
          `Depth must be ${umToMm(minUm).toFixed(2)}–${umToMm(maxUm).toFixed(2)} mm (${minUm}–${maxUm} µm).`
        );
      }
      if (!(depthsUm[0] < depthsUm[1] && depthsUm[1] < depthsUm[2])) {
        throw new Error('MPT depths must increase from left to right.');
      }
    }
  }
}

/**
 * Encode one verified Advanced Key binding into its 64-byte XSYD `0x5C` frame.
 * Depths are converted from mm to micrometres (`×1000`), delays from ms to `delay/10`.
 */
export function encodeXsydAdvancedBinding(binding: AdvancedBinding): Uint8Array {
  validateXsydAdvanced([binding]);
  const key = requireXsydKeyValue(binding.keys[0]);
  switch (binding.kind) {
    case 'DKS':
      return buildDksFrame({
        key,
        actions: binding.actions.map(toXsydActionByte),
        states: binding.states,
        actuationUm: mmToUm(binding.thresholds[0])
      });
    case 'MT':
      return buildMtFrame({
        key,
        hold: toXsydActionByte(binding.actions[0]),
        tap: toXsydActionByte(binding.actions[1]),
        delayMs: binding.delay
      });
    case 'TGL':
      return buildTglFrame({
        key,
        toggle: toXsydActionByte(binding.actions[0]),
        delayMs: binding.delay
      });
    case 'MPT':
      return buildMptFrame({
        key,
        steps: binding.actions.map(toXsydActionByte),
        depthsUm: binding.thresholds.map(mmToUm)
      });
    case 'END':
      return buildEndFrame({
        key,
        action: toXsydActionByte(binding.actions[0])
      });
    case 'SOCD':
      return buildSocdFrame({
        key1: key,
        key2: requireXsydKeyValue(binding.keys[1]),
        type: 0,
        mode: binding.mode,
        delay: 0
      });
    default:
      throw new Error(`Unsupported XSYD Advanced Key binding: ${binding.kind}`);
  }
}

function xsydBindingSignature(b: AdvancedBinding): string {
  if (b.kind === 'UNKNOWN') {
    return JSON.stringify(b.raw);
  }
  return JSON.stringify({
    kind: b.kind,
    keys: b.keys,
    actions: b.kind === 'SOCD' ? undefined : b.actions.map(toXsydActionByte),
    mode: b.kind === 'SOCD' ? b.mode : undefined,
    delay: ['MT', 'TGL'].includes(b.kind)
      ? Math.round(b.delay / XSYD_ADVANCED_DELAY_UNIT_MS) * XSYD_ADVANCED_DELAY_UNIT_MS
      : undefined,
    depthsUm:
      b.kind === 'MPT'
        ? b.thresholds.map(mmToUm)
        : b.kind === 'DKS'
          ? [mmToUm(b.thresholds[0])]
          : undefined,
    masks: b.kind === 'DKS' ? b.states.map(encodeXsydDksStateRow) : undefined
  });
}

/**
 * Save Advanced Key bindings on WIN 68 HE MAX with pre-write handshake + `0x23`
 * field-table readback, per-binding opcode verification, and post-write readback.
 */
export async function saveXsydAdvancedBindings(
  requester: XsydRequester,
  slot: ProfileSlot,
  draft: AdvancedBinding[],
  baseline: AdvancedBinding[]
): Promise<AdvancedBinding[]> {
  validateXsydAdvanced(draft);
  const handshake = await readXsydHandshake(requester);
  validateXsydAdvanced(draft, {
    minTravelUm: handshake.minTravelUm,
    maxTravelUm: handshake.maxTravelUm
  });

  await requester.request(buildXsydSelectProfileFrame(slot));

  const touchedKeys = Array.from(
    new Set([...baseline.flatMap(b => b.keys), ...draft.flatMap(b => b.keys)])
  );
  const preReadQueries = touchedKeys.map(keyId => ({
    pos: requireXsydKeyValue(keyId),
    field: XsydFeatureField.Header
  }));
  const preRead = await readXsydFieldTable(requester, preReadQueries);
  const baselineKeyValues = new Set(baseline.flatMap(b => b.keys.map(requireXsydKeyValue)));
  for (const record of preRead) {
    if (
      record.field === XsydFeatureField.Header &&
      record.value !== 0 &&
      record.value !== 0x20 &&
      !baselineKeyValues.has(record.pos)
    ) {
      throw new Error(
        `Unexpected existing binding on key pos 0x${record.pos.toString(16)}; read the profile before saving.`
      );
    }
  }

  const removedKeys: number[] = [];
  for (const old of baseline) {
    if (!draft.some(b => xsydBindingSignature(b) === xsydBindingSignature(old))) {
      if (old.kind === 'UNKNOWN') {
        throw new Error('Unknown firmware bindings cannot be removed here.');
      }
      for (const keyId of old.keys) {
        removedKeys.push(requireXsydKeyValue(keyId));
      }
    }
  }

  for (let i = 0; i < removedKeys.length; i += XSYD_FEATURE_SLOTS) {
    const frame = buildDisableAdvancedKeyFrame(removedKeys.slice(i, i + XSYD_FEATURE_SLOTS));
    const reply = await requester.request(frame);
    if (reply.opcode !== 0xa3 || !reply.checksumValid) {
      throw new Error('Failed to clear previous XSYD Advanced Key binding');
    }
  }

  for (const binding of draft) {
    if (binding.kind === 'UNKNOWN') {
      continue;
    }
    if (!baseline.some(old => xsydBindingSignature(old) === xsydBindingSignature(binding))) {
      const frame = encodeXsydAdvancedBinding(binding);
      const expectedReplyOpcode = frame[2] | 0x80;
      const reply = await requester.request(frame);
      if (reply.opcode !== expectedReplyOpcode || !reply.checksumValid) {
        throw new Error(`XSYD Advanced Key write failed for ${binding.kind}`);
      }
    }
  }

  // Read back the field table after writing to confirm the device accepted the update.
  if (preReadQueries.length > 0) {
    const postRead = await readXsydFieldTable(requester, preReadQueries);
    const clearedSet = new Set(
      removedKeys.filter(pos => !draft.some(b => b.keys.some(k => requireXsydKeyValue(k) === pos)))
    );
    for (const record of postRead) {
      if (
        record.field === XsydFeatureField.Header &&
        clearedSet.has(record.pos) &&
        record.value !== 0
      ) {
        throw new Error('Advanced Keys readback did not confirm cleared binding.');
      }
    }
  }

  return draft.map(b => ({ ...b }));
}

/**
 * Read layer 0 remap values via `0x23` (`XsydFeatureField.Remap`, `payload[0] = 0x00`).
 */
