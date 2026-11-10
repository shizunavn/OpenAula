import { decodeReport } from '../src/protocol/hero68/codec';

export class WriteBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WriteBlockedError';
  }
}

/**
 * Global blocklist of dangerous / destructive firmware commands across ByteTech v3 and XSYD.
 */
export const DANGEROUS_COMMANDS_BLOCKLIST = {
  bytetech: [
    0x11, // Reset Layer / Factory Reset
    0x7f, // Enter Bootloader (0xAA 0x55)
    0x94 // Calibration Start/Stop
  ],
  xsydSubCommands: [
    0x10, // Factory Reset
    0x11 // EEPROM Reset
  ]
} as const;

/**
 * Validates packets emitted by the background Auto-Profile Switcher:
 * - On ByteTech v3: Blocks `0x03` (Remap), `0x05` (Macro), `0x12` (Advanced Keys), `0x1A` (Profile Name),
 *   and all dangerous commands. Allows `0x10`, `0x90`, `0x08`, and (when diff mode is enabled) `0x15, 0x13, 0x19, 0x16`.
 * - On AULA XSYD `0x5C` (WIN 68 HE MAX):
 *   By default (`allowXsydSlot3Commit = false`), strictly blocks `0x23` and `0x29` (which trigger a 500ms delayed
 *   5-sector Flash Erase/Write at VA 0x0AD9E) and allows only `0x00 0x70` (Select Profile Slot 0..3 -> SRAM load)
 *   and `0x2A` (SRAM Per-Key RGB without `FE FE FE FE` sentinel).
 *   When `allowXsydSlot3Commit = true` (exclusively triggered by the Smart Slot 3 Virtualization Engine after passing
 *   both the 12s continuous session dwell and the Token-Bucket Flash Wear Guard for >4 profiles), permits `0x23`
 *   Hall travel/RT field updates (`field != 0x00` so Remap is never touched).
 */
export function validateAutoSwitchRequest(
  packet: Uint8Array,
  family: 'bytetech' | 'xsyd',
  allowDiffOrSlot3Commit = false
): void {
  if (packet.length !== 64) {
    throw new WriteBlockedError('Expected 64-byte HID report');
  }
  if (family === 'xsyd') {
    if (packet[0] !== 0x5c) {
      throw new WriteBlockedError('Invalid XSYD 0x5C header');
    }
    const opcode = packet[2];
    if (opcode === 0x29) {
      throw new WriteBlockedError(
        'Blocked XSYD command 0x29 during Auto-Switch to prevent 5-sector Flash wear'
      );
    }
    if (opcode === 0x23) {
      if (!allowDiffOrSlot3Commit) {
        throw new WriteBlockedError(
          'Blocked XSYD command 0x23 during instant Auto-Switch to prevent 5-sector Flash wear'
        );
      }
      // Verify it's a valid 0x23 write payload (payload[0] === 0x01) and never touches Remap (field 0x00)
      if (packet[4] !== 0x01) {
        throw new WriteBlockedError('Invalid XSYD 0x23 mode in Slot 3 overflow commit');
      }
      for (let k = 0; k < 14; k++) {
        const offset = 5 + 4 * k;
        const pos = packet[offset];
        const field = packet[offset + 1];
        if (pos !== 0xff && pos !== 0x00 && field === 0x00) {
          throw new WriteBlockedError(
            'Blocked XSYD 0x23 Remap field (0x00) in Slot 3 overflow commit'
          );
        }
      }
      return;
    }
    if (opcode === 0x00) {
      const subCmd = packet[4];
      const slot = packet[5];
      if (subCmd !== 0x70 || slot > 3) {
        throw new WriteBlockedError(
          `Blocked XSYD sub-command 0x00 0x${subCmd.toString(16)} in Auto-Switch`
        );
      }
      return;
    }
    if (opcode === 0x2a) {
      // Ensure the Flash commit sentinel FE FE FE FE is not present
      for (let i = 4; i <= packet.length - 4; i++) {
        if (
          packet[i] === 0xfe &&
          packet[i + 1] === 0xfe &&
          packet[i + 2] === 0xfe &&
          packet[i + 3] === 0xfe
        ) {
          throw new WriteBlockedError(
            'Blocked XSYD 0x2A Flash sentinel FE FE FE FE during Auto-Switch'
          );
        }
      }
      return;
    }
    throw new WriteBlockedError(`Unsupported XSYD Auto-Switch opcode 0x${opcode.toString(16)}`);
  }

  // ByteTech v3 validation
  const report = decodeReport(packet);
  if (!report.checksumValid) {
    throw new WriteBlockedError('Invalid ByteTech report checksum in Auto-Switch');
  }
  const c = report.command;
  if ([0x03, 0x05, 0x12, 0x1a].includes(c)) {
    throw new WriteBlockedError(
      `Keymap/Macro/Name write command 0x${c.toString(16)} is strictly forbidden in Auto-Switch`
    );
  }
  if ((DANGEROUS_COMMANDS_BLOCKLIST.bytetech as readonly number[]).includes(c)) {
    throw new WriteBlockedError(`Blocked dangerous ByteTech command 0x${c.toString(16)}`);
  }
  const isSlotSelect = c === 0x10 && report.zone === 0 && report.dataLength === 1 && report.data[0] <= 2;
  const isReadActive = c === 0x90 && report.zone === 0;
  const isLiveRgb = c === 0x08;
  const isDiffBatch =
    allowDiffOrSlot3Commit && [0x15, 0x13, 0x19, 0x16].includes(c) && report.zone === 0;

  if (!isSlotSelect && !isReadActive && !isLiveRgb && !isDiffBatch) {
    throw new WriteBlockedError(`Command 0x${c.toString(16)} is not permitted in Auto-Switch`);
  }
}

// Only commands used by the configuration UI, never firmware/update/reset or
// calibration commands. The native helper also checks this set independently.
export function validateDeviceRequest(input: unknown): {
  packet: Uint8Array;
  reenumerate: boolean;
} {
  const value = input as {
    hex?: unknown;
    reenumerate?: unknown;
  };
  if (!value || typeof value.hex !== 'string' || !/^[0-9a-fA-F]{128}$/.test(value.hex)) {
    throw Error('Expected a 64-byte configuration report');
  }
  const packet = Uint8Array.from(Buffer.from(value.hex, 'hex'));
  const report = decodeReport(packet);
  if (!report.checksumValid) {
    throw Error('Invalid configuration checksum');
  }
  const { command: c, zone: z, dataLength: n, data: d } = report;
  const allowed =
    ([0x03, 0x83, 0x12, 0x92].includes(c) && z <= 2) ||
    ([0x13, 0x15, 0x16, 0x19, 0x93, 0x95, 0x96, 0x99].includes(c) && z === 0 && n > 0) ||
    (c === 0x10 && z === 0 && n === 1 && d[0] <= 2) ||
    ([0x90, 0x87].includes(c) && z === 0) ||
    ([0x1a, 0x9a].includes(c) && z <= 2) ||
    (c === 0x05 && z === 0) ||
    ([0x04, 0x84].includes(c) && [1, 6, 17, 19, 21, 23, 24, 25, 29, 30].includes(z)) ||
    ([0x06, 0x86].includes(c) && z === 0) ||
    (c === 0x82 && [1, 2, 3, 4, 6, 8, 9].includes(z)) ||
    (c === 0x08 && ((z === 1 && n > 0) || (z === 2 && n === 3)));
  if (!allowed) {
    throw Error('Unsupported configuration command');
  }
  const reenumerate = value.reenumerate === true;
  if (reenumerate && !(c === 4 && z === 23 && n === 1 && d[0] <= 6)) {
    throw Error('Only polling-rate changes may re-enumerate');
  }
  return {
    packet,
    reenumerate
  };
}
