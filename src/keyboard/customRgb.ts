import { HERO68_KEY_IDS } from './hero68Layout';
import { isWin68HeMaxModel } from './devices';
import { getBoard, type HeroDeviceModelId } from './registry';
import { FirmwareRgbPreview } from './rgbPreview';
import { XsydFirmwareRgbPreview } from './xsydRgbPreview';
import type { RgbColor, RgbProfile } from '../protocol/hero68/rgb';
import { restoreCustomRgb, RGB_EFFECT_METADATA, RGB_GRADIENT_PALETTES, type CustomRgbConfiguration, type CustomRgbLayer } from './customRgbModel';
import { pickCustomRgbColor, blendCustomRgbColor, sampleCustomRgbSpectrum, customRgbContrastPalette } from './customRgbColors';
export * from './customRgbModel';
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));

// Physical key centers for host FX on the baseline 68-key board; board-specific
// coordinates can be retrieved via customRgbCoordinatesForModel(model).
export const CUSTOM_RGB_COORDINATES: Record<string, [number, number]> = Object.fromEntries(Object.entries(getBoard('hero68').keyCoordinates).map(([id, [x, y]]) => [id, ([x, y] as [number, number])]));
export function customRgbCoordinatesForModel(model: HeroDeviceModelId = 'hero68'): Readonly<Record<string, readonly [number, number]>> {
  return getBoard(model).keyCoordinates;
}
type Colors = Record<string, RgbColor>;
type Press = {
  id: string;
  at: number;
  x: number;
  y: number;
  colors: Colors;
};
type PressureWave = Press & {
  layerId: string;
  strength: number;
};
function computeBounds(coords: Readonly<Record<string, readonly [number, number]>>) {
  return [0, 1].map(axis => {
    const values = Object.values(coords).map(p => p[axis]);
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  });
}
const defaultBounds = computeBounds(CUSTOM_RGB_COORDINATES);
const gradientStops = Object.fromEntries(Object.entries(RGB_GRADIENT_PALETTES).map(([id, palette]) => [id, palette.colors.map(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)))]));
function gradient(layer: CustomRgbLayer, phase: number): RgbColor {
  if (!layer.multicolor) {
    return layer.color;
  }
  const stops = gradientStops[layer.palette ?? RGB_EFFECT_METADATA[layer.effect].defaults?.palette ?? 'aurora'];
  const position = clamp(phase, 0, 1) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(position));
  const mix = position - index;
  return (stops[index].map((v, i) => v + (stops[index + 1][i] - v) * mix) as RgbColor);
}
const fract = (v: number) => v - Math.floor(v);
const hash = (a: number, b = 0, c = 0) => fract(Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453);
const mixNumber = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (v: number) => {
  const t = clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
};
function valueNoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = ease(x - xi);
  const v = ease(y - yi);
  return mixNumber(mixNumber(hash(xi, yi), hash(xi + 1, yi), u), mixNumber(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
}
const WHITE: RgbColor = [255, 244, 224];
const lighten = (color: RgbColor, amount: number) => (color.map((c, i) => mixNumber(c, WHITE[i], clamp(amount, 0, 1))) as RgbColor);
const KEY_INDEX = Object.fromEntries(HERO68_KEY_IDS.map((id, i) => [id, i]));
const FLAME_SPARKS = 7;
type Spark = {
  x: number;
  y: number;
  power: number;
};
type GlowSource = {
  x: number;
  y: number;
  heat: number;
};
type GlowTransition = {
  at: number;
  pressed: boolean;
  heat: number;
};
function glowHeat(change: GlowTransition, time: number, duration: number) {
  return change.pressed ? change.heat + (1 - change.heat) * ease((time - change.at) / 70) : change.heat * Math.pow(1 - clamp((time - change.at) / duration, 0, 1), 1.5);
}
const PULSE_TAIL_SECONDS = Math.log(1024) / 1.7;
function flameHeat(x: number, y: number, seconds: number, height: number) {
  const reach = clamp(1 - (4.5 - y) / height, 0, 1);
  const base = reach * .72;
  const tongues = valueNoise(x * .55 + 1.3, y * .7 + seconds * 1.15) * .65 + valueNoise(x * 1.3 + 7.1, y * 1.6 + seconds * 2.1) * .35;
  return clamp(base + (tongues - .5) * .95 * ease(reach), 0, 1);
}
function flameSparks(seconds: number, speed: number): Spark[] {
  const sparks: Spark[] = [];
  for (let i = 0; i < FLAME_SPARKS; i++) {
    const phase = seconds * speed / (2.2 + hash(i, 1) * 2) + hash(i, 2) * 8;
    const cycle = Math.floor(phase);
    const life = fract(phase) / .62;
    if (life >= 1) {
      continue;
    }
    const rise = 2.4 + hash(i, cycle, 4) * 1.8;
    sparks.push({
      x: .8 + hash(i, cycle, 3) * 13.4 + Math.sin(life * 6 + hash(i, cycle, 5) * 6) * .5,
      y: 4.5 - life * rise,
      power: Math.pow(1 - life, 1.2) * ease(life / .08)
    });
  }
  return sparks;
}
function aurora(layer: CustomRgbLayer, x: number, y: number, seconds: number, bounds = defaultBounds) {
  const t = seconds * layer.speed;
  const span = bounds[0].max - bounds[0].min + 1;
  const bend = Math.sin(y * .85 + t * .55) * .7 + y * .38;
  const phase = (x - bounds[0].min + bend - t * 1.8) / span * 3;
  const palettePosition = (1 - Math.cos(phase * Math.PI * 2 / 3)) / 2;
  const curtain = Math.pow(.5 + .5 * Math.cos(phase * Math.PI * 2), Math.max(.35, 1.4 / layer.width));
  return {
    strength: .35 + .65 * curtain,
    tint: gradient(layer, palettePosition)
  };
}
export class CustomRgbEngine {
  private base: FirmwareRgbPreview | XsydFirmwareRgbPreview;
  private time = 0;
  private events: Press[] = [];
  private held = new Set<string>();
  private releases = new Map<string, number>();
  private transitions = new Map<string, {
    at: number;
    pressed: boolean;
  }>();
  private glows = new Map<string, Map<string, GlowTransition>>();
  private travel: Record<string, number> = {};
  private hallVersions = new Map<string, {
    sequence: number;
    timestampMs: number;
  }>();
  private keyColors = new Map<string, Colors>();
  private analogColors = new Map<string, Colors>();
  private cycleColors = new Map<string, {
    cycle: number;
    colors: Colors;
  }>();
  private previousColors = new Map<string, RgbColor>();
  private colorPalettes = new Map<string, readonly RgbColor[]>();
  private touchColors: Colors = {};
  private touchSource: string | undefined;
  private config: CustomRgbConfiguration;
  private pressureWaves: PressureWave[] = [];
  private emissions = new Map<string, number>();
  private analogInput = false;
  private strikes = new Map<string, {
    mm: number;
    at: number;
    peak: number;
    hitAt: number;
  }>();
  private coordinates: Readonly<Record<string, readonly [number, number]>>;
  private keyIds: readonly string[];
  private keyIndex: Record<string, number>;
  private bounds: {
    min: number;
    max: number;
  }[];
  constructor(private profile: RgbProfile, private model?: HeroDeviceModelId) {
    const inferredWin68 = !model && Boolean(
      profile.keys?.colorIndex !== undefined ||
      profile.keys?.reverse !== undefined ||
      Array.isArray(profile.keys?.palette) ||
      (profile.keys?.mode !== undefined && profile.keys.mode > 19 && profile.keys.mode < 100) ||
      profile.custom?.base?.colorIndex !== undefined ||
      profile.custom?.base?.reverse !== undefined ||
      Array.isArray(profile.custom?.base?.palette) ||
      (profile.custom?.base?.mode !== undefined && profile.custom.base.mode > 19 && profile.custom.base.mode < 100)
    );
    if (inferredWin68) {
      this.model = 'win68HeMax';
    }
    const resolvedModel = this.model;
    const board = resolvedModel ? getBoard(resolvedModel) : getBoard('hero68');
    this.coordinates = resolvedModel ? board.keyCoordinates : CUSTOM_RGB_COORDINATES;
    this.keyIds = resolvedModel ? board.keyIds : HERO68_KEY_IDS;
    this.keyIndex = resolvedModel ? Object.fromEntries(board.keyIds.map((id, i) => [id, i])) : KEY_INDEX;
    this.bounds = resolvedModel ? computeBounds(this.coordinates) : defaultBounds;
    this.config = restoreCustomRgb(profile.custom, profile);
    this.base = isWin68HeMaxModel(resolvedModel)
      ? new XsydFirmwareRgbPreview(this.baseProfile())
      : new FirmwareRgbPreview(this.baseProfile());
    this.configureColorPalettes();
  }
  private configureColorPalettes() {
    const backgrounds: RgbColor[] = [];
    const addGradient = (palette: string) => {
      const stops = gradientStops[palette];
      for (let i = 0; i < stops.length - 1; i++) {
        for (let step = 0; step <= 8; step++) {
          backgrounds.push((stops[i].map((v, c) => v + (stops[i + 1][c] - v) * step / 8) as RgbColor));
        }
      }
    };
    if (this.config.baseEffect && this.config.base.brightness > 0) {
      if (this.config.base.mix) {
        addGradient(this.config.baseEffect.palette);
      } else {
        backgrounds.push(this.config.base.rgb);
      }
    }
    this.colorPalettes.clear();
    for (const layer of this.config.layers) {
      this.colorPalettes.set(layer.id, customRgbContrastPalette(backgrounds));
      if (layer.enabled && layer.opacity > 0 && layer.keys.length && RGB_EFFECT_METADATA[layer.effect].gradient) {
        if (layer.multicolor) {
          addGradient(layer.palette ?? RGB_EFFECT_METADATA[layer.effect].defaults?.palette ?? 'aurora');
        } else {
          backgrounds.push(layer.color);
        }
      }
    }
  }
  private baseProfile(): RgbProfile {
    if (isWin68HeMaxModel(this.model)) {
      return {
        ...this.profile,
        keys: this.config.baseEffect ? {
          ...this.config.base,
          mode: 0,
          brightness: 0
        } : this.config.base
      };
    }
    return {
      ...this.profile,
      keys: this.config.baseEffect ? {
        ...this.config.base,
        mode: 20
      } : this.config.base
    };
  }
  configure(profile: RgbProfile) {
    this.profile = profile;
    this.config = restoreCustomRgb(profile.custom, profile);
    this.base.configure(this.baseProfile());
    this.configureColorPalettes();
    const pressureIds = new Set(this.config.layers.filter(l => l.enabled && l.effect === 'pressure-wave').map(l => l.id));
    this.pressureWaves = this.pressureWaves.filter(w => pressureIds.has(w.layerId));
    for (const key of this.emissions.keys()) {
      if (!pressureIds.has(key.slice(0, key.lastIndexOf(':')))) {
        this.emissions.delete(key);
      }
    }
    const ids = new Set(this.config.layers.map(l => l.id));
    for (const key of this.cycleColors.keys()) {
      if (!ids.has(key)) {
        this.cycleColors.delete(key);
      }
    }
    for (const key of this.previousColors.keys()) {
      if (!ids.has(key)) {
        this.previousColors.delete(key);
      }
    }
    const glowIds = new Set(this.config.layers.filter(l => l.enabled && l.effect === 'afterglow').map(l => l.id));
    for (const id of this.glows.keys()) {
      if (!glowIds.has(id)) {
        this.glows.delete(id);
      }
    }
    for (const id of glowIds) {
      if (!this.glows.has(id)) {
        this.glows.set(id, new Map([...this.held].map(key => [key, {
          at: this.time,
          pressed: true,
          heat: 0
        }])));
      }
    }
  }
  get milliseconds() {
    return this.time;
  }
  get activeWaveCount() {
    return this.pressureWaves.length;
  }
  advance(milliseconds: number) {
    this.time = Math.max(this.time, milliseconds);
    this.base.advance(this.time);
    this.events = this.events.filter(e => this.time - e.at <= 4000);
    this.pressureWaves = this.pressureWaves.filter(e => this.time - e.at <= 4000);
    for (const [id, at] of this.releases) {
      if (this.time - at > 4000) {
        this.releases.delete(id);
        this.keyColors.delete(id);
      }
    }
  }
  event(id: string, pressed: boolean) {
    const point = this.coordinates[id];
    if (!point) {
      return;
    }
    if (pressed && !this.held.has(id)) {
      this.glowEvent(id, true);
      const colors: Colors = {};
      this.keyColors.set(id, colors);
      this.events.push({
        id,
        at: this.time,
        x: point[0],
        y: point[1],
        colors
      });
      this.events = this.events.slice(-64);
      this.held.add(id);
      this.releases.delete(id);
      this.base.event(id, true);
      this.transitions.set(id, {
        at: this.time,
        pressed: true
      });
      if (!this.analogInput) {
        this.strikes.set(id, {
          mm: 3.4,
          at: this.time,
          peak: 1,
          hitAt: this.time
        });
      }
    } else if (!pressed && this.held.delete(id)) {
      this.glowEvent(id, false);
      this.releases.set(id, this.time);
      this.transitions.set(id, {
        at: this.time,
        pressed: false
      });
      this.base.event(id, false);
    }
  }
  private glowEvent(id: string, pressed: boolean) {
    for (const layer of this.config.layers) {
      if (!layer.enabled || layer.effect !== 'afterglow') {
        continue;
      }
      let changes = this.glows.get(layer.id);
      if (!changes) {
        changes = new Map();
        this.glows.set(layer.id, changes);
      }
      const previous = changes.get(id);
      changes.set(id, {
        at: this.time,
        pressed,
        heat: previous ? glowHeat(previous, this.time, layer.duration) : 0
      });
    }
  }
  setTravel(values: Record<string, number>, samples?: Record<string, {
    sequence: number;
    timestampMs: number;
  }>) {
    if (!this.analogInput) {
      this.analogInput = true;
      this.strikes.clear();
    }
    this.travel = values;
    for (const [id, value] of Object.entries(values)) {
      if (!this.coordinates[id] || !Number.isFinite(value)) {
        continue;
      }
      const sample = samples?.[id];
      const previousSample = this.hallVersions.get(id);
      if (sample && previousSample && sample.sequence <= previousSample.sequence) {
        continue;
      }
      if (sample) {
        this.hallVersions.set(id, sample);
      }
      const mm = clamp(value, 0, 3.4);
      if (mm <= .08) {
        this.strikes.set(id, {
          mm: 0,
          at: this.time,
          peak: 0,
          hitAt: this.time
        });
        continue;
      }
      const previous = this.strikes.get(id) ?? {
        mm: 0,
        at: this.time - 25,
        peak: 0,
        hitAt: this.time
      };
      const delta = mm - previous.mm;
      const dt = sample && previousSample ? clamp(sample.timestampMs - previousSample.timestampMs, 1, 80) : clamp(this.time - previous.at, 8, 80);
      let peak = previous.peak;
      let hitAt = previous.hitAt;
      if (delta > .04) {
        const velocity = delta / dt * 1000;
        const strength = .12 + .88 * clamp((velocity - 3) / 117, 0, 1);
        if (strength > peak) {
          peak = strength;
          hitAt = this.time;
        }
      }
      this.strikes.set(id, {
        mm,
        at: this.time,
        peak,
        hitAt
      });
    }
    for (const id of this.strikes.keys()) {
      if (values[id] === undefined) {
        this.strikes.delete(id);
      }
    }
    for (const id of this.hallVersions.keys()) {
      if (values[id] === undefined) {
        this.hallVersions.delete(id);
      }
    }
  }
  private strikeBrightness(id: string) {
    const strike = this.strikes.get(id);
    return strike ? strike.peak * (.25 + .75 * Math.exp(-Math.max(0, this.time - strike.hitAt) / 600)) : 0;
  }
  releaseAll() {
    for (const id of [...this.held]) {
      this.event(id, false);
    }
    this.travel = {};
    this.strikes.clear();
    this.hallVersions.clear();
  }
  private randomColor(colors: Colors, layerId: string, background: RgbColor): RgbColor {
    if (!colors[layerId]) {
      colors[layerId] = pickCustomRgbColor(background, Math.random(), this.previousColors.get(layerId), this.colorPalettes.get(layerId));
      this.previousColors.set(layerId, colors[layerId]);
    }
    return colors[layerId];
  }
  frame() {
    const frame = this.base.frame();
    if (this.model && this.model !== 'hero68') {
      const board = getBoard(this.model);
      for (const id of this.keyIds) {
        if (!frame.keys[id]) {
          const fallback = board.fallbackColorSources?.[id];
          frame.keys[id] = fallback && frame.keys[fallback] || '#000000';
        }
      }
    }
    if (this.config.baseEffect?.effect === 'aurora') {
      const settings = this.config.baseEffect;
      const layer = ({
        ...settings,
        effect: 'aurora',
        multicolor: this.config.base.mix,
        color: this.config.base.rgb
      } as CustomRgbLayer);
      const brightnessScale = isWin68HeMaxModel(this.model)
        ? Math.min(4, Math.max(0, this.config.base.brightness > 4 ? Math.round(this.config.base.brightness / 5) : this.config.base.brightness)) / 4
        : this.config.base.brightness / 20;
      for (const id of this.keyIds) {
        const [x, y] = this.coordinates[id];
        const {
          strength,
          tint
        } = aurora(layer, x, y, this.time / 1000, this.bounds);
        frame.keys[id] = '#' + tint.map(c => Math.round(c * strength * brightnessScale).toString(16).padStart(2, '0')).join('');
      }
    }
    const baseColors = Object.fromEntries(Object.entries(frame.keys).map(([id, hex]) => [id, ([1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as RgbColor)]));
    const smooth = (v: number) => {
      const t = clamp(v, 0, 1);
      return t * t * (3 - 2 * t);
    };
    const depth = (id: string) => {
      const mm = this.travel[id] ?? (this.held.has(id) ? 3.4 : 0);
      return clamp(mm / 3.4, 0, 1) * smooth((mm - .08) / .08);
    };
    const analog = this.keyIds.map(id => ({
      id,
      p: depth(id),
      point: this.coordinates[id]
    })).filter(k => k.p > .025);
    const activeAnalog = new Set(analog.map(k => k.id));
    for (const id of this.analogColors.keys()) {
      if (!activeAnalog.has(id)) {
        this.analogColors.delete(id);
      }
    }
    for (const k of analog) {
      if (!this.analogColors.has(k.id)) {
        this.analogColors.set(k.id, {});
      }
    }
    const emitting = new Set<string>();
    for (const layer of this.config.layers) {
      if (!layer.enabled || layer.effect !== 'pressure-wave') {
        continue;
      }
      for (const key of analog) {
        if (!layer.keys.includes(key.id)) {
          continue;
        }
        const token = `${layer.id}:${key.id}`;
        emitting.add(token);
        const strength = this.strikeBrightness(key.id);
        if (strength <= 0) {
          continue;
        }
        const last = this.emissions.get(token);
        if (last !== undefined && this.time - last < 500) {
          continue;
        }
        this.emissions.set(token, this.time);
        const colors = this.analogColors.get(key.id)!;
        if (layer.multicolor) {
          this.randomColor(colors, layer.id, baseColors[key.id]);
        }
        this.pressureWaves.push({
          id: key.id,
          at: this.time,
          x: key.point[0],
          y: key.point[1],
          colors: {
            ...colors
          },
          layerId: layer.id,
          strength
        });
      }
    }
    for (const token of this.emissions.keys()) {
      if (!emitting.has(token)) {
        this.emissions.delete(token);
      }
    }
    this.pressureWaves = this.pressureWaves.filter(w => this.time - w.at < (this.config.layers.find(l => l.id === w.layerId)?.duration ?? 0)).slice(-64);
    const bar = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
    const deepest = Math.max(0, ...analog.map(k => k.p));
    const deepestKey = analog.reduce<typeof analog[number] | undefined>((best, k) => !best || k.p > best.p ? k : best, undefined);
    if (!deepestKey) {
      this.touchColors = {};
      this.touchSource = undefined;
    } else if (!this.touchSource) {
      this.touchSource = deepestKey.id;
    }
    const cycleTints = new Map<string, RgbColor>();
    const scanBands = new Map<string, {
      center: number;
      colorPhase: number;
    }>();
    const sparks = new Map<string, Spark[]>();
    const glowSources = new Map<string, GlowSource[]>();
    for (const layer of this.config.layers) {
      if (!layer.enabled) {
        continue;
      }
      if (layer.effect === 'ember') {
        sparks.set(layer.id, flameSparks(this.time / 1000, layer.speed));
        continue;
      }
      if (layer.effect === 'afterglow') {
        const sources: GlowSource[] = [];
        for (const [id, change] of this.glows.get(layer.id) ?? []) {
          const point = this.coordinates[id];
          if (!point) {
            continue;
          }
          const heat = glowHeat(change, this.time, layer.duration);
          if (heat > .01) {
            sources.push({
              x: point[0],
              y: point[1],
              heat
            });
          }
        }
        glowSources.set(layer.id, sources);
        continue;
      }
      if (layer.effect === 'scan') {
        const {
          min,
          max
        } = this.bounds[layer.direction === 'horizontal' ? 0 : 1];
        const length = max - min;
        const travel = length / layer.speed;
        const pause = (layer.scanPauseMs ?? 0) / 1000;
        const phase = this.time / 1000 % (2 * (travel + pause));
        const position = phase < travel + pause ? clamp(phase / travel, 0, 1) : 1 - clamp((phase - travel - pause) / travel, 0, 1);
        scanBands.set(layer.id, {
          center: min + length * (layer.multicolor ? .5 - .5 * Math.cos(position * Math.PI) : position),
          colorPhase: this.time / 1000 / 20 % 1
        });
        continue;
      }
      if (!layer.multicolor || layer.effect !== 'breath') {
        continue;
      }
      const period = 6 / layer.speed;
      const cycle = Math.floor(this.time / 1000 / period);
      let entry = this.cycleColors.get(layer.id);
      if (!entry || entry.cycle !== cycle) {
        entry = {
          cycle,
          colors: {}
        };
        this.cycleColors.set(layer.id, entry);
      }
      const keys = layer.keys.filter(id => baseColors[id]);
      const background = ([0, 1, 2].map(i => keys.reduce((sum, id) => sum + baseColors[id][i], 0) / Math.max(1, keys.length)) as RgbColor);
      cycleTints.set(layer.id, layer.palette ? gradient(layer, fract(this.time / 1000 / period)) : this.randomColor(entry.colors, layer.id, background));
    }
    for (const id of this.keyIds) {
      const [x, y] = this.coordinates[id];
      const hex = frame.keys[id];
      let color = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      for (const layer of this.config.layers) {
        if (!layer.enabled || !layer.keys.includes(id)) {
          continue;
        }
        const axis = layer.direction === 'horizontal' ? x : y;
        let strength = 0;
        let tint: RgbColor = cycleTints.get(layer.id) ?? layer.color;
        const randomTint = (colors: Colors, source: string) => layer.palette ? gradient(layer, fract((this.keyIndex[source] ?? 0) / 17 + (this.time / 3000))) : this.randomColor(colors, layer.id, baseColors[source]);
        const seconds = this.time / 1000;
        if (layer.effect === 'aurora') {
          ;
          ({
            strength,
            tint
          } = aurora(layer, x, y, seconds, this.bounds));
        } else if (layer.effect === 'comet') {
          const primary = layer.direction === 'horizontal' ? 0 : 1;
          const secondary = 1 - primary;
          const span = this.bounds[primary].max - this.bounds[primary].min;
          const tail = Math.max(.25, layer.speed * layer.duration / 1000);
          const path = span + tail + 2;
          const point = [x, y];
          for (let i = 0; i < 2; i++) {
            const distance = (seconds * layer.speed + i * path * .5) % path;
            const cycle = Math.floor((seconds * layer.speed + i * path * .5) / path);
            const lane = this.bounds[secondary].min + (cycle * 2 + i * 3) % (Math.round(this.bounds[secondary].max - this.bounds[secondary].min) + 1);
            const behind = this.bounds[primary].min - 1 + distance - point[primary];
            const cross = Math.exp(-Math.pow((point[secondary] - lane) / Math.max(.25, layer.width * .4), 2));
            const head = Math.exp(-Math.pow(behind / .35, 2));
            const trail = behind >= 0 && behind <= tail ? Math.pow(1 - behind / tail, 2) * .7 : 0;
            const power = Math.max(head, trail) * cross;
            if (power > strength) {
              strength = power;
              tint = gradient(layer, clamp(1 - behind / tail, 0, 1));
            }
          }
        } else if (layer.effect === 'pressure-wave') {
          for (const k of analog) {
            if (k.id === id && layer.keys.includes(k.id)) {
              strength = this.strikeBrightness(k.id) * .55;
              if (layer.multicolor) {
                tint = randomTint(this.analogColors.get(k.id)!, k.id);
              }
            }
          }
          for (const wave of this.pressureWaves) {
            if (wave.layerId !== layer.id) {
              continue;
            }
            const age = this.time - wave.at;
            const radius = age / 1000 * layer.speed;
            const power = smooth(1 - Math.abs(Math.hypot(x - wave.x, y - wave.y) - radius) / layer.width) * wave.strength * clamp(1 - age / layer.duration, 0, 1);
            if (power > strength) {
              strength = power;
              if (layer.multicolor) {
                tint = randomTint(wave.colors, wave.id);
              }
            }
          }
        } else if (layer.effect === 'scan') {
          const band = scanBands.get(layer.id)!;
          if (layer.multicolor) {
            const offset = (axis - band.center) / layer.width;
            strength = Math.exp(-2 * offset * offset);
            tint = layer.palette ? gradient(layer, fract(band.colorPhase + offset / 8)) : sampleCustomRgbSpectrum(band.colorPhase + offset / 8, this.colorPalettes.get(layer.id));
          } else {
            strength = smooth(1 - Math.abs(axis - band.center) / layer.width);
          }
        } else if (layer.effect === 'ember') {
          const heat = flameHeat(x, y, seconds * layer.speed, layer.width);
          const flicker = .9 + .1 * valueNoise(seconds * layer.speed * 4, 3.7);
          strength = heat < .05 ? 0 : ease(heat / .3) * (.3 + .7 * Math.pow(heat, .9)) * flicker;
          tint = layer.multicolor ? gradient(layer, heat) : lighten(layer.color, (heat - .7) / .3 * .45);
          for (const spark of sparks.get(layer.id) ?? []) {
            const power = Math.exp(-(Math.pow(x - spark.x, 2) + Math.pow(y - spark.y, 2)) / (2 * .42 * .42)) * spark.power;
            if (power > strength) {
              strength = power;
              tint = layer.multicolor ? gradient(layer, 1) : lighten(layer.color, .55);
            }
          }
        } else if (layer.effect === 'starlight') {
          const k = this.keyIndex[id] ?? 0;
          const phase = seconds * layer.speed / (3.2 + hash(k, 5) * 4.5) + hash(k, 6) * 10;
          const cycle = Math.floor(phase);
          const life = fract(phase);
          if (hash(k, cycle, 7) < clamp(layer.width / 10, .03, .95)) {
            const envelope = life < .18 ? ease(life / .18) : Math.pow(1 - (life - .18) / .82, 2.2);
            strength = envelope * (.9 + .1 * Math.sin(seconds * 7 + k * 1.7));
            tint = lighten(layer.multicolor ? gradient(layer, hash(k, cycle, 8)) : layer.color, Math.pow(envelope, 3) * .7);
          }
        } else if (layer.effect === 'afterglow') {
          let heat = 0;
          for (const source of glowSources.get(layer.id) ?? []) {
            const fall = Math.exp(-Math.pow(Math.hypot(x - source.x, y - source.y) / layer.width, 2)) * source.heat;
            heat = 1 - (1 - heat) * (1 - fall);
          }
          strength = clamp(heat * 1.25, 0, 1);
          const sample = layer.multicolor ? gradient(layer, heat) : layer.color;
          tint = lighten(sample, (heat - .8) / .2 * .6);
        } else if (layer.effect === 'pulse') {
          const beatLength = 60 / layer.speed;
          const beat = Math.floor(seconds / beatLength);
          const centerX = (this.bounds[0].min + this.bounds[0].max) / 2;
          const centerY = (this.bounds[1].min + this.bounds[1].max) / 2;
          const distance = Math.hypot(x - centerX, (y - centerY) * 1.25);
          const history = Math.ceil(PULSE_TAIL_SECONDS / beatLength) + 1;
          for (let back = 0; back < history; back++) {
            const index = beat - back;
            if (index < 0) {
              continue;
            }
            const age = seconds - index * beatLength;
            const accent = index % 4 === 0;
            const loudness = accent ? 1 : .6;
            const ring = Math.exp(-Math.pow((distance - age * (accent ? 10 : 7.5)) / layer.width, 2)) * Math.exp(-age * (accent ? 1.7 : 2.4)) * loudness;
            const core = Math.exp(-age * 9) * Math.exp(-Math.pow(distance / 2.2, 2)) * loudness * .6;
            const power = Math.max(ring, core);
            if (power > strength) {
              strength = power;
              tint = layer.multicolor ? gradient(layer, accent ? 0 : index % 4 / 3) : accent ? lighten(layer.color, .35) : layer.color;
            }
          }
        } else if (layer.effect === 'breath') {
          strength = .5 - .5 * Math.cos(seconds * layer.speed * Math.PI / 3);
        } else if (layer.effect === 'mixing') {
          const components = [depth('ArrowLeft'), depth('ArrowDown'), depth('ArrowRight')];
          strength = Math.max(...components);
          tint = (components.map(p => strength > 0 ? Math.round(p / strength * 255) : 0) as RgbColor);
        } else if (layer.effect === 'touch') {
          const index = bar.indexOf(id);
          strength = index < 0 ? 0 : clamp(deepest * bar.length - index, 0, 1);
          if (layer.multicolor && this.touchSource) {
            tint = randomTint(this.touchColors, this.touchSource);
          }
        } else if (layer.effect === 'rt') {
          const t = this.transitions.get(id);
          if (t) {
            strength = this.held.has(id) ? 1 : clamp(1 - (this.time - t.at) / layer.duration, 0, 1);
            tint = t.pressed ? [0, 255, 0] : [255, 0, 0];
          }
        } else if (layer.effect === 'jelly' || layer.effect === 'aoe') {
          for (const k of analog) {
            const distance = Math.hypot(x - k.point[0], y - k.point[1]);
            const radius = layer.effect === 'jelly' ? .25 + k.p * layer.width * 3 : layer.width;
            const power = smooth(1 - distance / radius) * (layer.effect === 'aoe' ? k.p : 1);
            if (power > strength) {
              strength = power;
              if (layer.multicolor) {
                tint = randomTint(this.analogColors.get(k.id)!, k.id);
              }
            }
          }
        } else if (layer.effect === 'reaction') {
          const release = this.releases.get(id);
          strength = this.held.has(id) ? 1 : release === undefined ? 0 : clamp(1 - (this.time - release) / layer.duration, 0, 1);
          if (layer.multicolor && strength > 0) {
            const colors = this.keyColors.get(id);
            if (colors) {
              tint = randomTint(colors, id);
            }
          }
        } else {
          for (const event of this.events) {
            const age = this.time - event.at;
            const fade = clamp(1 - age / layer.duration, 0, 1);
            if (!fade) {
              continue;
            }
            const radius = Math.hypot(x - event.x, y - event.y);
            let power = 0;
            if (layer.effect === 'ripple') {
              power = clamp(1 - Math.abs(radius - age / 1000 * layer.speed) / layer.width, 0, 1) * fade;
            }
            if (layer.effect === 'trail') {
              power = event.id === id ? fade : 0;
            }
            if (power > strength) {
              strength = power;
              if (layer.multicolor) {
                tint = randomTint(event.colors, event.id);
              }
            }
          }
        }
        const alpha = clamp(strength * layer.opacity / 100, 0, 1);
        const colorful = layer.multicolor && !['mixing', 'rt'].includes(layer.effect);
        color = blendCustomRgbColor(color, tint, alpha, colorful);
      }
      frame.keys[id] = '#' + color.map(c => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, '0')).join('');
    }
    return frame;
  }
}
