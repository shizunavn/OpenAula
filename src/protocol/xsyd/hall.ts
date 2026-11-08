// Hall travel and pressed-state telemetry for the XSYD `0x5C` protocol
// (AULA WIN 68 HE MAX, board XS105 / SI2828C, firmware v1.1.4).
//
// Verified against firmware disassembly (`VA 0xA758`, `0xA77C`, `0xA7A8`, `0xA802`,
// `0xC6D8`, `0x12FE8`) and live USB capture `travel_test_press_randomkey.pcapng`:
//
// 1. Travel query (`subcmd = 0x02`):
//      out: 5C 04 12 A6 | 02 <table_id> FF FF   (table_id = 0x01 or 0x02)
//      in:  5C 80 92 A6 | 00 02 <63 x u16_le>   (128-byte payload across 3 HID reports)
//    - `table_id = 0x01` reads `0x200041EC`: 63 x u16_le travel values in micrometres
//      (`0..3400` um) for matrix indices `0..62` (rows 0..2: `Escape`..`Delete`).
//    - `table_id = 0x02` reads `0x2000426A`: 63 x u16_le travel values in micrometres
//      (`0..3400` um) for matrix indices `63..125` (rows 3..5: `CapsLock`..`ArrowRight`).
//    - In `travel_test_press_randomkey.pcapng`:
//      * Pressing `KeyM` (HID usage `0x10`, matrix index `92 = 63 + 29`) produces
//        `table_id = 2` slot `29` (`payload[60..61]`) ramping `0 -> 3400` um (`3.40 mm`).
//      * Pressing `KeyS` (HID usage `0x16`, matrix index `65 = 63 + 2`) produces
//        `table_id = 2` slot `2` (`payload[6..7]`) ramping `0 -> 1783` um (`1.783 mm`).
//
// 2. Per-key pressed / actuated flag query (`subcmd = 0x03`):
//      out: 5C 04 12 A6 | 03 01 FF FF
//      in:  5C 82 92 27 | 00 03 <126 x u8> FF FF (130-byte payload across 3 HID reports)
//    - Reads `0x20006A48 + index` (`index = 0..125`): `payload[2 + index]` is `0x00`
//      when released and `0x02` when actuated/pressed (`payload[94] = 0x02` while
//      `KeyM` is pressed; `payload[67] = 0x02` while `KeyS` is pressed).
//
// 3. Filtered 12-bit ADC query (`subcmd = 0x06`):
//      out: 5C 04 12 A6 | 06 <table_id> FF FF   (table_id = 0x01 or 0x02)
//      in:  5C 80 92 A6 | 00 06 <63 x u16_le>   (`0..4095` per matrix slot)

import { buildXsydFrame, type XsydReply } from './codec';
import { umToMm } from './features';
import { XSYD_KEYS, type XsydKeyEntry } from './keymap';

export const XSYD_HALL_OPCODE = 0x12;
export const XSYD_HALL_REPLY_OPCODE = 0x92;
export const XSYD_HALL_MATRIX_HALF_SIZE = 63;
export const XSYD_HALL_MATRIX_TOTAL_SIZE = 126;
export const XSYD_HALL_TRAVEL_PAYLOAD_LENGTH = 0x80;
export const XSYD_HALL_PRESSED_PAYLOAD_LENGTH = 0x82;
export const XSYD_HALL_MAX_TRAVEL_UM = 3400;

export const XsydHallSubcmd = {
  /** Per-key travel in micrometres (`0..3400` um), 63 x u16_le per table. */
  Travel: 0x02,
  /** Per-key pressed/actuated flags (`0x00` or `0x02`), 126 x u8 in table 1. */
  Pressed: 0x03,
  /** Filtered 12-bit Hall ADC (`0..4095`), 63 x u16_le per table. */
  FilteredAdc: 0x06
} as const;

export type XsydHallSubcmdId = (typeof XsydHallSubcmd)[keyof typeof XsydHallSubcmd];
export type XsydHallTableId = 1 | 2;

export interface XsydHallKeySample {
  /** UI key identifier (`KeyboardEvent.code`, with `F1` normalized to `'Fn'`). */
  keyId: string;
  /** Firmware 6x21 matrix index (`0..125`, e.g. `65` for `KeyS`, `92` for `KeyM`). */
  matrixIndex: number;
  /** Single-byte wire key position (`usage & 0xff`, e.g. `0x16` for `KeyS`, `0x10` for `KeyM`). */
  pos: number;
  /** Travel in micrometres (`0..3400` um). */
  travelUm: number;
  /** Travel in millimetres (`0..3.4` mm). */
  distanceMm: number;
  /** Travel in `0.01 mm` units (`0..340`), compatible with `HERO68_DISTANCE_UNIT_MM`. */
  distanceUnits: number;
  /** Filtered 12-bit ADC value (`0..4095`), or `0` when ADC was not queried. */
  rawAdc: number;
  /** Whether the firmware reports the key as actuated (`subcmd 0x03` bit 1). */
  pressed: boolean;
}

export function xsydKeyIdForEntry(entry: XsydKeyEntry): string {
  return entry.code === 'F1' ? 'Fn' : entry.code;
}

const KEY_ENTRY_BY_ID: ReadonlyMap<string, XsydKeyEntry> = new Map(
  XSYD_KEYS.map(entry => [xsydKeyIdForEntry(entry), entry])
);

const KEY_ENTRY_BY_MATRIX_INDEX: ReadonlyMap<number, XsydKeyEntry> = new Map(
  XSYD_KEYS.map(entry => [entry.index, entry])
);

export function xsydMatrixIndexForKeyId(keyId: string): number | undefined {
  return KEY_ENTRY_BY_ID.get(keyId)?.index;
}

/** Alias for xsydMatrixIndexForKeyId. */
export const xsydMatrixIndexForKey = xsydMatrixIndexForKeyId;

export function xsydKeyIdForMatrixIndex(matrixIndex: number): string | undefined {
  const entry = KEY_ENTRY_BY_MATRIX_INDEX.get(matrixIndex);
  return entry ? xsydKeyIdForEntry(entry) : undefined;
}

/**
 * Determine which `0x12` travel table(s) (`1` for indices `0..62`, `2` for `63..125`)
 * are needed to cover the requested `keyIds`. Returns `[1, 2]` when `keyIds` is empty.
 */
export function xsydTableIdsForKeys(keyIds: Iterable<string> = []): XsydHallTableId[] {
  let needTable1 = false;
  let needTable2 = false;
  let count = 0;
  for (const keyId of keyIds) {
    const idx = xsydMatrixIndexForKeyId(keyId);
    if (idx === undefined) continue;
    count++;
    if (idx < XSYD_HALL_MATRIX_HALF_SIZE) {
      needTable1 = true;
    } else {
      needTable2 = true;
    }
  }
  if (count === 0) {
    return [1, 2];
  }
  const tables: XsydHallTableId[] = [];
  if (needTable1) tables.push(1);
  if (needTable2) tables.push(2);
  return tables.length > 0 ? tables : [1, 2];
}

function assertTableId(tableId: number): asserts tableId is XsydHallTableId {
  if (tableId !== 1 && tableId !== 2) {
    throw new RangeError(`XSYD Hall tableId must be 1 or 2, got ${tableId}`);
  }
}

/**
 * Build `0x12` subcmd `0x02` Hall travel query (`5C 04 12 A6 | 02 <tableId> FF FF`).
 * - `tableId = 1`: matrix indices `0..62`
 * - `tableId = 2`: matrix indices `63..125`
 */
export function buildXsydHallTravelFrame(tableId: XsydHallTableId): Uint8Array {
  assertTableId(tableId);
  return buildXsydFrame(XSYD_HALL_OPCODE, [XsydHallSubcmd.Travel, tableId, 0xff, 0xff]);
}

/**
 * Build `0x12` subcmd `0x03` per-key pressed state query (`5C 04 12 A6 | 03 01 FF FF`).
 */
export function buildXsydHallPressedFrame(): Uint8Array {
  return buildXsydFrame(XSYD_HALL_OPCODE, [XsydHallSubcmd.Pressed, 0x01, 0xff, 0xff]);
}

/**
 * Build `0x12` subcmd `0x06` filtered 12-bit ADC query (`5C 04 12 A6 | 06 <tableId> FF FF`).
 */
export function buildXsydHallAdcFrame(tableId: XsydHallTableId): Uint8Array {
  assertTableId(tableId);
  return buildXsydFrame(XSYD_HALL_OPCODE, [XsydHallSubcmd.FilteredAdc, tableId, 0xff, 0xff]);
}

function decodeHalfMatrixU16Payload(
  payload: ArrayLike<number>,
  expectedSubcmd: number,
  tableId: XsydHallTableId
): Map<number, number> {
  assertTableId(tableId);
  if (payload.length < XSYD_HALL_TRAVEL_PAYLOAD_LENGTH) {
    throw new RangeError(
      `XSYD 0x92 subcmd 0x${expectedSubcmd.toString(16)} payload must be at least ${XSYD_HALL_TRAVEL_PAYLOAD_LENGTH} bytes, got ${payload.length}`
    );
  }
  if (payload[0] !== 0x00 || payload[1] !== expectedSubcmd) {
    throw new Error(
      `Unexpected XSYD 0x92 header: ${payload[0]?.toString(16)} ${payload[1]?.toString(16)} (expected 00 ${expectedSubcmd.toString(16).padStart(2, '0')})`
    );
  }
  const baseIndex = (tableId - 1) * XSYD_HALL_MATRIX_HALF_SIZE;
  const values = new Map<number, number>();
  for (let i = 0; i < XSYD_HALL_MATRIX_HALF_SIZE; i++) {
    const low = payload[2 + i * 2] ?? 0;
    const high = payload[3 + i * 2] ?? 0;
    const value = low | (high << 8);
    values.set(baseIndex + i, value);
  }
  return values;
}

/**
 * Decode a `128`-byte `0x92` subcmd `0x02` payload into a map of `matrixIndex -> travelUm`.
 */
export function decodeXsydHallTravelPayload(
  payload: ArrayLike<number>,
  tableId: XsydHallTableId
): Map<number, number> {
  return decodeHalfMatrixU16Payload(payload, XsydHallSubcmd.Travel, tableId);
}

export function decodeXsydHallTravelReply(
  reply: XsydReply,
  tableId: XsydHallTableId
): Map<number, number> {
  if (reply.opcode !== XSYD_HALL_REPLY_OPCODE || !reply.checksumValid) {
    throw new Error('Invalid XSYD 0x92 Hall travel reply');
  }
  return decodeXsydHallTravelPayload(reply.payload, tableId);
}

/**
 * Decode a `128`-byte `0x92` subcmd `0x06` payload into a map of `matrixIndex -> rawAdc`.
 */
export function decodeXsydHallAdcPayload(
  payload: ArrayLike<number>,
  tableId: XsydHallTableId
): Map<number, number> {
  return decodeHalfMatrixU16Payload(payload, XsydHallSubcmd.FilteredAdc, tableId);
}

export function decodeXsydHallAdcReply(
  reply: XsydReply,
  tableId: XsydHallTableId
): Map<number, number> {
  if (reply.opcode !== XSYD_HALL_REPLY_OPCODE || !reply.checksumValid) {
    throw new Error('Invalid XSYD 0x92 Hall ADC reply');
  }
  return decodeXsydHallAdcPayload(reply.payload, tableId);
}

/**
 * Decode a `130`-byte `0x92` subcmd `0x03` payload into a map of `matrixIndex -> pressed`.
 */
export function decodeXsydHallPressedPayload(payload: ArrayLike<number>): Map<number, boolean> {
  if (payload.length < XSYD_HALL_PRESSED_PAYLOAD_LENGTH) {
    throw new RangeError(
      `XSYD 0x92 subcmd 0x03 payload must be at least ${XSYD_HALL_PRESSED_PAYLOAD_LENGTH} bytes, got ${payload.length}`
    );
  }
  if (payload[0] !== 0x00 || payload[1] !== XsydHallSubcmd.Pressed) {
    throw new Error(
      `Unexpected XSYD 0x92 pressed header: ${payload[0]?.toString(16)} ${payload[1]?.toString(16)} (expected 00 03)`
    );
  }
  const flags = new Map<number, boolean>();
  for (let i = 0; i < XSYD_HALL_MATRIX_TOTAL_SIZE; i++) {
    const raw = payload[2 + i] ?? 0;
    flags.set(i, raw !== 0);
  }
  return flags;
}

export function decodeXsydHallPressedReply(reply: XsydReply): Map<number, boolean> {
  if (reply.opcode !== XSYD_HALL_REPLY_OPCODE || !reply.checksumValid) {
    throw new Error('Invalid XSYD 0x92 Hall pressed-state reply');
  }
  return decodeXsydHallPressedPayload(reply.payload);
}

/**
 * Combine decoded `0x92` travel (`subcmd 0x02`), pressed (`subcmd 0x03`), and optional
 * ADC (`subcmd 0x06`) maps into per-key `XsydHallKeySample` records for the 68 physical keys.
 */
export function mergeXsydHallSamples({
  travelByMatrixIndex,
  pressedByMatrixIndex,
  adcByMatrixIndex,
  keyIds
}: {
  travelByMatrixIndex: ReadonlyMap<number, number>;
  pressedByMatrixIndex?: ReadonlyMap<number, boolean>;
  adcByMatrixIndex?: ReadonlyMap<number, number>;
  keyIds?: ReadonlySet<string>;
}): XsydHallKeySample[] {
  const samples: XsydHallKeySample[] = [];
  for (const entry of XSYD_KEYS) {
    const keyId = xsydKeyIdForEntry(entry);
    if (keyIds && keyIds.size > 0 && !keyIds.has(keyId)) {
      continue;
    }
    if (!travelByMatrixIndex.has(entry.index) && !pressedByMatrixIndex?.has(entry.index)) {
      continue;
    }
    const rawTravelUm = travelByMatrixIndex.get(entry.index) ?? 0;
    const travelUm = Math.max(0, Math.min(XSYD_HALL_MAX_TRAVEL_UM, rawTravelUm));
    const distanceMm = umToMm(travelUm);
    const distanceUnits = Math.round(travelUm / 10);
    const rawAdc = adcByMatrixIndex?.get(entry.index) ?? 0;
    const pressed = pressedByMatrixIndex?.get(entry.index) ?? travelUm >= 100;
    samples.push({
      keyId,
      matrixIndex: entry.index,
      pos: entry.usage & 0xff,
      travelUm,
      distanceMm,
      distanceUnits,
      rawAdc,
      pressed
    });
  }
  return samples;
}
