import { HERO68_KEY_IDS } from './hero68Layout';
import { allRegisteredKeyIds, getBoard, isBoardModelId, type HeroDeviceModelId } from './registry';
import type { RgbColor, RgbProfile, RgbZone } from '../protocol/hero68/rgb';

export const CUSTOM_RGB_DIRECTIONS = [
  { id: 'top-left', label: 'Top Left', dx: -1, dy: -1 },
  { id: 'top', label: 'Top', dx: 0, dy: -1 },
  { id: 'top-right', label: 'Top Right', dx: 1, dy: -1 },
  { id: 'left', label: 'Left', dx: -1, dy: 0 },
  { id: 'center', label: 'Center', dx: 0, dy: 0 },
  { id: 'right', label: 'Right', dx: 1, dy: 0 },
  { id: 'bottom-left', label: 'Bottom Left', dx: -1, dy: 1 },
  { id: 'bottom', label: 'Bottom', dx: 0, dy: 1 },
  { id: 'bottom-right', label: 'Bottom Right', dx: 1, dy: 1 }
] as const;

export type CustomRgbDirection9 = (typeof CUSTOM_RGB_DIRECTIONS)[number]['id'];
export type CustomRgbDirection = 'horizontal' | 'vertical' | CustomRgbDirection9;

const VALID_CUSTOM_RGB_DIRECTIONS = new Set<string>([
  'horizontal',
  'vertical',
  ...CUSTOM_RGB_DIRECTIONS.map(d => d.id)
]);

export function isValidCustomRgbDirection(value: unknown): value is CustomRgbDirection {
  return typeof value === 'string' && VALID_CUSTOM_RGB_DIRECTIONS.has(value);
}

export const CUSTOM_RGB_EFFECTS = [
  {
    id: 'aurora',
    name: 'Aurora',
    detail: 'Soft ribbons of light drift across the keyboard.'
  },
  {
    id: 'wave',
    name: 'Dynamic Wave',
    detail:
      'Multi-directional color waves across 9 directions (including radial Center) with seamless circular palette transitions.'
  },
  {
    id: 'trigger',
    name: 'Trigger Response',
    detail:
      'Each key press launches a smooth cross-shaped row and column wave that cycles through the palette and blends additively.'
  },
  {
    id: 'comet',
    name: 'Comet',
    detail: 'Bright shooting stars leave gently fading tails.'
  },
  {
    id: 'pressure-wave',
    name: 'Pressure Wave',
    detail:
      'Faster strikes emit brighter waves, then settle while held. Strike strength is estimated from Hall motion.'
  },
  {
    id: 'jelly',
    name: 'Jelly',
    detail: 'The illuminated area expands with analog key travel.'
  },
  {
    id: 'scan',
    name: 'Scan',
    detail:
      'A moving band sweeps back and forth. Multicolor flows through a spectrum with smooth turns.'
  },
  {
    id: 'breath',
    name: 'Breath',
    detail: 'The layer gently fades in and out.'
  },
  {
    id: 'ripple',
    name: 'Ripple',
    detail: 'Expanding rings follow each key press.'
  },
  {
    id: 'touch',
    name: 'Touch',
    detail: 'The number row displays the deepest analog key travel as a bar.'
  },
  {
    id: 'reaction',
    name: 'Reaction',
    detail: 'Pressed keys light up and fade after release.'
  },
  {
    id: 'aoe',
    name: 'AOE',
    detail: 'Travel controls the brightness of a fixed area around each key.'
  },
  {
    id: 'mixing',
    name: 'Mixing',
    detail: 'Left, Down and Right arrow travel mix red, green and blue.'
  },
  {
    id: 'trail',
    name: 'Trail',
    detail: 'Each key press lights that key, then fades over time.'
  },
  {
    id: 'rt',
    name: 'RT Display',
    detail:
      'Green/red shows the reported Hall pressed flag. Its correspondence to firmware RT output is unverified.'
  },
  {
    id: 'ember',
    name: 'Ember',
    detail:
      'Warm firelight breathes up from the bottom row, with sparks that drift upward and fade.'
  },
  {
    id: 'starlight',
    name: 'Starlight',
    detail: 'Keys twinkle one at a time like stars: a quick glint, then a long, soft fade.'
  },
  {
    id: 'afterglow',
    name: 'Afterglow',
    detail:
      'A press leaves a hot core that cools through the palette like glowing metal, with a soft halo on nearby keys.'
  },
  {
    id: 'pulse',
    name: 'Tempo Pulse (BPM)',
    detail:
      'Soft rings bloom from the center on every beat, with a stronger accent on the first beat of each bar. Set the tempo in BPM.'
  }
] as const;
export type CustomRgbEffect = (typeof CUSTOM_RGB_EFFECTS)[number]['id'];
export const RGB_GRADIENT_PALETTES = {
  aurora: {
    name: 'Aurora',
    colors: ['#22d3ee', '#8b5cf6', '#ec4899']
  },
  wave: {
    name: 'Dynamic Wave',
    colors: ['#ff0000', '#ffa500', '#ffff00', '#00ff00', '#00ffff', '#0000ff']
  },
  trigger: {
    name: 'Trigger RGB',
    colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff']
  },
  sunset: {
    name: 'Sunset',
    colors: ['#ff6b35', '#f43f5e', '#8b5cf6']
  },
  ice: {
    name: 'Ice',
    colors: ['#0ea5e9', '#67e8f9', '#ffffff']
  },
  // Cool-to-hot ramps (first stop is the dim end) tuned for LEDs: mid-bright, never muddy.
  ember: {
    name: 'Ember',
    colors: ['#e11d00', '#ff7a00', '#ffd27a']
  },
  ocean: {
    name: 'Ocean',
    colors: ['#0057ff', '#00b4d8', '#9af5e4']
  },
  sakura: {
    name: 'Sakura',
    colors: ['#ff4f87', '#ff93b8', '#ffe1ec']
  },
  synthwave: {
    name: 'Synthwave',
    colors: ['#ff2a85', '#8a3ffc', '#12d6ff']
  }
} as const;
export type RgbGradientPalette = keyof typeof RGB_GRADIENT_PALETTES;
// Effects an app that predates `supportedEffects` can render. Newer effects must be listed
// in NEWER_RGB_EFFECTS so that an old background app is asked to update instead of failing.
const NEWER_RGB_EFFECTS: readonly string[] = [
  'aurora',
  'wave',
  'trigger',
  'comet',
  'pressure-wave',
  'ember',
  'starlight',
  'afterglow',
  'pulse'
];
export const LEGACY_RGB_EFFECTS = CUSTOM_RGB_EFFECTS.filter(
  e => !NEWER_RGB_EFFECTS.includes(e.id)
).map(e => e.id);
type EffectMetadata = {
  width?: string;
  widthUnit?: string;
  widthRange?: readonly [number, number, number];
  speed?: string;
  speedLabel?: string;
  speedRange?: readonly [number, number, number];
  duration?: string;
  scanPause?: string;
  direction?: boolean;
  multiDirection?: boolean;
  hall?: boolean;
  gradient?: boolean;
  semanticColor?: boolean;
  defaults?: Partial<CustomRgbLayer>;
};
export const RGB_EFFECT_METADATA: Record<CustomRgbEffect, EffectMetadata> = {
  aurora: {
    width: 'Ribbon width',
    speed: '×',
    gradient: true,
    defaults: {
      color: [34, 211, 238],
      multicolor: true,
      palette: 'aurora',
      opacity: 75,
      width: 2.5,
      speed: 0.5
    }
  },
  wave: {
    width: 'Wave width',
    widthRange: [0.5, 8, 0.25],
    speed: '×',
    speedRange: [0.25, 6, 0.25],
    direction: true,
    multiDirection: true,
    gradient: true,
    defaults: {
      color: [255, 0, 0],
      multicolor: true,
      palette: 'wave',
      opacity: 100,
      width: 2.5,
      speed: 1.5,
      direction: 'left'
    }
  },
  trigger: {
    width: 'Cross width',
    widthRange: [0.5, 4, 0.25],
    speed: '×',
    speedRange: [0.25, 5, 0.25],
    duration: 'Fade duration',
    gradient: true,
    defaults: {
      color: [0, 255, 255],
      multicolor: true,
      palette: 'trigger',
      opacity: 100,
      width: 1,
      speed: 1.5,
      duration: 900
    }
  },
  comet: {
    width: 'Width',
    speed: 'keys/s',
    duration: 'Tail duration',
    direction: true,
    gradient: true,
    defaults: {
      color: [103, 232, 249],
      multicolor: true,
      palette: 'ice',
      opacity: 85
    }
  },
  'pressure-wave': {
    width: 'Width',
    speed: 'keys/s',
    duration: 'Fade duration',
    hall: true,
    defaults: {
      color: [34, 211, 238],
      opacity: 80,
      duration: 1200
    }
  },
  jelly: {
    width: 'Width',
    hall: true
  },
  scan: {
    width: 'Width',
    speed: 'keys/s',
    direction: true,
    scanPause: 'Pause at each end',
    defaults: {
      scanPauseMs: 0
    }
  },
  breath: {
    speed: '×'
  },
  ripple: {
    width: 'Width',
    speed: 'keys/s',
    duration: 'Fade duration'
  },
  touch: {
    hall: true
  },
  reaction: {
    duration: 'Fade duration'
  },
  aoe: {
    width: 'Radius',
    hall: true
  },
  mixing: {
    hall: true,
    semanticColor: true
  },
  trail: {
    duration: 'Fade duration'
  },
  rt: {
    duration: 'Fade duration',
    semanticColor: true
  },
  ember: {
    width: 'Flame height',
    widthRange: [0.75, 5, 0.25],
    speed: '×',
    speedRange: [0.25, 4, 0.25],
    gradient: true,
    defaults: {
      color: [255, 122, 0],
      multicolor: true,
      palette: 'ember',
      opacity: 90,
      width: 3.5,
      speed: 1
    }
  },
  starlight: {
    width: 'Density',
    widthUnit: '/ 10',
    widthRange: [0.3, 9.5, 0.1],
    speed: '×',
    speedRange: [0.25, 4, 0.25],
    gradient: true,
    defaults: {
      color: [200, 225, 255],
      multicolor: true,
      palette: 'ice',
      opacity: 100,
      width: 3,
      speed: 1
    }
  },
  afterglow: {
    width: 'Halo radius',
    duration: 'Cool-down',
    gradient: true,
    defaults: {
      color: [255, 140, 40],
      multicolor: true,
      palette: 'ember',
      opacity: 100,
      width: 1.1,
      duration: 1400
    }
  },
  pulse: {
    width: 'Ring width',
    speed: 'BPM',
    speedLabel: 'Tempo',
    speedRange: [40, 200, 1],
    gradient: true,
    defaults: {
      color: [255, 42, 133],
      multicolor: true,
      palette: 'synthwave',
      opacity: 90,
      width: 1.3,
      speed: 96
    }
  }
};
export function needsRgbAnalogHall(
  config?: CustomRgbConfiguration,
  modelOrKeyIds?: HeroDeviceModelId | readonly string[]
) {
  return rgbHallKeys(config, modelOrKeyIds).length > 0;
}
/** Input sources differ from the LEDs affected by a layer. */
export function rgbHallKeys(
  config?: CustomRgbConfiguration,
  modelOrKeyIds: HeroDeviceModelId | readonly string[] = 'hero68'
): string[] {
  const boardKeyIds: readonly string[] =
    typeof modelOrKeyIds === 'string'
      ? isBoardModelId(modelOrKeyIds)
        ? getBoard(modelOrKeyIds).keyIds
        : HERO68_KEY_IDS
      : modelOrKeyIds;
  const allowedKeys = new Set(allRegisteredKeyIds());
  for (const id of boardKeyIds) {
    allowedKeys.add(id);
  }
  const keys = new Set<string>();
  for (const layer of config?.layers ?? []) {
    if (
      !layer.enabled ||
      layer.opacity <= 0 ||
      !layer.keys.length ||
      !RGB_EFFECT_METADATA[layer.effect]?.hall
    ) {
      continue;
    }
    const sources =
      layer.effect === 'pressure-wave'
        ? layer.keys
        : layer.effect === 'mixing'
          ? ['ArrowLeft', 'ArrowDown', 'ArrowRight']
          : boardKeyIds;
    for (const id of sources) {
      if (allowedKeys.has(id)) {
        keys.add(id);
      }
    }
  }
  return [...keys];
}
export type CustomRgbLayer = {
  id: string;
  effect: CustomRgbEffect;
  enabled: boolean;
  color: RgbColor;
  multicolor: boolean;
  opacity: number;
  width: number;
  speed: number;
  duration: number;
  direction: CustomRgbDirection;
  keys: string[];
  palette?: RgbGradientPalette;
  scanPauseMs?: number;
};
export type CustomRgbBaseEffect = {
  effect: 'aurora' | 'wave';
  palette: RgbGradientPalette;
  width: number;
  speed: number;
  direction?: CustomRgbDirection;
};
export type CustomRgbConfiguration = {
  version: 1;
  enabled: boolean;
  base: RgbZone;
  baseEffect?: CustomRgbBaseEffect;
  presetColors?: Record<number, Record<string, RgbColor>>;
  layers: CustomRgbLayer[];
};
export const MAX_RGB_LAYERS = 8;
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const finite = (v: unknown, fallback: number, low: number, high: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, low, high) : fallback;
export function createRgbLayer(
  effect: CustomRgbEffect = 'ripple',
  id: string = crypto.randomUUID(),
  keyIds: readonly string[] = HERO68_KEY_IDS
): CustomRgbLayer {
  return {
    id,
    effect,
    enabled: true,
    color: [255, 217, 90],
    multicolor: false,
    opacity: 100,
    width: 1.5,
    speed: 6,
    duration: 900,
    direction: 'horizontal',
    keys: [...keyIds],
    ...RGB_EFFECT_METADATA[effect].defaults
  };
}
function isXsydLikeZone(zone?: Partial<RgbZone>): boolean {
  return Boolean(
    zone &&
    (zone.colorIndex !== undefined || zone.reverse !== undefined || Array.isArray(zone.palette))
  );
}
export function defaultCustomRgb(profile: RgbProfile): CustomRgbConfiguration {
  const isXsyd = isXsydLikeZone(profile.keys);
  const base: RgbZone = {
    ...profile.keys,
    mode: isXsyd ? 21 : 19,
    mix: true,
    rgb: profile.keys.rgb.some(channel => channel > 0) ? [...profile.keys.rgb] : [255, 255, 255]
  };
  delete base.mixValue;
  return {
    version: 1,
    enabled: false,
    base,
    layers: []
  };
}
export function restoreCustomRgb(
  value: unknown,
  profile: RgbProfile,
  validKeyIds?: readonly string[]
): CustomRgbConfiguration {
  const fallback = defaultCustomRgb(profile);
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  const v = value as Partial<CustomRgbConfiguration>;
  const base = v.base;
  if (v.version !== 1 || !base || !Array.isArray(v.layers)) {
    return fallback;
  }
  const allowedSet = new Set(validKeyIds ?? allRegisteredKeyIds());
  const defaultKeys = validKeyIds ?? HERO68_KEY_IDS;
  const ids = new Set<string>();
  const restoredBase: RgbZone = {
    mode: Math.round(finite(base.mode, fallback.base.mode, 0, 255)),
    mix: typeof base.mix === 'boolean' ? base.mix : fallback.base.mix,
    rgb: [0, 1, 2].map(i => Math.round(finite(base.rgb?.[i], 255, 0, 255))) as RgbColor,
    brightness: Math.round(finite(base.brightness, fallback.base.brightness, 0, 20)),
    speed: Math.round(finite(base.speed, 2, 0, 4)),
    ...(typeof base.reverse === 'boolean' ? { reverse: base.reverse } : {}),
    ...(typeof base.colorIndex === 'number' && Number.isFinite(base.colorIndex)
      ? { colorIndex: Math.round(clamp(base.colorIndex, 0, 7)) }
      : {}),
    ...(Array.isArray(base.palette) && base.palette.length === 7
      ? {
          palette: base.palette.map(
            c =>
              [
                Math.round(finite(c?.[0], 255, 0, 255)),
                Math.round(finite(c?.[1], 255, 0, 255)),
                Math.round(finite(c?.[2], 255, 0, 255))
              ] as RgbColor
          )
        }
      : {})
  };
  return {
    version: 1,
    enabled: v.enabled === true,
    base: restoredBase,
    ...(v.baseEffect?.effect === 'aurora'
      ? {
          baseEffect: {
            effect: 'aurora' as const,
            palette: Object.hasOwn(RGB_GRADIENT_PALETTES, v.baseEffect.palette)
              ? v.baseEffect.palette
              : ('aurora' as const),
            width: finite(v.baseEffect.width, 2.5, 0.25, 12),
            speed: finite(v.baseEffect.speed, 0.5, 0.5, 30)
          }
        }
      : v.baseEffect?.effect === 'wave'
        ? {
            baseEffect: {
              effect: 'wave' as const,
              palette: Object.hasOwn(RGB_GRADIENT_PALETTES, v.baseEffect.palette)
                ? v.baseEffect.palette
                : ('wave' as const),
              width: finite(v.baseEffect.width, 2.5, 0.5, 8),
              speed: finite(v.baseEffect.speed, 1.5, 0.25, 6),
              direction: isValidCustomRgbDirection(v.baseEffect.direction)
                ? v.baseEffect.direction
                : 'left'
            }
          }
        : {}),
    ...(v.presetColors && typeof v.presetColors === 'object'
      ? {
          presetColors: Object.fromEntries(
            Object.entries(v.presetColors).flatMap(([modeKey, cols]) => {
              const modeNum = Number(modeKey);
              if (!Number.isFinite(modeNum) || !cols || typeof cols !== 'object') {
                return [];
              }
              const restoredEntries = Object.entries(cols).flatMap(([keyId, c]) => {
                if (!Array.isArray(c) || c.length < 3) return [];
                return [
                  [keyId, [0, 1, 2].map(i => Math.round(finite(c[i], 0, 0, 255))) as RgbColor]
                ];
              });
              return [[modeNum, Object.fromEntries(restoredEntries)]];
            })
          )
        }
      : {}),
    layers: v.layers.slice(0, MAX_RGB_LAYERS).flatMap(layer => {
      if (!layer || !CUSTOM_RGB_EFFECTS.some(e => e.id === layer.effect)) {
        return [];
      }
      const id =
        typeof layer.id === 'string' && layer.id && !ids.has(layer.id)
          ? layer.id
          : `layer-${ids.size}`;
      if (ids.has(id)) {
        return [];
      }
      ids.add(id);
      const defaults = createRgbLayer(layer.effect, id, defaultKeys);
      const hasValidPalette = Boolean(
        layer.palette && Object.hasOwn(RGB_GRADIENT_PALETTES, layer.palette)
      );
      return [
        {
          id,
          effect: layer.effect,
          enabled: layer.enabled !== false,
          color: [0, 1, 2].map(i =>
            Math.round(finite(layer.color?.[i], defaults.color[i], 0, 255))
          ) as RgbColor,
          multicolor:
            layer.multicolor === undefined ? defaults.multicolor : layer.multicolor === true,
          opacity: finite(layer.opacity, defaults.opacity, 0, 100),
          width: finite(
            layer.width,
            defaults.width,
            RGB_EFFECT_METADATA[layer.effect].widthRange?.[0] ?? 0.25,
            RGB_EFFECT_METADATA[layer.effect].widthRange?.[1] ?? 12
          ),
          speed: finite(
            layer.speed,
            defaults.speed,
            RGB_EFFECT_METADATA[layer.effect].speedRange?.[0] ?? 0.5,
            RGB_EFFECT_METADATA[layer.effect].speedRange?.[1] ?? 30
          ),
          duration: finite(layer.duration, defaults.duration, 100, 4000),
          direction: isValidCustomRgbDirection(layer.direction)
            ? layer.direction
            : defaults.direction,
          ...(layer.effect === 'scan'
            ? {
                scanPauseMs: finite(layer.scanPauseMs, 0, 0, 5000)
              }
            : {}),
          ...(RGB_EFFECT_METADATA[layer.effect].gradient || hasValidPalette
            ? {
                palette: hasValidPalette ? layer.palette : defaults.palette
              }
            : {}),
          keys: Array.isArray(layer.keys)
            ? [...new Set(layer.keys.filter(id => allowedSet.has(id)))]
            : [...defaultKeys]
        }
      ];
    })
  };
}
