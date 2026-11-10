// Frame codec for the XSYD `0x5C` vendor protocol used by the AULA WIN 68 HE MAX
// (board XSYD/SI2828C, firmware v1.1.4). This is NOT the HERO68 0x09 protocol:
// the board links its flash at VA = file offset + 0x4000 and this framing lives
// at VA 0x9B74 (`hid_loop`), verified against the firmware image.
//
//   pack[0] = 0x5C        magic, checked before anything else
//   pack[1] = LEN         payload length (0..252)
//   pack[2] = OPCODE      request 0x00..0x37, reply = request | 0x80
//   pack[3] = CHECKSUM
//   pack[4 ..]            payload
//
// A frame of 4 + LEN bytes is split into 64-byte HID reports with report id 0,
// so a reply of 132 bytes arrives as three `inputreport` events.

export const XSYD_MAGIC = 0x5c;
export const XSYD_REPORT_LENGTH = 64;
export const XSYD_MAX_PAYLOAD = 252;

/** One byte of the request header. */
const HEADER_LENGTH = 4;

function assertByte(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${name} must be a byte`);
  }
}

/**
 * Byte 3 of the frame (VA 0xCF48 in firmware).
 *
 * The firmware sums magic + LEN + OPCODE + 0x35 + `buf[0x60 + LEN]`, i.e. the
 * LAST payload byte only (pack[3 + LEN]) — never the whole body. Proven on all
 * 4316 frames of 9 USB captures; whole-payload sums reproduce only the frames
 * whose body happens to total 0x00/0xFF.
 *
 * Three families deviate, each explained by how the frame was assembled:
 *   - `in` with OPCODE < 0x80 never passes through the reply packer (which sets
 *     `opcode |= 0x80` before checksumming), so the byte stays 0x00;
 *   - OPCODE 0x30 uses a fixed 0x43-byte slot, so the addend is pack[63];
 *   - LEN > 60 pushes the addend past the 64-byte report: 0x00 for the 128-byte
 *     Hall reply (0x92, LEN 0x80) and 0xFF when it carries a FF FF suffix
 *     (LEN 0x82).
 */
export function xsydChecksum(frame: ArrayLike<number>, direction: 'out' | 'in' = 'out'): number {
  const magic = frame[0] ?? 0;
  const length = frame[1] ?? 0;
  const opcode = frame[2] ?? 0;
  if (direction === 'in' && opcode < 0x80) {
    return 0x00;
  }
  if (opcode === 0x30) {
    return (0x04 + (frame[63] ?? 0)) & 0xff;
  }
  const last = length > 60 ? (length === 0x80 ? 0x00 : 0xff) : (frame[3 + length] ?? 0);
  return (magic + length + opcode + 0x35 + last) & 0xff;
}

/**
 * Build one 0x5C frame, padded to a whole number of 64-byte reports.
 * Bytes after the payload stay 0x00, matching what the firmware writes.
 */
export function buildXsydFrame(opcode: number, payload: ArrayLike<number> = []): Uint8Array {
  assertByte(opcode, 'opcode');
  const length = payload.length;
  if (length > XSYD_MAX_PAYLOAD) {
    throw new RangeError(`payload is limited to ${XSYD_MAX_PAYLOAD} bytes`);
  }
  const total = Math.max(
    XSYD_REPORT_LENGTH,
    Math.ceil((HEADER_LENGTH + length) / XSYD_REPORT_LENGTH) * XSYD_REPORT_LENGTH
  );
  const frame = new Uint8Array(total);
  frame[0] = XSYD_MAGIC;
  frame[1] = length;
  frame[2] = opcode;
  for (let i = 0; i < length; i++) {
    const byte = payload[i];
    assertByte(byte, `payload[${i}]`);
    frame[HEADER_LENGTH + i] = byte;
  }
  frame[3] = xsydChecksum(frame);
  return frame;
}

/** Split a frame into the report bodies WebHID expects (`sendReport(id, body)`). */
export function xsydReports(frame: Uint8Array): Uint8Array[] {
  if (frame.length % XSYD_REPORT_LENGTH !== 0) {
    throw new RangeError('frame length must be a multiple of 64');
  }
  const reports: Uint8Array[] = [];
  for (let offset = 0; offset < frame.length; offset += XSYD_REPORT_LENGTH) {
    reports.push(frame.slice(offset, offset + XSYD_REPORT_LENGTH));
  }
  return reports;
}

export interface XsydReply {
  opcode: number;
  /** Opcode without the reply bit, i.e. the request this answers. */
  requestOpcode: number;
  length: number;
  checksumValid: boolean;
  /** `frame[4]` — the firmware's first payload byte (status on most replies). */
  status: number;
  payload: Uint8Array;
  raw: Uint8Array;
}

/**
 * Reassemble a reply from 64-byte `inputreport` events.
 *
 * The firmware header carries LEN, so the expected frame size is known as soon
 * as the first report arrives. A report whose first byte is not 0x5C while the
 * buffer is empty is a stray/echoed report and is dropped.
 *
 * Self-healing guard: if a multi-report `0x92` Hall reply (3 × 64B reports) is
 * interrupted or drops a continuation report and a valid standalone reply header
 * (`0xA3`, `0x80`, `0xFF`, or a fresh `0x92` header) arrives next, the stale
 * partial buffer is discarded immediately so it cannot swallow the new reply.
 */
export class XsydFrameAssembler {
  #buffer = new Uint8Array(XSYD_MAX_PAYLOAD + HEADER_LENGTH);
  #filled = 0;
  #expected = 0;

  /** Feed one 64-byte report; returns the complete reply once it is whole. */
  push(report: ArrayLike<number>): XsydReply | null {
    if (report.length < 4) {
      return null;
    }
    if (this.#filled > 0 && this.#buffer[2] === 0x92) {
      const magic = report[0] ?? 0;
      const len = report[1] ?? 0;
      const op = report[2] ?? 0;
      const isSingleReportReply =
        magic === XSYD_MAGIC &&
        len > 0 &&
        len <= XSYD_REPORT_LENGTH - HEADER_LENGTH &&
        op >= 0x80 &&
        op !== 0x92 &&
        report.length >= HEADER_LENGTH + len &&
        report[3] === xsydChecksum(report, 'in');
      const isFreshHallHeader =
        magic === XSYD_MAGIC &&
        (len === 0x80 || len === 0x82) &&
        op === 0x92 &&
        report[3] === xsydChecksum(report, 'in') &&
        (report[4] ?? 0xff) === 0x00 &&
        (report[5] === 0x01 || report[5] === 0x02 || report[5] === 0x03);
      if (isSingleReportReply || isFreshHallHeader) {
        this.reset();
      }
    }
    if (this.#filled === 0) {
      if (report[0] !== XSYD_MAGIC) {
        return null;
      }
      const length = report[1];
      if (length > XSYD_MAX_PAYLOAD) {
        return null;
      }
      this.#expected =
        Math.ceil((HEADER_LENGTH + length) / XSYD_REPORT_LENGTH) * XSYD_REPORT_LENGTH;
    }
    const room = Math.min(report.length, this.#expected - this.#filled);
    for (let i = 0; i < room; i++) {
      this.#buffer[this.#filled + i] = report[i];
    }
    this.#filled += room;
    if (this.#filled < this.#expected) {
      return null;
    }
    const frame = this.#buffer.slice(0, this.#expected);
    this.#filled = 0;
    this.#expected = 0;
    return decodeXsydFrame(frame);
  }

  reset(): void {
    this.#filled = 0;
    this.#expected = 0;
  }
}

/**
 * Placeholder returned when a caller sends a frame without waiting for a reply.
 * It has no checksum and an empty payload, so any decoder rejects it instead of
 * reading a fabricated status.
 */
export const SILENT_REPLY: Readonly<XsydReply> = Object.freeze({
  opcode: 0,
  requestOpcode: 0,
  length: 0,
  checksumValid: false,
  status: 0,
  payload: new Uint8Array(0),
  raw: new Uint8Array(0)
});

export function decodeXsydFrame(frame: Uint8Array): XsydReply {
  if (frame.length < HEADER_LENGTH || frame[0] !== XSYD_MAGIC) {
    throw new Error(`unexpected XSYD magic 0x${(frame[0] ?? 0).toString(16)}`);
  }
  const length = frame[1];
  if (HEADER_LENGTH + length > frame.length) {
    throw new RangeError(
      `frame declares ${length} payload bytes but only ${frame.length - HEADER_LENGTH} are present`
    );
  }
  const opcode = frame[2];
  return {
    opcode,
    requestOpcode: opcode & 0x7f,
    length,
    checksumValid: frame[3] === xsydChecksum(frame, 'in'),
    status: frame[4] ?? 0,
    payload: frame.slice(HEADER_LENGTH, HEADER_LENGTH + length),
    raw: frame
  };
}

export function xsydReport(opcode: number, payload: ArrayLike<number> = []): Uint8Array {
  return buildXsydFrame(opcode, payload);
}

export function xsydSelectProfileSlot(slot: number): Uint8Array {
  return buildXsydFrame(0x00, [0x70, slot & 0xff, 0xff, 0xff]);
}
