import { buildReport, checksum, u16be } from './codec';
import { allRegisteredKeyPositions, getBoard, type HeroDeviceModelId } from '../../keyboard/registry';
import { HERO68_KEY_POSITIONS, keyIdToPos, posToKeyId } from './keyPositions';
import type { DecodedReport } from './types';
import { restoreCustomRgb, type CustomRgbConfiguration } from '../../keyboard/customRgbModel';
export type RgbColor = [number, number, number];
export type RgbZone = {
  mode: number;
  mix: boolean;
  mixValue?: number;
  rgb: RgbColor;
  brightness: number;
  speed: number;
};
export type RgbProfile = {
  keys: RgbZone;
  side: RgbZone;
  colors: Record<string, RgbColor>;
  custom?: CustomRgbConfiguration;
};
export type RgbDirty = {
  keys?: true;
  side?: true;
  colors: string[];
};
export type RgbChanges = RgbDirty;
export interface RgbTransport {
  request(packet: Uint8Array, command: number, zone?: number, timeout?: number): Promise<DecodedReport>;
}
export function defaultRgb(keyIds: readonly string[] = Object.keys(HERO68_KEY_POSITIONS)): RgbProfile {
  const zone: RgbZone = {
    mode: 1,
    mix: false,
    rgb: [255, 255, 255],
    brightness: 20,
    speed: 2
  };
  return {
    keys: {
      ...zone
    },
    side: {
      ...zone,
      mode: 0,
      brightness: 4
    },
    colors: Object.fromEntries(keyIds.map(id => [id, [255, 255, 255]]))
  };
}
export function restoreStoredRgb(value?: RgbProfile, format?: 1): RgbProfile {
  const result = structuredClone(value ?? defaultRgb());
  if (!value) {
    result.keys.mix = true;
  }
  if (format !== 1 && result.side.brightness > 4 && result.side.brightness <= 20) {
    result.side.brightness = Math.round(result.side.brightness / 5);
  }
  if (result.custom) {
    result.custom = restoreCustomRgb(result.custom, result);
  }
  return result;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const wireMix = (value: RgbZone) => value.mixValue ?? (value.mix ? 7 : 0);
export function sameRgbZone(a: RgbZone, b: RgbZone) {
  const mix = wireMix(a);
  return a.mode === b.mode && mix === wireMix(b) && a.brightness === b.brightness && a.speed === b.speed && (mix === 7 || same(a.rgb, b.rgb));
}
export function rgbChanges(draft: RgbProfile, baseline: RgbProfile, keyIds?: readonly string[], model?: HeroDeviceModelId): RgbDirty {
  const validPosTable = model ? getBoard(model).keyIdToPos : allRegisteredKeyPositions();
  const candidateIds = keyIds ?? Array.from(new Set([...Object.keys(HERO68_KEY_POSITIONS), ...Object.keys(draft.colors ?? {}), ...Object.keys(baseline.colors ?? {})])).filter(id => validPosTable[id] !== undefined);
  return {
    keys: sameRgbZone(draft.keys, baseline.keys) ? undefined : true,
    side: sameRgbZone(draft.side, baseline.side) ? undefined : true,
    colors: candidateIds.filter(id => !same(draft.colors[id], baseline.colors[id]))
  };
}
export const rgbDirtyCount = (dirty: RgbDirty) => Number(!!dirty.keys) + Number(!!dirty.side) + dirty.colors.length;
export function mergeRgb(fresh: RgbProfile, draft?: RgbProfile, dirty?: RgbDirty): RgbProfile {
  const result = structuredClone(fresh);
  if (draft?.custom) {
    result.custom = restoreCustomRgb(draft.custom, result);
  }
  if (draft && dirty) {
    if (dirty.keys) {
      result.keys = structuredClone(draft.keys);
    }
    if (dirty.side) {
      result.side = structuredClone(draft.side);
    }
    for (const id of dirty.colors) {
      if (draft.colors[id]) {
        result.colors[id] = [...draft.colors[id]];
      }
    }
  }
  return result;
}
export function rgbModePacket(zone: 1 | 6, config: RgbZone) {
  const {
    mode,
    mix,
    rgb,
    brightness,
    speed
  } = config;
  if (!Number.isInteger(mode) || mode < 0 || mode > 255 || !Number.isInteger(brightness) || brightness < 0 || brightness > (zone === 6 ? 4 : 20) || !Number.isInteger(speed) || speed < 0 || speed > 4 || rgb.some(x => !Number.isInteger(x) || x < 0 || x > 255)) {
    throw Error('Invalid RGB parameters');
  }
  const packet = buildReport({
    command: 4,
    zone,
    data: [mode, config.mixValue ?? (mix ? 7 : 0), ...rgb, brightness, speed]
  });
  if (zone === 6 && mix) {
    packet[6] = 4;
    packet[63] = checksum(packet.subarray(1, 63));
  }
  return packet;
}
export function rgbColorPackets(colors: Record<string, RgbColor>, ids = Object.keys(colors), model?: HeroDeviceModelId) {
  const posTable = model ? getBoard(model).keyIdToPos : allRegisteredKeyPositions();
  const groups = [];
  for (let i = 0; i < ids.length; i += 11) {
    groups.push(ids.slice(i, i + 11));
  }
  return groups.map((group, sequence) => buildReport({
    command: 6,
    zone: 0,
    total: groups.length,
    sequence,
    data: group.flatMap(id => {
      const pos = posTable[id];
      if (pos === undefined || !colors[id] || colors[id].some(x => !Number.isInteger(x) || x < 0 || x > 255)) {
        throw Error('Invalid per-key color');
      }
      return [...u16be(pos), ...colors[id]];
    })
  }));
}
export async function readRgbColors(device: RgbTransport, ids: readonly string[] = Object.keys(HERO68_KEY_POSITIONS), model?: HeroDeviceModelId) {
  const colors: Record<string, RgbColor> = {};
  for (let i = 0; i < ids.length; i += 11) {
    const group = ids.slice(i, i + 11);
    const reply = await device.request(buildReport({
      command: 0x86,
      zone: 0,
      data: group.flatMap(id => u16be(keyIdToPos(id, model)))
    }), 0x86, 0);
    if (reply.data.length !== group.length * 5) {
      throw Error('Incomplete RGB color read');
    }
    const seen = new Set<string>();
    for (let j = 0; j < reply.data.length; j += 5) {
      const pos = reply.data[j] * 256 + reply.data[j + 1];
      const id = posToKeyId(pos, model);
      if (!id || !group.includes(id) || seen.has(id)) {
        throw Error(`Unexpected RGB position ${pos}`);
      }
      seen.add(id);
      colors[id] = [reply.data[j + 2], reply.data[j + 3], reply.data[j + 4]];
    }
  }
  return colors;
}
async function readZone(device: RgbTransport, zone: 1 | 6): Promise<RgbZone> {
  const reply = await device.request(buildReport({
    command: 0x84,
    zone
  }), 0x84, zone);
  const d = reply.raw?.slice(7, 14) ?? reply.data;
  if (d.length < 7 || d[5] > (zone === 6 ? 4 : 20) || d[6] > 4) {
    throw Error('Invalid RGB configuration read');
  }
  const result: RgbZone = {
    mode: d[0],
    mix: d[1] === 7,
    rgb: [d[2], d[3], d[4]],
    brightness: d[5],
    speed: d[6]
  };
  if (d[1] !== 0 && d[1] !== 7) {
    result.mixValue = d[1];
  }
  return result;
}
export async function readRgbProfile(device: RgbTransport, ids: readonly string[] = Object.keys(HERO68_KEY_POSITIONS), model?: HeroDeviceModelId): Promise<RgbProfile> {
  const keys = await readZone(device, 1);
  const side = await readZone(device, 6);
  const colors = await readRgbColors(device, ids, model);
  return {
    keys,
    side,
    colors
  };
}
export async function saveRgbProfile(device: RgbTransport, draft: RgbProfile, baseline: RgbProfile, verified: (baseline: RgbProfile) => void, keyIds?: readonly string[], model?: HeroDeviceModelId) {
  const next = structuredClone(baseline);
  const dirty = rgbChanges(draft, baseline, keyIds, model);
  if (dirty.colors.length) {
    for (const packet of rgbColorPackets(draft.colors, dirty.colors, model)) {
      await device.request(packet, 6, 0);
    }
    const colors = await readRgbColors(device, dirty.colors, model);
    if (dirty.colors.some(id => !same(colors[id], draft.colors[id]))) {
      throw Error('RGB color readback mismatch');
    }
    Object.assign(next.colors, colors);
    verified(structuredClone(next));
  }
  for (const [name, zone] of ([['keys', 1], ['side', 6]] as const)) {
    if (dirty[name] || name === 'keys' && draft.keys.mode === 19 && dirty.colors.length) {
      await device.request(rgbModePacket(zone, draft[name]), 4, zone);
      const actual = await readZone(device, zone);
      if (!sameRgbZone(actual, draft[name])) {
        throw Error(`${name} RGB readback mismatch`);
      }
      next[name] = actual;
      verified(structuredClone(next));
    }
  }
  return next;
}
