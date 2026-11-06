// XSYD `0x5C` RGB protocol (`0x18` Global Lighting & `0x2A` Per-Key RGB / Custom Stream)
// for the AULA WIN 68 HE MAX (VID 0x1CA2, PID 0x1901, firmware v1.1.4).
//
// Every frame layout below is verified byte-for-byte against real USB captures:
//   1. `tideflux_softripple_snippingstorm_brightness0-4-3-1-2-0_speed1-2-3-4-0_reverseon-off_colorchangetosmoothflow(multicolor-red-blue).pcapng`
//   2. `Q(green)-E(red)_-Z(yellow)-P(Pink).txt`
//   3. `connect_keyboard_to_webhidofficial.txt`
//   4. `profile_1_2_3_4.txt`

import { BRAND } from '../../brand'
import type { LightingFrame } from '../../keyboard/lightingPreviewBus'
import { restoreCustomRgb } from '../../keyboard/customRgbModel'
import { mapModeToWin68Hardware } from '../../keyboard/rgbCatalog'
import { rgbChanges, type RgbColor, type RgbProfile, type RgbZone } from '../hero68/rgb'
import type { ProfileSlot } from '../hero68/types'
import { buildXsydFrame, type XsydReply } from './codec'
import { codeForKeyValue, keyValueForCode, XSYD_KEYS } from './features'

export const XSYD_RGB_OPCODE = 0x18
export const XSYD_RGB_REPLY_OPCODE = 0x98
export const XSYD_PER_KEY_RGB_OPCODE = 0x2a
export const XSYD_PER_KEY_RGB_REPLY_OPCODE = 0xaa

/** Effect ID (`payload[39]`) that activates Custom Per-Key RGB (`0x2A` colors). */
export const XSYD_PER_KEY_RGB_MODE = 0x15

/** Number of 4-byte `[keyValue, R, G, B]` slots in a full `0x2A` (`LEN = 0x39`) frame. */
export const XSYD_PER_KEY_SLOTS = 14

/** Hardware brightness levels on WIN 68 HE MAX (`0..4` -> 0%, 25%, 50%, 75%, 100%). */
export const XSYD_MAX_BRIGHTNESS = 4

/** Hardware speed levels on WIN 68 HE MAX (`0..4`). */
export const XSYD_MAX_SPEED = 4

export interface XsydRgbRequester {
  request(frame: Uint8Array, timeoutMs?: number): Promise<XsydReply>
}

export interface XsydColorSlotInfo {
  /** `payload[43]` color index (`0` = Multicolor, `1..7` = Palette slots 1..7). */
  index: number
  name: string
  /** Display RGB tuple in standard `[R, G, B]` order (`0..255`). */
  rgb: RgbColor
  /** Raw 4-byte wire representation `[B, G, R, 0xFF]` inside `payload[5..32]`. */
  wireBgr: readonly [number, number, number, number]
}

/**
 * The 7 hardware preset color slots stored in `payload[5..32]` of `0x18` / `0x98`
 * in `[B, G, R, 0xFF]` order, plus `0` for Multicolor.
 *
 * Verified in `tideflux_..._pcapng`:
 *   - `colorIndex = 0` (`pkt=28908, 31746`): Multicolor
 *   - `colorIndex = 1` (`pkt=36682`): Red (`payload[5..8] = 00 00 ff ff`)
 *   - `colorIndex = 4` (`pkt=38840`): Blue (`payload[17..20] = ff 00 00 ff`)
 */
export const XSYD_COLOR_SLOTS: readonly XsydColorSlotInfo[] = [
  { index: 0, name: 'Multicolor', rgb: [255, 255, 255], wireBgr: [0x00, 0x00, 0x00, 0xff] },
  { index: 1, name: 'Red', rgb: [255, 0, 0], wireBgr: [0x00, 0x00, 0xff, 0xff] },
  { index: 2, name: 'Green', rgb: [0, 255, 0], wireBgr: [0x00, 0xff, 0x00, 0xff] },
  { index: 3, name: 'Yellow', rgb: [255, 255, 0], wireBgr: [0x00, 0x7f, 0x7f, 0xff] },
  { index: 4, name: 'Blue', rgb: [0, 0, 255], wireBgr: [0xff, 0x00, 0x00, 0xff] },
  { index: 5, name: 'Purple', rgb: [255, 0, 255], wireBgr: [0x7f, 0x00, 0x7f, 0xff] },
  { index: 6, name: 'Cyan', rgb: [0, 255, 255], wireBgr: [0x7f, 0x7f, 0x00, 0xff] },
  { index: 7, name: 'White', rgb: [255, 255, 255], wireBgr: [0x7f, 0x7f, 0x7f, 0xff] },
]

/** Exact 28-byte default `[B, G, R, 0xFF]` palette sent in every `0x18` capture. */
export const XSYD_DEFAULT_PALETTE_BGR: Uint8Array = Uint8Array.from(
  XSYD_COLOR_SLOTS.slice(1).flatMap(slot => slot.wireBgr)
)

/** Default 7-slot RGB palette (`Slots 1..7`) in `[R, G, B]` order. */
export const XSYD_DEFAULT_PALETTE_RGB: readonly RgbColor[] = XSYD_COLOR_SLOTS.slice(1).map(
  slot => [...slot.rgb] as RgbColor
)

const XSYD_SAVED_RGB_STORAGE_KEY = `${BRAND.storagePrefix}:xsyd-saved-rgb:v1`
const xsydWrittenColorsCache = new Map<string, RgbColor>()
const xsydSavedRgbBySlot = new Map<number, RgbProfile>()

export function saveXsydSavedRgb(slot: number, profile: RgbProfile): void {
  const cloned = structuredClone(profile)
  xsydSavedRgbBySlot.set(slot, cloned)
  for (const [k, v] of Object.entries(cloned.colors ?? {})) {
    xsydWrittenColorsCache.set(k, [...v] as RgbColor)
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const existing = JSON.parse(window.localStorage.getItem(XSYD_SAVED_RGB_STORAGE_KEY) ?? '{}')
      existing[String(slot)] = cloned
      window.localStorage.setItem(XSYD_SAVED_RGB_STORAGE_KEY, JSON.stringify(existing))
    } catch {
      // Ignore storage quota errors
    }
  }
}

export function loadXsydSavedRgb(slot: number): RgbProfile | null {
  const inMem = xsydSavedRgbBySlot.get(slot)
  if (inMem) {
    return structuredClone(inMem)
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const existing = JSON.parse(window.localStorage.getItem(XSYD_SAVED_RGB_STORAGE_KEY) ?? '{}')
      const stored = existing?.[String(slot)]
      if (stored && typeof stored === 'object' && stored.keys && stored.colors) {
        xsydSavedRgbBySlot.set(slot, stored)
        return structuredClone(stored)
      }
    } catch {
      return null
    }
  }
  return null
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

/**
 * Normalize brightness to WIN 68 HE MAX's hardware `0..4` range.
 * If a legacy HERO68 draft carries `5..20` (where 20 = 100%), scale by `round(v / 5)`
 * so switching models never triggers an invalid brightness error.
 */
export function normalizeXsydBrightness(brightness: number): number {
  if (!Number.isFinite(brightness) || brightness <= 0) {
    return 0
  }
  if (brightness > XSYD_MAX_BRIGHTNESS && brightness <= 20) {
    return Math.max(1, Math.min(XSYD_MAX_BRIGHTNESS, Math.round(brightness / 5)))
  }
  return Math.max(0, Math.min(XSYD_MAX_BRIGHTNESS, Math.round(brightness)))
}

/**
 * Find the closest hardware color slot (`1..7`) for an `[R, G, B]` color.
 */
export function closestXsydColorSlot(rgb: RgbColor): number {
  let bestIndex = 1
  let bestDist = Infinity
  for (let i = 1; i < XSYD_COLOR_SLOTS.length; i++) {
    const slotRgb = XSYD_COLOR_SLOTS[i].rgb
    const dist =
      (rgb[0] - slotRgb[0]) ** 2 +
      (rgb[1] - slotRgb[1]) ** 2 +
      (rgb[2] - slotRgb[2]) ** 2
    if (dist < bestDist) {
      bestDist = dist
      bestIndex = i
    }
  }
  return bestIndex
}

/**
 * Determine the wire `colorIndex` (`payload[43]`, `0..7`) for a given `RgbZone`.
 */
export function xsydColorIndexForZone(zone: RgbZone): number {
  if (zone.mix) {
    return 0
  }
  if (
    zone.colorIndex !== undefined &&
    Number.isInteger(zone.colorIndex) &&
    zone.colorIndex >= 1 &&
    zone.colorIndex <= 7
  ) {
    return zone.colorIndex
  }
  return closestXsydColorSlot(zone.rgb)
}

/**
 * Resolve the display `[R, G, B]` color for a `colorIndex` (`0..7`).
 */
export function xsydRgbForColorIndex(
  colorIndex: number,
  palette: readonly RgbColor[] = XSYD_DEFAULT_PALETTE_RGB
): RgbColor {
  if (colorIndex >= 1 && colorIndex <= 7) {
    const custom = palette[colorIndex - 1]
    if (custom && custom.length === 3) {
      return [clampByte(custom[0]), clampByte(custom[1]), clampByte(custom[2])]
    }
    return [...XSYD_COLOR_SLOTS[colorIndex].rgb] as RgbColor
  }
  return [255, 255, 255]
}

/**
 * Default `RgbProfile` tailored for AULA WIN 68 HE MAX:
 * - `mode = 0x01` (`Aurora Wave`), `brightness = 4` (100%), `speed = 3`, `mix = true` (`colorIndex = 0`)
 * - `reverse = false`
 * - 68 per-key colors initialized to `[255, 255, 255]`
 */
export function defaultXsydRgb(
  keyIds: readonly string[] = XSYD_KEYS.map(k => (k.code === 'F1' ? 'Fn' : k.code))
): RgbProfile {
  return {
    keys: {
      mode: 1,
      mix: true,
      rgb: [255, 0, 0],
      brightness: XSYD_MAX_BRIGHTNESS,
      speed: 3,
      reverse: false,
      colorIndex: 0,
      palette: XSYD_DEFAULT_PALETTE_RGB.map(c => [...c] as RgbColor),
    },
    side: {
      mode: 0,
      mix: false,
      rgb: [0, 0, 0],
      brightness: 0,
      speed: 0,
    },
    colors: Object.fromEntries(keyIds.map(id => [id, [255, 255, 255] as RgbColor])),
  }
}

/**
 * Build `0x18` global lighting read request payload (`LEN = 0x2B` = 43 bytes).
 *
 * Verified against:
 * - `connect_keyboard_to_webhidofficial.txt` `idx=20` (`useDefaultPalette = false`, 28 × `0xFF`)
 * - `profile_1_2_3_4.txt` `idx=2, 287, 574, 859` (`useDefaultPalette = true`, 28B default BGR palette)
 * Both produce `CK = 0xD4`.
 */
export function buildXsydRgbReadPayload(useDefaultPalette = false): Uint8Array {
  const payload = new Uint8Array(0x2b)
  payload[0] = 0x00 // Read
  if (useDefaultPalette) {
    payload.set(XSYD_DEFAULT_PALETTE_BGR, 5)
  } else {
    payload.fill(0xff, 5, 33)
  }
  return payload
}

/** Full 64-byte report for `0x18` global lighting read (`5c 2b 18 d4 | ...`). */
export function buildXsydRgbReadFrame(useDefaultPalette = false): Uint8Array {
  return buildXsydFrame(XSYD_RGB_OPCODE, buildXsydRgbReadPayload(useDefaultPalette))
}

/**
 * Build `0x18` global lighting write payload (`LEN = 0x2C` = 44 bytes).
 *
 * Verified byte-for-byte against all 21 `OUT op=0x18 len=0x2C` packets in
 * `tideflux_softripple_snippingstorm_brightness0-4-3-1-2-0_speed1-2-3-4-0_reverseon-off_colorchangetosmoothflow(multicolor-red-blue).pcapng`.
 */
export function buildXsydRgbWritePayload(zone: RgbZone): Uint8Array {
  const mode =
    zone.mode === 19 || zone.mode === 119
      ? XSYD_PER_KEY_RGB_MODE
      : zone.mode >= 100
        ? mapModeToWin68Hardware(zone.mode)
        : zone.mode
  if (!Number.isInteger(mode) || mode < 0 || mode > 0xff) {
    throw new RangeError(`Invalid XSYD RGB mode: ${zone.mode}`)
  }
  const brightness = normalizeXsydBrightness(zone.brightness)
  if (!Number.isInteger(zone.speed) || zone.speed < 0 || zone.speed > 5) {
    throw new RangeError(`Invalid XSYD RGB speed: ${zone.speed}`)
  }
  const speed = Math.min(XSYD_MAX_SPEED, Math.max(0, zone.speed))
  const colorIndex = xsydColorIndexForZone(zone)
  if (!Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex > 7) {
    throw new RangeError(`Invalid XSYD RGB colorIndex: ${colorIndex}`)
  }

  const payload = new Uint8Array(0x2c)
  payload[0] = 0x01 // Write
  // payload[1..4] = 00 00 00 00
  payload.set(XSYD_DEFAULT_PALETTE_BGR, 5)

  // If the caller supplied custom slot colors in `zone.palette` that differ from
  // the default display colors, encode them into the 7 `[B, G, R, 0xFF]` slots.
  if (zone.palette && zone.palette.length === 7) {
    for (let i = 0; i < 7; i++) {
      const custom = zone.palette[i]
      const def = XSYD_COLOR_SLOTS[i + 1].rgb
      if (
        custom &&
        custom.length === 3 &&
        (custom[0] !== def[0] || custom[1] !== def[1] || custom[2] !== def[2])
      ) {
        const offset = 5 + i * 4
        payload[offset] = clampByte(custom[2]) // B
        payload[offset + 1] = clampByte(custom[1]) // G
        payload[offset + 2] = clampByte(custom[0]) // R
        payload[offset + 3] = 0xff
      }
    }
  }

  // payload[33..36] = 00 00 00 00
  payload[37] = zone.reverse ? 0x03 : 0x01
  payload[38] = brightness
  payload[39] = mode
  payload[40] = speed
  payload[41] = 0x02
  payload[42] = 0x00
  payload[43] = colorIndex
  return payload
}

/** Full 64-byte report for `0x18` global lighting write (`5c 2c 18 <ck> | 01 ...`). */
export function buildXsydRgbWriteFrame(zone: RgbZone): Uint8Array {
  return buildXsydFrame(XSYD_RGB_OPCODE, buildXsydRgbWritePayload(zone))
}

/**
 * Decode an `IN op=0x98 len=0x2D` reply into a normalized `RgbZone`.
 */
export function decodeXsydRgbReply(reply: XsydReply): RgbZone {
  if (reply.opcode !== XSYD_RGB_REPLY_OPCODE || !reply.checksumValid) {
    throw new Error('Invalid XSYD 0x98 global RGB reply')
  }
  if (reply.payload.length < 0x2c) {
    throw new Error(`Incomplete XSYD 0x98 payload: expected >= 44 bytes, got ${reply.payload.length}`)
  }
  const p = reply.payload
  const palette: RgbColor[] = []
  for (let i = 0; i < 7; i++) {
    const offset = 5 + i * 4
    const b = p[offset] ?? 0
    const g = p[offset + 1] ?? 0
    const r = p[offset + 2] ?? 0
    const defWire = XSYD_COLOR_SLOTS[i + 1].wireBgr
    if ((b === defWire[0] && g === defWire[1] && r === defWire[2]) || (b === 0xff && g === 0xff && r === 0xff)) {
      palette.push([...XSYD_COLOR_SLOTS[i + 1].rgb] as RgbColor)
    } else {
      palette.push([r, g, b])
    }
  }

  const flags = p[37] ?? 0x01
  const reverse = (flags & 0x02) !== 0
  const brightness = Math.max(0, Math.min(XSYD_MAX_BRIGHTNESS, p[38] ?? 0))
  const mode = p[39] ?? 1
  const rawSpeed = p[40] ?? 3
  const speed = Math.max(0, Math.min(XSYD_MAX_SPEED, rawSpeed))
  const colorIndex = Math.max(0, Math.min(7, p[43] ?? 0))
  const mix = colorIndex === 0
  const rgb = mix
    ? ([...(palette[0] ?? [255, 0, 0])] as RgbColor)
    : xsydRgbForColorIndex(colorIndex, palette)

  return {
    mode,
    mix,
    rgb,
    brightness,
    speed,
    reverse,
    colorIndex,
    palette,
  }
}

/**
 * Build `0x2A` single-key RGB write payload (`LEN = 0x05`: `01 <keyValue> <R> <G> <B>`).
 *
 * Verified byte-for-byte against `Q(green)-E(red)_-Z(yellow)-P(Pink).txt`:
 * - `Q` (`0x14`, `[7, 255, 0]`):   `5c 05 2a c0 | 01 14 07 ff 00` (`idx=6`)
 * - `E` (`0x08`, `[255, 0, 0]`):   `5c 05 2a c0 | 01 08 ff 00 00` (`idx=8`)
 * - `Z` (`0x1D`, `[232, 255, 0]`): `5c 05 2a c0 | 01 1d e8 ff 00` (`idx=10`)
 * - `P` (`0x13`, `[255, 0, 206]`): `5c 05 2a 8e | 01 13 ff 00 ce` (`idx=13`)
 */
export function buildXsydPerKeyWritePayload(keyValue: number, color: RgbColor): Uint8Array {
  if (!Number.isInteger(keyValue) || keyValue < 0 || keyValue > 0xfe) {
    throw new RangeError(`keyValue must be 0..0xfe, got ${keyValue}`)
  }
  if (!Array.isArray(color) || color.length !== 3 || color.some(c => !Number.isInteger(c) || c < 0 || c > 255)) {
    throw new RangeError(`Invalid RGB888 color: ${JSON.stringify(color)}`)
  }
  return Uint8Array.from([0x01, keyValue, color[0], color[1], color[2]])
}

/** Full 64-byte report for `0x2A` single-key RGB write (`5c 05 2a <ck> | 01 <keyValue> <R> <G> <B>`). */
export function buildXsydPerKeyWriteFrame(keyValue: number, color: RgbColor): Uint8Array {
  return buildXsydFrame(XSYD_PER_KEY_RGB_OPCODE, buildXsydPerKeyWritePayload(keyValue, color))
}

/**
 * Build a 14-slot `0x2A` batch write frame (`LEN = 0x39` = 57 bytes, `payload[0] = 0x01`).
 * Unused slots are padded with `ff 00 00 00`.
 */
export function buildXsydPerKeyBatchWriteFrame(
  entries: readonly { keyValue: number; color: RgbColor }[]
): Uint8Array {
  if (entries.length === 0 || entries.length > XSYD_PER_KEY_SLOTS) {
    throw new RangeError(`Expected 1..${XSYD_PER_KEY_SLOTS} key color entries, got ${entries.length}`)
  }
  const payload = new Uint8Array(1 + 4 * XSYD_PER_KEY_SLOTS)
  payload[0] = 0x01
  for (let k = 0; k < XSYD_PER_KEY_SLOTS; k++) {
    const offset = 1 + 4 * k
    const item = entries[k]
    if (!item) {
      payload[offset] = 0xff
      continue
    }
    const { keyValue, color } = item
    if (!Number.isInteger(keyValue) || keyValue < 0 || keyValue > 0xfe) {
      throw new RangeError(`keyValue must be 0..0xfe, got ${keyValue}`)
    }
    if (!Array.isArray(color) || color.length !== 3 || color.some(c => !Number.isInteger(c) || c < 0 || c > 255)) {
      throw new RangeError(`Invalid RGB888 color: ${JSON.stringify(color)}`)
    }
    payload[offset] = keyValue
    payload[offset + 1] = color[0]
    payload[offset + 2] = color[1]
    payload[offset + 3] = color[2]
  }
  return buildXsydFrame(XSYD_PER_KEY_RGB_OPCODE, payload)
}

/**
 * Build the 5 `0x2A` (`LEN = 0x39`) read frames that query all 68 keys in batches of 14.
 *
 * Verified byte-for-byte against `connect_keyboard_to_webhidofficial.txt` `idx=290, 292, 294, 296, 298`
 * (where the last 2 padding slots of frame 5 are `ff 00 00 00 ff 00 00 00`).
 */
export function buildXsydPerKeyReadFrames(
  keyIds: readonly string[] = XSYD_KEYS.map(k => (k.code === 'F1' ? 'Fn' : k.code))
): Uint8Array[] {
  const keyValues = keyIds
    .map(id => keyValueForCode(id))
    .filter((kv): kv is number => kv !== undefined)
  const frames: Uint8Array[] = []
  for (let i = 0; i < keyValues.length; i += XSYD_PER_KEY_SLOTS) {
    const batch = keyValues.slice(i, i + XSYD_PER_KEY_SLOTS)
    const payload = new Uint8Array(1 + 4 * XSYD_PER_KEY_SLOTS)
    payload[0] = 0x00 // Read
    for (let k = 0; k < XSYD_PER_KEY_SLOTS; k++) {
      const offset = 1 + 4 * k
      payload[offset] = batch[k] ?? 0xff
      payload[offset + 1] = 0x00
      payload[offset + 2] = 0x00
      payload[offset + 3] = 0x00
    }
    frames.push(buildXsydFrame(XSYD_PER_KEY_RGB_OPCODE, payload))
  }
  return frames
}

/**
 * Decode an `IN op=0xAA len=0x39` reply into a `{ [keyId]: [R, G, B] }` map.
 */
export function decodeXsydPerKeyReply(reply: XsydReply): Record<string, RgbColor> {
  if (reply.opcode !== XSYD_PER_KEY_RGB_REPLY_OPCODE || !reply.checksumValid) {
    throw new Error('Invalid XSYD 0xAA per-key RGB reply')
  }
  if (reply.payload.length < 5) {
    throw new Error(`Incomplete XSYD 0xAA payload: ${reply.payload.length} bytes`)
  }
  const out: Record<string, RgbColor> = {}
  const slots = Math.min(XSYD_PER_KEY_SLOTS, Math.floor((reply.payload.length - 1) / 4))
  for (let k = 0; k < slots; k++) {
    const offset = 1 + 4 * k
    const keyValue = reply.payload[offset] ?? 0xff
    if (keyValue === 0xff || keyValue === 0x00) {
      continue
    }
    const keyId = codeForKeyValue(keyValue)
    if (!keyId) {
      continue
    }
    out[keyId] = [
      reply.payload[offset + 1] ?? 0,
      reply.payload[offset + 2] ?? 0,
      reply.payload[offset + 3] ?? 0,
    ]
  }
  return out
}

/**
 * Read the active global lighting configuration (`0x18` -> `0x98`) from WIN 68 HE MAX.
 */
export async function readXsydRgbZone(requester: XsydRgbRequester): Promise<RgbZone> {
  const reply = await requester.request(buildXsydRgbReadFrame())
  return decodeXsydRgbReply(reply)
}

/**
 * Read all 68 per-key RGB colors (`0x2A` -> `0xAA` × 5 frames) from WIN 68 HE MAX.
 */
export async function readXsydRgbColors(
  requester: XsydRgbRequester,
  keyIds: readonly string[] = XSYD_KEYS.map(k => (k.code === 'F1' ? 'Fn' : k.code))
): Promise<Record<string, RgbColor>> {
  const colors: Record<string, RgbColor> = Object.fromEntries(
    keyIds.map(id => [id, [...(xsydWrittenColorsCache.get(id) ?? [255, 255, 255])] as RgbColor])
  )
  const decodedAll: Record<string, RgbColor> = {}
  for (const frame of buildXsydPerKeyReadFrames(keyIds)) {
    const reply = await requester.request(frame)
    Object.assign(decodedAll, decodeXsydPerKeyReply(reply))
  }
  const hasAnyNonZero = Object.values(decodedAll).some(c => c[0] !== 0 || c[1] !== 0 || c[2] !== 0)
  if (hasAnyNonZero) {
    Object.assign(colors, decodedAll)
  }
  return colors
}

/**
 * Read the complete `RgbProfile` (`0x18` global lighting + `0x2A` 68-key color table)
 * from a WIN 68 HE MAX.
 */
export async function readXsydRgbProfile(
  requester: XsydRgbRequester,
  keyIds: readonly string[] = XSYD_KEYS.map(k => (k.code === 'F1' ? 'Fn' : k.code))
): Promise<RgbProfile> {
  const keys = await readXsydRgbZone(requester)
  const colors = await readXsydRgbColors(requester, keyIds)
  return {
    keys,
    side: {
      mode: 0,
      mix: false,
      rgb: [0, 0, 0],
      brightness: 0,
      speed: 0,
    },
    colors,
  }
}

/**
 * Compare two `RgbZone` configurations using XSYD `0x18` wire semantics
 * (including `reverse` direction and `colorIndex`).
 */
export function sameXsydRgbZone(a: RgbZone, b: RgbZone): boolean {
  const modeA = a.mode === 19 || a.mode === 119 ? XSYD_PER_KEY_RGB_MODE : a.mode
  const modeB = b.mode === 19 || b.mode === 119 ? XSYD_PER_KEY_RGB_MODE : b.mode
  if (modeA !== modeB) return false
  if (normalizeXsydBrightness(a.brightness) !== normalizeXsydBrightness(b.brightness)) return false
  if (Math.min(XSYD_MAX_SPEED, a.speed) !== Math.min(XSYD_MAX_SPEED, b.speed)) return false
  if (Boolean(a.reverse) !== Boolean(b.reverse)) return false
  const idxA = xsydColorIndexForZone(a)
  const idxB = xsydColorIndexForZone(b)
  if (idxA !== idxB) return false
  if (idxA !== 0) {
    if (a.rgb[0] !== b.rgb[0] || a.rgb[1] !== b.rgb[1] || a.rgb[2] !== b.rgb[2]) {
      return false
    }
  }
  if (a.palette && b.palette && JSON.stringify(a.palette) !== JSON.stringify(b.palette)) {
    return false
  }
  return true
}

/**
 * Save dirty per-key colors (`0x2A` `LEN = 0x05`) and global lighting (`0x18` `LEN = 0x2C`)
 * to a WIN 68 HE MAX, verifying each reply before advancing the baseline.
 */
export async function saveXsydRgbProfile(
  requester: XsydRgbRequester,
  draft: RgbProfile,
  baseline: RgbProfile,
  verified: (next: RgbProfile) => void,
  keyIds: readonly string[] = XSYD_KEYS.map(k => (k.code === 'F1' ? 'Fn' : k.code)),
  slot?: ProfileSlot | number
): Promise<RgbProfile> {
  if (slot !== undefined) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 3) {
      throw new RangeError(`Unsupported XSYD profile slot: ${slot}`)
    }
    await requester.request(buildXsydFrame(0x00, [0x70, slot, 0xff, 0xff]))
  }

  const next = structuredClone(baseline)
  const customChanged = JSON.stringify(draft.custom ?? null) !== JSON.stringify(baseline.custom ?? null)
  if (draft.custom) {
    next.custom = restoreCustomRgb(draft.custom, next)
  }
  const dirty = rgbChanges(draft, baseline, keyIds, 'win68HeMax')
  const keysZoneDirty = Boolean(dirty.keys) || !sameXsydRgbZone(draft.keys, baseline.keys)
  const isPerKey =
    draft.keys.mode === XSYD_PER_KEY_RGB_MODE ||
    draft.keys.mode === 19 ||
    (draft.keys.mode >= 21 && draft.keys.mode <= 26) ||
    draft.keys.mode === 119

  if (dirty.colors.length > 0) {
    for (const keyId of dirty.colors) {
      const kv = keyValueForCode(keyId)
      const color = draft.colors[keyId]
      if (kv === undefined || !color) {
        throw new Error(`Invalid WIN 68 HE MAX per-key color for ${keyId}`)
      }
      const reply = await requester.request(buildXsydPerKeyWriteFrame(kv, color))
      if (reply.opcode !== XSYD_PER_KEY_RGB_REPLY_OPCODE || !reply.checksumValid) {
        throw new Error(`WIN 68 HE MAX per-key RGB write failed on ${keyId}`)
      }
      let actual: RgbColor = [...color] as RgbColor
      try {
        const echoed = decodeXsydPerKeyReply(reply)
        if (echoed[keyId]) {
          actual = [...echoed[keyId]] as RgbColor
        }
      } catch {
        // Firmware ACK may omit echoed slots; keep requested color
      }
      next.colors[keyId] = [...actual] as RgbColor
      xsydWrittenColorsCache.set(keyId, [...actual] as RgbColor)
    }
    verified(structuredClone(next))
  }

  if (keysZoneDirty || (isPerKey && dirty.colors.length > 0)) {
    const wireMode =
      draft.keys.mode === 19 || draft.keys.mode === 119
        ? XSYD_PER_KEY_RGB_MODE
        : draft.keys.mode >= 100
          ? mapModeToWin68Hardware(draft.keys.mode)
          : draft.keys.mode
    const normalizedZone: RgbZone = {
      ...draft.keys,
      mode: wireMode,
      brightness: normalizeXsydBrightness(draft.keys.brightness),
      speed: Math.min(XSYD_MAX_SPEED, Math.max(0, draft.keys.speed)),
      colorIndex: xsydColorIndexForZone(draft.keys),
    }
    const reply = await requester.request(buildXsydRgbWriteFrame(normalizedZone))
    if (reply.opcode !== XSYD_RGB_REPLY_OPCODE || !reply.checksumValid) {
      throw new Error('WIN 68 HE MAX global RGB write failed')
    }
    let actual: RgbZone = normalizedZone
    try {
      actual = decodeXsydRgbReply(reply)
    } catch {
      actual = normalizedZone
    }
    next.keys = {
      ...actual,
      mode: draft.keys.mode >= 100 ? draft.keys.mode : actual.mode,
      rgb: normalizedZone.mix ? actual.rgb : ([...normalizedZone.rgb] as RgbColor),
      palette: draft.keys.palette ? draft.keys.palette.map(c => [...c] as RgbColor) : actual.palette,
    }
    verified(structuredClone(next))
  } else if (customChanged) {
    verified(structuredClone(next))
  }

  saveXsydSavedRgb(typeof slot === 'number' ? slot : 1, next)
  return next
}

function parseHexRgb(hex: string): RgbColor {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    return [0, 0, 0]
  }
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

/**
 * Stateful delta streamer for driving Custom RGB / Audio Visualizer animations
 * directly to a WIN 68 HE MAX over WebHID (`0x18` mode `0x15` + `0x2A` delta frames).
 */
export class XsydCustomRgbStreamer {
  #prevColors = new Map<string, string>()
  #active = false

  get active(): boolean {
    return this.#active
  }

  reset(): void {
    this.#prevColors.clear()
    this.#active = false
  }

  /**
   * Switch the keyboard into Custom Per-Key RGB mode (`Effect ID = 0x15`) at
   * full brightness (`4`) so subsequent `0x2A` writes are immediately visible.
   */
  async start(requester: XsydRgbRequester, brightness = XSYD_MAX_BRIGHTNESS): Promise<void> {
    this.#prevColors.clear()
    await requester.request(
      buildXsydRgbWriteFrame({
        mode: XSYD_PER_KEY_RGB_MODE,
        mix: false,
        rgb: [255, 255, 255],
        brightness: normalizeXsydBrightness(brightness),
        speed: 3,
        reverse: false,
        colorIndex: 0,
      })
    )
    this.#active = true
  }

  /**
   * Push a rendered `LightingFrame` (`{ [keyId]: '#rrggbb' }`) to the keyboard,
   * sending `0x2A` (`LEN = 0x05`) only for keys whose color changed since the
   * previous frame.
   */
  async pushFrameDelta(requester: XsydRgbRequester, frame: LightingFrame): Promise<number> {
    if (!this.#active) {
      await this.start(requester)
    }
    let sent = 0
    for (const [keyId, hex] of Object.entries(frame)) {
      const normalized = hex.toLowerCase()
      if (this.#prevColors.get(keyId) === normalized) {
        continue
      }
      const kv = keyValueForCode(keyId)
      if (kv === undefined) {
        continue
      }
      await requester.request(buildXsydPerKeyWriteFrame(kv, parseHexRgb(normalized)))
      this.#prevColors.set(keyId, normalized)
      sent++
    }
    return sent
  }

  /**
   * Stop Custom RGB streaming and restore the onboard lighting configuration.
   */
  async stop(requester: XsydRgbRequester, onboardZone?: RgbZone): Promise<void> {
    this.#active = false
    this.#prevColors.clear()
    if (onboardZone) {
      await requester.request(buildXsydRgbWriteFrame(onboardZone))
    }
  }
}
