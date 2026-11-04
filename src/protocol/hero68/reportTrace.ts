// Record of the reports exchanged while an identified keyboard is configured,
// used to check OpenHero68's own packets against another implementation of the
// same protocol. Only reports the protocol already uses are kept, and the log
// is bounded so a long lighting session cannot grow without limit.

export type ReportTraceEntry = {
  at: number;
  direction: 'out' | 'in';
  hex: string;
};
const MAX_ENTRIES = 4000;
const KEPT_COMMANDS = new Set([0x03, 0x83, 0x04, 0x84, 0x82, 0x90, 0x92, 0x93, 0x95, 0x96, 0x99]);
export class ReportTrace {
  #entries: ReportTraceEntry[] = [];
  #listeners = new Set<() => void>();
  #startedAt = 0;
  #recording = false;
  #dropped = 0;
  get recording() {
    return this.#recording;
  }
  get count() {
    return this.#entries.length;
  }
  get dropped() {
    return this.#dropped;
  }
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  getSnapshot = () => ({
    recording: this.#recording,
    count: this.#entries.length,
    dropped: this.#dropped
  });
  start() {
    this.#entries = [];
    this.#dropped = 0;
    this.#startedAt = Date.now();
    this.#recording = true;
    this.#notify();
  }
  stop() {
    this.#recording = false;
    this.#notify();
  }
  add(direction: 'out' | 'in', reportId: number, bytes: Uint8Array) {
    if (!this.#recording || reportId !== 0x09 || bytes.length !== 64) {
      return;
    }
    if (!KEPT_COMMANDS.has(bytes[1])) {
      return;
    }
    if (this.#entries.length >= MAX_ENTRIES) {
      this.#dropped++;
      return;
    }
    this.#entries.push({
      at: Date.now() - this.#startedAt,
      direction,
      hex: Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
    });
    this.#notify();
  }
  export(endedAt = new Date()) {
    return {
      format: 'openhero68-trace',
      version: 1,
      startedAt: new Date(this.#startedAt).toISOString(),
      endedAt: endedAt.toISOString(),
      dropped: this.#dropped,
      entries: [...this.#entries]
    };
  }
  #notify() {
    this.#listeners.forEach(listener => listener());
  }
}
export const reportTrace = new ReportTrace();
