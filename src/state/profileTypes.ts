import type { HeroDeviceModelId } from '../keyboard/devices';
import type { ProfileSlot } from '../protocol/hero68/types';
import type { ProfileDraft } from './persistence';

declare const Buffer:
  | {
      from: (
        input: string,
        encoding?: string
      ) => { toString: (encoding?: string) => string };
    }
  | undefined;

export type ProfileNamespace = 'onboard' | 'linked' | 'inactive';

export type ProfileId =
  | { namespace: 'onboard'; slotIndex: ProfileSlot; deviceModel: HeroDeviceModelId }
  | {
      namespace: 'linked';
      uid: string;
      targetSlot?: ProfileSlot;
      deviceModel: HeroDeviceModelId;
    }
  | { namespace: 'inactive'; uid: string; deviceModel: HeroDeviceModelId };

export type AppFilterMatchType = 'AllMatches' | 'AnyMatches';

export type CustomAppFilter =
  | { kind: 'processName'; value: string; caseSensitive?: boolean }
  | { kind: 'processDirectory'; value: string; caseSensitive?: boolean }
  | { kind: 'windowTitle'; value: string; caseSensitive?: boolean }
  | { kind: 'processFullPath'; value: string; caseSensitive?: boolean };

export interface LinkedAppRule {
  id: string;
  name: string;
  iconUrl?: string;
  sourceType: 'running' | 'steam' | 'disk' | 'custom';
  steamAppId?: number;
  matchType: AppFilterMatchType;
  filters: CustomAppFilter[];
}

export type WootPresetType = 'fps' | 'racing' | 'typing' | 'analog' | 'tenz' | 'custom';

export interface WootProfileMetadata {
  uid: string;
  name: string; // Max 55 UTF-8 bytes
  color: string; // Hex color, default '#ffd45c'
  icon: string; // Wootility icon ID: 'woot:g:yellow', 'switchy:gamer', 'uwu:excited', etc.
  tier?: ProfileNamespace;
  presetType?: WootPresetType;
  createdFor: HeroDeviceModelId;
  updatedAt: number;
  executionMode: 'slot-switch' | 'ram-stream';
  mappedOnboardSlot?: ProfileSlot; // Hardware slot (0..2 on HERO, 0..3 on WIN68 HE MAX)
  linkedApps: LinkedAppRule[];
}

export interface StoredProfileRecord {
  metadata: WootProfileMetadata;
  draft: ProfileDraft;
}

export type SavedKeyboardProfile = StoredProfileRecord;

export const MAX_PROFILE_NAME_BYTES = 55;
export const MAX_FILTERS_PER_APP = 3;
export const MAX_LINKED_PROFILES = 10;
export const MAX_INACTIVE_PROFILES = 25;
export const REQUIRED_AUTO_PROFILE_SERVICE_VERSION = '1.8.0';

export const WOOT_PROFILE_COLORS: readonly string[] = [
  '#ffd45c', // Wooting Gold
  '#38bdf8', // Sky Blue
  '#4ade80', // Emerald Green
  '#f87171', // Coral Red
  '#a78bfa', // Violet
  '#fb923c', // Orange
  '#f472b6', // Pink
  '#2dd4bf', // Teal
  '#e2e8f0' // Silver
];

/**
 * Exact Wootility v5 ProfileIcons registry (`j3` in `wootility.readable.js`),
 * mapped to `/images/ProfileIcons/<Filename>.svg` extracted from `wootility-assets.zip`.
 */
export const WOOT_ICON_MAP: Readonly<Record<string, string>> = {
  // Gradients (18)
  'grad:gray': 'Gradient_gray',
  'grad:black': 'Gradient_black',
  'grad:pastelRed': 'Gradient_pastelRed',
  'grad:pastelOrange': 'Gradient_pastelOrange',
  'grad:pastelYellow': 'Gradient_pastelYellow',
  'grad:pastelGreen': 'Gradient_pastelGreen',
  'grad:pastelBlue': 'Gradient_pastelBlue',
  'grad:pastelPurple': 'Gradient_pastelPurple',
  'grad:pastelPink': 'Gradient_pastelPink',
  'grad:red': 'Gradient_red',
  'grad:orange': 'Gradient_orange',
  'grad:yellow': 'Gradient_yellow',
  'grad:green': 'Gradient_green',
  'grad:turquoise': 'Gradient_turquoise',
  'grad:blue': 'Gradient_blue',
  'grad:purple': 'Gradient_purple',
  'grad:pink': 'Gradient_pink',
  'grad:pride': 'Gradient_pride',

  // Switchy & UwU (43)
  'switchy:actually': 'Switchy_actually',
  'switchy:angry': 'Switchy_angry',
  'switchy:ban': 'Switchy_ban',
  'switchy:confetti': 'Switchy_confetti',
  'switchy:confused': 'Switchy_confused',
  'switchy:cool': 'Switchy_cool',
  'switchy:cosy': 'Switchy_cosy',
  'switchy:cross': 'Switchy_cross',
  'switchy:cry': 'Switchy_cry',
  'switchy:dead': 'Switchy_dead',
  'switchy:drool': 'Switchy_drool',
  'switchy:evil': 'Switchy_evil',
  'switchy:gamer': 'Switchy_gamer',
  'switchy:gamerUltra': 'Switchy_gamerUltra',
  'switchy:heart': 'Switchy_heart',
  'switchy:heartEyes': 'Switchy_heartEyes',
  'switchy:hehe': 'Switchy_hehe',
  'switchy:knife': 'Switchy_knife',
  'switchy:laser': 'Switchy_laser',
  'switchy:nervous': 'Switchy_nervous',
  'switchy:o7': 'Switchy_o7',
  'switchy:oops': 'Switchy_oops',
  'switchy:pog': 'Switchy_pog',
  'switchy:popcorn': 'Switchy_popcorn',
  'switchy:pray': 'Switchy_pray',
  'switchy:scared': 'Switchy_scared',
  'switchy:sippy': 'Switchy_sippy',
  'switchy:sit': 'Switchy_sit',
  'switchy:smug': 'Switchy_smug',
  'switchy:sweat': 'Switchy_sweat',
  'switchy:think': 'Switchy_think',
  'switchy:tikky': 'Switchy_tikky',
  'switchy:tired': 'Switchy_tired',
  'switchy:uwu': 'Switchy_uwu',
  'switchy:wave': 'Switchy_wave',
  'uwu:cool': 'Uwu_cool',
  'uwu:angry': 'Uwu_angry',
  'uwu:confused': 'Uwu_confused',
  'uwu:cry': 'Uwu_cry',
  'uwu:default': 'Uwu_default',
  'uwu:excited': 'Uwu_excited',
  'uwu:kiss': 'Uwu_kiss',
  'uwu:owo': 'Uwu_owo',

  // Wooting Logos (28)
  'woot:p:white': 'WootingLogo_Plain_white',
  'woot:p:black': 'WootingLogo_Plain_black',
  'woot:p:pastelRed': 'WootingLogo_Plain_pastelRed',
  'woot:p:pastelOrange': 'WootingLogo_Plain_pastelOrange',
  'woot:p:pastelYellow': 'WootingLogo_Plain_pastelYellow',
  'woot:p:pastelGreen': 'WootingLogo_Plain_pastelGreen',
  'woot:p:pastelBlue': 'WootingLogo_Plain_pastelBlue',
  'woot:p:pastelPurple': 'WootingLogo_Plain_pastelPurple',
  'woot:p:pastelPink': 'WootingLogo_Plain_pastelPink',
  'woot:p:red': 'WootingLogo_Plain_red',
  'woot:p:orange': 'WootingLogo_Plain_orange',
  'woot:p:yellow': 'WootingLogo_Plain_yellow',
  'woot:p:green': 'WootingLogo_Plain_green',
  'woot:p:turquoise': 'WootingLogo_Plain_turquoise',
  'woot:p:blue': 'WootingLogo_Plain_blue',
  'woot:p:purple': 'WootingLogo_Plain_purple',
  'woot:p:magenta': 'WootingLogo_Plain_magenta',
  'woot:pride': 'WootingLogo_pride',
  'woot:g:orange': 'WootingLogo_Gradient_orange',
  'woot:g:yellow': 'WootingLogo_Gradient_yellow',
  'woot:g:sunset': 'WootingLogo_Gradient_sunset',
  'woot:g:peachBlue': 'WootingLogo_Gradient_peachBlue',
  'woot:g:greenPurple': 'WootingLogo_Gradient_greenPurple',
  'woot:g:blue': 'WootingLogo_Gradient_blue',
  'woot:g:green': 'WootingLogo_Gradient_green',
  'woot:g:yellowPurple': 'WootingLogo_Gradient_yellowPurple',
  'woot:g:pinkPurple': 'WootingLogo_Gradient_pinkPurple',
  'woot:g:pinkMagenta': 'WootingLogo_Gradient_pinkMagenta',

  // Friendly aliases for presets
  fps: 'Switchy_gamer',
  racing: 'Switchy_cool',
  typing: 'WootingLogo_Plain_black',
  analog: 'Switchy_gamerUltra',
  tenz: 'WootingLogo_Gradient_blue',
  code: 'Switchy_think',
  music: 'Switchy_confetti',
  sparkles: 'WootingLogo_Gradient_yellow',
  custom: 'WootingLogo_Plain_black'
};

export function resolveWootProfileIconUrl(iconId?: string | null): string {
  const key = iconId && WOOT_ICON_MAP[iconId] ? WOOT_ICON_MAP[iconId] : 'WootingLogo_Plain_black';
  return `/images/ProfileIcons/${key}.svg`;
}

export type WootIconCategory = 'switchyUwu' | 'wooting' | 'gradients';

export const WOOT_ICON_CATEGORIES: readonly {
  id: WootIconCategory;
  label: string;
  icons: readonly string[];
}[] = [
  {
    id: 'switchyUwu',
    label: 'SWITCHY & UwU',
    icons: Object.keys(WOOT_ICON_MAP).filter(
      k => k.startsWith('switchy:') || k.startsWith('uwu:')
    )
  },
  {
    id: 'wooting',
    label: 'WOOTING',
    icons: Object.keys(WOOT_ICON_MAP).filter(k => k.startsWith('woot:'))
  },
  {
    id: 'gradients',
    label: 'GRADIENTS',
    icons: Object.keys(WOOT_ICON_MAP).filter(k => k.startsWith('grad:'))
  }
];

export const WOOT_PROFILE_ICONS: readonly { id: string; label: string }[] = [
  { id: 'woot:p:black', label: 'Default' },
  { id: 'switchy:gamer', label: 'Switchy Gamer' },
  { id: 'switchy:gamerUltra', label: 'Gamer Ultra' },
  { id: 'switchy:cool', label: 'Switchy Cool' },
  { id: 'switchy:pog', label: 'Switchy Pog' },
  { id: 'switchy:laser', label: 'Switchy Laser' },
  { id: 'switchy:heartEyes', label: 'Heart Eyes' },
  { id: 'switchy:knife', label: 'Knife' },
  { id: 'uwu:excited', label: 'UwU Excited' },
  { id: 'uwu:cool', label: 'UwU Cool' },
  { id: 'woot:g:yellow', label: 'Gold Gradient' },
  { id: 'woot:g:blue', label: 'Blue Gradient' }
];

export interface WootPresetDefinition {
  id: WootPresetType;
  title: string;
  description: string;
  defaultName: string;
  color: string;
  icon: string;
  imageSrc: string;
  actuationMm: number;
  rapidTrigger: boolean;
  rapidSensitivityMm: number;
}

export const WOOT_PROFILE_PRESETS: readonly WootPresetDefinition[] = [
  {
    id: 'fps',
    title: 'FPS',
    description: 'Ultra-fast actuation (0.4 mm) and Rapid Trigger (0.15 mm) for competitive shooters.',
    defaultName: 'New FPS Profile',
    color: '#f87171',
    icon: 'switchy:gamer',
    imageSrc: '/images/ProfilePresetImages/fps.svg',
    actuationMm: 0.4,
    rapidTrigger: true,
    rapidSensitivityMm: 0.15
  },
  {
    id: 'racing',
    title: 'Racing',
    description: 'Smooth travel response (1.2 mm) with balanced Rapid Trigger (0.35 mm).',
    defaultName: 'New Racing Profile',
    color: '#fb923c',
    icon: 'switchy:cool',
    imageSrc: '/images/ProfilePresetImages/racing.svg',
    actuationMm: 1.2,
    rapidTrigger: true,
    rapidSensitivityMm: 0.35
  },
  {
    id: 'typing',
    title: 'Typing',
    description: 'Comfortable 2.0 mm actuation point with Rapid Trigger disabled to prevent typos.',
    defaultName: 'New Typing Profile',
    color: '#38bdf8',
    icon: 'woot:p:blue',
    imageSrc: '/images/ProfilePresetImages/typing.svg',
    actuationMm: 2.0,
    rapidTrigger: false,
    rapidSensitivityMm: 0.65
  },
  {
    id: 'analog',
    title: 'Analog Movement',
    description: 'Optimized 1.0 mm actuation for hybrid keyboard + analog controller workflows.',
    defaultName: 'New Analog Profile',
    color: '#4ade80',
    icon: 'switchy:gamerUltra',
    imageSrc: '/images/ProfilePresetImages/analogMovement.svg',
    actuationMm: 1.0,
    rapidTrigger: true,
    rapidSensitivityMm: 0.25
  },
  {
    id: 'tenz',
    title: 'TenZ Pro FPS',
    description: 'Instant 0.1 mm actuation and 0.15 mm Rapid Trigger tuned for peak competitive play.',
    defaultName: 'TenZ Pro Profile',
    color: '#38bdf8',
    icon: 'woot:g:blue',
    imageSrc: '/images/ProfilePresetImages/tenz.svg',
    actuationMm: 0.2,
    rapidTrigger: true,
    rapidSensitivityMm: 0.15
  },
  {
    id: 'custom',
    title: 'Custom',
    description: 'Start from standard baseline settings (1.6 mm) and customize every key yourself.',
    defaultName: 'New Custom Profile',
    color: '#ffd45c',
    icon: 'woot:p:black',
    imageSrc: '/images/ProfilePresetImages/custom.svg',
    actuationMm: 1.6,
    rapidTrigger: false,
    rapidSensitivityMm: 0.65
  }
];

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function clampUtf8String(value: string, maxBytes = MAX_PROFILE_NAME_BYTES): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).length <= maxBytes) {
    return value;
  }
  let out = '';
  for (const ch of value) {
    if (encoder.encode(out + ch).length > maxBytes) {
      break;
    }
    out += ch;
  }
  return out;
}

export function createDefaultOnboardMetadata(
  slot: ProfileSlot,
  name: string,
  model: HeroDeviceModelId = 'hero68'
): WootProfileMetadata {
  const defaultColors: Record<ProfileSlot, string> = {
    0: '#ffd45c',
    1: '#38bdf8',
    2: '#4ade80',
    3: '#a78bfa'
  };
  const defaultIcons: Record<ProfileSlot, string> = {
    0: 'woot:p:black',
    1: 'switchy:gamer',
    2: 'switchy:cool',
    3: 'uwu:excited'
  };
  return {
    uid: `onboard-${slot}`,
    name: name || `Onboard Profile ${slot}`,
    color: defaultColors[slot] ?? '#ffd45c',
    icon: defaultIcons[slot] ?? 'woot:p:black',
    tier: 'onboard',
    presetType: slot === 1 ? 'fps' : slot === 2 ? 'typing' : slot === 3 ? 'analog' : 'custom',
    createdFor: model,
    updatedAt: Date.now(),
    executionMode: 'slot-switch',
    mappedOnboardSlot: slot,
    linkedApps: []
  };
}

/** Deterministic dominant accent color from app name (mirrors iee(iconUrl) in Wootility L61875) */
export function extractDominantColorFromApp(appName: string): string {
  const lower = appName.toLowerCase();
  if (lower.includes('valorant') || lower.includes('apex') || lower.includes('doom')) {
    return '#f87171';
  }
  if (lower.includes('cs2') || lower.includes('counter-strike') || lower.includes('pubg')) {
    return '#ffd45c';
  }
  if (lower.includes('overwatch') || lower.includes('forza') || lower.includes('trackmania')) {
    return '#fb923c';
  }
  if (lower.includes('minecraft') || lower.includes('spotify') || lower.includes('razer')) {
    return '#4ade80';
  }
  if (lower.includes('discord') || lower.includes('code') || lower.includes('steam')) {
    return '#38bdf8';
  }
  if (lower.includes('osu')) {
    return '#f472b6';
  }
  let hash = 0;
  for (let i = 0; i < lower.length; i++) {
    hash = (hash * 31 + lower.charCodeAt(i)) >>> 0;
  }
  return WOOT_PROFILE_COLORS[hash % WOOT_PROFILE_COLORS.length];
}

export interface ExportedWootProfileBundle {
  schema: 'openaula-woot-profile';
  version: 2;
  metadata: WootProfileMetadata;
  draft: ProfileDraft;
}

export function encodeProfileShareCode(record: StoredProfileRecord): string {
  const bundle: ExportedWootProfileBundle = {
    schema: 'openaula-woot-profile',
    version: 2,
    metadata: record.metadata,
    draft: record.draft
  };
  const json = JSON.stringify(bundle);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : typeof Buffer !== 'undefined'
        ? Buffer.from(json, 'utf8').toString('base64')
        : '';
  return `OA2-${base64}`;
}

export function decodeProfileShareCode(input: string): StoredProfileRecord {
  const trimmed = input.trim();
  let jsonText = trimmed;
  if (trimmed.startsWith('OA2-')) {
    const b64 = trimmed.slice(4).trim();
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      jsonText = new TextDecoder().decode(bytes);
    } else if (typeof Buffer !== 'undefined') {
      jsonText = Buffer.from(b64, 'base64').toString('utf8');
    }
  }
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid profile format');
  }
  if (parsed.schema === 'openaula-woot-profile' && parsed.metadata && parsed.draft) {
    const meta = parsed.metadata as WootProfileMetadata;
    return {
      metadata: {
        ...meta,
        uid: `imported-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: clampUtf8String(meta.name || 'Imported Profile'),
        color: meta.color || '#ffd45c',
        icon: meta.icon || 'woot:p:black',
        createdFor: (meta.createdFor as HeroDeviceModelId) || 'hero68',
        updatedAt: Date.now(),
        executionMode: meta.executionMode === 'ram-stream' ? 'ram-stream' : 'slot-switch',
        linkedApps: Array.isArray(meta.linkedApps) ? meta.linkedApps : []
      },
      draft: parsed.draft as ProfileDraft
    };
  }
  if (parsed.settings && typeof parsed.settings === 'object') {
    return {
      metadata: {
        uid: `imported-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: clampUtf8String(typeof parsed.name === 'string' ? parsed.name : 'Imported Profile'),
        color: '#ffd45c',
        icon: 'woot:p:black',
        createdFor: (parsed.deviceModel as HeroDeviceModelId) || 'hero68',
        updatedAt: Date.now(),
        executionMode: 'slot-switch',
        linkedApps: []
      },
      draft: parsed.settings as ProfileDraft
    };
  }
  throw new Error('Unrecognized profile file or share code');
}
