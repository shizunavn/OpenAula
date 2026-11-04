import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { HallKeyMetric } from '../../src/protocol/gamepadService';
import { decodeReport } from '../../src/protocol/hero68/codec';
import type { ServiceContext } from '../context';
import { decodeHero68Input } from '../keyInput';
import { profileRequest } from '../profileSelection';
import { nativeRhythmCommand, type RhythmConfiguration } from '../rhythm';

export type NativeBridgeHandlers = {
  onGamepadInput: (payload: any) => void;
  onHallSnapshot: (payload: any) => void;
  onPowerOrHallRecovery: () => void;
  onHallErrorRecovery: () => void;
  onGamepadStatusChanged: () => void;
  onCustomTick: () => void;
  onCustomFrame: (payload: any) => void;
  onRhythmFrame: (payload: any) => void;
  onRgbKey: (keyId: string, pressed: boolean) => void;
  onGamepadToggleInput: (keyId: string, pressed: boolean) => void;
  publishFrame: (value: unknown) => void;
  publishGamepad: () => void;
  onFatalExit: (exitCode: number) => void;
};

export class NativeBridge {
  // Downloaded cores live in the state folder; the supervisor retains the
  // installed app folder as cwd, where its compatible native helper resides.
  private readonly process: ReturnType<typeof spawn>;
  private readonly ctx: ServiceContext;
  private readonly binaryDir: string;
  private readonly handlers: NativeBridgeHandlers;

  private pending: {
    resolve: (v: string) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  private gone = false;

  constructor(
    ctx: ServiceContext,
    binaryDir: string,
    handlers: NativeBridgeHandlers,
  ) {
    this.ctx = ctx;
    this.binaryDir = binaryDir;
    this.handlers = handlers;
    this.process = spawn(
      existsSync(path.join(binaryDir, 'hid-bridge.exe'))
        ? path.join(binaryDir, 'hid-bridge.exe')
        : path.join(process.cwd(), 'hid-bridge.exe'),
      [],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    createInterface({
      input: this.process.stdout,
    }).on('line', line => {
      if (line.startsWith('gamepad-input:')) {
        try {
          this.handlers.onGamepadInput(JSON.parse(line.slice(14)));
        } catch (ignoredError) {
          /* Ignored non-fatal error. */
          void ignoredError;
        }
        return;
      }
      if (line.startsWith('hall-snapshot:')) {
        try {
          this.handlers.onHallSnapshot(JSON.parse(line.slice(14)));
        } catch (ignoredError) {
          /* Ignored non-fatal error. */
          void ignoredError;
        }
        return;
      }
      if (line.startsWith('hall-stats:')) {
        try {
          const v = JSON.parse(line.slice(11));
          this.ctx.hallMetrics = {
            ...v,
            keys: v.keys.map((k: HallKeyMetric) => ({
              ...k,
              keyId: this.ctx.keyByPosition.get(k.pos) ?? '',
            })),
          };
        } catch (ignoredError) {
          /* Ignored non-fatal error. */
          void ignoredError;
        }
        return;
      }
      if (line.startsWith('bridge-stats:')) {
        try {
          this.ctx.bridgeIpc = JSON.parse(line.slice(13));
        } catch (ignoredError) {
          /* Ignored non-fatal error. */
          void ignoredError;
        }
        return;
      }
      if (line === 'power:suspend' || line === 'power:resume') {
        this.handlers.onPowerOrHallRecovery();
        return;
      }
      if (line.startsWith('hall-error:')) {
        this.ctx.hallSamples.clear();
        this.ctx.hallReceivedAt.clear();
        this.ctx.lastError = line.slice(11);
        this.ctx.timeouts++;
        this.handlers.onHallErrorRecovery();
        return;
      }
      if (line.startsWith('gamepad-status:')) {
        try {
          const enabled = this.ctx.gamepadState.enabled;
          this.ctx.gamepadState = JSON.parse(line.slice(15));
          if (enabled !== this.ctx.gamepadState.enabled) {
            this.handlers.onGamepadStatusChanged();
          }
          this.handlers.publishGamepad();
        } catch (ignoredError) {
          /* Ignored non-fatal error. */
          void ignoredError;
        }
        return;
      }
      if (line === 'custom-tick:') {
        this.handlers.onCustomTick();
        return;
      }
      if (line.startsWith('custom-frame:')) {
        try {
          this.handlers.onCustomFrame(JSON.parse(line.slice(13)));
        } catch (ignoredError) {
          /* Ignored non-fatal error. */
          void ignoredError;
        }
        return;
      }
      if (line.startsWith('custom-error:')) {
        if (this.ctx.mode === 'custom') {
          this.ctx.connected = false;
          this.ctx.lastError = line.slice(13);
          this.ctx.timeouts++;
          this.handlers.publishFrame({
            enabled: true,
            connected: false,
            sessionId: this.ctx.sessionId,
          });
        }
        return;
      }
      if (line.startsWith('rhythm-frame:')) {
        try {
          this.handlers.onRhythmFrame(JSON.parse(line.slice(13)));
        } catch (ignoredError) {
          /* Ignored non-fatal error. */
          void ignoredError;
        }
        return;
      }
      if (line.startsWith('rhythm-error:')) {
        if (this.ctx.mode === 'rhythm') {
          this.ctx.connected = false;
          this.ctx.lastError = line.slice(13);
          this.ctx.timeouts++;
          this.handlers.publishFrame({
            enabled: true,
            connected: false,
            sessionId: this.ctx.sessionId,
          });
        }
        return;
      }
      if (line === 'raw:ready' || line === 'raw:unavailable') {
        this.ctx.rawInputReady = line === 'raw:ready';
        return;
      }
      if (line.startsWith('key:')) {
        const input = decodeHero68Input(line);
        if (input) {
          this.handlers.onRgbKey(input.id, input.pressed);
          this.handlers.onGamepadToggleInput(input.id, input.pressed);
        }
        return;
      }
      const p = this.pending;
      if (p) {
        this.pending = null;
        clearTimeout(p.timer);
        p.resolve(line);
      }
    });

    this.process.stderr.on('data', data => this.ctx.log(`bridge: ${data}`));
    this.process.on('error', e => this.fail(e));
    this.process.on('exit', () => this.fail(Error('Native HID bridge exited')));
  }

  private fail(e: Error) {
    if (this.gone) {
      return;
    }
    this.gone = true;
    this.ctx.gamepadState = {
      ...this.ctx.gamepadState,
      enabled: false,
      armed: false,
      stale: true,
      error: e.message,
      report: {
        buttons: 0,
        lx: 0,
        ly: 0,
        rx: 0,
        ry: 0,
        lt: 0,
        rt: 0,
      },
    };
    this.ctx.hallSamples.clear();
    this.ctx.hallReceivedAt.clear();
    this.handlers.publishGamepad();
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(e);
      this.pending = null;
    }
    if (!this.ctx.closing) {
      setImmediate(() => this.handlers.onFatalExit(1));
    }
  }

  async line(value: string) {
    if (this.gone) {
      throw Error('Native HID bridge unavailable; restart service');
    }
    if (this.pending) {
      throw Error('Concurrent HID operation');
    }
    return new Promise<string>((resolve, reject) => {
      // A cold Xbox device can need Windows driver enumeration beyond ViGEm's
      // one-second ready wait. Ordinary HID commands retain their short watchdog.
      const timeout = value === 'gamepad-start' || value === 'gamepad-start-paused' ? 15000 : 2000;
      const timer = setTimeout(() => {
        this.fail(Error('Native HID bridge stalled'));
        this.process.kill();
      }, timeout);
      this.pending = {
        resolve,
        reject,
        timer,
      };
      this.process.stdin.write(value + '\n', e => {
        if (e) {
          this.fail(e);
        }
      });
    });
  }

  async request(packet: Uint8Array, sendOnly = false) {
    return profileRequest(packet, nextPacket => this.requestOnce(nextPacket, sendOnly));
  }

  private async requestOnce(packet: Uint8Array, sendOnly = false) {
    const result = await this.line((sendOnly ? 'send:' : '') + Buffer.from(packet).toString('hex'));
    if (result.startsWith('error:')) {
      throw Error(result.slice(6));
    }
    if (!/^[0-9a-f]{128}$/.test(result)) {
      throw Error('Invalid bridge response');
    }
    const reply = decodeReport(Uint8Array.from(Buffer.from(result, 'hex')));
    if (!reply.checksumValid || reply.command !== packet[1] || reply.zone !== packet[2]) {
      throw Error('Unexpected HID response');
    }
    this.ctx.packets++;
    return reply;
  }

  async startCustom() {
    const result = await this.line('custom-start');
    if (result !== 'custom-ready') {
      throw Error('Native custom scheduler did not start');
    }
    this.ctx.customDelivery.reset();
  }

  async stopCustom() {
    const result = await this.line('custom-stop');
    if (result !== 'custom-stopped') {
      throw Error('Native custom scheduler did not stop');
    }
  }

  async queueFrame(id: number, values: Uint8Array[]) {
    const result = await this.line(
      'frame:' + id + ':' + values.map(p => Buffer.from(p).toString('hex')).join(','),
    );
    if (result !== 'frame-queued') {
      throw Error(result.startsWith('error:') ? result.slice(6) : 'Invalid frame queue acknowledgement');
    }
  }

  async batch(values: Uint8Array[]) {
    const result = await this.line('batch:' + values.map(p => Buffer.from(p).toString('hex')).join(','));
    if (result !== 'batch-written') {
      throw Error(result.startsWith('error:') ? result.slice(6) : 'Invalid RGB batch acknowledgement');
    }
    this.ctx.packets += values.length;
  }

  async syncModel() {
    if (this.ctx.deviceModel) {
      try {
        await this.line('device-model:' + this.ctx.deviceModel);
      } catch (ignoredError) {
        /* older native bridge: Rhythm stays 68-key */
        void ignoredError;
      }
    }
  }

  async configureRhythm(value: RhythmConfiguration) {
    await this.syncModel();
    const result = await this.line(nativeRhythmCommand(value));
    if (result !== 'rhythm-ready') {
      throw Error(result.startsWith('error:') ? result.slice(6) : 'Native rhythm did not start');
    }
    if (this.ctx.mode !== 'rhythm') {
      this.ctx.rhythmDelivery.reset();
    }
  }

  async stopRhythm() {
    const result = await this.line('rhythm-stop');
    if (result !== 'rhythm-stopped') {
      throw Error('Native rhythm did not stop');
    }
  }

  async audioDevices() {
    const result = await this.line('audio-devices');
    if (!result.startsWith('audio-devices:')) {
      throw Error('Audio enumeration failed');
    }
    return JSON.parse(result.slice(14));
  }

  async close() {
    await this.line('close');
  }

  async wait(ms: number) {
    await this.line(`wait:${Math.max(0, Math.min(25, ms))}`);
  }

  end() {
    this.process.stdin.end();
  }
}
