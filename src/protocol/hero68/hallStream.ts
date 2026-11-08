import { useSyncExternalStore } from 'react';
import {
  calibrationDistanceExit,
  calibrationDistanceStart,
  calibrationDistanceSync,
  readAutoCalibration,
  writeAutoCalibration,
} from './commands';
import { decodeDistanceCalibrationLive } from './codec';
import {
  HERO68_KEY_POSITIONS,
  HERO84_KEY_POSITIONS,
  keyIdToPos,
  posToKeyId,
} from './keyPositions';
import { hero68DeviceManager } from './webhid';
import {
  buildXsydHallPressedFrame,
  buildXsydHallTravelFrame,
  decodeXsydHallPressedReply,
  decodeXsydHallTravelReply,
  mergeXsydHallSamples,
  xsydDeviceManager,
  xsydMatrixIndexForKey,
  xsydMatrixIndexForKeyId,
  xsydTableIdsForKeys,
  type XsydHallTableId,
} from '../xsyd/device';
import { rgbService, type RgbServiceHallRecord } from '../rgbService';
import { HERO68_DISTANCE_UNIT_MM } from './precision';
import { runHallPolling } from './hallPolling';

/** The usable HERO68/HERO84 key travel tops out around 3.4 mm. Clamp the UI to 3.40 mm so full travel visually reaches 100%. */
export const HERO68_HALL_VISUAL_MAX_MM = 3.4 as const;
/** Target 200 Hz (5.0 ms period) Hall polling cadence on WIN 68 HE MAX (XSYD). */
export const XSYD_HALL_POLL_INTERVAL_MS = 5 as const;
export type HallStreamSource = 'direct-poll' | 'mode-poll';

export type HallStreamSample = {
  keyId: string;
  pos: number;
  distanceMm: number;
  visualDistanceMm: number;
  distanceUnits: number;
  rawAdc: number;
  pressed: boolean;
  releaseInferred: boolean;
  timestampMs: number;
};

export type HallStreamState = {
  active: boolean;
  starting: boolean;
  recovering: boolean;
  source: HallStreamSource;
  error: string | null;
  sampleCount: number;
  frameCount: number;
  telemetryHz: number | null;
  samples: Readonly<Record<string, HallStreamSample>>;
  keyTelemetryHz: Readonly<Record<string, number>>;
};

/**
 * Coordinates real-time Hall travel telemetry across two transport modes:
 * 1. Direct WebHID polling (`direct-poll` / `mode-poll`): issues `0x98/0x01` batches
 *    directly over the browser WebHID handle when the local service is not holding
 *    the device.
 * 2. Shared Background Service SSE (`rgbService.hallStream` when `viaService` is true):
 *    subscribes to `/hall/stream?keys=...` so Web UI visual feedback can coexist
 *    with active Custom RGB or Gamepad output without fighting over the USB handle.
 */
class Hero68HallStream {
  #state: HallStreamState = {
    active: false,
    starting: false,
    recovering: false,
    source: 'direct-poll',
    error: null,
    sampleCount: 0,
    frameCount: 0,
    telemetryHz: null,
    samples: {},
    keyTelemetryHz: {},
  };
  #listeners = new Set<() => void>();
  #unsubscribeReport: (() => void) | null = null;
  #unsubscribeDevice: (() => void) | null = null;
  #frameTimes: number[] = [];
  #keyFrameTimes = new Map<string, number[]>();
  #keyupHandler: ((event: KeyboardEvent) => void) | null = null;
  #keydownHandler: ((event: KeyboardEvent) => void) | null = null;
  #hostPressedKeys = new Set<string>();
  #sampleExpiryTimers = new Map<string, number>();
  #restoreAutoCalibration = false;
  #stage = 'idle';
  #requestedKeyIds: string[] = [];
  getRequestedKeys = () => [...this.#requestedKeyIds];
  #pollGeneration = 0;
  #pollPromise: Promise<void> | null = null;
  #notifyTimer: ReturnType<typeof setTimeout> | null = null;

  getSnapshot = (): HallStreamState => this.#state;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  #setState(next: Partial<HallStreamState>) {
    this.#state = {
      ...this.#state,
      ...next,
    };
    this.#listeners.forEach(listener => listener());
  }

  #publishSamples(next: Partial<HallStreamState>) {
    this.#state = {
      ...this.#state,
      ...next,
    };
    if (this.#notifyTimer !== null) {
      return;
    }
    this.#notifyTimer = setTimeout(() => {
      this.#notifyTimer = null;
      this.#listeners.forEach(listener => listener());
    }, 32);
  }

  #cleanupListeners() {
    if (this.#notifyTimer !== null) {
      clearTimeout(this.#notifyTimer);
      this.#notifyTimer = null;
    }
    this.#unsubscribeReport?.();
    this.#unsubscribeReport = null;
    this.#unsubscribeDevice?.();
    this.#unsubscribeDevice = null;
    if (typeof window !== 'undefined') {
      if (this.#keyupHandler) {
        window.removeEventListener('keyup', this.#keyupHandler, true);
      }
      if (this.#keydownHandler) {
        window.removeEventListener('keydown', this.#keydownHandler, true);
      }
      for (const timer of this.#sampleExpiryTimers.values()) {
        window.clearTimeout(timer);
      }
    }
    this.#keyupHandler = null;
    this.#keydownHandler = null;
    this.#hostPressedKeys.clear();
    this.#sampleExpiryTimers.clear();
  }

  #installHostKeyFallback() {
    if (typeof window === 'undefined') {
      return;
    }
    this.#keydownHandler = (event: KeyboardEvent) => {
      try {
        keyIdToPos(event.code);
      } catch {
        return;
      }
      this.#hostPressedKeys.add(event.code);
    };
    this.#keyupHandler = (event: KeyboardEvent) => {
      try {
        keyIdToPos(event.code);
      } catch {
        return;
      }
      this.#hostPressedKeys.delete(event.code);
      const sample = this.#state.samples[event.code];
      if (!sample || (!sample.pressed && sample.visualDistanceMm === 0)) {
        return;
      }
      const released: HallStreamSample = {
        ...sample,
        visualDistanceMm: 0,
        pressed: false,
        releaseInferred: true,
        timestampMs: performance.now(),
      };
      this.#setState({
        samples: {
          ...this.#state.samples,
          [event.code]: released,
        },
      });
      this.#scheduleSampleExpiry(event.code, 450);
    };
    window.addEventListener('keydown', this.#keydownHandler, true);
    window.addEventListener('keyup', this.#keyupHandler, true);
  }

  #recordFrameTime(now: number): number | null {
    this.#frameTimes.push(now);
    if (this.#frameTimes.length > 24) {
      this.#frameTimes.shift();
    }
    if (this.#frameTimes.length < 3) {
      return null;
    }
    const intervals: number[] = [];
    for (let index = 1; index < this.#frameTimes.length; index += 1) {
      const delta = this.#frameTimes[index] - this.#frameTimes[index - 1];
      if (delta > 0 && delta < 1000) {
        intervals.push(delta);
      }
    }
    if (intervals.length === 0) {
      return null;
    }
    intervals.sort((a, b) => a - b);
    const mid = Math.floor(intervals.length / 2);
    const median =
      intervals.length % 2 ? intervals[mid] : (intervals[mid - 1] + intervals[mid]) / 2;
    return median > 0 ? 1000 / median : null;
  }

  #recordKeyFrameTime(keyId: string, now: number): number | null {
    const times = this.#keyFrameTimes.get(keyId) ?? [];
    times.push(now);
    while (times.length > 32) {
      times.shift();
    }
    while (times.length > 2 && now - times[0] > 2500) {
      times.shift();
    }
    this.#keyFrameTimes.set(keyId, times);
    if (times.length < 2) {
      return null;
    }
    const elapsed = times[times.length - 1] - times[0];
    return elapsed > 0 ? ((times.length - 1) * 1000) / elapsed : null;
  }

  #scheduleSampleExpiry(keyId: string, delayMs = 900) {
    if (typeof window === 'undefined') {
      return;
    }
    const previous = this.#sampleExpiryTimers.get(keyId);
    if (previous) {
      window.clearTimeout(previous);
    }
    const timer = window.setTimeout(() => {
      this.#sampleExpiryTimers.delete(keyId);
      const sample = this.#state.samples[keyId];
      if (!sample || sample.pressed || (!sample.releaseInferred && sample.visualDistanceMm > 0)) {
        return;
      }
      const next = {
        ...this.#state.samples,
      };
      delete next[keyId];
      this.#setState({
        samples: next,
      });
    }, delayMs);
    this.#sampleExpiryTimers.set(keyId, timer);
  }

  #cancelSampleExpiry(keyId: string) {
    if (typeof window === 'undefined') {
      return;
    }
    const previous = this.#sampleExpiryTimers.get(keyId);
    if (!previous) {
      return;
    }
    window.clearTimeout(previous);
    this.#sampleExpiryTimers.delete(keyId);
  }

  #ingestRecords(
    records: readonly {
      keyId: number;
      keyCode?: string;
      distanceUnits: number;
      adc: number;
      pressed: boolean;
    }[],
  ) {
    if (records.length === 0) {
      return;
    }
    const timestampMs = performance.now();
    const telemetryHz = this.#recordFrameTime(timestampMs);
    const next = {
      ...this.#state.samples,
    };
    const keyTelemetryHz = {
      ...this.#state.keyTelemetryHz,
    };
    let added = 0;
    for (const record of records) {
      const keyId = record.keyCode ?? posToKeyId(record.keyId);
      if (!keyId) {
        continue;
      }
      const previous = this.#state.samples[keyId];
      const keyHz = this.#recordKeyFrameTime(keyId, timestampMs);
      if (keyHz !== null) {
        keyTelemetryHz[keyId] = keyHz;
      }
      const distanceMm = record.distanceUnits * HERO68_DISTANCE_UNIT_MM;
      const moved =
        !previous ||
        previous.distanceUnits !== record.distanceUnits ||
        previous.pressed !== record.pressed;
      const hallAtRest = !record.pressed && distanceMm <= 0.08;
      next[keyId] = {
        keyId,
        pos: record.keyId,
        distanceMm,
        visualDistanceMm: hallAtRest ? 0 : Math.min(distanceMm, HERO68_HALL_VISUAL_MAX_MM),
        distanceUnits: record.distanceUnits,
        rawAdc: record.adc,
        pressed: record.pressed,
        releaseInferred: false,
        timestampMs: moved ? timestampMs : previous.timestampMs,
      };
      if (record.pressed || !hallAtRest) {
        this.#cancelSampleExpiry(keyId);
      } else {
        this.#scheduleSampleExpiry(keyId, 450);
      }
      added += 1;
    }
    if (added) {
      this.#publishSamples({
        samples: next,
        sampleCount: this.#state.sampleCount + added,
        frameCount: this.#state.frameCount + 1,
        telemetryHz,
        keyTelemetryHz,
      });
    }
  }

  #installDistanceReportHandler() {
    this.#unsubscribeReport = hero68DeviceManager.onReport(report => {
      if (report.command !== 0x98 || report.zone !== 1) {
        return;
      }
      this.#ingestRecords(decodeDistanceCalibrationLive(report.data));
    });
  }

  #installDeviceWatcher(useXsyd = false) {
    const manager = useXsyd ? xsydDeviceManager : hero68DeviceManager;
    const label = useXsyd ? 'WIN 68 HE MAX' : 'HERO68';
    this.#unsubscribeDevice = manager.subscribe(() => {
      const snapshot = manager.getSnapshot();
      if (snapshot.state === 'connected' || (!this.#state.active && !this.#state.starting)) {
        return;
      }
      ++this.#pollGeneration;
      this.#cleanupListeners();
      const disconnectMessage =
        snapshot.state === 'disconnected'
          ? `${label} USB interface disconnected during Hall Stream (${this.#stage}).`
          : snapshot.error;
      this.#setState({
        active: false,
        starting: false,
        recovering: false,
        samples: this.#zeroVisualSamples(),
        telemetryHz: null,
        keyTelemetryHz: {},
        error: disconnectMessage,
      });
    });
  }

  #reportMatchesBatch(
    report: import('./types').DecodedReport,
    positions: readonly number[],
  ): boolean {
    if (report.command !== 0x98 || report.zone !== 1) {
      return false;
    }
    if (report.data.length !== positions.length * 6) {
      return false;
    }
    for (let index = 0; index < positions.length; index += 1) {
      const offset = index * 6;
      const pos = (report.data[offset] << 8) | report.data[offset + 1];
      if (pos !== positions[index]) {
        return false;
      }
    }
    return true;
  }

  async #runFirmwarePolling(generation: number, positions: readonly number[]): Promise<void> {
    const requestBatch = (batch: readonly number[]) => {
      const packet = calibrationDistanceSync(batch);
      return hero68DeviceManager.request(packet, 0x98, 1, 650, report =>
        this.#reportMatchesBatch(report, batch),
      );
    };

    await runHallPolling({
      positions,
      isActive: () => generation === this.#pollGeneration && hero68DeviceManager.connected,
      requestBatch,
      delay: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
      recover: () => hero68DeviceManager.recoverControlChannel(),
      onRecovering: recovering => {
        if (generation !== this.#pollGeneration || !hero68DeviceManager.connected) {
          return;
        }
        if (recovering) {
          this.#frameTimes = [];
          this.#keyFrameTimes.clear();
          this.#setState({
            recovering,
            samples: this.#zeroVisualSamples(),
            telemetryHz: null,
            keyTelemetryHz: {},
          });
        } else {
          this.#setState({
            recovering,
          });
        }
      },
    });
  }

  #selectNextXsydTable(
    tables: readonly XsydHallTableId[],
    stepIndex: number,
    travelCache: ReadonlyMap<number, number>,
  ): XsydHallTableId {
    if (tables.length === 1) {
      return tables[0]!;
    }
    let table1Active = false;
    let table2Active = false;
    for (const [idx, um] of travelCache) {
      if (um > 80) {
        if (idx < 63) {
          table1Active = true;
        } else {
          table2Active = true;
        }
      }
    }
    for (const keyId of this.#hostPressedKeys) {
      const idx = xsydMatrixIndexForKeyId(keyId);
      if (idx === undefined) continue;
      if (idx < 63) {
        table1Active = true;
      } else {
        table2Active = true;
      }
    }
    // When only one half-matrix has depressed keys, dedicate 3 out of 4 polls
    // to that active table and scan the idle half every 4th tick.
    if (table1Active && !table2Active) {
      return stepIndex % 4 === 3 ? 2 : 1;
    }
    if (table2Active && !table1Active) {
      return stepIndex % 4 === 3 ? 1 : 2;
    }
    return tables[stepIndex % tables.length]!;
  }

  /**
   * High-frequency 200 Hz (`5.0 ms` period) Hall polling loop for WIN 68 HE MAX (`XSYD 0x5C`).
   *
   * Optimization over the legacy ~68 Hz loop:
   * 1. Queries `0x12` subcmd `0x03` (`buildXsydHallPressedFrame`) only once on stream start
   *    (`stepIndex === 0`) to seed `pressedByMatrixIndex`. Subsequent ticks issue a single
   *    `0x12` subcmd `0x02` (`buildXsydHallTravelFrame`) round-trip (`1 OUT + 3 IN` ≈ `2.0 ms`)
   *    and update `pressedByMatrixIndex` via travel hysteresis (`<= 80 µm` release, `>= 150 µm`
   *    or OS keydown press), cutting USB traffic in half.
   * 2. Prioritizes the active half-matrix table 3:1 when keys are depressed in one table.
   * 3. Uses a `MessageChannel`-backed 5.0 ms deadline pacer to bypass Chromium's 4 ms nested
   *    `setTimeout` clamp and achieve a rock-solid 200 Hz stream rate.
   */
  async #runXsydPolling(generation: number, requestedKeyIds: readonly string[]): Promise<void> {
    const keyIdSet = requestedKeyIds.length > 0 ? new Set(requestedKeyIds) : undefined;
    const tables = xsydTableIdsForKeys(requestedKeyIds);
    const travelCache = new Map<number, number>();
    const pressedByMatrixIndex = new Map<number, boolean>();
    let stepIndex = 0;
    let consecutiveFailures = 0;

    const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
    const yieldImmediate = (): Promise<void> => {
      if (!channel) {
        return new Promise(resolve => setTimeout(resolve, 0));
      }
      return new Promise(resolve => {
        channel.port1.onmessage = () => resolve();
        channel.port2.postMessage(null);
      });
    };
    const paceToDeadline = async (deadlineMs: number): Promise<void> => {
      const now = performance.now();
      const remaining = deadlineMs - now;
      if (remaining <= 0) {
        await yieldImmediate();
        return;
      }
      if (remaining > 4.5) {
        await new Promise(resolve => setTimeout(resolve, Math.max(1, Math.floor(remaining - 1.5))));
      }
      while (
        generation === this.#pollGeneration &&
        xsydDeviceManager.connected &&
        performance.now() < deadlineMs
      ) {
        await yieldImmediate();
      }
    };

    try {
      let nextTickAt = performance.now();
      while (generation === this.#pollGeneration && xsydDeviceManager.connected) {
        const isInitialSeed = stepIndex === 0;
        const pollTables: readonly XsydHallTableId[] = isInitialSeed
          ? tables
          : [this.#selectNextXsydTable(tables, stepIndex, travelCache)];
        stepIndex += 1;
        nextTickAt += XSYD_HALL_POLL_INTERVAL_MS;

        try {
          if (isInitialSeed) {
            const pressedReply = await xsydDeviceManager.request(buildXsydHallPressedFrame(), 300);
            if (generation !== this.#pollGeneration || !xsydDeviceManager.connected) {
              return;
            }
            for (const [idx, isPressed] of decodeXsydHallPressedReply(pressedReply)) {
              pressedByMatrixIndex.set(idx, isPressed);
            }
          }

          let tableTravel = travelCache;
          for (const tableId of pollTables) {
            const travelReply = await xsydDeviceManager.request(
              buildXsydHallTravelFrame(tableId),
              300,
            );
            if (generation !== this.#pollGeneration || !xsydDeviceManager.connected) {
              return;
            }
            tableTravel = decodeXsydHallTravelReply(travelReply, tableId);
            for (const [idx, um] of tableTravel) {
              travelCache.set(idx, um);
              if (!isInitialSeed) {
                if (um <= 80) {
                  pressedByMatrixIndex.set(idx, false);
                } else if (um >= 150) {
                  pressedByMatrixIndex.set(idx, true);
                }
              }
            }
          }

          if (consecutiveFailures > 0) {
            consecutiveFailures = 0;
            if (this.#state.recovering) {
              this.#setState({ recovering: false });
            }
          }

          const samples = mergeXsydHallSamples({
            travelByMatrixIndex: tables.length === 1 ? tableTravel : travelCache,
            pressedByMatrixIndex,
            keyIds: keyIdSet,
          });
          this.#ingestRecords(
            samples.map(sample => ({
              keyId: sample.pos,
              keyCode: sample.keyId,
              distanceUnits: sample.distanceUnits,
              adc: sample.rawAdc,
              pressed: sample.pressed || this.#hostPressedKeys.has(sample.keyId),
            })),
          );
        } catch (error) {
          if (generation !== this.#pollGeneration || !xsydDeviceManager.connected) {
            return;
          }
          consecutiveFailures += 1;
          if (consecutiveFailures >= 6) {
            throw error;
          }
          if (!this.#state.recovering) {
            this.#setState({ recovering: true });
          }
        }

        const now = performance.now();
        if (nextTickAt < now) {
          nextTickAt = now;
        }
        await paceToDeadline(nextTickAt);
      }
    } finally {
      if (channel) {
        channel.port1.onmessage = null;
        channel.port1.close();
        channel.port2.close();
      }
    }
  }

  async start(
    preferredKeyIds: Iterable<string> = [],
    source: HallStreamSource = 'direct-poll',
    modelKeyIds?: readonly string[],
  ): Promise<void> {
    if (this.#state.active || this.#state.starting) {
      return;
    }
    if (this.#pollPromise) {
      await this.#pollPromise;
    }
    if (this.#state.active || this.#state.starting) {
      return;
    }
    const useXsyd = xsydDeviceManager.connected && !hero68DeviceManager.connected;
    if (!hero68DeviceManager.connected && !useXsyd) {
      throw new Error('Connect HERO68 before starting Hall Stream');
    }

    const requestedIds = Array.from(preferredKeyIds);
    this.#requestedKeyIds = [...requestedIds];
    const preferredPositions: number[] = [];
    const seenPositions = new Set<number>();
    for (const keyId of requestedIds) {
      const pos = HERO84_KEY_POSITIONS[keyId];
      if (pos === undefined || seenPositions.has(pos)) {
        continue;
      }
      seenPositions.add(pos);
      preferredPositions.push(pos);
    }

    let defaultPositionMap: Readonly<Record<string, number>>;
    if (modelKeyIds) {
      const entries = modelKeyIds
        .filter(id => HERO84_KEY_POSITIONS[id] !== undefined)
        .map(id => [id, HERO84_KEY_POSITIONS[id]] as const);
      defaultPositionMap = Object.fromEntries(entries);
    } else if (hero68DeviceManager.getSnapshot().detectedModel === 'hero84') {
      defaultPositionMap = HERO84_KEY_POSITIONS;
    } else {
      defaultPositionMap = HERO68_KEY_POSITIONS;
    }

    const pollingPositions =
      preferredPositions.length > 0 ? preferredPositions : Object.values(defaultPositionMap);
    const viaService = !useXsyd && hero68DeviceManager.viaService;
    if (viaService) {
      const status = await rgbService.status();
      if ((status.apiVersion ?? 0) < 4) {
        throw Error('Update RGB service to share Hall samples with the web.');
      }
      if (source !== 'direct-poll') {
        throw Error('Service Hall stream uses direct polling only.');
      }
    }

    if (this.#restoreAutoCalibration) {
      this.#stage = 'restore-auto-calibration-after-reconnect';
      await this.#restoreAutoCalibrationIfNeeded();
    }

    this.#stage = 'prepare';
    this.#cleanupListeners();
    this.#frameTimes = [];
    this.#keyFrameTimes.clear();
    this.#setState({
      source,
      starting: true,
      recovering: false,
      error: null,
      samples: {},
      sampleCount: 0,
      frameCount: 0,
      telemetryHz: null,
      keyTelemetryHz: {},
    });
    this.#installHostKeyFallback();
    this.#installDeviceWatcher(useXsyd);
    if (!viaService && !useXsyd) {
      this.#installDistanceReportHandler();
    }

    try {
      if (source !== 'direct-poll' && !viaService && !useXsyd) {
        this.#stage = 'read-auto-calibration';
        const autoCalibration = await hero68DeviceManager.request(
          readAutoCalibration(),
          0x84,
          25,
          1000,
        );
        this.#restoreAutoCalibration = (autoCalibration.data[0] ?? 0) !== 0;
        if (this.#restoreAutoCalibration) {
          this.#stage = 'disable-auto-calibration';
          await hero68DeviceManager.request(writeAutoCalibration(false), 0x04, 25, 1000);
        }
        this.#stage = 'start-0x98-await-ack';
        await hero68DeviceManager.request(calibrationDistanceStart(), 0x98, 0, 1000);
      }

      this.#stage = `${source}-streaming`;
      this.#setState({
        active: true,
        starting: false,
        error: null,
      });

      if (viaService) {
        const streamKeyIds = preferredPositions.length
          ? requestedIds.filter(id => HERO84_KEY_POSITIONS[id] !== undefined)
          : Object.keys(defaultPositionMap);
        const onServiceRecords = (records: RgbServiceHallRecord[]) => {
          const normalized = records.map(record => ({
            keyId: record.pos,
            distanceUnits: record.distanceUnits,
            adc: record.adc,
            pressed: record.pressed,
          }));
          this.#ingestRecords(normalized);
        };
        this.#unsubscribeReport = rgbService.hallStream(streamKeyIds, onServiceRecords, () => {
          this.#cleanupListeners();
          this.#setState({
            active: false,
            starting: false,
            recovering: false,
            samples: this.#zeroVisualSamples(),
            error: 'Service Hall stream disconnected',
            telemetryHz: null,
            keyTelemetryHz: {},
          });
        });
      } else if (useXsyd) {
        const generation = ++this.#pollGeneration;
        this.#pollPromise = this.#runXsydPolling(generation, requestedIds).catch(error => {
          if (generation !== this.#pollGeneration) {
            return;
          }
          const message = error instanceof Error ? error.message : String(error);
          this.#cleanupListeners();
          this.#setState({
            active: false,
            starting: false,
            recovering: false,
            error: `Hall polling stopped: ${message}. Close other keyboard apps or tabs, reconnect WIN 68 HE MAX, then start again.`,
            samples: this.#zeroVisualSamples(),
            telemetryHz: null,
            keyTelemetryHz: {},
          });
        });
      } else if (source === 'direct-poll' || source === 'mode-poll') {
        const generation = ++this.#pollGeneration;
        this.#pollPromise = this.#runFirmwarePolling(generation, pollingPositions).catch(
          async error => {
            if (generation !== this.#pollGeneration) {
              return;
            }
            const message = error instanceof Error ? error.message : String(error);
            this.#cleanupListeners();
            this.#setState({
              active: false,
              starting: false,
              recovering: false,
              error: `Hall polling stopped: ${message}. Close other keyboard apps or tabs, reconnect HERO68, then start again.`,
              samples: this.#zeroVisualSamples(),
              telemetryHz: null,
              keyTelemetryHz: {},
            });
            if (hero68DeviceManager.connected && source !== 'direct-poll') {
              try {
                await hero68DeviceManager.request(calibrationDistanceExit(), 0x98, 2, 1000);
              } catch {
                /* best effort */
              }
            }

            try {
              await this.#restoreAutoCalibrationIfNeeded();
            } catch {
              /* retry on the next start */
            }
          },
        );
      }
    } catch (error) {
      if (hero68DeviceManager.connected) {
        if (source !== 'direct-poll') {
          try {
            await hero68DeviceManager.request(calibrationDistanceExit(), 0x98, 2, 1000);
          } catch {
            /* best effort */
          }
        }

        try {
          await this.#restoreAutoCalibrationIfNeeded();
        } catch {
          /* best effort */
        }
      }

      this.#cleanupListeners();
      const snapshot = hero68DeviceManager.getSnapshot();
      const errorText = error instanceof Error ? error.message : String(error);
      const message =
        snapshot.state === 'disconnected'
          ? `HERO68 USB interface disconnected during Hall Stream (${this.#stage}).`
          : errorText;
      this.#setState({
        active: false,
        starting: false,
        recovering: false,
        error: message,
      });
      throw new Error(message);
    }
  }

  async #restoreAutoCalibrationIfNeeded(): Promise<void> {
    if (!this.#restoreAutoCalibration || !hero68DeviceManager.connected) {
      return;
    }
    this.#stage = 'restore-auto-calibration';
    await hero68DeviceManager.request(writeAutoCalibration(true), 0x04, 25, 1000);
    this.#restoreAutoCalibration = false;
  }

  #zeroVisualSamples(): Record<string, HallStreamSample> {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return Object.fromEntries(
      Object.entries(this.#state.samples).map(([keyId, sample]) => [
        keyId,
        {
          ...sample,
          distanceMm: 0,
          visualDistanceMm: 0,
          distanceUnits: 0,
          rawAdc: 0,
          pressed: false,
          releaseInferred: false,
          timestampMs: now,
        },
      ]),
    );
  }

  async stop(): Promise<void> {
    if (!this.#state.active && !this.#state.starting) {
      return;
    }
    this.#setState({
      samples: this.#zeroVisualSamples(),
      keyTelemetryHz: {},
      telemetryHz: null,
    });
    ++this.#pollGeneration;
    const pollPromise = this.#pollPromise;
    this.#pollPromise = null;
    if (pollPromise) {
      try {
        await pollPromise;
      } catch {
        /* polling errors are surfaced in state */
      }
    }

    try {
      if (
        hero68DeviceManager.connected &&
        this.#state.source !== 'direct-poll' &&
        !hero68DeviceManager.viaService
      ) {
        this.#stage = 'exit-0x98-await-ack';
        await hero68DeviceManager.request(calibrationDistanceExit(), 0x98, 2, 1000);
      }
    } finally {
      try {
        await this.#restoreAutoCalibrationIfNeeded();
      } finally {
        this.#cleanupListeners();
        this.#setState({
          active: false,
          starting: false,
          recovering: false,
          samples: this.#zeroVisualSamples(),
          keyTelemetryHz: {},
          telemetryHz: null,
        });
        this.#stage = 'idle';
      }
    }
  }
}

export const hero68HallStream = new Hero68HallStream();

export function useHero68HallStream(): HallStreamState {
  return useSyncExternalStore(
    hero68HallStream.subscribe,
    hero68HallStream.getSnapshot,
    hero68HallStream.getSnapshot,
  );
}

export { xsydDeviceManager };
export type Hero68HallStreamState = HallStreamState;
