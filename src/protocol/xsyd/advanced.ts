// Advanced per-key features of the XSYD `0x5C` protocol (AULA WIN 68 HE MAX).
//
// The `0x23` field table cannot express DKS / MT / MPT / TGL / END / SOCD: every
// field there is a single u16 per key. Those features have their own opcodes:
//
//   0x24 MT    0x25 TGL    0x26 DKS    0x27 MPT    0x28 END    0x2C SOCD
//
// The opcode numbers above are the ones observed on the wire and verified
// against the RISC-V firmware dispatch table (`VA 0x07674..0x076A0`).
//
// Layout below is read from the web driver (`magnet.aulastar.com`), cross-checked
// against firmware v1.1.4 (`VA 0x0B2D6..0x0BF8E` and `VA 0x1470A..0x162FA`), and
// checked byte for byte against USB captures:
//
//   MT   `set_MT_at_W...` / `W_MT_holdZ_ClickE_longpresstrigger200ms`
//   TGL  `TGL_V_setZ_logpresstriggerdelay200ms`
//   DKS  `dks_keyW_down1.4-3.4_up3.4-1.4_A-hold1_B-hold2_C-hold3_D-end`
//   MPT  `set_MT_at_W-holdZ-clickE-setMPT_A-0.5mmA,1mmM,1.5mmN`
//   END  `S_END_P`
//   SOCD `socd_AD_on` + `socd_ad_keyinredboxAtakeprecedence_keyinblueboxDtakeprecedence_neutral(changes3modein1capture)`
//
// All come from a device announcing ProtocolVersion 1.0.9, so the
// `advancedKeyV2` branch (since 1.0.3) is the one in use: key codes are one
// byte, delays are one byte in 10 ms units.
//
// Verified by tests/xsyd-advanced.test.mjs and tests/xsyd-win68-integration.test.mjs.

import {buildXsydFrame, type XsydReply} from './codec'
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

/**
 * Verified SOCD resolution modes (`payload[8]` in opcode `0x2C`, evaluated at
 * firmware `VA 0x14D5C..0x14D72` and `VA 0x1622E..0x162FA`):
 * - `0x00` (`LastInputPriority`): Last pressed key overrides the earlier key (`socd_AD_on.pcapng`).
 * - `0x01` (`FirstKeyPriority`): Key 1 (red box) always takes precedence (`#29461` in `socd_ad_...pcapng`).
 * - `0x02` (`SecondKeyPriority`): Key 2 (blue box) always takes precedence (`#59268` in `socd_ad_...pcapng`).
 * - `0x03` (`Neutral`): Both keys cancel out when held simultaneously (`#86416` in `socd_ad_...pcapng`).
 */
export const XsydSocdMode = {
  LastInputPriority: 0x00,
  FirstKeyPriority: 0x01,
  SecondKeyPriority: 0x02,
  Neutral: 0x03,
} as const

export type XsydSocdModeValue = (typeof XsydSocdMode)[keyof typeof XsydSocdMode]

/**
 * Verified 8-bit DKS phase masks (`payload[10..13]` in opcode `0x26`, evaluated
 * against ROM table `VA 0x1D524` `[0x01, 0x02, 0x02, 0x02, 0x04, 0x18, 0x20, 0x40, 0x40, 0x40, 0x80]`
 * at `VA 0x14A8E..0x14BD0` and captured in `dks_keyW_down1.4-3.4_up3.4-1.4_A-hold1_B-hold2_C-hold3_D-end.pcapng`):
 * - `0x01`: Tap at Phase 0 (start of press)
 * - `0x04`: Tap at Phase 1 (deep press)
 * - `0x20`: Tap at Phase 2 (release from deep)
 * - `0xc0`: Tap at Phase 3 (end of release, `D-end` in capture)
 * - `0x03`: Hold Phase 0 → Phase 1 (`A-hold1` in capture)
 * - `0x1c`: Hold Phase 1 → Phase 2 (`B-hold2` in capture)
 * - `0x60`: Hold Phase 2 → Phase 3 (`C-hold3` in capture)
 * - `0x1f`: Hold Phase 0 → Phase 2 (`0x03 | 0x1c`)
 * - `0x7c`: Hold Phase 1 → Phase 3 (`0x1c | 0x60`)
 * - `0x7f`: Hold Phase 0 → Phase 3 (`0x03 | 0x1c | 0x60`)
 */
export const XsydDksMask = {
  None: 0x00,
  TapStart: 0x01,
  TapDeepPress: 0x04,
  TapReleaseFromDeep: 0x20,
  TapEndOfRelease: 0xc0,
  HoldStartToDeepPress: 0x03,
  HoldDeepPressToRelease: 0x1c,
  HoldReleaseToEnd: 0x60,
  HoldStartToReleaseFromDeep: 0x1f,
  HoldDeepPressToEnd: 0x7c,
  HoldStartToEnd: 0x7f,
} as const

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
 * DKS: Dynamic Keystroke (`0x26`, LEN `0x10` = 16).
 *
 * Verified by `dks_keyW_down1.4-3.4_up3.4-1.4_A-hold1_B-hold2_C-hold3_D-end.pcapng` (`#40752`)
 * and firmware handler `VA 0x0B718..0x0B9FE`:
 *   `5c 10 26 cc | 01 1a 04 00 05 00 06 00 07 00 03 1c 60 c0 78 05`
 * - `payload[0] = 0x01` (write flag)
 * - `payload[1] = key` (`0x1a` = 26 for W)
 * - `payload[2..9]` = 4 action codes as little-endian `u16` (`04 00 05 00 06 00 07 00`)
 * - `payload[10..13]` = 4 8-bit phase masks (`03 1c 60 c0`)
 * - `payload[14..15]` = shallow actuation depth in micrometres as little-endian `u16` (`0x0578` = 1400 µm)
 */
export interface XsydDks {
  /** Action code of the key being configured (`keyValue`, e.g. `0x1a` = 26 for W). */
  key: XsydKeyCode
  /** Four action codes (rows 0..3), each encoded as u16 LE on wire. */
  actions: readonly XsydKeyCode[]
  /** Explicit 8-bit phase masks `[mask0, mask1, mask2, mask3]`. */
  masks?: readonly number[]
  /** OpenAula 4-phase state rows (`states[0..3]`, converted via `encodeXsydDksStateRow`). */
  states?: readonly (readonly number[])[]
  /** Shallow actuation depth in micrometres (`100..3400` µm, e.g. `1400` µm = `0x0578`). */
  actuationUm: number
}

/**
 * SOCD: simultaneous opposite cardinal direction pair (`0x2C`, LEN 11).
 *
 * Verified across all 4 modes:
 * - `socd_AD_on.pcapng`:
 *   `5c 0b 2c c8 | 01 04 07 00 00 00 00 00 00 00 00` (`mode = 0x00`: Last input priority)
 * - `socd_ad_keyinredboxAtakeprecedence_keyinblueboxDtakeprecedence_neutral(changes3modein1capture).pcapng`:
 *   - `#29461`: `5c 0b 2c c8 | 01 04 07 00 00 00 00 00 01 00 00` (`mode = 0x01`: Key 1 / red box priority)
 *   - `#59268`: `5c 0b 2c c8 | 01 04 07 00 00 00 00 00 02 00 00` (`mode = 0x02`: Key 2 / blue box priority)
 *   - `#86416`: `5c 0b 2c c8 | 01 04 07 00 00 00 00 00 03 00 00` (`mode = 0x03`: Neutral)
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
 * Convert one OpenAula 4-phase DKS row (`[s0, s1, s2, s3]`) into its 8-bit XSYD
 * wire mask byte (`payload[10 + r]` in opcode `0x26`).
 */
export function encodeXsydDksStateRow(row: readonly number[]): number {
  if (!Array.isArray(row) || row.length !== 4) {
    throw new RangeError('DKS state row must have 4 phase values')
  }
  const [s0, s1, s2, s3] = row
  if (s0 === 0 && s1 === 0 && s2 === 0 && s3 === 0) {
    return XsydDksMask.None
  }
  if (s0 === 14 && s1 === 0 && s2 === 0 && s3 === 0) {
    return XsydDksMask.HoldStartToDeepPress
  }
  if (s0 === 0 && s1 === 14 && s2 === 0 && s3 === 0) {
    return XsydDksMask.HoldDeepPressToRelease
  }
  if (s0 === 0 && s1 === 0 && s2 === 14 && s3 === 0) {
    return XsydDksMask.HoldReleaseToEnd
  }
  if (s0 === 6 && s1 === 12 && s2 === 0 && s3 === 0) {
    return XsydDksMask.HoldStartToReleaseFromDeep
  }
  if (s0 === 0 && s1 === 6 && s2 === 12 && s3 === 0) {
    return XsydDksMask.HoldDeepPressToEnd
  }
  if (s0 === 6 && s1 === 4 && s2 === 12 && s3 === 0) {
    return XsydDksMask.HoldStartToEnd
  }
  if (row.every(v => v === 0 || v === 10)) {
    let mask = 0
    if (s0 === 10) mask |= XsydDksMask.TapStart
    if (s1 === 10) mask |= XsydDksMask.TapDeepPress
    if (s2 === 10) mask |= XsydDksMask.TapReleaseFromDeep
    if (s3 === 10) mask |= XsydDksMask.TapEndOfRelease
    return mask
  }
  throw new RangeError(`Unsupported DKS state row pattern: [${row.join(', ')}]`)
}

/**
 * Decode one 8-bit XSYD DKS wire mask byte back into OpenAula's 4-phase state row.
 */
export function decodeXsydDksStateMask(mask: number): [number, number, number, number] {
  if (!Number.isInteger(mask) || mask < 0 || mask > 0xff) {
    throw new RangeError(`DKS mask must be a byte (0..255), got ${mask}`)
  }
  switch (mask) {
    case XsydDksMask.None:
      return [0, 0, 0, 0]
    case XsydDksMask.HoldStartToDeepPress:
      return [14, 0, 0, 0]
    case XsydDksMask.HoldDeepPressToRelease:
      return [0, 14, 0, 0]
    case XsydDksMask.HoldReleaseToEnd:
      return [0, 0, 14, 0]
    case XsydDksMask.HoldStartToReleaseFromDeep:
      return [6, 12, 0, 0]
    case XsydDksMask.HoldDeepPressToEnd:
      return [0, 6, 12, 0]
    case XsydDksMask.HoldStartToEnd:
    case 0xff:
      return [6, 4, 12, 0]
    default:
      return [
        mask & XsydDksMask.TapStart ? 10 : 0,
        mask & XsydDksMask.TapDeepPress ? 10 : 0,
        mask & XsydDksMask.TapReleaseFromDeep ? 10 : 0,
        mask & 0x80 ? 10 : 0,
      ]
  }
}

/**
 * `0x26` payload for one DKS key (`LEN = 0x10` = 16 bytes).
 *
 * Capture `dks_keyW_down1.4-3.4_up3.4-1.4_A-hold1_B-hold2_C-hold3_D-end.pcapng` (`#40752`):
 * `5c 10 26 cc | 01 1a 04 00 05 00 06 00 07 00 03 1c 60 c0 78 05`
 */
export function buildDksPayload(dks: XsydDks): Uint8Array {
  assertCode(dks.key, 'key')
  if (!Array.isArray(dks.actions) || dks.actions.length !== 4) {
    throw new RangeError('DKS requires exactly 4 action codes')
  }
  for (const action of dks.actions) {
    assertCode(action, 'action')
  }
  let masks: number[]
  if (dks.masks !== undefined) {
    if (!Array.isArray(dks.masks) || dks.masks.length !== 4) {
      throw new RangeError('DKS requires 4 mask bytes')
    }
    for (const m of dks.masks) {
      assertCode(m, 'mask')
    }
    masks = [...dks.masks]
  } else if (dks.states !== undefined) {
    if (!Array.isArray(dks.states) || dks.states.length !== 4) {
      throw new RangeError('DKS requires 4 state rows')
    }
    masks = dks.states.map(encodeXsydDksStateRow)
  } else {
    throw new RangeError('DKS requires either masks or states')
  }
  if (!Number.isInteger(dks.actuationUm) || dks.actuationUm < 100 || dks.actuationUm > 3400) {
    throw new RangeError('DKS actuationUm must be an integer in 100..3400 µm')
  }
  return Uint8Array.from([
    0x01,
    dks.key,
    dks.actions[0],
    0x00,
    dks.actions[1],
    0x00,
    dks.actions[2],
    0x00,
    dks.actions[3],
    0x00,
    masks[0],
    masks[1],
    masks[2],
    masks[3],
    dks.actuationUm & 0xff,
    (dks.actuationUm >> 8) & 0xff,
  ])
}

/**
 * Decode an `0xA6` DKS reply (`LEN = 0x2E` = 46 bytes, `#40754` in `dks_keyW_...pcapng`).
 */
export function decodeDksReply(reply: XsydReply): {
  key: XsydKeyCode
  actions: [XsydKeyCode, XsydKeyCode, XsydKeyCode, XsydKeyCode]
  masks: [number, number, number, number]
  states: [number, number, number, number][]
  actuationUm: number
} {
  if (reply.opcode !== 0xa6 || reply.payload.length < 16) {
    throw new Error(`Expected opcode 0xA6 DKS reply, got 0x${reply.opcode.toString(16)}`)
  }
  const p = reply.payload
  const key = p[1]
  const actions: [number, number, number, number] = [
    p[2] | (p[3] << 8),
    p[4] | (p[5] << 8),
    p[6] | (p[7] << 8),
    p[8] | (p[9] << 8),
  ]
  const masks: [number, number, number, number] = [p[10], p[11], p[12], p[13]]
  const actuationUm = p[14] | (p[15] << 8)
  return {
    key,
    actions,
    masks,
    states: masks.map(decodeXsydDksStateMask),
    actuationUm,
  }
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
 * Verified across all 4 modes (`mode = 0..3`):
 * - `mode = 0x00`: Last input priority (`socd_AD_on.pcapng`)
 * - `mode = 0x01`: Key 1 (red box) takes precedence (`#29461`)
 * - `mode = 0x02`: Key 2 (blue box) takes precedence (`#59268`)
 * - `mode = 0x03`: Neutral (`#86416`)
 * Any non-zero `type`, `action1`, `action2`, or `delay`, or `mode` outside `0..3`,
 * is rejected before reaching the wire.
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
  const mode = socd.mode ?? XsydSocdMode.LastInputPriority
  const delay = socd.delay ?? 0
  if (!Number.isInteger(mode) || mode < 0 || mode > 3) {
    throw new RangeError('SOCD mode must be 0..3 on WIN 68 HE MAX')
  }
  if (action1 !== 0 || action2 !== 0 || type !== 0 || delay !== 0) {
    throw new RangeError('Only SOCD type=0, action1=0, action2=0, delay=0 is verified by capture on WIN 68 HE MAX')
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
    mode,
    0x00,
    0x00,
  ])
}

/**
 * Build a `0x2C` read query frame (`5c 0b 2c c8 | 00 <key> 00 00 00 00 00 00 00 0a 00`),
 * verified by `#12086`, `#47190`, `#73090` in `socd_ad_...pcapng`.
 */
export function buildSocdReadFrame(key: XsydKeyCode): Uint8Array {
  assertCode(key, 'key')
  return buildXsydFrame(0x2c, [0x00, key, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0a, 0x00])
}

/**
 * Decode an `0xAC` SOCD reply (`LEN = 0x0B` = 11 bytes, `#29463`, `#59270`, `#86418`).
 */
export function decodeSocdReply(reply: XsydReply): {
  key1: XsydKeyCode
  key2: XsydKeyCode
  action1: number
  action2: number
  type: number
  mode: XsydSocdModeValue
  delay: number
} | null {
  if (reply.opcode !== 0xac || reply.payload.length < 11) {
    throw new Error(`Expected opcode 0xAC SOCD reply, got 0x${reply.opcode.toString(16)}`)
  }
  const p = reply.payload
  if (p[1] === 0 && p[2] === 0) {
    return null
  }
  return {
    key1: p[1],
    key2: p[2],
    action1: p[3] | (p[4] << 8),
    action2: p[5] | (p[6] << 8),
    type: p[7],
    mode: (p[8] & 0x03) as XsydSocdModeValue,
    delay: p[9] | (p[10] << 8),
  }
}

/** Full 64-byte report body for an MT write. */
export function buildMtFrame(mt: XsydMt): Uint8Array {
  return buildXsydFrame(0x24, buildMtPayload(mt))
}

/** Full 64-byte report body for a TGL write. */
export function buildTglFrame(tgl: XsydTgl): Uint8Array {
  return buildXsydFrame(0x25, buildTglPayload(tgl))
}

/** Full 64-byte report body for a DKS write (`0x26`, `LEN = 0x10`). */
export function buildDksFrame(dks: XsydDks): Uint8Array {
  return buildXsydFrame(0x26, buildDksPayload(dks))
}

/** Full 64-byte report body for an END write. */
export function buildEndFrame(end: XsydEnd): Uint8Array {
  return buildXsydFrame(0x28, buildEndPayload(end))
}

/** Full 64-byte report body for an MPT (multi-point travel) write. */
export function buildMptFrame(mpt: XsydMpt): Uint8Array {
  return buildXsydFrame(0x27, buildMptPayload(mpt))
}

/** Full 64-byte report body for a verified SOCD write (`mode = 0..3`). */
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
