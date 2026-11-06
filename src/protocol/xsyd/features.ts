// Per-key field bank of the XSYD `0x5C` protocol (AULA WIN 68 HE MAX).
//
// `0x23` is NOT a "remap" opcode: it writes one row of a per-key field table.
// Handler 0xACE0 reads each slot as four bytes and jumps through the field
// table at VA 0x1C744:
//
//   payload[0]        flag: 0 -> only slots with pos != 0xFF, 1 -> all 14 slots
//   payload[1+4k]     pos   (wire key id, see keymap.ts)
//   payload[2+4k]     field (index into 0x1C744)
//   payload[3+4k]     value low byte
//   payload[4+4k]     value high byte
//
// Every accepted field is one u16 per key, addressed by the firmware as
// `0x20003220 + 2 * ((pos >> 5) * 0x15 + (pos & 0x1F) + WINDOW)`, i.e. a 6x21
// array. Remap (field 0) is the exception: its value is a single byte.
//
// Verified against 9 USBPcap sessions: tests/xsyd-features.test.mjs.

import {buildXsydFrame} from './codec'
import {XSYD_KEYS} from './keymap'

export {XSYD_KEYS}

/** Field ids accepted by the `0x23` jump table (VA 0x1C744). */
export const XsydFeatureField = {
  /** Action code of the key (byte). 0x4A20 maps pos -> default action. */
  Remap: 0x00,
  /** Actuation travel in micrometres. Verified: WASD 1000, Space 1510, M/N 200. */
  Travel: 0x04,
  /** Key header. Every capture writes 0x20. */
  Header: 0x08,
  /** Rapid trigger. Verified: 100 (0.1 mm) in the actuation capture. */
  RapidTrigger: 0x16,
  /** Dead zone. Verified: 100 (0.1 mm) in the actuation capture. */
  Deadzone: 0x17,
  /** Switch type. Verified: yongchun capture writes A=1, Z=1, Q=2, W=3, E=0. */
  SwitchType: 0x19,
} as const

export type XsydFeatureFieldId = (typeof XsydFeatureField)[keyof typeof XsydFeatureField]

/** Slots per `0x23` frame. Handler 0xAD7C walks exactly 14. */
export const XSYD_FEATURE_SLOTS = 14

/** Empty slot marker: `pos = 0xFF`, nothing else. */
const EMPTY_SLOT = [0xff, 0xff, 0x00, 0x00] as const

export interface XsydFieldWrite {
  /** Wire key id (keymap.ts `index`). */
  pos: number
  field: number
  /** u16 value; for `Remap` only the low byte is used. */
  value: number
}

/** Total micrometres of travel the firmware can address with a u16. */
export const XSYD_TRAVEL_MAX_UM = 0xffff

/** Micrometres -> millimetres (the UI speaks mm, the wire speaks um). */
export function umToMm(um: number): number {
  return um / 1000
}

export function mmToUm(mm: number): number {
  return Math.round(mm * 1000)
}

/**
 * Build an `0x23` payload.
 *
 * Always uses flag 1 (scan all 14 slots) because that is what the vendor app
 * sends; a slot left unspecified is padded with `ff ff 00 00`, which the
 * firmware skips (`0xADB8`).
 */
export function buildFieldWritePayload(writes: readonly XsydFieldWrite[]): Uint8Array {
  if (writes.length > XSYD_FEATURE_SLOTS) {
    throw new RangeError(`at most ${XSYD_FEATURE_SLOTS} slots per frame`);
  }
  const payload = new Uint8Array(1 + 4 * XSYD_FEATURE_SLOTS).fill(0)
  payload[0] = 0x01
  for (let k = 0; k < XSYD_FEATURE_SLOTS; k++) {
    const slot = writes[k]
    if (!slot) {
      payload.set([...EMPTY_SLOT], 1 + 4 * k)
      continue
    }
    const {pos, field, value} = slot
    if (!Number.isInteger(pos) || pos < 0 || pos > 0xfe) {
      throw new RangeError(`pos must be a wire key id (0..0xfe), got ${pos}`)
    }
    if (!Number.isInteger(field) || field < 0 || field > 0xff) {
      throw new RangeError(`field must be a byte, got ${field}`)
    }
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new RangeError(`value must be a u16, got ${value}`)
    }
    const offset = 1 + 4 * k
    payload[offset] = pos
    payload[offset + 1] = field
    payload[offset + 2] = value & 0xff
    payload[offset + 3] = (value >> 8) & 0xff
  }
  return payload
}

/** Full 64-byte report body for one `0x23` frame. */
export function buildFieldWriteFrame(writes: readonly XsydFieldWrite[]): Uint8Array {
  return buildXsydFrame(0x23, buildFieldWritePayload(writes))
}

/**
 * Build an `0x23` readback request payload (`payload[0] = 0x00`).
 *
 * Queries up to 14 `(pos, field)` slots without mutating other slots; unused
 * slots are padded with `ff ff 00 00`.
 */
export function buildFieldReadPayload(
  queries: readonly {pos: number; field: number}[] = []
): Uint8Array {
  if (queries.length > XSYD_FEATURE_SLOTS) {
    throw new RangeError(`at most ${XSYD_FEATURE_SLOTS} slots per frame`)
  }
  const payload = new Uint8Array(1 + 4 * XSYD_FEATURE_SLOTS).fill(0)
  payload[0] = 0x00
  for (let k = 0; k < XSYD_FEATURE_SLOTS; k++) {
    const slot = queries[k]
    if (!slot) {
      payload.set([...EMPTY_SLOT], 1 + 4 * k)
      continue
    }
    const {pos, field} = slot
    if (!Number.isInteger(pos) || pos < 0 || pos > 0xfe) {
      throw new RangeError(`pos must be a wire key id (0..0xfe), got ${pos}`)
    }
    if (!Number.isInteger(field) || field < 0 || field > 0xff) {
      throw new RangeError(`field must be a byte, got ${field}`)
    }
    const offset = 1 + 4 * k
    payload[offset] = pos
    payload[offset + 1] = field
    payload[offset + 2] = 0x00
    payload[offset + 3] = 0x00
  }
  return payload
}

/** Full 64-byte report body for an `0x23` readback request (`payload[0] = 0x00`). */
export function buildFieldReadFrame(
  queries: readonly {pos: number; field: number}[] = []
): Uint8Array {
  return buildXsydFrame(0x23, buildFieldReadPayload(queries))
}

/** Decode an `0x23` payload back into live slots (padding dropped). */
export function decodeFieldWritePayload(payload: ArrayLike<number>): XsydFieldWrite[] {
  const slots: XsydFieldWrite[] = []
  for (let k = 0; k < XSYD_FEATURE_SLOTS; k++) {
    const offset = 1 + 4 * k
    if (offset + 3 >= payload.length) break
    const pos = payload[offset]
    if (pos === 0xff) continue
    slots.push({
      pos,
      field: payload[offset + 1],
      value: payload[offset + 2] | (payload[offset + 3] << 8),
    })
  }
  return slots
}

/** Split any number of writes into frames of 14 slots. */
export function chunkFieldWrites(writes: readonly XsydFieldWrite[]): XsydFieldWrite[][] {
  const frames: XsydFieldWrite[][] = []
  for (let i = 0; i < writes.length; i += XSYD_FEATURE_SLOTS) {
    frames.push(writes.slice(i, i + XSYD_FEATURE_SLOTS))
  }
  return frames
}

/** Convenience: one `Travel` write per key id. */
export function travelWrites(
  entries: readonly {pos: number; um: number}[]
): XsydFieldWrite[] {
  return entries.map(({pos, um}) => ({pos, field: XsydFeatureField.Travel, value: um}))
}

const WIRE_POS_BY_CODE: ReadonlyMap<string, number> = new Map(
  XSYD_KEYS.map(key => [key.code, key.index])
)

const KEY_VALUE_BY_CODE: ReadonlyMap<string, number> = new Map(
  XSYD_KEYS.flatMap(key => {
    const val = key.usage & 0xff
    return key.code === 'F1' ? [['F1', val], ['Fn', val]] : [[key.code, val]]
  })
)

const CODE_BY_KEY_VALUE: ReadonlyMap<number, string> = new Map(
  XSYD_KEYS.map(key => [key.usage & 0xff, key.code === 'F1' ? 'Fn' : key.code])
)

/** Wire key id for a `KeyboardEvent.code`, or `undefined` for an unsupported key. */
export function wirePosForCode(code: string): number | undefined {
  return WIRE_POS_BY_CODE.get(code)
}

/** 1-byte `keyValue` (HID usage low byte) used by XSYD frames on the wire. */
export function keyValueForCode(code: string): number | undefined {
  return KEY_VALUE_BY_CODE.get(code)
}

/** UI keyId (`Escape`..`ArrowRight`, `Fn`) for a 1-byte XSYD `keyValue`. */
export function codeForKeyValue(keyValue: number): string | undefined {
  return CODE_BY_KEY_VALUE.get(keyValue)
}
