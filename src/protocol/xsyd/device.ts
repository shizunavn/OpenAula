import { useSyncExternalStore } from 'react'
import {
  detectHeroDeviceFamily,
  isWin68HeMaxModel,
  WIN68_HE_MAX_DEVICE_MODEL,
  type HeroDeviceModelId,
} from '../../keyboard/devices'
import { MAX_HE_IDS, MAX_HE_NAME_PATTERN, MAX_HE_USAGE, MAX_HE_USAGE_PAGE } from '../../keyboard/maxHe'
import {
  registerXsydProtocol,
  type DeviceConfigurationSnapshot,
  type Hero68ProtocolEncoder,
  type Hero68Transport,
} from '../deviceBridge'
import { bytesToHex, hexToBytes } from '../hex'
import type { AdvancedBinding } from '../hero68/advanced'
import type { HydratedKeySettings } from '../hero68/hero68Encoder'
import { defaultRemapLayers, REMAP_LAYERS, type RemapLayer, type RemapLayers } from '../hero68/remap'
import { reportTrace } from '../hero68/reportTrace'
import type { PollingRate, ProfileSlot } from '../hero68/types'
import type { Hero68ConnectionState, Hero68DeviceSnapshot } from '../hero68/webhid'
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
  XSYD_ADVANCED_DELAY_UNIT_MS,
} from './advanced'
import {
  buildXsydFrame,
  decodeXsydFrame,
  SILENT_REPLY,
  XsydFrameAssembler,
  xsydChecksum,
  xsydReports,
  XSYD_MAGIC,
  XSYD_REPORT_LENGTH,
  type XsydReply,
} from './codec'
import {
  buildFieldReadFrame,
  buildFieldWriteFrame,
  buildGlobalActuationReadFrame,
  chunkFieldWrites,
  codeForKeyValue,
  decodeFieldWritePayload,
  decodeGlobalActuationReply,
  keyValueForCode,
  mmToUm,
  umToMm,
  XSYD_FEATURE_SLOTS,
  XSYD_KEYS,
  XsydFeatureField,
  type XsydFieldWrite,
} from './features'
import {
  buildXsydHallAdcFrame,
  buildXsydHallPressedFrame,
  buildXsydHallTravelFrame,
  decodeXsydHallAdcReply,
  decodeXsydHallPressedReply,
  decodeXsydHallTravelReply,
  mergeXsydHallSamples,
  xsydTableIdsForKeys,
  type XsydHallKeySample,
  type XsydHallTableId,
} from './hall'

export const XSYD_REPORT_ID = 0x00

/**
 * Polling rate code table for XSYD `0x00` subcmd `0x50`.
 * Verified on `4k_to_2k_to_1k.pcapng`:
 * - `0x00` -> `8000` Hz (`bInterval = 1`)
 * - `0x01` -> `4000` Hz (`5C 04 00 94 | 50 01 FF FF`, `bInterval = 2`)
 * - `0x02` -> `2000` Hz (`5C 04 00 94 | 50 02 FF FF`, `bInterval = 3`)
 * - `0x03` -> `1000` Hz (`5C 04 00 94 | 50 03 FF FF`, `bInterval = 4`)
 * - `0x04` -> `500` Hz
 * - `0x05` -> `250` Hz
 * - `0x06` -> `125` Hz
 * - `0x07` -> Read current polling rate query (`5C 04 00 94 | 50 07 FF FF`)
 */
export const XSYD_POLLING_RATES = [8000, 4000, 2000, 1000, 500, 250, 125] as const
export const XSYD_POLLING_RATE_QUERY = 0x07
export const XSYD_PROFILE_SLOT_QUERY = 0x04

export interface XsydRequester {
  request(frame: Uint8Array, timeoutMs?: number): Promise<XsydReply>
}

export interface XsydHandshakeInfo {
  version: string
  precisionUm: number
  minTravelUm: number
  maxTravelUm: number
  name: string
}

interface HIDReportInfoLike {
  reportId?: number
}

interface HIDCollectionInfoLike {
  usagePage?: number
  usage?: number
  inputReports?: HIDReportInfoLike[]
  outputReports?: HIDReportInfoLike[]
  children?: HIDCollectionInfoLike[]
}

interface HIDInputReportEventLike {
  data: DataView
  reportId: number
  device?: HIDDeviceLike
}

interface HIDConnectionEventLike {
  device: HIDDeviceLike
}

interface HIDDeviceLike {
  opened: boolean
  vendorId: number
  productId: number
  productName?: string
  collections?: HIDCollectionInfoLike[]
  open(): Promise<void>
  close(): Promise<void>
  sendReport(reportId: number, data: BufferSource): Promise<void>
  addEventListener(type: 'inputreport', listener: (event: HIDInputReportEventLike) => void): void
  removeEventListener(type: 'inputreport', listener: (event: HIDInputReportEventLike) => void): void
}

interface NavigatorHIDLike {
  getDevices(): Promise<HIDDeviceLike[]>
  requestDevice(options: {
    filters: Array<{
      vendorId: number
      productId: number
      usagePage?: number
      usage?: number
    }>
  }): Promise<HIDDeviceLike[]>
  addEventListener?(type: 'connect' | 'disconnect', listener: (event: HIDConnectionEventLike) => void): void
  removeEventListener?(type: 'connect' | 'disconnect', listener: (event: HIDConnectionEventLike) => void): void
}

type XsydWaiter = {
  expectedOpcode: number
  resolve: (reply: XsydReply) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

function getHid(): NavigatorHIDLike | undefined {
  if (typeof navigator === 'undefined') {
    return undefined
  }
  return (navigator as Navigator & { hid?: NavigatorHIDLike }).hid
}

function collectionMatchesXsyd(collection: HIDCollectionInfoLike): boolean {
  if (collection.usagePage === MAX_HE_USAGE_PAGE && (collection.usage === MAX_HE_USAGE || collection.usage === undefined)) {
    return true
  }
  return collection.children?.some(collectionMatchesXsyd) ?? false
}

export function isXsydControlDevice(device: {
  productName?: string
  vendorId: number
  productId: number
  collections?: HIDCollectionInfoLike[]
}): boolean {
  if (detectHeroDeviceFamily(device.productName, device.vendorId, device.productId) !== 'win68HeMax') {
    return false
  }
  if (!device.collections?.length) {
    return true
  }
  return device.collections.some(collectionMatchesXsyd)
}

/** Build `0x00` subcmd `0x01` protocol version handshake query. */
export function buildHandshakeVersionFrame(): Uint8Array {
  return buildXsydFrame(0x00, [0x01, 0xff, 0xff])
}

/** Build `0x00` subcmd `0x25` travel precision and range handshake query. */
export function buildHandshakeTravelFrame(): Uint8Array {
  return buildXsydFrame(0x00, [0x25, 0xff, 0xff])
}

/** Build `0x00` subcmd `0x26` keyboard name handshake query. */
export function buildHandshakeNameFrame(): Uint8Array {
  return buildXsydFrame(0x00, [0x26, 0xff, 0xff])
}

/**
 * Build `0x00` subcmd `0x70` onboard profile selection frame (`0..3`).
 * Verified on `profile_1_2_3_4.pcapng`: `5C 04 00 94 | 70 <slot> FF FF`.
 */
export function buildXsydSelectProfileFrame(slot: ProfileSlot | number): Uint8Array {
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) {
    throw new RangeError(`Unsupported XSYD profile slot: ${slot}`)
  }
  return buildXsydFrame(0x00, [0x70, slot, 0xff, 0xff])
}

/**
 * Build `0x00` subcmd `0x70` active onboard profile query (`70 04 FF FF`).
 * Verified on `4k_to_2k_to_1k.pcapng` (#10 -> #11 `5C 04 80 14 | 00 70 03 FF`).
 */
export function buildXsydReadProfileFrame(): Uint8Array {
  return buildXsydFrame(0x00, [0x70, XSYD_PROFILE_SLOT_QUERY, 0xff, 0xff])
}

export function decodeXsydProfileReply(reply: XsydReply): number {
  if (reply.opcode !== 0x80 || !reply.checksumValid) {
    throw new Error('Invalid XSYD profile query reply')
  }
  if (reply.payload.length < 3 || reply.payload[0] !== 0x00 || reply.payload[1] !== 0x70) {
    throw new Error('Unexpected XSYD profile query subcommand reply')
  }
  const slot = reply.payload[2] ?? -1
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) {
    throw new RangeError(`Unsupported XSYD active profile slot in reply: ${slot}`)
  }
  return slot
}

export async function readXsydProfileSlot(requester: XsydRequester): Promise<number> {
  const reply = await requester.request(buildXsydReadProfileFrame())
  return decodeXsydProfileReply(reply)
}

export function xsydPollingCodeForRate(rate: PollingRate): number {
  const index = XSYD_POLLING_RATES.indexOf(rate)
  if (index < 0) {
    throw new RangeError(`Unsupported XSYD polling rate: ${rate} Hz`)
  }
  return index
}

export function xsydPollingRateForCode(code: number): PollingRate {
  const rate = XSYD_POLLING_RATES[code]
  if (rate === undefined) {
    throw new RangeError(`Unsupported XSYD polling rate code: 0x${code.toString(16).padStart(2, '0')}`)
  }
  return rate
}

/**
 * Build `0x00` subcmd `0x50` polling-rate read query (`50 07 FF FF`).
 * Verified on `4k_to_2k_to_1k.pcapng` (#14, #650, #1010):
 * `5C 04 00 94 | 50 07 FF FF` -> `5C 04 80 14 | 00 50 <code> FF`.
 */
export function buildXsydReadPollingRateFrame(): Uint8Array {
  return buildXsydFrame(0x00, [0x50, XSYD_POLLING_RATE_QUERY, 0xff, 0xff])
}

/**
 * Build `0x00` subcmd `0x50` polling-rate write frame (`50 <code> FF FF`).
 * Verified on `4k_to_2k_to_1k.pcapng`:
 * - 4000 Hz (`0x01`): `5C 04 00 94 | 50 01 FF FF` (#0)
 * - 2000 Hz (`0x02`): `5C 04 00 94 | 50 02 FF FF` (#636)
 * - 1000 Hz (`0x03`): `5C 04 00 94 | 50 03 FF FF` (#996)
 */
export function buildXsydWritePollingRateFrame(rate: PollingRate): Uint8Array {
  const code = xsydPollingCodeForRate(rate)
  return buildXsydFrame(0x00, [0x50, code, 0xff, 0xff])
}

/**
 * Decode an `0x80` reply to `0x00` subcmd `0x50` (`00 50 <code> FF`).
 */
export function decodeXsydPollingRateReply(reply: XsydReply): PollingRate {
  if (reply.opcode !== 0x80 || !reply.checksumValid) {
    throw new Error('Invalid XSYD polling rate reply')
  }
  if (reply.payload.length < 3 || reply.payload[0] !== 0x00 || reply.payload[1] !== 0x50) {
    throw new Error('Unexpected XSYD polling rate subcommand reply')
  }
  return xsydPollingRateForCode(reply.payload[2] ?? -1)
}

export async function readXsydPollingRate(requester: XsydRequester): Promise<PollingRate> {
  const reply = await requester.request(buildXsydReadPollingRateFrame())
  return decodeXsydPollingRateReply(reply)
}

/**
 * Poll live Hall travel (`0x12` subcmd `0x02`) and per-key pressed flags (`subcmd 0x03`)
 * from a WIN 68 HE MAX, returning normalized `XsydHallKeySample[]`.
 *
 * Verified on `travel_test_press_randomkey.pcapng`:
 * - `5C 04 12 A6 | 03 01 FF FF` -> `5C 82 92 27 | 00 03 <126 x u8> FF FF`
 * - `5C 04 12 A6 | 02 01 FF FF` -> `5C 80 92 A6 | 00 02 <63 x u16_le>` (indices `0..62`)
 * - `5C 04 12 A6 | 02 02 FF FF` -> `5C 80 92 A6 | 00 02 <63 x u16_le>` (indices `63..125`)
 */
export async function readXsydHallSnapshot(
  requester: XsydRequester,
  options: {
    keyIds?: Iterable<string>
    tableIds?: readonly XsydHallTableId[]
    includeAdc?: boolean
    timeoutMs?: number
  } = {}
): Promise<XsydHallKeySample[]> {
  const timeoutMs = options.timeoutMs ?? 450
  const keyIdSet = options.keyIds ? new Set(options.keyIds) : undefined
  const tables = options.tableIds?.length
    ? [...options.tableIds]
    : xsydTableIdsForKeys(keyIdSet ?? [])

  const pressedReply = await requester.request(buildXsydHallPressedFrame(), timeoutMs)
  const pressedByMatrixIndex = decodeXsydHallPressedReply(pressedReply)

  const travelByMatrixIndex = new Map<number, number>()
  for (const tableId of tables) {
    const travelReply = await requester.request(buildXsydHallTravelFrame(tableId), timeoutMs)
    for (const [idx, um] of decodeXsydHallTravelReply(travelReply, tableId)) {
      travelByMatrixIndex.set(idx, um)
    }
  }

  let adcByMatrixIndex: Map<number, number> | undefined
  if (options.includeAdc) {
    adcByMatrixIndex = new Map<number, number>()
    for (const tableId of tables) {
      const adcReply = await requester.request(buildXsydHallAdcFrame(tableId), timeoutMs)
      for (const [idx, adc] of decodeXsydHallAdcReply(adcReply, tableId)) {
        adcByMatrixIndex.set(idx, adc)
      }
    }
  }

  return mergeXsydHallSamples({
    travelByMatrixIndex,
    pressedByMatrixIndex,
    adcByMatrixIndex,
    keyIds: keyIdSet,
  })
}

export function decodeHandshakeVersionReply(reply: XsydReply): string {
  if (reply.opcode !== 0x80 || !reply.checksumValid) {
    throw new Error('Invalid XSYD protocol version handshake reply')
  }
  if (reply.payload.length < 4 || reply.payload[0] !== 0x00 || reply.payload[1] !== 0x01) {
    throw new Error('Unexpected XSYD protocol version subcommand reply')
  }
  const patch = reply.payload[2] ?? 0
  const major = reply.payload[3] ?? 0
  const version = `${major}.0.${patch}`
  if (major !== 1 || patch < 3) {
    throw new Error(`Unsupported XSYD protocol version ${version}; expected >= 1.0.3`)
  }
  return version
}

export function decodeHandshakeTravelReply(reply: XsydReply): {
  precisionUm: number
  minTravelUm: number
  maxTravelUm: number
} {
  if (reply.opcode !== 0x80 || !reply.checksumValid) {
    throw new Error('Invalid XSYD travel limits handshake reply')
  }
  if (reply.payload.length < 7 || reply.payload[0] !== 0x00 || reply.payload[1] !== 0x25) {
    throw new Error('Unexpected XSYD travel limits subcommand reply')
  }
  const precisionUm = reply.payload[2] ?? 0
  const rawMin = (reply.payload[3] ?? 0) | ((reply.payload[4] ?? 0) << 8)
  const minTravelUm = rawMin > 0 && rawMin < 50 ? rawMin * precisionUm : rawMin
  const maxTravelUm = (reply.payload[5] ?? 0) | ((reply.payload[6] ?? 0) << 8)
  if (precisionUm <= 0 || minTravelUm <= 0 || maxTravelUm < minTravelUm || maxTravelUm > 10000) {
    throw new Error(
      `Invalid XSYD travel limits: precision=${precisionUm}um, min=${minTravelUm}um, max=${maxTravelUm}um`
    )
  }
  return { precisionUm, minTravelUm, maxTravelUm }
}

export function decodeHandshakeNameReply(reply: XsydReply): string {
  if (reply.opcode !== 0x80 || !reply.checksumValid) {
    throw new Error('Invalid XSYD keyboard name handshake reply')
  }
  const hasHeader = reply.payload.length >= 2 && reply.payload[0] === 0x00 && reply.payload[1] === 0x26
  const bytes = hasHeader ? reply.payload.slice(2) : reply.payload
  const chars: string[] = []
  for (const byte of bytes) {
    if (byte === 0x00 || byte === 0xff) {
      if (chars.length > 0) break
      continue
    }
    if (byte >= 0x20 && byte <= 0x7e) {
      chars.push(String.fromCharCode(byte))
    }
  }
  const name = chars.join('').trim()
  if (!name || !MAX_HE_NAME_PATTERN.test(name)) {
    throw new Error(`Unexpected XSYD keyboard name in handshake: "${name || 'empty'}"`)
  }
  return name
}

/**
 * Execute the full 3-step XSYD handshake (`0x00` subcmds `0x01`, `0x25`, `0x26`).
 * Throws and aborts before any device write if any reply does not match.
 */
export async function readXsydHandshake(requester: XsydRequester): Promise<XsydHandshakeInfo> {
  const versionReply = await requester.request(buildHandshakeVersionFrame())
  const version = decodeHandshakeVersionReply(versionReply)

  const travelReply = await requester.request(buildHandshakeTravelFrame())
  const { precisionUm, minTravelUm, maxTravelUm } = decodeHandshakeTravelReply(travelReply)

  const nameReply = await requester.request(buildHandshakeNameFrame())
  const name = decodeHandshakeNameReply(nameReply)

  return {
    version,
    precisionUm,
    minTravelUm,
    maxTravelUm,
    name,
  }
}

/**
 * Read back per-key field slots via `0x23` with `payload[0] = 0x00`.
 * Rejects immediately if the reply is not `0xA3` with a valid checksum.
 */
export async function readXsydFieldTable(
  requester: XsydRequester,
  queries: readonly { pos: number; field: number }[] = []
): Promise<XsydFieldWrite[]> {
  const results: XsydFieldWrite[] = []
  const chunks: { pos: number; field: number }[][] = []
  if (queries.length === 0) {
    chunks.push([])
  } else {
    for (let i = 0; i < queries.length; i += XSYD_FEATURE_SLOTS) {
      chunks.push(queries.slice(i, i + XSYD_FEATURE_SLOTS))
    }
  }
  for (const batch of chunks) {
    const reply = await requester.request(buildFieldReadFrame(batch))
    if (reply.opcode !== 0xa3 || !reply.checksumValid || reply.payload.length < 1 + 4 * XSYD_FEATURE_SLOTS) {
      throw new Error('Invalid XSYD 0x23 field table readback reply')
    }
    results.push(...decodeFieldWritePayload(reply.payload))
  }
  return results
}

/**
 * Switch ID table verified against WIN 68 HE MAX firmware v1.1.4 (`VA 0x1D48C`,
 * `0x04E44`, `0x05644`, `0x12CEA..0x12D14`) and `yongchun` USBPcap capture:
 * - `0`: Wing Chun / Graywood (`switch-4`, Curve 0, max travel `3400 µm`)
 * - `1`: Jade Pro / Magnetic Jade (`switch-1`, Curve 0, max travel `3400 µm`)
 * - `2`: Black King / Black Emperor / Uranus (`black`, Curve 1, max travel `3300 µm`)
 * - `3`: Meteor Magnetic / TTC King (`white`, Curve 1, max travel `3300 µm`)
 */
const XSYD_SWITCH_ID_BY_PROFILE: Readonly<Record<string, number>> = {
  'switch-4': 0,
  'wing-chun': 0,
  clear: 0,
  'switch-5': 0,
  'switch-22': 0,
  'switch-1': 1,
  'jade-pro': 1,
  'switch-14': 1,
  blue: 1,
  'switch-24': 1,
  black: 2,
  'switch-3': 2,
  uranus: 2,
  white: 3,
  'switch-2': 3,
}

const XSYD_PROFILE_BY_SWITCH_ID: Readonly<Record<number, string>> = {
  0: 'switch-4',
  1: 'switch-1',
  2: 'black',
  3: 'white',
}

export function xsydSwitchTypeId(switchProfile: string): number {
  return XSYD_SWITCH_ID_BY_PROFILE[switchProfile] ?? 0
}

export function xsydSwitchProfileId(switchType: number): string {
  return XSYD_PROFILE_BY_SWITCH_ID[switchType] ?? 'white'
}

/**
 * Maximum actuation/RT travel in micrometres enforced by firmware sanitizer
 * `VA 0x12CEA..0x12D14` (`3400 µm` for switch IDs `0, 1`; `3300 µm` for `2, 3`).
 */
export function xsydSwitchMaxTravelUm(switchType: number): number {
  return switchType === 2 || switchType === 3 ? 3300 : 3400
}

export function toXsydActionByte(action: number): number {
  if (action === 0xf001) {
    return 0x01
  }
  if (!Number.isInteger(action) || action < 0 || action > 0xff) {
    throw new RangeError(`XSYD action code must be a single byte (0..255), got ${action}`)
  }
  return action
}

export function requireXsydKeyValue(keyId: string): number {
  const pos = keyValueForCode(keyId)
  if (pos === undefined) {
    throw new RangeError(`Unsupported WIN 68 HE MAX key "${keyId}"`)
  }
  return pos
}

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
  const minUm = limits.minTravelUm ?? 100
  const maxUm = limits.maxTravelUm ?? 3400
  if (bindings.length > 40) {
    throw new Error('Maximum 40 Advanced Keys per profile.')
  }
  const used = new Set<string>()
  for (const b of bindings) {
    if ((b.kind as string) === 'RS' || (b.kind as string) === 'DDKS') {
      throw new Error(`${b.kind} is not supported on WIN 68 HE MAX.`)
    }
    if (b.kind === 'UNKNOWN') {
      if (!b.raw) {
        throw new Error('Missing original binding data.')
      }
      continue
    }
    if (!['SOCD', 'DKS', 'MT', 'TGL', 'MPT', 'END'].includes(b.kind)) {
      throw new Error(`Unsupported Advanced Key type on WIN 68 HE MAX: ${b.kind}`)
    }
    if (b.keys.length !== (b.kind === 'SOCD' ? 2 : 1)) {
      throw new Error('Select the required physical keys.')
    }
    for (const keyId of b.keys) {
      requireXsydKeyValue(keyId)
      if (used.has(keyId)) {
        throw new Error('A physical key can only have one Advanced Key binding.')
      }
      used.add(keyId)
    }
    if (b.kind === 'SOCD') {
      if (![0, 1, 2, 3].includes(b.mode)) {
        throw new Error('Invalid SOCD mode on WIN 68 HE MAX (expected 0–3).')
      }
      continue
    }
    const expectedActions = b.kind === 'DKS' ? 4 : b.kind === 'MPT' ? 3 : b.kind === 'MT' ? 2 : 1
    if (b.actions.length !== expectedActions) {
      throw new Error('Invalid action count.')
    }
    for (const action of b.actions) {
      toXsydActionByte(action)
    }
    if (b.kind === 'MT' || b.kind === 'TGL') {
      if (
        !Number.isInteger(b.delay) ||
        b.delay < XSYD_ADVANCED_DELAY_UNIT_MS ||
        b.delay > XSYD_ADVANCED_DELAY_MAX_MS
      ) {
        throw new Error(`Delay must be ${XSYD_ADVANCED_DELAY_UNIT_MS}–${XSYD_ADVANCED_DELAY_MAX_MS} ms on WIN 68 HE MAX.`)
      }
    }
    if (b.kind === 'DKS') {
      if (b.thresholds.length !== 4) {
        throw new Error('DKS requires 4 depth thresholds.')
      }
      const depthsUm = b.thresholds.map(mmToUm)
      if (depthsUm.some(um => !Number.isInteger(um) || um < minUm || um > maxUm)) {
        throw new Error(
          `Depth must be ${umToMm(minUm).toFixed(2)}–${umToMm(maxUm).toFixed(2)} mm (${minUm}–${maxUm} µm).`
        )
      }
      if (depthsUm[0] >= depthsUm[1] || depthsUm[3] >= depthsUm[2]) {
        throw new Error('Shallow DKS points must be above the deep points.')
      }
      if (!Array.isArray(b.states) || b.states.length !== 4) {
        throw new Error('Invalid DKS action pattern.')
      }
      try {
        for (const row of b.states) {
          encodeXsydDksStateRow(row)
        }
      } catch {
        throw new Error('Invalid DKS action pattern.')
      }
    }
    if (b.kind === 'MPT') {
      if (b.thresholds.length !== 3) {
        throw new Error('MPT requires 3 depth thresholds.')
      }
      const depthsUm = b.thresholds.map(mmToUm)
      if (depthsUm.some(um => !Number.isInteger(um) || um < minUm || um > maxUm)) {
        throw new Error(
          `Depth must be ${umToMm(minUm).toFixed(2)}–${umToMm(maxUm).toFixed(2)} mm (${minUm}–${maxUm} µm).`
        )
      }
      if (!(depthsUm[0] < depthsUm[1] && depthsUm[1] < depthsUm[2])) {
        throw new Error('MPT depths must increase from left to right.')
      }
    }
  }
}

/**
 * Encode one verified Advanced Key binding into its 64-byte XSYD `0x5C` frame.
 * Depths are converted from mm to micrometres (`×1000`), delays from ms to `delay/10`.
 */
export function encodeXsydAdvancedBinding(binding: AdvancedBinding): Uint8Array {
  validateXsydAdvanced([binding])
  const key = requireXsydKeyValue(binding.keys[0])
  switch (binding.kind) {
    case 'DKS':
      return buildDksFrame({
        key,
        actions: binding.actions.map(toXsydActionByte),
        states: binding.states,
        actuationUm: mmToUm(binding.thresholds[0]),
      })
    case 'MT':
      return buildMtFrame({
        key,
        hold: toXsydActionByte(binding.actions[0]),
        tap: toXsydActionByte(binding.actions[1]),
        delayMs: binding.delay,
      })
    case 'TGL':
      return buildTglFrame({
        key,
        toggle: toXsydActionByte(binding.actions[0]),
        delayMs: binding.delay,
      })
    case 'MPT':
      return buildMptFrame({
        key,
        steps: binding.actions.map(toXsydActionByte),
        depthsUm: binding.thresholds.map(mmToUm),
      })
    case 'END':
      return buildEndFrame({
        key,
        action: toXsydActionByte(binding.actions[0]),
      })
    case 'SOCD':
      return buildSocdFrame({
        key1: key,
        key2: requireXsydKeyValue(binding.keys[1]),
        type: 0,
        mode: binding.mode,
        delay: 0,
      })
    default:
      throw new Error(`Unsupported XSYD Advanced Key binding: ${binding.kind}`)
  }
}

function xsydBindingSignature(b: AdvancedBinding): string {
  if (b.kind === 'UNKNOWN') {
    return JSON.stringify(b.raw)
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
    masks: b.kind === 'DKS' ? b.states.map(encodeXsydDksStateRow) : undefined,
  })
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
  validateXsydAdvanced(draft)
  const handshake = await readXsydHandshake(requester)
  validateXsydAdvanced(draft, {
    minTravelUm: handshake.minTravelUm,
    maxTravelUm: handshake.maxTravelUm,
  })

  await requester.request(buildXsydSelectProfileFrame(slot))

  const touchedKeys = Array.from(
    new Set([...baseline.flatMap(b => b.keys), ...draft.flatMap(b => b.keys)])
  )
  const preReadQueries = touchedKeys.map(keyId => ({
    pos: requireXsydKeyValue(keyId),
    field: XsydFeatureField.Header,
  }))
  const preRead = await readXsydFieldTable(requester, preReadQueries)
  const baselineKeyValues = new Set(baseline.flatMap(b => b.keys.map(requireXsydKeyValue)))
  for (const record of preRead) {
    if (
      record.field === XsydFeatureField.Header &&
      record.value !== 0 &&
      record.value !== 0x20 &&
      !baselineKeyValues.has(record.pos)
    ) {
      throw new Error(
        `Unexpected existing binding on key pos 0x${record.pos.toString(16)}; read the profile before saving.`
      )
    }
  }

  const removedKeys: number[] = []
  for (const old of baseline) {
    if (!draft.some(b => xsydBindingSignature(b) === xsydBindingSignature(old))) {
      if (old.kind === 'UNKNOWN') {
        throw new Error('Unknown firmware bindings cannot be removed here.')
      }
      for (const keyId of old.keys) {
        removedKeys.push(requireXsydKeyValue(keyId))
      }
    }
  }

  for (let i = 0; i < removedKeys.length; i += XSYD_FEATURE_SLOTS) {
    const frame = buildDisableAdvancedKeyFrame(removedKeys.slice(i, i + XSYD_FEATURE_SLOTS))
    const reply = await requester.request(frame)
    if (reply.opcode !== 0xa3 || !reply.checksumValid) {
      throw new Error('Failed to clear previous XSYD Advanced Key binding')
    }
  }

  for (const binding of draft) {
    if (binding.kind === 'UNKNOWN') {
      continue
    }
    if (!baseline.some(old => xsydBindingSignature(old) === xsydBindingSignature(binding))) {
      const frame = encodeXsydAdvancedBinding(binding)
      const expectedReplyOpcode = frame[2] | 0x80
      const reply = await requester.request(frame)
      if (reply.opcode !== expectedReplyOpcode || !reply.checksumValid) {
        throw new Error(`XSYD Advanced Key write failed for ${binding.kind}`)
      }
    }
  }

  // Read back the field table after writing to confirm the device accepted the update.
  if (preReadQueries.length > 0) {
    const postRead = await readXsydFieldTable(requester, preReadQueries)
    const clearedSet = new Set(
      removedKeys.filter(pos => !draft.some(b => b.keys.some(k => requireXsydKeyValue(k) === pos)))
    )
    for (const record of postRead) {
      if (record.field === XsydFeatureField.Header && clearedSet.has(record.pos) && record.value !== 0) {
        throw new Error('Advanced Keys readback did not confirm cleared binding.')
      }
    }
  }

  return draft.map(b => ({ ...b }))
}

/**
 * Read layer 0 remap values via `0x23` (`XsydFeatureField.Remap`, `payload[0] = 0x00`).
 */
export async function readXsydRemapLayers(
  requester: XsydRequester,
  keyIds: readonly string[] = XSYD_KEYS.map(k => (k.code === 'F1' ? 'Fn' : k.code))
): Promise<RemapLayers> {
  const layers = defaultRemapLayers('win68HeMax')
  const queries = keyIds
    .map(keyId => keyValueForCode(keyId))
    .filter((pos): pos is number => pos !== undefined)
    .map(pos => ({ pos, field: XsydFeatureField.Remap }))
  const records = await readXsydFieldTable(requester, queries)
  for (const record of records) {
    if (record.field !== XsydFeatureField.Remap) continue
    const keyId = codeForKeyValue(record.pos)
    if (keyId && record.value > 0) {
      layers[0][keyId] = record.value & 0xff
    }
  }
  return layers
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
    return
  }
  await requester.request(buildXsydSelectProfileFrame(slot))
  const writes: XsydFieldWrite[] = []
  for (const entry of dirty) {
    const [layerText, keyId] = entry.split(':')
    const layer = Number(layerText) as RemapLayer
    if (!REMAP_LAYERS.includes(layer) || layer !== 0) {
      continue
    }
    const pos = requireXsydKeyValue(keyId)
    const value = toXsydActionByte(layers[layer][keyId] ?? pos)
    writes.push({ pos, field: XsydFeatureField.Remap, value })
  }
  for (const batch of chunkFieldWrites(writes)) {
    const reply = await requester.request(buildFieldWriteFrame(batch))
    if (reply.opcode !== 0xa3 || !reply.checksumValid) {
      throw new Error('XSYD remap write failed')
    }
  }
}

/**
 * Encode a `DeviceConfigurationSnapshot` into XSYD `0x5C` hex packets.
 * Uses micrometres (`mmToUm`) for actuation travel (`0x04`), Rapid Trigger
 * Press/Release (`0x14` / `0x15`), Top/Bottom Deadzone (`0x16` / `0x17`),
 * Header (`0x08`), and SwitchType (`0x19`).
 */
const xsydWrittenFieldCache = new Map<string, number>()

export const xsydProtocolEncoder: Hero68ProtocolEncoder = {
  encodeSave(snapshot: DeviceConfigurationSnapshot): string[] {
    const frames: Uint8Array[] = [buildXsydSelectProfileFrame(snapshot.profileSlot)]
    const writes: XsydFieldWrite[] = []
    for (const key of snapshot.keys) {
      const pos = requireXsydKeyValue(key.keyId)
      const travelUm = mmToUm(key.actuationMm)
      if (travelUm < 100 || travelUm > 3400) {
        throw new RangeError(`Actuation depth ${key.actuationMm} mm (${travelUm} µm) is outside 100..3400 µm`)
      }
      const swId = xsydSwitchTypeId(key.switchProfile)
      const switchMaxUm = xsydSwitchMaxTravelUm(swId)
      const effectiveTravelUm = Math.max(100, Math.min(switchMaxUm, travelUm))
      const headerValue = key.rapidTriggerEnabled ? 0x20 : 0x00

      const rawPressMm = key.splitSensitivity ? key.pressSensitivityMm : key.rapidSensitivityMm
      const rawReleaseMm = key.splitSensitivity ? key.releaseSensitivityMm : key.rapidSensitivityMm
      const pressRtUm = Math.max(10, Math.min(switchMaxUm, mmToUm(rawPressMm > 0 ? rawPressMm : 0.3)))
      const releaseRtUm = Math.max(10, Math.min(switchMaxUm, mmToUm(rawReleaseMm > 0 ? rawReleaseMm : 0.3)))

      const topDzUm = key.deadzoneEnabled ? Math.max(0, Math.min(1000, mmToUm(key.topDeadzoneMm))) : 0
      const bottomDzUm = key.deadzoneEnabled ? Math.max(0, Math.min(1000, mmToUm(key.bottomDeadzoneMm))) : 0

      const keyWrites: XsydFieldWrite[] = [
        { pos, field: XsydFeatureField.Header, value: headerValue },
        { pos, field: XsydFeatureField.Travel, value: effectiveTravelUm },
        { pos, field: XsydFeatureField.RapidTriggerPress, value: pressRtUm },
        { pos, field: XsydFeatureField.RapidTriggerRelease, value: releaseRtUm },
        { pos, field: XsydFeatureField.TopDeadzone, value: topDzUm },
        { pos, field: XsydFeatureField.BottomDeadzone, value: bottomDzUm },
        { pos, field: XsydFeatureField.SwitchType, value: swId },
      ]
      for (const w of keyWrites) {
        xsydWrittenFieldCache.set(`${snapshot.profileSlot}:${w.pos}:${w.field}`, w.value)
        xsydWrittenFieldCache.set(`${w.pos}:${w.field}`, w.value)
        writes.push(w)
      }
    }
    for (const batch of chunkFieldWrites(writes)) {
      frames.push(buildFieldWriteFrame(batch))
    }
    return frames.map(frame => bytesToHex(frame, ''))
  },
}

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
  const handshake = await readXsydHandshake(requester)
  await requester.request(buildXsydSelectProfileFrame(profileSlot))

  let globalActuationUm: number | undefined
  try {
    const globalReply = await requester.request(buildGlobalActuationReadFrame())
    globalActuationUm = decodeGlobalActuationReply(globalReply)
  } catch {
    // Optional if mock requester does not implement 0x29
  }

  const queries: { pos: number; field: number }[] = []
  for (const keyId of keyIds) {
    const pos = keyValueForCode(keyId)
    if (pos === undefined) continue
    queries.push(
      { pos, field: XsydFeatureField.Header },
      { pos, field: XsydFeatureField.Travel },
      { pos, field: XsydFeatureField.RapidTriggerPress },
      { pos, field: XsydFeatureField.RapidTriggerRelease },
      { pos, field: XsydFeatureField.TopDeadzone },
      { pos, field: XsydFeatureField.BottomDeadzone },
      { pos, field: XsydFeatureField.SwitchType }
    )
  }

  const records = await readXsydFieldTable(requester, queries)
  const fieldsByPos = new Map<number, Map<number, number>>()
  for (const record of records) {
    let fieldMap = fieldsByPos.get(record.pos)
    if (!fieldMap) {
      fieldMap = new Map<number, number>()
      fieldsByPos.set(record.pos, fieldMap)
    }
    fieldMap.set(record.field, record.value)
  }

  const hydrated = new Map<string, HydratedKeySettings>()
  for (const [pos, fieldMap] of fieldsByPos) {
    const keyId = codeForKeyValue(pos)
    if (!keyId) continue
    const entry: HydratedKeySettings = {}
    hydrated.set(keyId, entry)

    const swVal = fieldMap.get(XsydFeatureField.SwitchType)
    if (swVal !== undefined) {
      entry.switchProfile = xsydSwitchProfileId(swVal)
    }

    const rawTravel = fieldMap.get(XsydFeatureField.Travel)
    const fallbackTravel =
      globalActuationUm ??
      xsydWrittenFieldCache.get(`${profileSlot}:${pos}:${XsydFeatureField.Travel}`) ??
      xsydWrittenFieldCache.get(`${pos}:${XsydFeatureField.Travel}`)
    const effectiveTravel = rawTravel && rawTravel > 0 ? rawTravel : fallbackTravel
    if (effectiveTravel !== undefined && effectiveTravel > 0) {
      const clampedUm = Math.max(handshake.minTravelUm, Math.min(handshake.maxTravelUm, effectiveTravel))
      entry.actuationMm = umToMm(clampedUm)
    }

    const headerVal = fieldMap.get(XsydFeatureField.Header)
    const pressVal = fieldMap.get(XsydFeatureField.RapidTriggerPress)
    const releaseVal = fieldMap.get(XsydFeatureField.RapidTriggerRelease)
    if (headerVal !== undefined || pressVal !== undefined || releaseVal !== undefined) {
      const rtEnabled = headerVal !== undefined ? (headerVal & 0x30) === 0x20 : (pressVal ?? 0) > 0
      const pressUm = pressVal && pressVal > 0 ? pressVal : 300
      const releaseUm = releaseVal && releaseVal > 0 ? releaseVal : pressUm
      const pressMm = umToMm(pressUm)
      const releaseMm = umToMm(releaseUm)
      entry.rapidTriggerEnabled = rtEnabled
      entry.splitSensitivity = Math.abs(pressMm - releaseMm) >= 0.005
      entry.rapidSensitivityMm = pressMm
      entry.pressSensitivityMm = pressMm
      entry.releaseSensitivityMm = releaseMm
    }

    const topDzVal = fieldMap.get(XsydFeatureField.TopDeadzone)
    const bottomDzVal = fieldMap.get(XsydFeatureField.BottomDeadzone)
    if (topDzVal !== undefined || bottomDzVal !== undefined) {
      const topUm = topDzVal ?? 0
      const bottomUm = bottomDzVal ?? topUm
      entry.topDeadzoneMm = umToMm(topUm)
      entry.bottomDeadzoneMm = umToMm(bottomUm)
      entry.deadzoneEnabled = topUm > 0 || bottomUm > 0
    }
  }
  return hydrated
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * WebHID transport manager for the AULA WIN 68 HE MAX (`0x5C` XSYD protocol).
 *
 * Follows Windows WebHID constraints:
 * - Uses `getDevices()` first and never re-calls `open()` on an already opened handle.
 * - Sends 64-byte chunks with report ID `0` (`sendReport(0, chunk)`).
 * - Reassembles multi-packet replies using `XsydFrameAssembler` (by `LEN` at byte 1).
 * - Resolves the waiter whose `expectedOpcode` matches; a reply for another
 *   request is discarded, so a late or unsolicited frame cannot fail the request.
 * - Guards `0x00` subcmd `0x70` profile selection against the firmware's 500 ms
 *   deferred Flash flush (`VA 0x07E28` -> `0x11914` vs `VA 0x16342` -> `0x12AF4`),
 *   so redundant `0x00 0x70 <slot>` frames during a multi-step save never reload
 *   stale Flash over uncommitted SRAM writes.
 */
export class XsydDeviceManager implements Hero68Transport, XsydRequester {
  #device: HIDDeviceLike | undefined
  #assembler = new XsydFrameAssembler()
  #waiters = new Set<XsydWaiter>()
  #subscribers = new Set<() => void>()
  #requestTail: Promise<unknown> = Promise.resolve()
  #handshake: XsydHandshakeInfo | null = null
  #reenumerating = false
  #activeProfileSlot: number | null = null
  #lastSramWriteAt = 0
  #snapshot: Hero68DeviceSnapshot = {
    state: getHid() ? 'disconnected' : 'unsupported',
    deviceName: WIN68_HE_MAX_DEVICE_MODEL.label,
    detectedModel: null,
    error: null,
  }

  constructor() {
    getHid()?.addEventListener?.('disconnect', this.#onHidDisconnect)
  }

  get connected(): boolean {
    return this.#snapshot.state === 'connected' && Boolean(this.#device?.opened)
  }

  get handshake(): XsydHandshakeInfo | null {
    return this.#handshake
  }

  invalidateActiveProfileSlot(): void {
    this.#activeProfileSlot = null
  }

  getSnapshot = (): Hero68DeviceSnapshot => this.#snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.#subscribers.add(listener)
    return () => {
      this.#subscribers.delete(listener)
    }
  }

  #setSnapshot(next: Partial<Hero68DeviceSnapshot>) {
    this.#snapshot = {
      ...this.#snapshot,
      ...next,
    }
    this.#subscribers.forEach(listener => listener())
  }

  async hasAuthorizedDevice(): Promise<boolean> {
    const hid = getHid()
    if (!hid) return false
    const devices = (await hid.getDevices()).filter(isXsydControlDevice)
    return devices.length > 0
  }

  async connect(requestPermission = true): Promise<boolean> {
    if (this.connected) {
      return true
    }
    const hid = getHid()
    if (!hid) {
      this.#setSnapshot({
        state: 'unsupported',
        error: 'WebHID is not available in this browser.',
      })
      throw new Error('WebHID is not available in this browser')
    }
    this.#setSnapshot({
      state: 'connecting',
      error: null,
    })
    try {
      let devices = (await hid.getDevices()).filter(isXsydControlDevice)
      if (devices.length === 0 && !requestPermission) {
        this.#setSnapshot({
          state: 'disconnected',
          error: null,
        })
        return false
      }
      if (devices.length === 0 && requestPermission) {
        const requested = await hid.requestDevice({
          filters: MAX_HE_IDS.map(({ vendorId, productId }) => ({
            vendorId,
            productId,
            usagePage: MAX_HE_USAGE_PAGE,
            usage: MAX_HE_USAGE,
          })),
        })
        devices = requested.filter(isXsydControlDevice)
      }
      if (devices.length !== 1) {
        throw new Error(`Expected one authorized WIN 68 HE MAX control interface, found ${devices.length}.`)
      }
      const device = devices[0]
      // Windows WebHID rule: never call open() again if the handle is already open.
      if (!device.opened) {
        await device.open()
      }
      this.#assembler.reset()
      this.#activeProfileSlot = null
      this.#lastSramWriteAt = 0
      device.removeEventListener('inputreport', this.#onInputReport)
      device.addEventListener('inputreport', this.#onInputReport)
      this.#device = device

      const handshake = await readXsydHandshake(this)
      this.#handshake = handshake
      this.#setSnapshot({
        state: 'connected',
        detectedModel: 'win68HeMax',
        detectedModelFromUuid: true,
        deviceName: device.productName || handshake.name || WIN68_HE_MAX_DEVICE_MODEL.label,
        error: null,
      })
      return true
    } catch (error) {
      if (this.#device) {
        this.#device.removeEventListener('inputreport', this.#onInputReport)
      }
      this.#device = undefined
      this.#handshake = null
      this.#activeProfileSlot = null
      this.#lastSramWriteAt = 0
      this.#setSnapshot({
        state: 'error',
        error: errorMessage(error),
      })
      throw error
    }
  }

  async detectConnectedModel(): Promise<HeroDeviceModelId | null> {
    if (!this.connected) {
      return null
    }
    return 'win68HeMax'
  }

  async disconnect(): Promise<void> {
    const device = this.#device
    this.#device = undefined
    this.#handshake = null
    this.#activeProfileSlot = null
    this.#lastSramWriteAt = 0
    this.#assembler.reset()
    this.#rejectWaiters(new Error('WIN 68 HE MAX disconnected'))
    if (device) {
      device.removeEventListener('inputreport', this.#onInputReport)
      if (device.opened) {
        await device.close()
      }
    }
    this.#setSnapshot({
      state: getHid() ? 'disconnected' : 'unsupported',
      detectedModel: null,
      detectedModelFromUuid: false,
      error: null,
    })
  }

  async send(frame: Uint8Array): Promise<void> {
    const device = this.#device
    if (!device?.opened) {
      throw new Error('WIN 68 HE MAX is not connected')
    }
    if (frame.length < XSYD_REPORT_LENGTH || frame.length % XSYD_REPORT_LENGTH !== 0 || frame[0] !== XSYD_MAGIC) {
      throw new Error('Expected a 64-byte aligned XSYD 0x5C frame')
    }
    for (const report of xsydReports(frame)) {
      reportTrace.add('out', XSYD_REPORT_ID, report)
      // `sendReport` is typed `BufferSource`, which excludes views over a
      // `SharedArrayBuffer`; every report here owns a plain `ArrayBuffer`.
      await device.sendReport(XSYD_REPORT_ID, report as Uint8Array<ArrayBuffer>)
    }
  }

  /**
   * Send a frame that triggers USB re-enumeration (such as `0x00` subcmd `0x50`
   * polling-rate changes, verified in `4k_to_2k_to_1k.pcapng` across `dev3` ->
   * `dev6` -> `dev7` -> `dev8`), wait for the new HID interface to appear, and
   * reopen it without re-calling `open()` on an already opened handle.
   */
  async sendReenumerating(frame: Uint8Array, timeoutMs = 7000): Promise<void> {
    const hid = getHid()
    const previous = this.#device
    if (!hid || !previous?.opened || !this.connected) {
      throw new Error('WIN 68 HE MAX is not connected')
    }
    this.#reenumerating = true
    let sendError: unknown = null
    try {
      try {
        // The board may not answer, or may answer only after the new interface
        // enumerates: wait for the re-enumeration, not for a reply.
        await this.request(frame, Math.min(350, Math.max(50, timeoutMs)), { expectReply: false })
      } catch (error) {
        sendError = error
      }
      this.#setSnapshot({
        state: 'connecting',
        error: null,
      })
      const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
      const setTimer = typeof window !== 'undefined' && window.setTimeout ? window.setTimeout.bind(window) : setTimeout
      const deadline = now() + Math.max(50, timeoutMs)
      let sawTransition = this.#device !== previous || !previous.opened
      while (now() < deadline) {
        const devices = (await hid.getDevices()).filter(isXsydControlDevice)
        const previousStillListed = devices.includes(previous)
        if (!previousStillListed || !previous.opened || this.#device !== previous) {
          sawTransition = true
        }
        if (sawTransition && devices.length > 0) {
          const candidate = devices[0]
          try {
            previous.removeEventListener('inputreport', this.#onInputReport)
            if (!candidate.opened) {
              await candidate.open()
            }
            this.#assembler.reset()
            candidate.removeEventListener('inputreport', this.#onInputReport)
            candidate.addEventListener('inputreport', this.#onInputReport)
            this.#device = candidate
            this.#setSnapshot({
              state: 'connected',
              detectedModel: 'win68HeMax',
              detectedModelFromUuid: true,
              deviceName: candidate.productName || this.#handshake?.name || WIN68_HE_MAX_DEVICE_MODEL.label,
              error: null,
            })
            return
          } catch {
            // Keep polling until the re-enumerated interface finishes opening.
          }
        }
        await new Promise(resolve => setTimer(resolve, Math.min(120, Math.max(10, Math.floor(timeoutMs / 10)))))
      }
      if (this.#device?.opened) {
        this.#setSnapshot({
          state: 'connected',
          detectedModel: 'win68HeMax',
          detectedModelFromUuid: true,
          error: null,
        })
        return
      }
      const detail = sendError instanceof Error ? ` (${sendError.message})` : ''
      this.#setSnapshot({
        state: 'error',
        error: `WIN 68 HE MAX did not return after USB re-enumeration${detail}`,
      })
      throw new Error(`WIN 68 HE MAX did not return after USB re-enumeration${detail}`)
    } finally {
      this.#reenumerating = false
    }
  }

  /**
   * Write a new polling rate via `0x00` subcmd `0x50`, wait for USB re-enumeration,
   * and verify the persisted rate with `0x00` subcmd `0x50` query `0x07`.
   */
  async readHallSnapshot(
    options: {
      keyIds?: Iterable<string>
      tableIds?: readonly XsydHallTableId[]
      includeAdc?: boolean
      timeoutMs?: number
    } = {}
  ): Promise<XsydHallKeySample[]> {
    return readXsydHallSnapshot(this, options)
  }

  async writePollingRate(rate: PollingRate, timeoutMs = 7000): Promise<PollingRate> {
    await this.sendReenumerating(buildXsydWritePollingRateFrame(rate), timeoutMs)
    const actual = await readXsydPollingRate(this)
    if (actual !== rate) {
      throw new Error(`Polling-rate verify failed: requested ${rate} Hz, device reports ${actual} Hz`)
    }
    return actual
  }

  async sendHex(hex: string): Promise<void> {
    const frame = hexToBytes(hex)
    await this.request(frame, 1000)
  }

  async sendBatchHex(hexes: readonly string[]): Promise<void> {
    for (const hex of hexes) {
      await this.sendHex(hex)
    }
  }

  #queueControlOperation<T>(run: () => Promise<T>): Promise<T> {
    const work = () =>
      typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request('openhero68:xsyd-hid-control', run)
        : run()
    const next = this.#requestTail.then(work)
    this.#requestTail = next.catch(() => {})
    return next
  }

  /**
   * Send one frame and wait for its reply.
   *
   * `expectReply: false` is for frames the firmware may answer with nothing (or
   * only after the USB interface re-enumerates): the frame is written and the
   * promise resolves once `sendReport` returns. The returned reply is a
   * placeholder and must not be decoded.
   */
  async request(
    frame: Uint8Array,
    timeoutMs = 800,
    options: { expectReply?: boolean } = {}
  ): Promise<XsydReply> {
    const expectReply = options.expectReply ?? true
    return this.#queueControlOperation(async () => {
      if (!expectReply) {
        this.#assembler.reset()
        await this.send(frame)
        return SILENT_REPLY
      }
      const op = frame[2]
      const sub = frame[4]
      // Guard `0x00` subcmd `0x70` profile select against firmware `VA 0x16342` -> `0x12AF4`:
      // In firmware v1.1.4, `0x00 0x70 <slot>` unconditionally reloads Flash into SRAM.
      // Because `0x23`/`0x29`/`0x18`/`0x2A` writes only flush SRAM -> Flash after a
      // 500 ms timer (`VA 0x07E28` -> `0x11914`), sending `0x00 0x70 <slot>` again for
      // the already-active slot wipes out uncommitted SRAM writes!
      if (op === 0x00 && sub === 0x70) {
        const slotArg = frame[5] ?? 0xff
        if (slotArg >= 0 && slotArg <= 3) {
          if (this.#activeProfileSlot === slotArg && this.#lastSramWriteAt > 0) {
            const synthetic = buildXsydFrame(0x80, [0x00, 0x70, slotArg, 0xff])
            synthetic[3] = xsydChecksum(synthetic, 'in')
            return decodeXsydFrame(synthetic)
          }
          const elapsed = Date.now() - this.#lastSramWriteAt
          if (this.#lastSramWriteAt > 0 && elapsed < 600) {
            const setTimer = typeof window !== 'undefined' && window.setTimeout ? window.setTimeout.bind(window) : setTimeout
            await new Promise(resolve => setTimer(resolve, 600 - elapsed))
          }
          const reply = await this.#requestOnce(frame, timeoutMs)
          this.#activeProfileSlot = slotArg
          this.#lastSramWriteAt = 0
          return reply
        }
        if (slotArg === XSYD_PROFILE_SLOT_QUERY) {
          const reply = await this.#requestOnce(frame, timeoutMs)
          const queriedSlot = reply.payload[2]
          if (queriedSlot !== undefined && queriedSlot >= 0 && queriedSlot <= 3) {
            this.#activeProfileSlot = queriedSlot
          }
          return reply
        }
      }
      const reply = await this.#requestOnce(frame, timeoutMs)
      if (
        [0x18, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x2c].includes(op) &&
        frame[4] === 0x01
      ) {
        this.#lastSramWriteAt = Date.now()
      }
      return reply
    })
  }

  async #requestOnce(frame: Uint8Array, timeoutMs = 800): Promise<XsydReply> {
    if (!this.#device?.opened) {
      throw new Error('WIN 68 HE MAX is not connected')
    }
    const decodedOut = decodeXsydFrame(frame)
    const expectedOpcode = (decodedOut.opcode | 0x80) & 0xff
    const setTimer = typeof window !== 'undefined' && window.setTimeout ? window.setTimeout.bind(window) : setTimeout
    const clearTimer =
      typeof window !== 'undefined' && window.clearTimeout ? window.clearTimeout.bind(window) : clearTimeout

    return new Promise<XsydReply>((resolve, reject) => {
      const timeoutError = (stage: 'read' | 'send') =>
        new Error(
          `WIN 68 HE MAX ${stage} timed out (opcode=0x${decodedOut.opcode.toString(16).padStart(2, '0')})`
        )
      const waiter: XsydWaiter = {
        expectedOpcode,
        resolve,
        reject,
        timer: setTimer(() => {
          this.#waiters.delete(waiter)
          const error = timeoutError('send')
          reject(error)
          this.#setSnapshot({
            state: 'error',
            error: error.message,
          })
        }, Math.max(2000, timeoutMs)),
      }
      this.#waiters.add(waiter)
      void this.send(frame)
        .then(() => {
          if (!this.#waiters.has(waiter)) {
            return
          }
          clearTimer(waiter.timer)
          waiter.timer = setTimer(() => {
            this.#waiters.delete(waiter)
            reject(timeoutError('read'))
          }, Math.max(1, timeoutMs))
        })
        .catch(error => {
          clearTimer(waiter.timer)
          this.#waiters.delete(waiter)
          reject(error instanceof Error ? error : new Error(String(error)))
        })
    })
  }

  #rejectWaiters(error: Error) {
    const clearTimer =
      typeof window !== 'undefined' && window.clearTimeout ? window.clearTimeout.bind(window) : clearTimeout
    for (const waiter of this.#waiters) {
      clearTimer(waiter.timer)
      waiter.reject(error)
    }
    this.#waiters.clear()
  }

  #onInputReport = (event: HIDInputReportEventLike): void => {
    if (event.reportId !== undefined && event.reportId !== XSYD_REPORT_ID) {
      return
    }
    const payload = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)
    reportTrace.add('in', event.reportId ?? XSYD_REPORT_ID, payload)
    if (this.#waiters.size === 0) {
      return
    }
    const clearTimer =
      typeof window !== 'undefined' && window.clearTimeout ? window.clearTimeout.bind(window) : clearTimeout
    try {
      const reply = this.#assembler.push(payload)
      if (!reply) {
        return
      }
      for (const waiter of this.#waiters) {
        if (reply.opcode !== waiter.expectedOpcode) {
          // Another request's reply, or an unsolicited frame: never fail the
          // request that is still waiting for its own opcode.
          continue
        }
        clearTimer(waiter.timer)
        this.#waiters.delete(waiter)
        if (!reply.checksumValid) {
          waiter.reject(
            new Error(`Invalid XSYD reply checksum for opcode 0x${reply.opcode.toString(16).padStart(2, '0')}`)
          )
        } else {
          waiter.resolve(reply)
        }
        break
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.#rejectWaiters(err)
      this.#setSnapshot({
        error: err.message,
      })
    }
  }

  #onHidDisconnect = (event: HIDConnectionEventLike): void => {
    if (!this.#device || event.device !== this.#device) {
      return
    }
    this.#device.removeEventListener('inputreport', this.#onInputReport)
    this.#device = undefined
    this.#activeProfileSlot = null
    this.#lastSramWriteAt = 0
    this.#assembler.reset()
    this.#rejectWaiters(new Error('WIN 68 HE MAX disconnected'))
    if (this.#reenumerating) {
      return
    }
    this.#handshake = null
    this.#setSnapshot({
      state: 'disconnected',
      detectedModel: null,
      detectedModelFromUuid: false,
      error: 'WIN 68 HE MAX was disconnected.',
    })
  }
}

export const xsydDeviceManager = new XsydDeviceManager()
registerXsydProtocol(xsydProtocolEncoder, xsydDeviceManager)

export function useXsydDevice(): Hero68DeviceSnapshot {
  return useSyncExternalStore(
    xsydDeviceManager.subscribe,
    xsydDeviceManager.getSnapshot,
    xsydDeviceManager.getSnapshot
  )
}

export { isWin68HeMaxModel }
export type { Hero68ConnectionState, Hero68DeviceSnapshot }

export * from './hall'
export * from './rgb'
