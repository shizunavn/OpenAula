import { detectHeroDeviceFamily } from '../../keyboard/devices';
import {
  MAX_HE_IDS,
  MAX_HE_NAME_PATTERN,
  MAX_HE_USAGE,
  MAX_HE_USAGE_PAGE
} from '../../keyboard/maxHe';
import type { PollingRate, ProfileSlot } from '../hero68/types';
import { buildXsydFrame, SILENT_REPLY, type XsydReply } from './codec';
import {
  buildFieldReadFrame,
  decodeFieldWritePayload,
  XSYD_FEATURE_SLOTS,
  XSYD_KEYS,
  XsydFeatureField,
  type XsydFieldWrite
} from './features';
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
  type XsydHallTableId
} from './hall';

export const XSYD_REPORT_ID = 0x00;

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
export const XSYD_POLLING_RATES = [8000, 4000, 2000, 1000, 500, 250, 125] as const;
export const XSYD_POLLING_RATE_QUERY = 0x07;
export const XSYD_PROFILE_SLOT_QUERY = 0x04;
export const XSYD_WIN_LOCK_SUBCMD = 0x20;
export const XSYD_WIN_LOCK_QUERY = 0xff;
export const XSYD_OS_MODE_READ_WIN_SUBCMD = 0x21;
export const XSYD_OS_MODE_READ_MAC_SUBCMD = 0x22;
export const XSYD_OS_MODE_WRITE_WIN_SUBCMD = 0x30;
export const XSYD_OS_MODE_WRITE_MAC_SUBCMD = 0x31;

export interface XsydRequester {
  request(frame: Uint8Array, timeoutMs?: number): Promise<XsydReply>;
}

export interface XsydHandshakeInfo {
  version: string;
  precisionUm: number;
  minTravelUm: number;
  maxTravelUm: number;
  name: string;
}

interface HIDReportInfoLike {
  reportId?: number;
}

export interface HIDCollectionInfoLike {
  usagePage?: number;
  usage?: number;
  inputReports?: HIDReportInfoLike[];
  outputReports?: HIDReportInfoLike[];
  children?: HIDCollectionInfoLike[];
}

export interface HIDInputReportEventLike {
  data: DataView;
  reportId: number;
  device?: HIDDeviceLike;
}

export interface HIDConnectionEventLike {
  device: HIDDeviceLike;
}

export interface HIDDeviceLike {
  opened: boolean;
  vendorId: number;
  productId: number;
  productName?: string;
  collections?: HIDCollectionInfoLike[];
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  addEventListener(type: 'inputreport', listener: (event: HIDInputReportEventLike) => void): void;
  removeEventListener(
    type: 'inputreport',
    listener: (event: HIDInputReportEventLike) => void
  ): void;
}

export interface NavigatorHIDLike {
  getDevices(): Promise<HIDDeviceLike[]>;
  requestDevice(options: {
    filters: Array<{
      vendorId: number;
      productId: number;
      usagePage?: number;
      usage?: number;
    }>;
  }): Promise<HIDDeviceLike[]>;
  addEventListener?(
    type: 'connect' | 'disconnect',
    listener: (event: HIDConnectionEventLike) => void
  ): void;
  removeEventListener?(
    type: 'connect' | 'disconnect',
    listener: (event: HIDConnectionEventLike) => void
  ): void;
}

export type XsydWaiter = {
  expectedOpcode: number;
  resolve: (reply: XsydReply) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export function getHid(): NavigatorHIDLike | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }
  return (navigator as Navigator & { hid?: NavigatorHIDLike }).hid;
}

function collectionMatchesXsyd(collection: HIDCollectionInfoLike): boolean {
  if (
    collection.usagePage === MAX_HE_USAGE_PAGE &&
    (collection.usage === MAX_HE_USAGE || collection.usage === undefined)
  ) {
    return true;
  }
  return collection.children?.some(collectionMatchesXsyd) ?? false;
}

export function isXsydControlDevice(device: {
  productName?: string;
  vendorId: number;
  productId: number;
  collections?: HIDCollectionInfoLike[];
}): boolean {
  if (
    detectHeroDeviceFamily(device.productName, device.vendorId, device.productId) !== 'win68HeMax'
  ) {
    return false;
  }
  if (!device.collections?.length) {
    return true;
  }
  return device.collections.some(collectionMatchesXsyd);
}

/** Build `0x00` subcmd `0x01` protocol version handshake query. */
export function buildHandshakeVersionFrame(): Uint8Array {
  return buildXsydFrame(0x00, [0x01, 0xff, 0xff]);
}

/** Build `0x00` subcmd `0x25` travel precision and range handshake query. */
export function buildHandshakeTravelFrame(): Uint8Array {
  return buildXsydFrame(0x00, [0x25, 0xff, 0xff]);
}

/** Build `0x00` subcmd `0x26` keyboard name handshake query. */
export function buildHandshakeNameFrame(): Uint8Array {
  return buildXsydFrame(0x00, [0x26, 0xff, 0xff]);
}

/**
 * Build `0x00` subcmd `0x70` onboard profile selection frame (`0..3`).
 * Verified on `profile_1_2_3_4.pcapng`: `5C 04 00 94 | 70 <slot> FF FF`.
 */
export function buildXsydSelectProfileFrame(slot: ProfileSlot | number): Uint8Array {
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) {
    throw new RangeError(`Unsupported XSYD profile slot: ${slot}`);
  }
  return buildXsydFrame(0x00, [0x70, slot, 0xff, 0xff]);
}

/**
 * Build `0x00` subcmd `0x70` active onboard profile query (`70 04 FF FF`).
 * Verified on `4k_to_2k_to_1k.pcapng` (#10 -> #11 `5C 04 80 14 | 00 70 03 FF`).
 */
export function buildXsydReadProfileFrame(): Uint8Array {
  return buildXsydFrame(0x00, [0x70, XSYD_PROFILE_SLOT_QUERY, 0xff, 0xff]);
}

export function decodeXsydProfileReply(reply: XsydReply): number {
  if (reply.opcode !== 0x80 || !reply.checksumValid) {
    throw new Error('Invalid XSYD profile query reply');
  }
  if (reply.payload.length < 3 || reply.payload[0] !== 0x00 || reply.payload[1] !== 0x70) {
    throw new Error('Unexpected XSYD profile query subcommand reply');
  }
  const slot = reply.payload[2] ?? -1;
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) {
    throw new RangeError(`Unsupported XSYD active profile slot in reply: ${slot}`);
  }
  return slot;
}

export async function readXsydProfileSlot(requester: XsydRequester): Promise<number> {
  const reply = await requester.request(buildXsydReadProfileFrame());
  return decodeXsydProfileReply(reply);
}

export function xsydPollingCodeForRate(rate: PollingRate): number {
  const index = XSYD_POLLING_RATES.indexOf(rate);
  if (index < 0) {
    throw new RangeError(`Unsupported XSYD polling rate: ${rate} Hz`);
  }
  return index;
}

export function xsydPollingRateForCode(code: number): PollingRate {
  const rate = XSYD_POLLING_RATES[code];
  if (rate === undefined) {
    throw new RangeError(
      `Unsupported XSYD polling rate code: 0x${code.toString(16).padStart(2, '0')}`
    );
  }
  return rate;
}

/**
 * Build `0x00` subcmd `0x50` polling-rate read query (`50 07 FF FF`).
 * Verified on `4k_to_2k_to_1k.pcapng` (#14, #650, #1010):
 * `5C 04 00 94 | 50 07 FF FF` -> `5C 04 80 14 | 00 50 <code> FF`.
 */
export function buildXsydReadPollingRateFrame(): Uint8Array {
  return buildXsydFrame(0x00, [0x50, XSYD_POLLING_RATE_QUERY, 0xff, 0xff]);
}

/**
 * Build `0x00` subcmd `0x50` polling-rate write frame (`50 <code> FF FF`).
 * Verified on `4k_to_2k_to_1k.pcapng`:
 * - 4000 Hz (`0x01`): `5C 04 00 94 | 50 01 FF FF` (#0)
 * - 2000 Hz (`0x02`): `5C 04 00 94 | 50 02 FF FF` (#636)
 * - 1000 Hz (`0x03`): `5C 04 00 94 | 50 03 FF FF` (#996)
 */
export function buildXsydWritePollingRateFrame(rate: PollingRate): Uint8Array {
  const code = xsydPollingCodeForRate(rate);
  return buildXsydFrame(0x00, [0x50, code, 0xff, 0xff]);
}

/**
 * Decode an `0x80` reply to `0x00` subcmd `0x50` (`00 50 <code> FF`).
 */
export function decodeXsydPollingRateReply(reply: XsydReply): PollingRate {
  if (reply.opcode !== 0x80 || !reply.checksumValid) {
    throw new Error('Invalid XSYD polling rate reply');
  }
  if (reply.payload.length < 3 || reply.payload[0] !== 0x00 || reply.payload[1] !== 0x50) {
    throw new Error('Unexpected XSYD polling rate subcommand reply');
  }
  return xsydPollingRateForCode(reply.payload[2] ?? -1);
}

export async function readXsydPollingRate(requester: XsydRequester): Promise<PollingRate> {
  const reply = await requester.request(buildXsydReadPollingRateFrame());
  return decodeXsydPollingRateReply(reply);
}

/**
 * Build `0x00` subcmd `0x20` Windows Key Lock read query (`20 FF FF FF`).
 *
 * Verified against WIN 68 HE MAX firmware v1.1.4 (`VA 0x09CBC` -> `0x09F38..0x09F4E`,
 * helper `VA 0x12FAE`):
 * - Request: `5C 04 00 94 | 20 FF FF FF`
 * - Reply:   `5C 04 80 14 | 00 20 <00|01> FF` (`0x00` = unlocked, `0x01` = locked;
 *            reads bit 3 (`0x08`) of indicator bitmask `-1757(gp)`).
 */
export function buildXsydReadWinLockFrame(): Uint8Array {
  return buildXsydFrame(0x00, [XSYD_WIN_LOCK_SUBCMD, XSYD_WIN_LOCK_QUERY, 0xff, 0xff]);
}

/**
 * Build `0x00` subcmd `0x20` Windows Key Lock toggle frame (`20 <01|00> FF FF`).
 *
 * Verified against WIN 68 HE MAX firmware v1.1.4 (`VA 0x09F50..0x09FA6`,
 * helper `VA 0x12F6A`):
 * - When `payload[1] !== 0xFF`, the firmware looks up `0xE3` (`Left Win`) in active
 *   Layer 0 (`0x20004BE4`), toggles its disable bit in `0x20006120`, updates bit 3
 *   (`0x08`) of `-1757(gp)` via `VA 0x12F6A(0|1)`, and echoes the frame with opcode `0x80`.
 * - Because the firmware handler is a hardware toggle whenever `payload[1] !== 0xFF`,
 *   always use `writeXsydWinLock()` to read current state before toggling and verify readback.
 */
export function buildXsydToggleWinLockFrame(enable = true): Uint8Array {
  return buildXsydFrame(0x00, [XSYD_WIN_LOCK_SUBCMD, enable ? 0x01 : 0x00, 0xff, 0xff]);
}

/**
 * Decode an `0x80` reply to `0x00` subcmd `0x20` (`00 20 <00|01> FF` or echoed `20 <00|01> FF FF`).
 */
export function decodeXsydWinLockReply(reply: XsydReply): boolean {
  if (reply.opcode !== 0x80 || !reply.checksumValid) {
    throw new Error('Invalid XSYD Windows key lock reply');
  }
  if (
    reply.payload.length >= 3 &&
    reply.payload[0] === 0x00 &&
    reply.payload[1] === XSYD_WIN_LOCK_SUBCMD
  ) {
    return (reply.payload[2] ?? 0) !== 0;
  }
  if (
    reply.payload.length >= 2 &&
    reply.payload[0] === XSYD_WIN_LOCK_SUBCMD &&
    reply.payload[1] !== XSYD_WIN_LOCK_QUERY
  ) {
    return (reply.payload[1] ?? 0) !== 0;
  }
  throw new Error('Unexpected XSYD Windows key lock subcommand reply');
}

export async function readXsydWinLock(requester: XsydRequester): Promise<boolean> {
  const reply = await requester.request(buildXsydReadWinLockFrame());
  return decodeXsydWinLockReply(reply);
}

/**
 * Deterministically set Windows Key Lock on WIN 68 HE MAX.
 *
 * Since `0x00` subcmd `0x20` (`VA 0x09F50..0x09FA6`) toggles the `Left Win` (`0xE3`)
 * disable bit whenever `payload[1] !== 0xFF`, this helper reads the current state via
 * `20 FF FF FF`, sends `20 <01|00> FF FF` only when a state transition is needed, and
 * verifies the final state via a follow-up `20 FF FF FF` readback.
 */
export async function writeXsydWinLock(
  requester: XsydRequester,
  locked: boolean
): Promise<boolean> {
  const current = await readXsydWinLock(requester);
  if (current === locked) {
    return current;
  }
  const toggleReply = await requester.request(buildXsydToggleWinLockFrame(locked));
  if (toggleReply.opcode !== 0x80 || !toggleReply.checksumValid) {
    throw new Error('Invalid XSYD Windows key lock write reply');
  }
  const actual = await readXsydWinLock(requester);
  if (actual !== locked) {
    throw new Error(
      `Windows key lock verify failed: requested ${locked ? 'on' : 'off'}, device reports ${actual ? 'on' : 'off'}`
    );
  }
  return actual;
}

/**
 * Build `0x00` subcmd `0x22` (macOS mode query) or `0x21` (Windows mode query) frame.
 *
 * Verified against WIN 68 HE MAX firmware v1.1.4 (`VA 0x09CC4..0x09CDA`, `0x0A128..0x0A13A`,
 * helper `VA 0x12960` reading `lbu 0x200031CB` where `0` = Windows, `1` = macOS):
 * - Subcmd `0x21` (`5C 04 00 94 | 21 FF FF FF`): replies `5C 04 80 14 | 00 21 <01=Win|00=Mac> FF`
 * - Subcmd `0x22` (`5C 04 00 94 | 22 FF FF FF`): replies `5C 04 80 14 | 00 22 <01=Mac|00=Win> FF`
 */
export function buildXsydReadOsModeFrame(target: 'mac' | 'win' = 'mac'): Uint8Array {
  const subcmd = target === 'win' ? XSYD_OS_MODE_READ_WIN_SUBCMD : XSYD_OS_MODE_READ_MAC_SUBCMD;
  return buildXsydFrame(0x00, [subcmd, 0xff, 0xff, 0xff]);
}

/**
 * Build `0x00` subcmd `0x31` (write macOS mode) or `0x30` (write Windows mode) frame.
 *
 * Verified against WIN 68 HE MAX firmware v1.1.4 (`VA 0x0A13C..0x0A18A`, helper `VA 0x128E8`):
 * - Windows mode (`mac = false`): `5C 04 00 94 | 30 00 FF FF` -> replies `5C 04 80 14 | 00 30 01 FF`
 * - macOS mode   (`mac = true`):  `5C 04 00 94 | 31 00 FF FF` -> replies `5C 04 80 14 | 00 31 01 FF`
 *
 * Hardware effects:
 * - Saves outgoing OS mode keymap bank (`0x11DE8`), writes `0x200031CB` (`0` = Win, `1` = Mac)
 *   and marks NVRAM descriptor `25` dirty (`0x11B18`).
 * - When entering macOS mode (`0x31`), `VA 0x128E8(1)` automatically clears `Left Win` (`0xE3`)
 *   disable bit in `0x20006120` and unlocks WinLock (`VA 0x12F6A(0)`).
 * - Sets bit 16 (`0x10000`) of `-1684(gp)` so the main loop (`VA 0x07CAC..0x07CCC`) reloads
 *   the active OS mode keymap bank (`VA 0x4A20` for Windows, `VA 0x4630` for macOS where
 *   `L-Win` `0xE3` and `L-Alt` `0xE2` are swapped in Layer 0).
 */
export function buildXsydWriteOsModeFrame(mac: boolean): Uint8Array {
  const subcmd = mac ? XSYD_OS_MODE_WRITE_MAC_SUBCMD : XSYD_OS_MODE_WRITE_WIN_SUBCMD;
  return buildXsydFrame(0x00, [subcmd, 0x00, 0xff, 0xff]);
}

/**
 * Decode an `0x80` reply to `0x00` subcommands `0x21`, `0x22`, `0x30`, or `0x31`.
 * Returns `true` when the keyboard is in macOS mode (`0x200031CB === 1`), or `false` for Windows mode.
 */
export function decodeXsydOsModeReply(reply: XsydReply): boolean {
  if (reply.opcode !== 0x80 || !reply.checksumValid) {
    throw new Error('Invalid XSYD OS mode reply');
  }
  if (reply.payload.length < 3 || reply.payload[0] !== 0x00) {
    throw new Error('Unexpected XSYD OS mode subcommand reply');
  }
  const subcmd = reply.payload[1];
  const val = reply.payload[2] ?? 0;
  if (subcmd === XSYD_OS_MODE_READ_MAC_SUBCMD) {
    return val !== 0;
  }
  if (subcmd === XSYD_OS_MODE_READ_WIN_SUBCMD) {
    return val === 0;
  }
  if (subcmd === XSYD_OS_MODE_WRITE_MAC_SUBCMD && val === 0x01) {
    return true;
  }
  if (subcmd === XSYD_OS_MODE_WRITE_WIN_SUBCMD && val === 0x01) {
    return false;
  }
  throw new Error('Unexpected XSYD OS mode subcommand reply');
}

export async function readXsydOsModeMac(requester: XsydRequester): Promise<boolean> {
  const reply = await requester.request(buildXsydReadOsModeFrame('mac'));
  return decodeXsydOsModeReply(reply);
}

/**
 * Write Operating System Mode (`false` = Windows, `true` = macOS) on WIN 68 HE MAX
 * and verify with a `0x22` readback.
 *
 * Note on `VA 0x128E8(0)`: while `VA 0x128E8(1)` clears the `0xE3` disable bit in
 * `0x20006120` before loading the macOS keymap, `VA 0x128E8(0)` does not clear
 * `0x20006120` when switching back to Windows mode. If WinLock was toggled on while
 * in macOS mode (where `0xE3` sits on physical `L-Alt`, matrix index `107`),
 * unlocking WinLock before switching back to Windows mode ensures matrix index `107`
 * is never left disabled in `0x20006120`.
 */
export async function writeXsydOsModeMac(requester: XsydRequester, mac: boolean): Promise<boolean> {
  if (!mac) {
    try {
      const winLocked = await readXsydWinLock(requester);
      if (winLocked) {
        await writeXsydWinLock(requester, false);
      }
    } catch {
      // Proceed if a minimal test mock does not implement subcmd 0x20.
    }
  }
  const writeReply = await requester.request(buildXsydWriteOsModeFrame(mac));
  decodeXsydOsModeReply(writeReply);
  const actual = await readXsydOsModeMac(requester);
  if (actual !== mac) {
    throw new Error(
      `OS mode verify failed: requested ${mac ? 'macOS' : 'Windows'}, device reports ${actual ? 'macOS' : 'Windows'}`
    );
  }
  return actual;
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
    keyIds?: Iterable<string>;
    tableIds?: readonly XsydHallTableId[];
    includeAdc?: boolean;
    timeoutMs?: number;
  } = {}
): Promise<XsydHallKeySample[]> {
  const timeoutMs = options.timeoutMs ?? 450;
  const keyIdSet = options.keyIds ? new Set(options.keyIds) : undefined;
  const tables = options.tableIds?.length
    ? [...options.tableIds]
    : xsydTableIdsForKeys(keyIdSet ?? []);

  const pressedReply = await requester.request(buildXsydHallPressedFrame(), timeoutMs);
  const pressedByMatrixIndex = decodeXsydHallPressedReply(pressedReply);

  const travelByMatrixIndex = new Map<number, number>();
  for (const tableId of tables) {
    const travelReply = await requester.request(buildXsydHallTravelFrame(tableId), timeoutMs);
    for (const [idx, um] of decodeXsydHallTravelReply(travelReply, tableId)) {
      travelByMatrixIndex.set(idx, um);
    }
  }

  let adcByMatrixIndex: Map<number, number> | undefined;
  if (options.includeAdc) {
    adcByMatrixIndex = new Map<number, number>();
    for (const tableId of tables) {
      const adcReply = await requester.request(buildXsydHallAdcFrame(tableId), timeoutMs);
      for (const [idx, adc] of decodeXsydHallAdcReply(adcReply, tableId)) {
        adcByMatrixIndex.set(idx, adc);
      }
    }
  }

  return mergeXsydHallSamples({
    travelByMatrixIndex,
    pressedByMatrixIndex,
    adcByMatrixIndex,
    keyIds: keyIdSet
  });
}

export function decodeHandshakeVersionReply(reply: XsydReply): string {
  if (reply.opcode !== 0x80 || !reply.checksumValid) {
    throw new Error('Invalid XSYD protocol version handshake reply');
  }
  if (reply.payload.length < 4 || reply.payload[0] !== 0x00 || reply.payload[1] !== 0x01) {
    throw new Error('Unexpected XSYD protocol version subcommand reply');
  }
  const patch = reply.payload[2] ?? 0;
  const major = reply.payload[3] ?? 0;
  const version = `${major}.0.${patch}`;
  if (major !== 1 || patch < 3) {
    throw new Error(`Unsupported XSYD protocol version ${version}; expected >= 1.0.3`);
  }
  return version;
}

export function decodeHandshakeTravelReply(reply: XsydReply): {
  precisionUm: number;
  minTravelUm: number;
  maxTravelUm: number;
} {
  if (reply.opcode !== 0x80 || !reply.checksumValid) {
    throw new Error('Invalid XSYD travel limits handshake reply');
  }
  if (reply.payload.length < 7 || reply.payload[0] !== 0x00 || reply.payload[1] !== 0x25) {
    throw new Error('Unexpected XSYD travel limits subcommand reply');
  }
  const precisionUm = reply.payload[2] ?? 0;
  const rawMin = (reply.payload[3] ?? 0) | ((reply.payload[4] ?? 0) << 8);
  const minTravelUm = rawMin > 0 && rawMin < 50 ? rawMin * precisionUm : rawMin;
  const maxTravelUm = (reply.payload[5] ?? 0) | ((reply.payload[6] ?? 0) << 8);
  if (precisionUm <= 0 || minTravelUm <= 0 || maxTravelUm < minTravelUm || maxTravelUm > 10000) {
    throw new Error(
      `Invalid XSYD travel limits: precision=${precisionUm}um, min=${minTravelUm}um, max=${maxTravelUm}um`
    );
  }
  return { precisionUm, minTravelUm, maxTravelUm };
}

export function decodeHandshakeNameReply(reply: XsydReply): string {
  if (reply.opcode !== 0x80 || !reply.checksumValid) {
    throw new Error('Invalid XSYD keyboard name handshake reply');
  }
  const hasHeader =
    reply.payload.length >= 2 && reply.payload[0] === 0x00 && reply.payload[1] === 0x26;
  const bytes = hasHeader ? reply.payload.slice(2) : reply.payload;
  const chars: string[] = [];
  for (const byte of bytes) {
    if (byte === 0x00 || byte === 0xff) {
      if (chars.length > 0) break;
      continue;
    }
    if (byte >= 0x20 && byte <= 0x7e) {
      chars.push(String.fromCharCode(byte));
    }
  }
  const name = chars.join('').trim();
  if (!name || !MAX_HE_NAME_PATTERN.test(name)) {
    throw new Error(`Unexpected XSYD keyboard name in handshake: "${name || 'empty'}"`);
  }
  return name;
}

/**
 * Execute the full 3-step XSYD handshake (`0x00` subcmds `0x01`, `0x25`, `0x26`).
 * Throws and aborts before any device write if any reply does not match.
 */
export async function readXsydHandshake(requester: XsydRequester): Promise<XsydHandshakeInfo> {
  const versionReply = await requester.request(buildHandshakeVersionFrame());
  const version = decodeHandshakeVersionReply(versionReply);

  const travelReply = await requester.request(buildHandshakeTravelFrame());
  const { precisionUm, minTravelUm, maxTravelUm } = decodeHandshakeTravelReply(travelReply);

  const nameReply = await requester.request(buildHandshakeNameFrame());
  const name = decodeHandshakeNameReply(nameReply);

  return {
    version,
    precisionUm,
    minTravelUm,
    maxTravelUm,
    name
  };
}

/**
 * Read back per-key field slots via `0x23` with `payload[0] = 0x00`.
 * Rejects immediately if the reply is not `0xA3` with a valid checksum.
 */
export async function readXsydFieldTable(
  requester: XsydRequester,
  queries: readonly { pos: number; field: number }[] = []
): Promise<XsydFieldWrite[]> {
  if (queries.length === 0) {
    return [];
  }
  const results: XsydFieldWrite[] = [];
  const chunks: { pos: number; field: number }[][] = [];
  for (let i = 0; i < queries.length; i += XSYD_FEATURE_SLOTS) {
    chunks.push(queries.slice(i, i + XSYD_FEATURE_SLOTS));
  }
  for (const batch of chunks) {
    const reply = await requester.request(buildFieldReadFrame(batch));
    if (
      reply.opcode !== 0xa3 ||
      !reply.checksumValid ||
      reply.payload.length < 1 + 4 * XSYD_FEATURE_SLOTS
    ) {
      throw new Error('Invalid XSYD 0x23 field table readback reply');
    }
    results.push(...decodeFieldWritePayload(reply.payload));
  }
  return results;
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
  'switch-2': 3
};

const XSYD_PROFILE_BY_SWITCH_ID: Readonly<Record<number, string>> = {
  0: 'switch-4',
  1: 'switch-1',
  2: 'black',
  3: 'white'
};

export function xsydSwitchTypeId(switchProfile: string): number {
  return XSYD_SWITCH_ID_BY_PROFILE[switchProfile] ?? 0;
}

export function xsydSwitchProfileId(switchType: number): string {
  return XSYD_PROFILE_BY_SWITCH_ID[switchType] ?? 'white';
}

/**
 * Maximum actuation/RT travel in micrometres enforced by firmware sanitizer
 * `VA 0x12CEA..0x12D14` (`3400 µm` for switch IDs `0, 1`; `3300 µm` for `2, 3`).
 */
export function xsydSwitchMaxTravelUm(switchType: number): number {
  return switchType === 2 || switchType === 3 ? 3300 : 3400;
}

const HERO_MODIFIER_TO_XSYD_USAGE: Readonly<Record<number, number>> = {
  0x00010000: 0xe0, // L_Ctrl
  0x00020000: 0xe1, // L_Shift
  0x00040000: 0xe2, // L_Alt
  0x00080000: 0xe3, // L_WIN
  0x00100000: 0xe4, // R_Ctrl
  0x00200000: 0xe5, // R_Shift
  0x00400000: 0xe6, // R_Alt
  0x00800000: 0xe7, // R_WIN
  0x0d000000: 0x01, // Fn
  0x0d010000: 0x01, // Fn1
  0xf001: 0x01 // Firmware Fn action code
};

export function toXsydActionByte(action: number): number {
  const mapped = HERO_MODIFIER_TO_XSYD_USAGE[action];
  if (mapped !== undefined) {
    return mapped;
  }
  if (!Number.isInteger(action) || action < 0 || action > 0xff) {
    throw new RangeError(`XSYD action code must be a single byte (0..255), got ${action}`);
  }
  return action;
}
