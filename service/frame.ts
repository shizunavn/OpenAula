import { buildReport } from '../src/protocol/hero68/codec';
import { getBoard, type HeroDeviceModelId } from '../src/keyboard/registry';
export const frameKeyIds = (model: HeroDeviceModelId = 'hero68') => [...getBoard(model).keyIds];
const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const distance = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
type PaletteState = {
  assignments: number[];
};
// CMD08's aggregate-length counter is a byte. 68 IDs + 32*4 <= 196 bytes; HERO84: 84 + 128 = 212 bytes.
export function prepareFrame(frame: Record<string, string>, previous?: PaletteState, model: HeroDeviceModelId = 'hero68') {
  const board = getBoard(model);
  const keyIds = board.keyIds;
  const positions = board.keyIdToPos;
  const fallback = board.fallbackColorSources;
  const colorOf = (id: string) => frame[id] ?? (fallback?.[id] ? frame[fallback[id]] : undefined);
  const values = keyIds.map(id => channels((colorOf(id) as string)));
  if (values.some(v => v.some(n => !Number.isInteger(n) || n < 0 || n > 255))) {
    throw Error('Invalid RGB frame');
  }
  const unique = new Map<string, {
    color: number[];
    members: number[];
    black: boolean;
    prior: number;
  }>();
  values.forEach((color, i) => {
    const key = color.join(',');
    const entry = unique.get(key);
    const prior = previous?.assignments[i] ?? -1;
    if (entry) {
      entry.members.push(i);
      if (entry.prior !== prior) {
        entry.prior = -1;
      }
    } else {
      unique.set(key, {
        color,
        members: [i],
        black: color[0] === 0 && color[1] === 0 && color[2] === 0,
        prior
      });
    }
  });
  let groups = [...unique.values()];
  const count = groups.length;
  const active = Array(count).fill(true);
  const costs = new Float64Array(count * count);
  const cost = (i: number, j: number) => {
    const a = groups[i];
    const b = groups[j];
    if (a.black || b.black) {
      return Infinity;
    }
    let value = distance(a.color, b.color) * a.members.length * b.members.length / (a.members.length + b.members.length);
    if (a.prior >= 0 && a.prior === b.prior) {
      value *= .6;
    }
    return value;
  };
  if (count > 32) {
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        costs[i * count + j] = cost(i, j);
      }
    }
  }
  let remaining = count;
  while (remaining > 32) {
    let left = 0;
    let right = 1;
    let best = Infinity;
    for (let i = 0; i < count; i++) {
      if (active[i]) {
        for (let j = i + 1; j < count; j++) {
          if (active[j]) {
            const value = costs[i * count + j];
            if (value < best) {
              best = value;
              left = i;
              right = j;
            }
          }
        }
      }
    }
    const a = groups[left];
    const b = groups[right];
    const total = a.members.length + b.members.length;
    a.color = a.color.map((v, i) => (v * a.members.length + b.color[i] * b.members.length) / total);
    if (a.prior !== b.prior) {
      a.prior = -1;
    }
    a.members.push(...b.members);
    active[right] = false;
    remaining--;
    for (let i = 0; i < count; i++) {
      if (active[i] && i !== left) {
        const lo = Math.min(i, left);
        const hi = Math.max(i, left);
        costs[lo * count + hi] = cost(lo, hi);
      }
    }
  }
  groups = groups.filter((_, i) => active[i]);
  const assignments: number[] = [];
  const keys: Record<string, string> = {};
  groups.forEach((group, index) => {
    group.color = group.color.map(Math.round);
    const hex = '#' + group.color.map(c => c.toString(16).padStart(2, '0')).join('');
    group.members.forEach(i => {
      assignments[i] = index;
      keys[keyIds[i]] = hex;
    });
  });
  const body = groups.flatMap(g => [...g.color, g.members.length, ...g.members.map(i => positions[keyIds[i]])]);
  const parts: number[][] = [];
  for (let i = 0; i < body.length; i += 56) {
    parts.push(body.slice(i, i + 56));
  }
  return {
    keys,
    packets: parts.map((data, sequence) => buildReport({
      command: 8,
      zone: 1,
      total: parts.length,
      sequence,
      data
    })),
    palette: {
      assignments
    }
  };
}
export class RgbFrameEncoder {
  private model: HeroDeviceModelId = 'hero68';
  private previous?: PaletteState;
  private input?: Record<string, string>;
  private result?: ReturnType<typeof prepareFrame>;
  prepare(frame: Record<string, string>) {
    if (this.result && frameKeyIds(this.model).every(id => frame[id] === this.input?.[id])) {
      return this.result;
    }
    const result = prepareFrame(frame, this.previous, this.model);
    this.previous = result.palette;
    this.input = {
      ...frame
    };
    this.result = result;
    return result;
  }
  setModel(model: HeroDeviceModelId) {
    if (model !== this.model) {
      this.model = model;
      this.reset();
    }
  }
  reset() {
    this.previous = undefined;
    this.input = undefined;
    this.result = undefined;
  }
}
export function framePackets(frame: Record<string, string>, model: HeroDeviceModelId = 'hero68') {
  return prepareFrame(frame, undefined, model).packets;
}
