import { useSyncExternalStore } from 'react';
import { registerHero68Protocol, type Hero68Transport } from '../deviceBridge';
import { hexToBytes } from '../hex';
import { buildReport, decodeReport } from './codec';
import { hero68ProtocolEncoder } from './hero68Encoder';
import { reportTrace } from './reportTrace';
import type { DecodedReport } from './types';
import { rgbService } from '../rgbService';
import {
  detectHeroDeviceFamily,
  detectHeroDeviceModelFromProductName,
  detectHeroDeviceModelFromUuid,
  HERO_USB_FILTERS,
  heroDeviceModel,
  type HeroDeviceModelId
} from '../../keyboard/devices';
const HERO68_USAGE = 0x0061;
const HERO68_REPORT_ID = 0x09;
const HERO_RECEIVER_PRODUCT_IDS: readonly number[] = [0x1000, 0x106c];
function isHeroReceiverProductId(productId?: number | null): boolean {
  return (
    productId !== undefined && productId !== null && HERO_RECEIVER_PRODUCT_IDS.includes(productId)
  );
}
function isReceiverUuidPrefix(data?: ArrayLike<number> | null): boolean {
  const first = Number(data?.[0] ?? 0);
  return first >= 0x20;
}
interface HIDReportInfoLike {
  reportId?: number;
  featureId?: number;
  items?: Array<{
    reportSize?: number;
    reportCount?: number;
    usages?: number[];
  }>;
}
interface HIDCollectionInfoLike {
  usagePage?: number;
  usage?: number;
  type?: number;
  inputReports?: HIDReportInfoLike[];
  outputReports?: HIDReportInfoLike[];
  featureReports?: HIDReportInfoLike[];
  children?: HIDCollectionInfoLike[];
}
interface HIDInputReportEventLike {
  data: DataView;
  reportId: number;
  device?: HIDDeviceLike;
}
interface HIDConnectionEventLike {
  device: HIDDeviceLike;
}
interface HIDDeviceLike {
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
interface NavigatorHIDLike {
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
type ReportWaiter = {
  expectedCommand: number;
  expectedZone?: number;
  predicate?: (report: DecodedReport) => boolean;
  resolve: (report: DecodedReport) => void;
  reject: (error: Error) => void;
  timer: number;
};
export type Hero68ConnectionState =
  'unsupported' | 'disconnected' | 'connecting' | 'connected' | 'error';
export type Hero68DeviceSnapshot = {
  state: Hero68ConnectionState;
  deviceName: string;
  detectedModel?: HeroDeviceModelId | null;
  /** `detectedModel` came from the device UUID (CMD 0x82 zone 1), not a name heuristic. */
  detectedModelFromUuid?: boolean;
  isXs?: boolean;
  error: string | null;
};
export type Hero68RawInputReport = {
  reportId: number;
  data: Uint8Array;
  timestampMs: number;
};
export type Hero68HidCollectionDiagnostic = {
  path: string;
  usagePage: number | null;
  usage: number | null;
  type: number | null;
  inputReportIds: number[];
  outputReportIds: number[];
  featureReportIds: number[];
};
function getHid(): NavigatorHIDLike | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }
  return (
    navigator as Navigator & {
      hid?: NavigatorHIDLike;
    }
  ).hid;
}
function collectionMatches(
  collection: HIDCollectionInfoLike,
  usagePages: readonly number[]
): boolean {
  if (usagePages.includes(collection.usagePage ?? -1) && collection.usage === HERO68_USAGE) {
    return true;
  }
  return collection.children?.some(child => collectionMatches(child, usagePages)) ?? false;
}
function isHero68ControlDevice(device: HIDDeviceLike): boolean {
  const filters = HERO_USB_FILTERS.filter(
    filter => filter.vendorId === device.vendorId && filter.productId === device.productId
  );
  if (filters.length === 0) {
    return false;
  }
  if (!device.collections?.length) {
    return true;
  }
  const usagePages = filters.map(filter => filter.usagePage);
  return device.collections.some(collection => collectionMatches(collection, usagePages));
}
/**
 * The WIN 68 HE MAX shares the HERO HID surface but not its command set, so it
 * may be opened for identification and must never receive a report.
 */
function isUnsupportedCommandSet(device: HIDDeviceLike): boolean {
  return (
    detectHeroDeviceFamily(device.productName, device.vendorId, device.productId) === 'win68HeMax'
  );
}
const MAX_HE_UNSUPPORTED_MESSAGE =
  'AULA WIN 68 HE MAX detected: this board is not the HERO68 and OpenAula does not know its HID command set yet, so no settings were read or written.';
function inferModelFromHidDevice(device: HIDDeviceLike): HeroDeviceModelId | null {
  const byName = detectHeroDeviceModelFromProductName(device.productName);
  if (byName) {
    return byName;
  }
  if (device.productId === 0x1000) {
    return 'hero84';
  }
  return null;
}
function deviceDisplayName(device: HIDDeviceLike | undefined, model: HeroDeviceModelId): string {
  return device?.productName || heroDeviceModel(model).label;
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export class Hero68DeviceManager implements Hero68Transport {
  #device: HIDDeviceLike | undefined;
  #isHero68Xs = false;
  #snapshot: Hero68DeviceSnapshot = {
    state: getHid() ? 'disconnected' : 'unsupported',
    deviceName: 'AULA Hero68',
    detectedModel: null,
    isXs: false,
    error: null
  };
  #subscribers = new Set<() => void>();
  #reportListeners = new Set<(report: DecodedReport) => void>();
  #rawReportListeners = new Set<(report: Hero68RawInputReport) => void>();
  #waiters = new Set<ReportWaiter>();
  #viaService = false;
  #reconnectViaService = false;
  #requestTail: Promise<unknown> = Promise.resolve();
  get viaService() {
    return this.#viaService;
  }
  constructor() {
    getHid()?.addEventListener?.('disconnect', this.#onHidDisconnect);
    rgbService.onAvailability(online => {
      if (!online && this.#viaService) {
        this.#viaService = false;
        this.#reconnectViaService = true;
        this.#setSnapshot({
          state: 'disconnected',
          error: 'RGB service đã tắt. Hãy chạy lại Hero68RgbService.exe.'
        });
      } else if (online && this.#reconnectViaService && !this.connected) {
        this.#reconnectViaService = false;
        void this.connectViaService().catch(() => {
          this.#reconnectViaService = true;
        });
      }
    });
  }
  get connected(): boolean {
    return (
      this.#snapshot.state === 'connected' && (this.#viaService || Boolean(this.#device?.opened))
    );
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
  async connect(requestPermission = true): Promise<boolean> {
    if (this.connected) {
      return true;
    }
    if (typeof location !== 'undefined' && location.protocol.startsWith('http')) {
      const service = await rgbService.status().catch(() => null);
      if (
        service &&
        ((service.apiVersion ?? 0) >= 3 || (service.enabled && (service.apiVersion ?? 0) >= 2))
      ) {
        try {
          await this.connectViaService();
          if (this.connected) {
            return true;
          }
          if (this.#snapshot.detectedModel === 'win68HeMax') {
            return false;
          }
        } catch (error) {
          if (!getHid()) {
            throw error;
          }
          this.#setSnapshot({
            state: 'disconnected',
            error: null
          });
        }
      }
    }
    const hid = getHid();
    if (!hid) {
      this.#setSnapshot({
        state: 'unsupported',
        error: 'WebHID is not available in this browser.'
      });
      throw new Error('WebHID is not available in this browser');
    }
    if (this.connected) {
      return true;
    }
    this.#setSnapshot({
      state: 'connecting',
      error: null
    });
    try {
      let devices = (await hid.getDevices()).filter(isHero68ControlDevice);
      if (devices.length === 0 && !requestPermission) {
        this.#setSnapshot({
          state: 'disconnected',
          error: null
        });
        return false;
      }
      if (devices.length === 0 && requestPermission) {
        const requested = await hid.requestDevice({
          // Official AULA HUB asks by VID/PID (0x372e:0x103e wired + 0x372e:0x1000 / 0x106c wireless receivers),
          // and the WIN 68 HE MAX by 0x1c4f:0xee88 / 0x1ca2:0x1901.
          filters: HERO_USB_FILTERS.map(filter => ({
            vendorId: filter.vendorId,
            productId: filter.productId
          }))
        });
        devices = requested.filter(isHero68ControlDevice);
      }
      if (devices.length !== 1) {
        throw new Error(
          `Expected one authorized HERO68 control interface, found ${devices.length}.`
        );
      }
      const device = devices[0];
      // Refuse before opening anything: the MAX speaks a different command set,
      // so neither reading its UUID nor restoring defaults would be safe.
      if (isUnsupportedCommandSet(device)) {
        throw new Error(MAX_HE_UNSUPPORTED_MESSAGE);
      }
      if (typeof location !== 'undefined' && location.protocol.startsWith('http')) {
        const service = await rgbService.status().catch(() => null);
        if (service?.enabled) {
          await rgbService.stop();
        }
      }
      if (!device.opened) {
        await device.open();
      }
      device.addEventListener('inputreport', this.#onInputReport);
      this.#device = device;
      this.#isHero68Xs = /hero\s*68\s*xs/i.test(device.productName ?? '');
      // Ask the board itself so a stale or generic productName cannot select
      // the wrong model's key tables and overwrite the keyboard's settings.
      const fromUuid = await this.#readModelUuid();
      if (fromUuid === null) {
        throw new Error(
          'This keyboard did not report a supported OpenAula device UUID (HERO68, HERO84, HERO68 XS, WIN 68 MAX)'
        );
      }
      this.#setSnapshot({
        state: 'connected',
        detectedModel: fromUuid,
        detectedModelFromUuid: true,
        deviceName:
          this.#isHero68Xs && (!device.productName || device.productName.includes('Receiver'))
            ? 'AULA HERO 68 XS'
            : deviceDisplayName(device, fromUuid),
        isXs: this.#isHero68Xs,
        error: null
      });
      return true;
    } catch (error) {
      this.#device = undefined;
      this.#isHero68Xs = false;
      this.#setSnapshot({
        state: 'error',
        isXs: false,
        error: errorMessage(error)
      });
      throw error;
    }
  }
  async #readModelUuid(): Promise<HeroDeviceModelId | null> {
    try {
      const reply = await this.request(
        buildReport({
          command: 0x82,
          zone: 1
        }),
        0x82,
        1,
        600
      );
      const direct = detectHeroDeviceModelFromUuid(reply.data);
      if (direct) {
        if (reply.data && reply.data[5] === 0x10) {
          this.#isHero68Xs = true;
        }
        return direct;
      }
      if (isHeroReceiverProductId(this.#device?.productId) || isReceiverUuidPrefix(reply.data)) {
        const subReply = await this.request(
          buildReport({
            command: 0x82,
            zone: 0x09
          }),
          0x82,
          0x09,
          600
        );
        const subDirect = detectHeroDeviceModelFromUuid(subReply.data);
        if (subDirect) {
          if (subReply.data && subReply.data[5] === 0x10) {
            this.#isHero68Xs = true;
          }
          return subDirect;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Identify whether the connected keyboard is HERO68 (`0x110000000003` / `0x120000000010`) or
   * HERO84 (`0x110000000005` / `0x120000000015`) using `productName` or
   * CMD `0x82` zone `1` (`readDeviceUuid`) / zone `0x09` (`readSubDeviceInfo`).
   */
  async detectConnectedModel(): Promise<HeroDeviceModelId | null> {
    if (!this.connected) {
      return null;
    }
    // The device UUID is authoritative; a stale product name must not win.
    if (this.#snapshot.detectedModelFromUuid) {
      return this.#snapshot.detectedModel ?? null;
    }
    const fromDevice = this.#device ? inferModelFromHidDevice(this.#device) : null;
    if (fromDevice) {
      if (/hero\s*68\s*xs/i.test(this.#device?.productName ?? '')) {
        this.#isHero68Xs = true;
      }
      this.#setSnapshot({
        detectedModel: fromDevice,
        deviceName: deviceDisplayName(this.#device, fromDevice),
        isXs: this.#isHero68Xs
      });
      return fromDevice;
    }
    try {
      const fromUuid = await this.#readModelUuid();
      if (fromUuid) {
        // Keep a detailed productName ("AULA HERO 84 HE") instead of the generic
        // "AULA Hero84" label; this also runs on the service transport, where
        // `#device` is undefined.
        this.#setSnapshot({
          detectedModel: fromUuid,
          detectedModelFromUuid: true,
          deviceName:
            this.#isHero68Xs &&
            (!this.#device?.productName || this.#device.productName.includes('Receiver'))
              ? 'AULA HERO 68 XS'
              : deviceDisplayName(this.#device, fromUuid),
          isXs: this.#isHero68Xs
        });
        return fromUuid;
      }
    } catch {} /* Preserve existing model selection if UUID read is unsupported in a mock/fixture. */

    return null;
  }
  async disconnect(): Promise<void> {
    this.#viaService = false;
    this.#reconnectViaService = false;
    this.#isHero68Xs = false;
    const device = this.#device;
    this.#device = undefined;
    this.#rejectWaiters(new Error('HERO68 disconnected'));
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
      isXs: false,
      error: null
    });
  }

  /** Drain any queued WebHID control operations and switch ownership to the local service. */
  async handoffToService(): Promise<void> {
    if (this.#viaService) {
      return;
    }
    if (this.connected) {
      await this.disconnect();
    }
    await this.connectViaService();
  }

  /** Keep the same configuration transport while the service owns the HID handle. */
  async connectViaService(): Promise<void> {
    const device = this.#device;
    if (device) {
      device.removeEventListener('inputreport', this.#onInputReport);
      if (device.opened) {
        await device.close();
      }
      this.#device = undefined;
    }
    try {
      // Identity read verifies native helper access and returns the 6-byte deviceId UUID.
      // It is the only model source on this transport: without it the app would
      // write another model's key tables, so refuse instead of guessing.
      const identity = await rgbService.deviceRequest(
        buildReport({
          command: 0x82,
          zone: 1
        })
      );
      let isXsFromService = Boolean(identity?.data && identity.data[5] === 0x10);
      let detectedModel = detectHeroDeviceModelFromUuid(identity?.data);
      if (!detectedModel && isReceiverUuidPrefix(identity?.data)) {
        try {
          const subIdentity = await rgbService.deviceRequest(
            buildReport({
              command: 0x82,
              zone: 0x09
            })
          );
          if (subIdentity?.data && subIdentity.data[5] === 0x10) {
            isXsFromService = true;
          }
          detectedModel = detectHeroDeviceModelFromUuid(subIdentity?.data);
        } catch {}
      }
      if (!detectedModel) {
        throw new Error(
          'This keyboard did not report a supported OpenAula device UUID (HERO68, HERO84, HERO68 XS, WIN 68 MAX)'
        );
      }
      if (detectedModel === 'win68HeMax' || detectedModel === 'win68') {
        // WIN 68 HE MAX uses XsydDeviceManager for WebHID configuration; recognize
        // its bridge UUID (11000000005c / 12000000005c) without throwing.
        this.#viaService = false;
        this.#reconnectViaService = false;
        this.#isHero68Xs = false;
        this.#setSnapshot({
          state: 'disconnected',
          detectedModel: 'win68HeMax',
          detectedModelFromUuid: true,
          deviceName: heroDeviceModel('win68HeMax').label,
          isXs: false,
          error: null
        });
        return;
      }
      if (detectedModel === 'hero68' && !isXsFromService) {
        try {
          const rtPrecision = await rgbService.deviceRequest(
            buildReport({
              command: 0x82,
              zone: 6
            })
          );
          if (rtPrecision?.data?.[0] === 5) {
            isXsFromService = true;
          }
        } catch {}
      }
      this.#viaService = true;
      this.#reconnectViaService = false;
      this.#isHero68Xs = isXsFromService;
      this.#setSnapshot({
        state: 'connected',
        detectedModel,
        detectedModelFromUuid: true,
        deviceName: isXsFromService ? 'AULA HERO 68 XS' : heroDeviceModel(detectedModel).label,
        isXs: isXsFromService,
        error: null
      });
    } catch (error) {
      this.#viaService = false;
      this.#setSnapshot({
        state: 'error',
        error: errorMessage(error)
      });
      throw error;
    }
  }
  onReport(listener: (report: DecodedReport) => void): () => void {
    this.#reportListeners.add(listener);
    return () => {
      this.#reportListeners.delete(listener);
    };
  }
  onRawReport(listener: (report: Hero68RawInputReport) => void): () => void {
    this.#rawReportListeners.add(listener);
    return () => {
      this.#rawReportListeners.delete(listener);
    };
  }
  getCollectionDiagnostics(): Hero68HidCollectionDiagnostic[] {
    const result: Hero68HidCollectionDiagnostic[] = [];
    const visit = (collection: HIDCollectionInfoLike, path: string) => {
      result.push({
        path,
        usagePage: collection.usagePage ?? null,
        usage: collection.usage ?? null,
        type: collection.type ?? null,
        inputReportIds: (collection.inputReports ?? []).map(report => Number(report.reportId ?? 0)),
        outputReportIds: (collection.outputReports ?? []).map(report =>
          Number(report.reportId ?? 0)
        ),
        featureReportIds: (collection.featureReports ?? []).map(report =>
          Number(report.featureId ?? report.reportId ?? 0)
        )
      });
      (collection.children ?? []).forEach((child, index) => visit(child, `${path}.${index + 1}`));
    };
    (this.#device?.collections ?? []).forEach((collection, index) =>
      visit(collection, `C${index + 1}`)
    );
    return result;
  }
  async send(report: Uint8Array): Promise<void> {
    reportTrace.add('out', report[0] ?? 0, report);
    const device = this.#device;
    if (!this.#viaService && device && isUnsupportedCommandSet(device)) {
      throw new Error(MAX_HE_UNSUPPORTED_MESSAGE);
    }
    if (this.#viaService) {
      await rgbService.deviceRequest(report);
      return;
    }
    if (!device?.opened) {
      throw new Error('HERO68 is not connected');
    }
    if (report.length !== 64 || report[0] !== HERO68_REPORT_ID) {
      throw new Error('Expected a complete 64-byte HERO68 report with report ID 0x09');
    }
    await device.sendReport(HERO68_REPORT_ID, report.slice(1));
  }
  async sendReenumerating(report: Uint8Array, timeoutMs = 7000): Promise<void> {
    if (this.#viaService) {
      await rgbService.deviceRequest(report, true);
      return;
    }
    const hid = getHid();
    const previous = this.#device;
    if (!hid || !previous?.opened || !this.connected) {
      throw new Error('HERO68 is not connected');
    }
    let sendError: unknown = null;
    try {
      await this.send(report);
    } catch (error) {
      sendError = error;
    }
    this.#setSnapshot({
      state: 'connecting',
      error: null
    });
    const deadline = performance.now() + Math.max(500, timeoutMs);
    let sawTransition = this.#device !== previous || !previous.opened;
    while (performance.now() < deadline) {
      const devices = (await hid.getDevices()).filter(isHero68ControlDevice);
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
          candidate.removeEventListener('inputreport', this.#onInputReport);
          candidate.addEventListener('inputreport', this.#onInputReport);
          this.#device = candidate;
          const detectedModel = inferModelFromHidDevice(candidate) ?? this.#snapshot.detectedModel;
          this.#setSnapshot({
            state: 'connected',
            detectedModel,
            deviceName:
              candidate.productName ||
              (detectedModel ? heroDeviceModel(detectedModel).label : 'AULA Hero68'),
            error: null
          });
          return;
        } catch {} // Keep polling until the timeout.
      }

      await new Promise(resolve => window.setTimeout(resolve, 120));
    }
    if (this.#device?.opened) {
      this.#setSnapshot({
        state: 'connected',
        error: null
      });
      return;
    }
    const detail = sendError instanceof Error ? ` (${sendError.message})` : '';
    this.#setSnapshot({
      state: 'error',
      error: `HERO68 did not return after USB re-enumeration${detail}`
    });
    throw new Error(`HERO68 did not return after USB re-enumeration${detail}`);
  }
  async sendHex(hex: string): Promise<void> {
    const report = hexToBytes(hex);
    const decoded = decodeReport(report);
    const maxAttempts = [0x19, 0x16, 0x15].includes(decoded.command) ? 3 : 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.request(report, decoded.command, decoded.zone, 1000);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          await new Promise(resolve => window.setTimeout(resolve, 100));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
  async sendBatchHex(hexes: readonly string[]): Promise<void> {
    if (!this.#viaService) {
      for (const hex of hexes) {
        await this.sendHex(hex);
      }
      return;
    }
    const packets = hexes.map(hexToBytes);
    for (let i = 0; i < packets.length; i += 128) {
      await rgbService.deviceBatch(packets.slice(i, i + 128));
    }
  }
  async recoverControlChannel(): Promise<void> {
    return this.#queueControlOperation(async () => {
      if (!this.connected) {
        throw new Error('HERO68 is not connected');
      }
      if (this.#viaService) {
        return;
      }
      const device = this.#device!;
      device.removeEventListener('inputreport', this.#onInputReport);
      try {
        await device.close();
        if (this.#device !== device) {
          throw new Error('HERO68 disconnected');
        }
        await device.open();
        if (this.#device !== device) {
          throw new Error('HERO68 disconnected');
        }
        device.addEventListener('inputreport', this.#onInputReport);
        await this.#requestOnce(
          buildReport({
            command: 0x82,
            zone: 1
          }),
          0x82,
          1,
          1500
        );
      } finally {
        if (this.#device === device) {
          device.removeEventListener('inputreport', this.#onInputReport);
          if (device.opened) {
            device.addEventListener('inputreport', this.#onInputReport);
          } else {
            this.#setSnapshot({
              state: 'error',
              error: 'Could not reopen HERO68 HID interface'
            });
          }
        }
      }
    });
  }
  #queueControlOperation<T>(run: () => Promise<T>): Promise<T> {
    const work = () =>
      !this.#viaService && typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request('openhero68:hid-control', run)
        : run();
    const next = this.#requestTail.then(work);
    this.#requestTail = next.catch(() => {});
    return next;
  }
  async request(
    report: Uint8Array,
    expectedCommand: number,
    expectedZone?: number,
    timeoutMs = 800,
    predicate?: (report: DecodedReport) => boolean
  ): Promise<DecodedReport> {
    const work = async () => {
      const run = async () => {
        const selecting =
          report[1] === 0x10 && report[2] === 0 && report[6] === 1 && report[7] <= 2;
        for (let attempt = 0; ; attempt++) {
          try {
            return await this.#requestOnce(
              report,
              expectedCommand,
              expectedZone,
              timeoutMs,
              predicate
            );
          } catch (error) {
            if (!selecting || !/timed out|timeout/i.test(errorMessage(error))) {
              throw error;
            }
            try {
              const active = await this.#requestOnce(
                buildReport({
                  command: 0x90,
                  data: [0]
                }),
                0x90,
                0,
                timeoutMs
              );
              const verified = decodeReport(report);
              if (active.data[0] === report[7] && (!predicate || predicate(verified))) {
                return verified;
              }
            } catch {} /* Retry only the same profile selection. */
            if (attempt >= 2) {
              throw error;
            }
          }
        }
      };
      return run();
    };
    return this.#queueControlOperation(work);
  }
  async #requestOnce(
    report: Uint8Array,
    expectedCommand: number,
    expectedZone?: number,
    timeoutMs = 800,
    predicate?: (report: DecodedReport) => boolean
  ): Promise<DecodedReport> {
    // connect() asks for the UUID before the snapshot turns 'connected'.
    if (!this.#device?.opened && !this.#viaService) {
      throw new Error('HERO68 is not connected');
    }
    if (this.#viaService) {
      reportTrace.add('out', report[0] ?? 0, report);
      const reply = await rgbService.deviceRequest(report);
      reportTrace.add('in', reply.reportId, reply.raw);
      if (
        reply.command !== expectedCommand ||
        (expectedZone !== undefined && reply.zone !== expectedZone) ||
        (predicate && !predicate(reply))
      ) {
        throw Error('Unexpected service configuration reply');
      }
      this.#reportListeners.forEach(listener => listener(reply));
      return reply;
    }
    return new Promise<DecodedReport>((resolve, reject) => {
      const timeoutError = (stage: 'read' | 'send') => {
        const zoneText =
          expectedZone === undefined
            ? ''
            : `, zone=0x${expectedZone.toString(16).padStart(2, '0')}`;
        return new Error(
          `HERO68 ${stage} timed out (command=0x${expectedCommand.toString(16).padStart(2, '0')}${zoneText})`
        );
      };
      const waiter: ReportWaiter = {
        expectedCommand,
        expectedZone,
        predicate,
        resolve,
        reject,
        timer: window.setTimeout(
          () => {
            this.#waiters.delete(waiter);
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
      void this.send(report)
        .then(() => {
          if (!this.#waiters.has(waiter)) {
            return;
          }
          window.clearTimeout(waiter.timer);
          waiter.timer = window.setTimeout(
            () => {
              this.#waiters.delete(waiter);
              reject(timeoutError('read'));
            },
            Math.max(0, timeoutMs)
          );
        })
        .catch(error => {
          window.clearTimeout(waiter.timer);
          this.#waiters.delete(waiter);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }
  #rejectWaiters(error: Error) {
    for (const waiter of this.#waiters) {
      window.clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.#waiters.clear();
  }
  #onInputReport = (event: HIDInputReportEventLike): void => {
    const payload = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
    const raw: Hero68RawInputReport = {
      reportId: event.reportId,
      data: payload.slice(),
      timestampMs: typeof performance !== 'undefined' ? performance.now() : Date.now()
    };
    this.#rawReportListeners.forEach(listener => listener(raw));
    reportTrace.add('in', event.reportId, payload);
    if (event.reportId !== HERO68_REPORT_ID) {
      return;
    }
    try {
      const report = decodeReport(payload);
      if (!report.checksumValid) {
        return;
      }
      for (const waiter of this.#waiters) {
        if (report.command !== waiter.expectedCommand) {
          continue;
        }
        if (waiter.expectedZone !== undefined && report.zone !== waiter.expectedZone) {
          continue;
        }
        if (waiter.predicate && !waiter.predicate(report)) {
          continue;
        }
        window.clearTimeout(waiter.timer);
        this.#waiters.delete(waiter);
        waiter.resolve(report);
        break;
      }
      this.#reportListeners.forEach(listener => listener(report));
    } catch (error) {
      this.#setSnapshot({
        error: errorMessage(error)
      });
    }
  };
  #onHidDisconnect = (event: HIDConnectionEventLike): void => {
    if (!this.#device) {
      return;
    }
    if (event.device !== this.#device) {
      return;
    }
    this.#device.removeEventListener('inputreport', this.#onInputReport);
    this.#device = undefined;
    this.#rejectWaiters(new Error('HERO68 disconnected'));
    this.#setSnapshot({
      state: 'disconnected',
      detectedModel: null,
      detectedModelFromUuid: false,
      error: 'HERO68 was disconnected.'
    });
  };
}
export const hero68DeviceManager = new Hero68DeviceManager();
registerHero68Protocol(hero68ProtocolEncoder, hero68DeviceManager);
export function useHero68Device(): Hero68DeviceSnapshot {
  return useSyncExternalStore(
    hero68DeviceManager.subscribe,
    hero68DeviceManager.getSnapshot,
    hero68DeviceManager.getSnapshot
  );
}
