import { useSyncExternalStore } from 'react';
import {
  detectHeroDeviceFamily,
  WIN68_HE_MAX_DEVICE_MODEL,
  type HeroDeviceModelId
} from '../../keyboard/devices';
import { MAX_HE_IDS, MAX_HE_USAGE, MAX_HE_USAGE_PAGE } from '../../keyboard/maxHe';
import { registerXsydProtocol, type Hero68Transport } from '../deviceBridge';
import { bytesToHex, hexToBytes } from '../hex';
import type { AdvancedBinding } from '../hero68/advanced';
import type { RemapLayer, RemapLayers } from '../hero68/remap';
import { reportTrace } from '../hero68/reportTrace';
import type { PollingRate, ProfileSlot } from '../hero68/types';
import type { Hero68ConnectionState, Hero68DeviceSnapshot } from '../hero68/webhid';
import {
  decodeXsydFrame,
  SILENT_REPLY,
  XsydFrameAssembler,
  xsydChecksum,
  xsydReports,
  XSYD_MAGIC,
  XSYD_REPORT_LENGTH,
  buildXsydFrame,
  type XsydReply
} from './codec';
import {
  buildXsydSelectProfileFrame,
  buildXsydWritePollingRateFrame,
  getHid,
  isXsydControlDevice,
  readXsydHallSnapshot,
  readXsydHandshake,
  readXsydOsModeMac,
  readXsydPollingRate,
  readXsydProfileSlot,
  readXsydWinLock,
  writeXsydOsModeMac,
  writeXsydWinLock,
  XSYD_OS_MODE_WRITE_MAC_SUBCMD,
  XSYD_OS_MODE_WRITE_WIN_SUBCMD,
  XSYD_PROFILE_SLOT_QUERY,
  XSYD_REPORT_ID,
  type HIDConnectionEventLike,
  type HIDDeviceLike,
  type HIDInputReportEventLike,
  type XsydHandshakeInfo,
  type XsydRequester,
  type XsydWaiter
} from './commands';
import { saveXsydAdvancedBindings } from './advancedBindings';
import { readXsydRemapLayers, saveXsydRemapChanges } from './remap';
import { hydrateFromXsydDevice, xsydProtocolEncoder } from './hydrate';
import type { XsydHallKeySample, XsydHallTableId } from './hall';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
 * - Retries `0x23` field-table requests automatically on transient read timeouts
 *   (e.g., when a request lands during the firmware's ~500–670 ms Flash sector erase,
 *   which emits an unsolicited `0xFF` completion packet at `VA 0x09AF0`).
 */
export class XsydDeviceManager implements Hero68Transport, XsydRequester {
  #device: HIDDeviceLike | undefined;
  #assembler = new XsydFrameAssembler();
  #waiters = new Set<XsydWaiter>();
  #subscribers = new Set<() => void>();
  #requestTail: Promise<unknown> = Promise.resolve();
  #handshake: XsydHandshakeInfo | null = null;
  #reenumerating = false;
  #activeProfileSlot: number | null = null;
  #lastSramWriteAt = 0;
  #snapshot: Hero68DeviceSnapshot = {
    state: getHid() ? 'disconnected' : 'unsupported',
    deviceName: WIN68_HE_MAX_DEVICE_MODEL.label,
    detectedModel: null,
    error: null
  };

  constructor() {
    getHid()?.addEventListener?.('disconnect', this.#onHidDisconnect);
  }

  get connected(): boolean {
    return this.#snapshot.state === 'connected' && Boolean(this.#device?.opened);
  }

  get handshake(): XsydHandshakeInfo | null {
    return this.#handshake;
  }

  invalidateActiveProfileSlot(): void {
    this.#activeProfileSlot = null;
  }

  getSnapshot = (): Hero68DeviceSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#subscribers.add(listener);
    return () => {
      this.#subscribers.delete(listener);
    };
  };

  #setSnapshot(next: Partial<Hero68DeviceSnapshot>) {
    this.#snapshot = {
      ...this.#snapshot,
      ...next
    };
    this.#subscribers.forEach(listener => listener());
  }

  async hasAuthorizedDevice(): Promise<boolean> {
    const hid = getHid();
    if (!hid) return false;
    const devices = (await hid.getDevices()).filter(isXsydControlDevice);
    return devices.length > 0;
  }

  async connect(requestPermission = true): Promise<boolean> {
    if (this.connected) {
      return true;
    }
    const hid = getHid();
    if (!hid) {
      this.#setSnapshot({
        state: 'unsupported',
        error: 'WebHID is not available in this browser.'
      });
      throw new Error('WebHID is not available in this browser');
    }
    this.#setSnapshot({
      state: 'connecting',
      error: null
    });
    try {
      let devices = (await hid.getDevices()).filter(isXsydControlDevice);
      if (devices.length === 0 && !requestPermission) {
        this.#setSnapshot({
          state: 'disconnected',
          error: null
        });
        return false;
      }
      if (devices.length === 0 && requestPermission) {
        const requested = await hid.requestDevice({
          filters: MAX_HE_IDS.map(({ vendorId, productId }) => ({
            vendorId,
            productId,
            usagePage: MAX_HE_USAGE_PAGE,
            usage: MAX_HE_USAGE
          }))
        });
        devices = requested.filter(isXsydControlDevice);
      }
      if (devices.length !== 1) {
        throw new Error(
          `Expected one authorized WIN 68 HE MAX control interface, found ${devices.length}.`
        );
      }
      const device = devices[0];
      // Windows WebHID rule: never call open() again if the handle is already open.
      if (!device.opened) {
        await device.open();
      }
      this.#assembler.reset();
      this.#activeProfileSlot = null;
      this.#lastSramWriteAt = 0;
      device.removeEventListener('inputreport', this.#onInputReport);
      device.addEventListener('inputreport', this.#onInputReport);
      this.#device = device;

      const handshake = await readXsydHandshake(this);
      this.#handshake = handshake;
      this.#setSnapshot({
        state: 'connected',
        detectedModel: 'win68HeMax',
        detectedModelFromUuid: true,
        deviceName: device.productName || handshake.name || WIN68_HE_MAX_DEVICE_MODEL.label,
        error: null
      });
      return true;
    } catch (error) {
      if (this.#device) {
        this.#device.removeEventListener('inputreport', this.#onInputReport);
      }
      this.#device = undefined;
      this.#handshake = null;
      this.#activeProfileSlot = null;
      this.#lastSramWriteAt = 0;
      this.#setSnapshot({
        state: 'error',
        error: errorMessage(error)
      });
      throw error;
    }
  }

  async detectConnectedModel(): Promise<HeroDeviceModelId | null> {
    if (!this.connected) {
      return null;
    }
    return 'win68HeMax';
  }

  async disconnect(): Promise<void> {
    const device = this.#device;
    this.#device = undefined;
    this.#handshake = null;
    this.#activeProfileSlot = null;
    this.#lastSramWriteAt = 0;
    this.#assembler.reset();
    this.#rejectWaiters(new Error('WIN 68 HE MAX disconnected'));
    if (device) {
      device.removeEventListener('inputreport', this.#onInputReport);
      if (device.opened) {
        await device.close();
      }
    }
    this.#setSnapshot({
      state: getHid() ? 'disconnected' : 'unsupported',
      detectedModel: null,
      detectedModelFromUuid: false,
      error: null
    });
  }

  async send(frame: Uint8Array): Promise<void> {
    const device = this.#device;
    if (!device?.opened) {
      throw new Error('WIN 68 HE MAX is not connected');
    }
    if (
      frame.length < XSYD_REPORT_LENGTH ||
      frame.length % XSYD_REPORT_LENGTH !== 0 ||
      frame[0] !== XSYD_MAGIC
    ) {
      throw new Error('Expected a 64-byte aligned XSYD 0x5C frame');
    }
    for (const report of xsydReports(frame)) {
      reportTrace.add('out', XSYD_REPORT_ID, report);
      // `sendReport` is typed `BufferSource`, which excludes views over a
      // `SharedArrayBuffer`; every report here owns a plain `ArrayBuffer`.
      await device.sendReport(XSYD_REPORT_ID, report as Uint8Array<ArrayBuffer>);
    }
  }

  /**
   * Send a frame that triggers USB re-enumeration (such as `0x00` subcmd `0x50`
   * polling-rate changes, verified in `4k_to_2k_to_1k.pcapng` across `dev3` ->
   * `dev6` -> `dev7` -> `dev8`), wait for the new HID interface to appear, and
   * reopen it without re-calling `open()` on an already opened handle.
   */
  async sendReenumerating(frame: Uint8Array, timeoutMs = 7000): Promise<void> {
    const hid = getHid();
    const previous = this.#device;
    if (!hid || !previous?.opened || !this.connected) {
      throw new Error('WIN 68 HE MAX is not connected');
    }
    this.#reenumerating = true;
    let sendError: unknown = null;
    try {
      try {
        // The board may not answer, or may answer only after the new interface
        // enumerates: wait for the re-enumeration, not for a reply.
        await this.request(frame, Math.min(350, Math.max(50, timeoutMs)), { expectReply: false });
      } catch (error) {
        sendError = error;
      }
      this.#setSnapshot({
        state: 'connecting',
        error: null
      });
      const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const setTimer =
        typeof window !== 'undefined' && window.setTimeout
          ? window.setTimeout.bind(window)
          : setTimeout;
      const deadline = now() + Math.max(50, timeoutMs);
      let sawTransition = this.#device !== previous || !previous.opened;
      while (now() < deadline) {
        const devices = (await hid.getDevices()).filter(isXsydControlDevice);
        const previousStillListed = devices.includes(previous);
        if (!previousStillListed || !previous.opened || this.#device !== previous) {
          sawTransition = true;
        }
        if (sawTransition && devices.length > 0) {
          const candidate = devices[0];
          try {
            previous.removeEventListener('inputreport', this.#onInputReport);
            if (!candidate.opened) {
              await candidate.open();
            }
            this.#assembler.reset();
            candidate.removeEventListener('inputreport', this.#onInputReport);
            candidate.addEventListener('inputreport', this.#onInputReport);
            this.#device = candidate;
            this.#setSnapshot({
              state: 'connected',
              detectedModel: 'win68HeMax',
              detectedModelFromUuid: true,
              deviceName:
                candidate.productName || this.#handshake?.name || WIN68_HE_MAX_DEVICE_MODEL.label,
              error: null
            });
            return;
          } catch {
            // Keep polling until the re-enumerated interface finishes opening.
          }
        }
        await new Promise(resolve =>
          setTimer(resolve, Math.min(120, Math.max(10, Math.floor(timeoutMs / 10))))
        );
      }
      if (this.#device?.opened) {
        this.#setSnapshot({
          state: 'connected',
          detectedModel: 'win68HeMax',
          detectedModelFromUuid: true,
          error: null
        });
        return;
      }
      const detail = sendError instanceof Error ? ` (${sendError.message})` : '';
      this.#setSnapshot({
        state: 'error',
        error: `WIN 68 HE MAX did not return after USB re-enumeration${detail}`
      });
      throw new Error(`WIN 68 HE MAX did not return after USB re-enumeration${detail}`);
    } finally {
      this.#reenumerating = false;
    }
  }

  /**
   * Write a new polling rate via `0x00` subcmd `0x50`, wait for USB re-enumeration,
   * and verify the persisted rate with `0x00` subcmd `0x50` query `0x07`.
   */
  async readHallSnapshot(
    options: {
      keyIds?: Iterable<string>;
      tableIds?: readonly XsydHallTableId[];
      includeAdc?: boolean;
      timeoutMs?: number;
    } = {}
  ): Promise<XsydHallKeySample[]> {
    return readXsydHallSnapshot(this, options);
  }

  async writePollingRate(rate: PollingRate, timeoutMs = 7000): Promise<PollingRate> {
    await this.sendReenumerating(buildXsydWritePollingRateFrame(rate), timeoutMs);
    const actual = await readXsydPollingRate(this);
    if (actual !== rate) {
      throw new Error(
        `Polling-rate verify failed: requested ${rate} Hz, device reports ${actual} Hz`
      );
    }
    return actual;
  }

  async readWinLock(): Promise<boolean> {
    return readXsydWinLock(this);
  }

  async writeWinLock(locked: boolean): Promise<boolean> {
    return writeXsydWinLock(this, locked);
  }

  async readOsModeMac(): Promise<boolean> {
    return readXsydOsModeMac(this);
  }

  async writeOsModeMac(mac: boolean): Promise<boolean> {
    return writeXsydOsModeMac(this, mac);
  }

  async sendHex(hex: string): Promise<void> {
    const frame = hexToBytes(hex);
    await this.request(frame, 1000);
  }

  async sendBatchHex(hexes: readonly string[]): Promise<void> {
    for (const hex of hexes) {
      await this.sendHex(hex);
    }
  }

  #queueControlOperation<T>(run: () => Promise<T>, useCrossTabLock = true): Promise<T> {
    const work = () =>
      useCrossTabLock && typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request('openhero68:xsyd-hid-control', run)
        : run();
    const next = this.#requestTail.then(work);
    this.#requestTail = next.catch(() => {});
    return next;
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
    options: { expectReply?: boolean; retries?: number } = {}
  ): Promise<XsydReply> {
    const expectReply = options.expectReply ?? true;
    const op = frame[2] ?? 0;
    return this.#queueControlOperation(async () => {
      if (!expectReply) {
        this.#assembler.reset();
        await this.send(frame);
        return SILENT_REPLY;
      }
      const sub = frame[4];
      // Guard `0x00` subcmd `0x70` profile select against firmware `VA 0x16342` -> `0x12AF4`:
      // In firmware v1.1.4, `0x00 0x70 <slot>` unconditionally reloads Flash into SRAM.
      // Because `0x23`/`0x29`/`0x18`/`0x2A` writes only flush SRAM -> Flash after a
      // 500 ms timer (`VA 0x07E28` -> `0x11914`), sending `0x00 0x70 <slot>` again for
      // the already-active slot wipes out uncommitted SRAM writes!
      if (op === 0x00 && sub === 0x70) {
        const slotArg = frame[5] ?? 0xff;
        if (slotArg >= 0 && slotArg <= 3) {
          if (this.#activeProfileSlot === slotArg && this.#lastSramWriteAt > 0) {
            const synthetic = buildXsydFrame(0x80, [0x00, 0x70, slotArg, 0xff]);
            synthetic[3] = xsydChecksum(synthetic, 'in');
            return decodeXsydFrame(synthetic);
          }
          const elapsed = Date.now() - this.#lastSramWriteAt;
          if (this.#lastSramWriteAt > 0 && elapsed < 600) {
            const setTimer =
              typeof window !== 'undefined' && window.setTimeout
                ? window.setTimeout.bind(window)
                : setTimeout;
            await new Promise(resolve => setTimer(resolve, 600 - elapsed));
          }
          const reply = await this.#requestOnce(frame, timeoutMs);
          this.#activeProfileSlot = slotArg;
          this.#lastSramWriteAt = 0;
          return reply;
        }
        if (slotArg === XSYD_PROFILE_SLOT_QUERY) {
          const reply = await this.#requestOnce(frame, timeoutMs);
          const queriedSlot = reply.payload[2];
          if (queriedSlot !== undefined && queriedSlot >= 0 && queriedSlot <= 3) {
            this.#activeProfileSlot = queriedSlot;
          }
          return reply;
        }
      }
      // `0x23` per-key field table reads/writes run in 34..68 packet bursts and
      // frequently overlap the firmware's ~500–670 ms deferred Flash sector erase
      // (`VA 0x0AD9E` -> `0x11914` -> `0x09AF0`), during which a single USB packet
      // can be dropped while the MCU masks interrupts. Retry `0x23` up to 2 times.
      const maxRetries = options.retries ?? (op === 0x23 ? 2 : 0);
      const reply = await this.#requestWithRetry(frame, timeoutMs, maxRetries);
      if (
        ([0x18, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x2c].includes(op) &&
          frame[4] === 0x01) ||
        (op === 0x00 &&
          (sub === XSYD_OS_MODE_WRITE_WIN_SUBCMD || sub === XSYD_OS_MODE_WRITE_MAC_SUBCMD))
      ) {
        if (this.#lastSramWriteAt === 0) {
          this.#lastSramWriteAt = Date.now();
        }
      }
      return reply;
    }, op !== 0x12);
  }

  async #requestWithRetry(
    frame: Uint8Array,
    timeoutMs: number,
    maxRetries: number
  ): Promise<XsydReply> {
    const setTimer =
      typeof window !== 'undefined' && window.setTimeout
        ? window.setTimeout.bind(window)
        : setTimeout;
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const attemptTimeout =
          maxRetries > 0 && attempt < maxRetries ? Math.min(timeoutMs, 350) : timeoutMs;
        return await this.#requestOnce(frame, attemptTimeout);
      } catch (error) {
        lastError = error;
        const isReadTimeout = error instanceof Error && error.message.includes('read timed out');
        if (!isReadTimeout || attempt >= maxRetries || !this.#device?.opened) {
          throw error;
        }
        this.#assembler.reset();
        await new Promise(resolve => setTimer(resolve, 35));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async #requestOnce(frame: Uint8Array, timeoutMs = 800): Promise<XsydReply> {
    if (!this.#device?.opened) {
      throw new Error('WIN 68 HE MAX is not connected');
    }
    const decodedOut = decodeXsydFrame(frame);
    const expectedOpcode = (decodedOut.opcode | 0x80) & 0xff;
    const setTimer =
      typeof window !== 'undefined' && window.setTimeout
        ? window.setTimeout.bind(window)
        : setTimeout;
    const clearTimer =
      typeof window !== 'undefined' && window.clearTimeout
        ? window.clearTimeout.bind(window)
        : clearTimeout;

    this.#assembler.reset();

    return new Promise<XsydReply>((resolve, reject) => {
      const timeoutError = (stage: 'read' | 'send') =>
        new Error(
          `WIN 68 HE MAX ${stage} timed out (opcode=0x${decodedOut.opcode.toString(16).padStart(2, '0')})`
        );
      const waiter: XsydWaiter = {
        expectedOpcode,
        resolve,
        reject,
        timer: setTimer(
          () => {
            this.#waiters.delete(waiter);
            this.#assembler.reset();
            const error = timeoutError('send');
            reject(error);
            this.#setSnapshot({
              state: 'error',
              error: error.message
            });
          },
          Math.max(2000, timeoutMs)
        )
      };
      this.#waiters.add(waiter);
      void this.send(frame)
        .then(() => {
          if (!this.#waiters.has(waiter)) {
            return;
          }
          clearTimer(waiter.timer);
          waiter.timer = setTimer(
            () => {
              this.#waiters.delete(waiter);
              this.#assembler.reset();
              reject(timeoutError('read'));
            },
            Math.max(1, timeoutMs)
          );
        })
        .catch(error => {
          clearTimer(waiter.timer);
          this.#waiters.delete(waiter);
          this.#assembler.reset();
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  #rejectWaiters(error: Error) {
    const clearTimer =
      typeof window !== 'undefined' && window.clearTimeout
        ? window.clearTimeout.bind(window)
        : clearTimeout;
    for (const waiter of this.#waiters) {
      clearTimer(waiter.timer);
      waiter.reject(error);
    }
    this.#waiters.clear();
  }

  #onInputReport = (event: HIDInputReportEventLike): void => {
    if (event.reportId !== undefined && event.reportId !== XSYD_REPORT_ID) {
      return;
    }
    const payload = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
    reportTrace.add('in', event.reportId ?? XSYD_REPORT_ID, payload);
    if (this.#waiters.size === 0) {
      if (
        payload.length >= 6 &&
        payload[0] === XSYD_MAGIC &&
        payload[2] === 0xff &&
        payload[4] === 0x0a &&
        payload[5] === 0xff
      ) {
        this.#lastSramWriteAt = 0;
      }
      return;
    }
    const clearTimer =
      typeof window !== 'undefined' && window.clearTimeout
        ? window.clearTimeout.bind(window)
        : clearTimeout;
    try {
      const reply = this.#assembler.push(payload);
      if (!reply) {
        return;
      }
      // Unsolicited `0xFF` (`0A FF <hi> <lo>` at `VA 0x09AF0`) signals that the
      // firmware finished its deferred SRAM -> Flash sector flush.
      if (reply.opcode === 0xff && reply.payload[0] === 0x0a && reply.payload[1] === 0xff) {
        this.#lastSramWriteAt = 0;
      }
      for (const waiter of this.#waiters) {
        if (reply.opcode !== waiter.expectedOpcode) {
          // Another request's reply, or an unsolicited frame: never fail the
          // request that is still waiting for its own opcode.
          continue;
        }
        clearTimer(waiter.timer);
        this.#waiters.delete(waiter);
        if (!reply.checksumValid) {
          waiter.reject(
            new Error(
              `Invalid XSYD reply checksum for opcode 0x${reply.opcode.toString(16).padStart(2, '0')}`
            )
          );
        } else {
          waiter.resolve(reply);
        }
        break;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.#rejectWaiters(err);
      this.#setSnapshot({
        error: err.message
      });
    }
  };

  #onHidDisconnect = (event: HIDConnectionEventLike): void => {
    if (!this.#device || event.device !== this.#device) {
      return;
    }
    this.#device.removeEventListener('inputreport', this.#onInputReport);
    this.#device = undefined;
    this.#activeProfileSlot = null;
    this.#lastSramWriteAt = 0;
    this.#assembler.reset();
    this.#rejectWaiters(new Error('WIN 68 HE MAX disconnected'));
    if (this.#reenumerating) {
      return;
    }
    this.#handshake = null;
    this.#setSnapshot({
      state: 'disconnected',
      detectedModel: null,
      detectedModelFromUuid: false,
      error: 'WIN 68 HE MAX was disconnected.'
    });
  };
}

export const xsydDeviceManager = new XsydDeviceManager();
registerXsydProtocol(xsydProtocolEncoder, xsydDeviceManager);

export function useXsydDevice(): Hero68DeviceSnapshot {
  return useSyncExternalStore(
    xsydDeviceManager.subscribe,
    xsydDeviceManager.getSnapshot,
    xsydDeviceManager.getSnapshot
  );
}
