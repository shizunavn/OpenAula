// Per-key field bank (`0x23`) and Global Actuation (`0x29`) of the XSYD `0x5C`
// protocol (AULA WIN 68 HE MAX, firmware `XS105_SI2828C_WIN 68 HE MAX_App_v1.1.4_20260204a.bin`).
//
// `0x23` reads (`payload[0] = 0x00`) or writes (`payload[0] = 0x01`) up to 14
// `(pos, field, u16_le)` slots per frame (`VA 0x0ACE0..0x0B4B8`):
//   - Write jump table at `VA 0x1C6DC` (26 entries, `field = 0x00..0x19`)
//   - Read jump table at `VA 0x1C744` (49 entries, `field = 0x00..0x30`)
//
//   payload[0]        mode: 0x00 = Read from SRAM, 0x01 = Write to SRAM (+ 500ms Flash flush at VA 0x07E28)
//   payload[1+4k]     pos   (1-byte HID usage / keyValue, translated via VA 0x0D0A8 -> cell 0..125)
//   payload[2+4k]     field (index into 0x1C6DC / 0x1C744)
//   payload[3+4k]     value low byte
//   payload[4+4k]     value high byte

import {buildXsydFrame, type XsydReply} from './codec'
import {XSYD_KEYS} from './keymap'

export {XSYD_KEYS}

export const XSYD_GLOBAL_ACTUATION_OPCODE = 0x29
export const XSYD_GLOBAL_ACTUATION_REPLY_OPCODE = 0xa9

/**
 * Field IDs verified against firmware v1.1.4 (`VA 0x1C6DC` write table,
 * `VA 0x1C744` read table, and `VA 0x12FE8..0x13636` Hall scan engine) and
 * USBPcap captures (`profile_1_2_3_4.pcapng`, `actutation2.0global_...pcapng`,
 * `wasd_deadzone.pcapng`).
 */
export const XsydFeatureField = {
  /** Layer 0 key action byte (`0x20003220 + 2*cell`, write `0x0ADCC`, read `0x0B1F8`). */
  Remap: 0x00,
  /** Per-key actuation point in micrometres (`0x2000341A + 2*cell`, write `0x0B07C`, read `0x0B34A`, scan `0x13206`). */
  Travel: 0x04,
  /** Multi-Point Trigger (MPT) depth 1 in µm (`0x20003516 + 2*cell`, write `0x0B0A8`, read `0x0B372`). */
  MptDepth1: 0x05,
  /** Multi-Point Trigger (MPT) depth 2 in µm (`0x20003612 + 2*cell`, write `0x0B0D4`, read `0x0B39A`). */
  MptDepth2: 0x06,
  /** Multi-Point Trigger (MPT) depth 3 in µm (`0x2000370E + 2*cell`, write `0x0B100`, read `0x0B3C2`). */
  MptDepth3: 0x07,
  /**
   * Key mode / header byte (`0x200051CC + cell`, write `0x0AE72`, read `0x0B270`):
   * - `bit 5 (0x20)`: Rapid Trigger enabled (`VA 0x13504..0x13510`) and per-key travel lock vs `0x29` (`VA 0x0C0DC`)
   * - `0x00`: Rapid Trigger disabled (standard actuation mode)
   * - `bits 0..3`: Advanced Key type (`1=DKS, 2=MPT, 3=MT, 4=TGL, 5=END, 7=SOCD`)
   */
  Header: 0x08,
  /** Rapid Trigger Press sensitivity in µm (`0x2000380A + 2*cell`, write `0x0B150`, read `0x0B402`, scan `0x1352E`). */
  RapidTriggerPress: 0x14,
  /** Rapid Trigger Release sensitivity in µm (`0x20003906 + 2*cell`, write `0x0B16A`, read `0x0B41C`, scan `0x13538`). */
  RapidTriggerRelease: 0x15,
  /**
   * Top Deadzone in µm (`0x20003FEC + 2*cell`, write `0x0B184`, read `0x0B436`, scan `0x13202` & `0x13572`,
   * sanitized at `0x12C72..0x12C96` to `0..1000 µm` else reset to `200 µm`).
   * Verified in `wasd_deadzone.pcapng` (#03 `150 µm = 0.15 mm`, #11 `1000 µm = 1.00 mm`).
   */
  TopDeadzone: 0x16,
  /**
   * Bottom Deadzone in µm (`0x200040E8 + 2*cell`, write `0x0B1AA`, read `0x0B45E`, scan `0x1357C`,
   * sanitized at `0x12C9A..0x12CA2` to `0..1000 µm` else reset to `200 µm`).
   * Verified in `wasd_deadzone.pcapng` (#06 `200 µm = 0.20 mm`, #13 `1000 µm = 1.00 mm`).
   */
  BottomDeadzone: 0x17,
  /**
   * Per-key magnetic switch calibration curve ID (`0x200045F4 + 2*cell`, write `0x0B1D0`, read `0x0B486`, scan `0x130C6`):
   * - `0`: Wing Chun / Graywood (`3400 µm` max travel, curve 0 at `VA 0x04E44`)
   * - `1`: Jade Pro / Magnetic Jade (`3400 µm` max travel, curve 0 at `VA 0x04E44`)
   * - `2`: Black King / Black Emperor / Uranus (`3300 µm` max travel, curve 1 at `VA 0x05644`)
   * - `3`: Meteor Magnetic / TTC King (`3300 µm` max travel, curve 1 at `VA 0x05644`)
   */
  SwitchType: 0x19,
  /** Backwards-compatible alias for `RapidTriggerPress` (`0x14`). */
  RapidTrigger: 0x14,
  /** Backwards-compatible alias for `TopDeadzone` (`0x16`). */
  Deadzone: 0x16,
} as const

export type XsydFeatureFieldId = (typeof XsydFeatureField)[keyof typeof XsydFeatureField]

/** Slots per `0x23` frame. Handler `0x0AD7C` / `0x0ADEC` walks 14 slots. */
export const XSYD_FEATURE_SLOTS = 14

/** Empty slot marker: `pos = 0xFF`, nothing else. */
const EMPTY_SLOT = [0xff, 0xff, 0x00, 0x00] as const

export interface XsydFieldWrite {
  /** 1-byte XSYD keyValue (HID usage low byte, `0x01` for Fn). */
  pos: number
  field: number
  /** u16 value; for `Remap` and `Header` only the low byte is used by hardware. */
  value: number
}

/** Total micrometres of travel the firmware can address with a u16. */
export const XSYD_TRAVEL_MAX_UM = 0xffff

/** Micrometres -> millimetres (the UI speaks mm, the wire speaks µm). */
export function umToMm(um: number): number {
  return um / 1000
}

export function mmToUm(mm: number): number {
  return Math.round(mm * 1000)
}

/**
 * Build an `0x29` Global Actuation read frame (`LEN = 0x0F`, `payload[0] = 0x00`).
 * Verified at firmware `VA 0x0C092..0x0C12E` and `profile_1_2_3_4.pcapng`:
 * `5C 0F 29 C9 | 00 ...` -> `5C 0F A9 49 | 00 00 00 <u16_le global_travel_um> 00 ...`.
 */
export function buildGlobalActuationReadFrame(): Uint8Array {
  const payload = new Uint8Array(0x0f)
  payload[0] = 0x00
  return buildXsydFrame(XSYD_GLOBAL_ACTUATION_OPCODE, payload)
}

/**
 * Build an `0x29` Global Actuation write frame (`LEN = 0x0F`, `payload[0] = 0x01`).
 * Verified at firmware `VA 0x0C092..0x0C10A` and `actutation2.0global_...pcapng`:
 * `5C 0F 29 C9 | 01 00 00 <u16_le global_travel_um> 00 ...`.
 */
export function buildGlobalActuationWriteFrame(travelUm: number): Uint8Array {
  if (!Number.isInteger(travelUm) || travelUm < 100 || travelUm > 3400) {
    throw new RangeError(`Global actuation travel must be 100..3400 µm, got ${travelUm}`)
  }
  const payload = new Uint8Array(0x0f)
  payload[0] = 0x01
  payload[3] = travelUm & 0xff
  payload[4] = (travelUm >> 8) & 0xff
  return buildXsydFrame(XSYD_GLOBAL_ACTUATION_OPCODE, payload)
}

/**
 * Decode an `0xA9` reply to `0x29` Global Actuation read/write, returning the
 * global actuation point in micrometres (`payload[3..4]` u16_le).
 */
export function decodeGlobalActuationReply(reply: XsydReply): number {
  if (reply.opcode !== XSYD_GLOBAL_ACTUATION_REPLY_OPCODE || !reply.checksumValid) {
    throw new Error('Invalid XSYD 0x29 global actuation reply')
  }
  if (reply.payload.length < 5) {
    throw new Error(`Incomplete XSYD 0xA9 payload: ${reply.payload.length} bytes`)
  }
  return (reply.payload[3] ?? 0) | ((reply.payload[4] ?? 0) << 8)
}

/**
 * Build an `0x23` write payload (`payload[0] = 0x01`).
 *
 * Unused slots are padded with `ff ff 00 00`, which the firmware skips (`VA 0x0AD62`).
 */
export function buildFieldWritePayload(writes: readonly XsydFieldWrite[]): Uint8Array {
  if (writes.length > XSYD_FEATURE_SLOTS) {
    throw new RangeError(`at most ${XSYD_FEATURE_SLOTS} slots per frame`)
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

/** Full 64-byte report body for one `0x23` write frame. */
export function buildFieldWriteFrame(writes: readonly XsydFieldWrite[]): Uint8Array {
  return buildXsydFrame(0x23, buildFieldWritePayload(writes))
}

/**
 * Build an `0x23` readback request payload (`payload[0] = 0x00`).
 *
 * Queries up to 14 `(pos, field)` slots from SRAM (`VA 0x0AE34`); unused slots
 * are padded with `ff ff 00 00`.
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

/**
 * Decode an `0x23` / `0xA3` payload back into live slots, dropping both
 * `ff ff 00 00` / `ff ff ff 00` and `00 00 00 00` padding slots (`wasd_deadzone.pcapng`).
 */
export function decodeFieldWritePayload(payload: ArrayLike<number>): XsydFieldWrite[] {
  const slots: XsydFieldWrite[] = []
  for (let k = 0; k < XSYD_FEATURE_SLOTS; k++) {
    const offset = 1 + 4 * k
    if (offset + 3 >= payload.length) break
    const pos = payload[offset]
    const field = payload[offset + 1]
    const lo = payload[offset + 2]
    const hi = payload[offset + 3]
    if (pos === 0xff || (pos === 0x00 && field === 0x00 && lo === 0x00 && hi === 0x00)) continue
    slots.push({
      pos,
      field,
      value: lo | (hi << 8),
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
