// Advanced per-key features of the XSYD `0x5C` protocol (AULA WIN 68 HE MAX).
//
// The `0x23` field table cannot express DKS / MT / MPT / TGL: every field there
// is a single u16 per key. Those features have their own opcodes instead:
//
//   0x24 MT    0x25 TGL    0x27 MPT    0x28 END
//
// The opcode numbers above are the ones observed on the wire, which do not
// always match the names the web driver uses for them (`ProtocolCMD` calls
// 0x27 `KB2_CMD_TGL`, yet the capture carrying the MPT editor's save sends
// 0x27). Trust the capture.
//
// Layout below is read from the web driver (`magnet.aulastar.com`) and checked
// byte for byte against captures:
//
//   MT   `set_MT_at_W...` / `W_MT_holdZ_ClickE_longpresstrigger200ms`
//   TGL  `TGL_V_setZ_logpresstriggerdelay200ms`
//   MPT  `set_MT_at_W-holdZ-clickE-setMPT_A-0.5mmA,1mmM,1.5mmN`
//   END  `S_END_P`
//
// All come from a device announcing ProtocolVersion 1.0.9, so the
// `advancedKeyV2` branch (since 1.0.3) is the one in use: key codes are one
// byte, delays are one byte in 10 ms units.
//
// Verified by tests/xsyd-advanced.test.mjs.

import {buildXsydFrame} from './codec'
import {buildFieldWriteFrame, XsydFeatureField} from './features'

/** ProtocolVersion reported by the WIN 68 HE MAX in the capture handshake. */
export const XSYD_PROTOCOL_VERSION = '1.0.9'

/** `advancedKeyV2` layout: one-byte key codes, one-byte delays. Requires >= 1.0.3. */
export const XSYD_ADVANCED_KEY_V2 = true

/** A key code as stored by the driver: HID usage / action code, one byte. */
export type XsydKeyCode = number

/** Delay granularity of every advanced-key timer (MT/TGL hold). */
export const XSYD_ADVANCED_DELAY_UNIT_MS = 10

/** Largest hold delay the one-byte wire field can address. */
export const XSYD_ADVANCED_DELAY_MAX_MS = XSYD_ADVANCED_DELAY_UNIT_MS * 0xff

function assertCode(code: number, name: string): void {
  if (!Number.isInteger(code) || code < 0 || code > 0xff) {
    throw new RangeError(`${name} must be a byte key code`)
  }
}

/**
 * Convert a hold threshold to the wire byte (`delay / 10`).
 *
 * Both MT and TGL captures agree: `Delay: 200` -> 0x14, `Delay: 300` -> 0x1e.
 */
function encodeDelay(delayMs: number): number {
  const delay = Math.round(delayMs / XSYD_ADVANCED_DELAY_UNIT_MS)
  if (!Number.isInteger(delay) || delay < 0 || delay > 0xff) {
    throw new RangeError(`delayMs must map to 0..${XSYD_ADVANCED_DELAY_MAX_MS} ms`)
  }
  return delay
}

/** MT: hold one key, tap another. */
export interface XsydMt {
  /** Action code of the key being configured (the key object's `keyValue`). */
  key: XsydKeyCode
  /** Action code fired while held (`MTInfo.DKS[0]`). */
  hold: XsydKeyCode
  /** Action code fired on a short press (`MTInfo.DKS[1]`). */
  tap: XsydKeyCode
  /** Hold threshold in milliseconds; the wire stores `delay / 10`. */
  delayMs: number
}

/** TGL: latch one action on press, release it on the next press. */
export interface XsydTgl {
  /** Action code of the key being configured. */
  key: XsydKeyCode
  /** Action code held while latched (`TGLInfo.DKS`). */
  toggle: XsydKeyCode
  /** Long-press threshold in milliseconds; the wire stores `delay / 10`. */
  delayMs: number
}

/** End key: pressing this key emits another key's action and does not latch. */
export interface XsydEnd {
  /** Action code of the key being configured (`ENDInfo` owner). */
  key: XsydKeyCode
  /** `ENDInfo.DKS`: action code emitted when the key is pressed. */
  action: XsydKeyCode
}

/**
 * `0x28` payload for one END key.
 *
 * Capture: `5c 04 28 | 01 16 13 00` for S (`keyValue` 22 = 0x16) configured to
 * end as P (0x13 = 19). Confirmed by the user: the editor had S selected and
 * the END action was P.
 */
export function buildEndPayload(end: XsydEnd): Uint8Array {
  assertCode(end.key, 'key')
  assertCode(end.action, 'action')
  return Uint8Array.from([
    0x01, // END
    end.key,
    end.action,
    0x00, // constant in the capture
  ])
}

/** MPT: trigger one action per travel depth. */
export interface XsydMpt {
  /** Action code of the key being configured. */
  key: XsydKeyCode
  /** Action codes fired at each depth below, in order (up to 3). */
  steps: readonly XsydKeyCode[]
  /** `MPTInfo.DB` in micrometres: one per step, shallowest first. */
  depthsUm: readonly number[]
}

/**
 * SOCD: simultaneous opposite cardinal direction pair (`0x2C`, LEN 11).
 *
 * Capture `socd_AD_on`: `5c 0b 2c c8 | 01 04 07 00 00 00 00 00 00 00 00`.
 * Only `type = 0`, `mode = 0`, `delay = 0` is verified by capture.
 */
export interface XsydSocd {
  key1: XsydKeyCode
  key2: XsydKeyCode
  action1?: number
  action2?: number
  type?: number
  mode?: number
  delay?: number
}

/**
 * `0x24` payload for one MT key.
 *
 * Capture: `5c 07 24 | 01 1a 1d 00 08 00 14` for W (`keyValue` 26 = 0x1a) with
 * `MTInfo{DKS:[29,8], Delay:200}` — hold Z (0x1d), tap E (0x08).
 *
 * The two constant bytes around `hold … tap` never changed between the two
 * captures; the only byte that moved with `Delay` is the last one (0x1e vs 0x14
 * for 300 ms vs 200 ms).
 */
export function buildMtPayload(mt: XsydMt): Uint8Array {
  assertCode(mt.key, 'key')
  assertCode(mt.hold, 'hold')
  assertCode(mt.tap, 'tap')
  return Uint8Array.from([
    0x01, // MT
    mt.key,
    mt.hold,
    0x00, // constant in every capture
    mt.tap,
    0x00, // constant in every capture
    encodeDelay(mt.delayMs),
  ])
}

/**
 * `0x25` payload for one TGL key.
 *
 * Capture: `5c 05 25 | 01 19 1d 00 14` for V (`keyValue` 25 = 0x19) with
 * `TGLInfo{DKS:29, Delay:200}` — toggle Z (0x1d).
 */
export function buildTglPayload(tgl: XsydTgl): Uint8Array {
  assertCode(tgl.key, 'key')
  assertCode(tgl.toggle, 'toggle')
  return Uint8Array.from([
    0x01, // TGL
    tgl.key,
    tgl.toggle,
    0x00, // constant in the capture
    encodeDelay(tgl.delayMs),
  ])
}

/**
 * `0x27` payload for one MPT key.
 *
 * Capture: `5c 0e 27 | 01 04 04 00 10 00 11 00 f4 01 e8 03 dc 05` for A with
 * `MPTInfo{DKS:[4,0,16], DB:[0.5,1,1.5]}`.
 *
 * Body is `01`, `count` (`steps + 1`), then one u16 little-endian code per step
 * (high byte always 0), then one u16 depth per step, shallowest first.
 *
 * The key being configured is not repeated on the wire: `MPTInfo.DKS[0]` is
 * the key itself, and the captured frame only carried `DKS[1..]`
 * (`[4,16]` plus the 0x11 pseudo-key the editor appends). Depths are
 * `MPTInfo.DB` in µm.
 */
export function buildMptPayload(mpt: XsydMpt): Uint8Array {
  assertCode(mpt.key, 'key')
  if (mpt.steps.length === 0 || mpt.steps.length > 3) {
    throw new RangeError('MPT takes 1..3 steps')
  }
  if (mpt.depthsUm.length !== mpt.steps.length) {
    throw new RangeError('every MPT step needs a depth')
  }
  const payload = [0x01, mpt.steps.length + 1]
  for (const step of mpt.steps) {
    assertCode(step, 'step')
    payload.push(step, 0x00)
  }
  for (const depth of mpt.depthsUm) {
    if (!Number.isInteger(depth) || depth < 0 || depth > 0xffff) {
      throw new RangeError('depth must be micrometres in a u16')
    }
    payload.push(depth & 0xff, (depth >> 8) & 0xff)
  }
  return Uint8Array.from(payload)
}

/**
 * `0x2C` payload for one SOCD pair (LEN 11).
 *
 * Capture `socd_AD_on`: `5c 0b 2c c8 | 01 04 07 00 00 00 00 00 00 00 00`.
 * Any non-zero `type`, `mode`, `action1`, `action2`, or `delay` is unverified
 * and rejected before reaching the wire.
 */
export function buildSocdPayload(socd: XsydSocd): Uint8Array {
  assertCode(socd.key1, 'key1')
  assertCode(socd.key2, 'key2')
  if (socd.key1 === socd.key2) {
    throw new RangeError('SOCD requires two distinct keys')
  }
  const action1 = socd.action1 ?? 0
  const action2 = socd.action2 ?? 0
  const type = socd.type ?? 0
  const mode = socd.mode ?? 0
  const delay = socd.delay ?? 0
  if (action1 !== 0 || action2 !== 0 || type !== 0 || mode !== 0 || delay !== 0) {
    throw new RangeError('Only SOCD type=0, mode=0, delay=0 is verified by capture on WIN 68 HE MAX')
  }
  return Uint8Array.from([
    0x01,
    socd.key1,
    socd.key2,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ])
}

/** Full 64-byte report body for an MT write. */
export function buildMtFrame(mt: XsydMt): Uint8Array {
  return buildXsydFrame(0x24, buildMtPayload(mt))
}

/** Full 64-byte report body for a TGL write. */
export function buildTglFrame(tgl: XsydTgl): Uint8Array {
  return buildXsydFrame(0x25, buildTglPayload(tgl))
}

/** Full 64-byte report body for an END write. */
export function buildEndFrame(end: XsydEnd): Uint8Array {
  return buildXsydFrame(0x28, buildEndPayload(end))
}

/** Full 64-byte report body for an MPT (multi-point travel) write. */
export function buildMptFrame(mpt: XsydMpt): Uint8Array {
  return buildXsydFrame(0x27, buildMptPayload(mpt))
}

/** Full 64-byte report body for a verified SOCD write (`type=0, mode=0`). */
export function buildSocdFrame(socd: XsydSocd): Uint8Array {
  return buildXsydFrame(0x2c, buildSocdPayload(socd))
}

/**
 * Turn off advanced key binding on one or more keys via `0x23` field `0x08` = `0x0000`
 * (verified by `S_D_F_to-B_C_D_and_revert` capture, docs/xsyd-protocol.md §5.5).
 */
export function buildDisableAdvancedKeyFrame(keys: readonly XsydKeyCode[]): Uint8Array {
  if (keys.length === 0) {
    throw new RangeError('At least one key is required to disable an advanced binding')
  }
  for (const key of keys) {
    assertCode(key, 'key')
  }
  return buildFieldWriteFrame(
    keys.map(pos => ({
      pos,
      field: XsydFeatureField.Header,
      value: 0x0000,
    }))
  )
}
