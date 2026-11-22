/**
 * Layer-0 remap read/write on the WIN 68 HE MAX via the XSYD `0x5C` `0x23` field bank.
 */
import {
  defaultRemapLayers,
  REMAP_LAYERS,
  type RemapLayer,
  type RemapLayers
} from '../hero68/remap';
import type { ProfileSlot } from '../hero68/types';
import {
  buildFieldWriteFrame,
  chunkFieldWrites,
  codeForKeyValue,
  keyValueForCode,
  requireXsydKeyValue,
  XSYD_KEYS,
  XsydFeatureField,
  type XsydFieldWrite
} from './features';
import {
  buildXsydSelectProfileFrame,
  readXsydFieldTable,
  toXsydActionByte,
  type XsydRequester
} from './commands';

export async function readXsydRemapLayers(
  requester: XsydRequester,
  keyIds: readonly string[] = XSYD_KEYS.map(k => (k.code === 'F1' ? 'Fn' : k.code))
): Promise<RemapLayers> {
  const layers = defaultRemapLayers('win68HeMax');
  const queries = keyIds
    .map(keyId => keyValueForCode(keyId))
    .filter((pos): pos is number => pos !== undefined)
    .map(pos => ({ pos, field: XsydFeatureField.Remap }));
  const records = await readXsydFieldTable(requester, queries);
  for (const record of records) {
    if (record.field !== XsydFeatureField.Remap) continue;
    const keyId = codeForKeyValue(record.pos);
    if (keyId && record.value > 0) {
      layers[0][keyId] = record.value & 0xff;
    }
  }
  return layers;
}

/**
 * Save dirty remap changes via `0x23` (`XsydFeatureField.Remap`, verified by
 * `S_D_F_to-B_C_D_and_revert.pcapng`).
 */
export async function saveXsydRemapChanges(
  requester: XsydRequester,
  slot: ProfileSlot,
  layers: RemapLayers,
  dirty: ReadonlySet<string>
): Promise<void> {
  if (dirty.size === 0) {
    return;
  }
  await requester.request(buildXsydSelectProfileFrame(slot));
  const writes: XsydFieldWrite[] = [];
  for (const entry of dirty) {
    const [layerText, keyId] = entry.split(':');
    const layer = Number(layerText) as RemapLayer;
    if (!REMAP_LAYERS.includes(layer) || layer !== 0) {
      continue;
    }
    const pos = requireXsydKeyValue(keyId);
    const value = toXsydActionByte(layers[layer][keyId] ?? pos);
    writes.push({ pos, field: XsydFeatureField.Remap, value });
  }
  for (const batch of chunkFieldWrites(writes)) {
    const reply = await requester.request(buildFieldWriteFrame(batch));
    if (reply.opcode !== 0xa3 || !reply.checksumValid) {
      throw new Error('XSYD remap write failed');
    }
  }
}

/**
 * Last travel value written per `profileSlot:pos:field` (and `pos:field`), used by
 * `hydrateFromXsydDevice` as a fallback when the device reports no stored travel.
 */
export const xsydWrittenFieldCache = new Map<string, number>();
