import clearFront from '../assets/switches/clear-front.png';
import clearTop from '../assets/switches/clear-top.png';
import blueFront from '../assets/switches/blue-front.png';
import blueTop from '../assets/switches/blue-top.png';
import blackFront from '../assets/switches/black-front.png';
import blackTop from '../assets/switches/black-top.png';
import whiteFront from '../assets/switches/white-front.png';
import whiteTop from '../assets/switches/white-top.png';
import wingChunTop from '../assets/switches/wing-chun-top.png';
import uranusTop from '../assets/switches/uranus-top.png';
import jadeProTop from '../assets/switches/jade-pro-top.png';
import wingChunFront from '../assets/switches/wing-chun-front.png';
import uranusFront from '../assets/switches/uranus-front.png';
import jadeProFront from '../assets/switches/jade-pro-front.png';
import lingyunFront from '../assets/switches/lingyun-front.png';
import lingyunTop from '../assets/switches/lingyun-top.png';
import snowgodFront from '../assets/switches/snowgod-front.webp';
import snowgodTop from '../assets/switches/snowgod-top.png';
import icejadeFront from '../assets/switches/icejade-front.png';
import icejadeTop from '../assets/switches/icejade-top.png';
import nickFront from '../assets/switches/nick-front.png';
import nickTop from '../assets/switches/nick-top.png';
import ashwoodFront from '../assets/switches/ashwood-front.png';
import ashwoodTop from '../assets/switches/ashwood-top.png';
import { isWin68HeMaxModel, type HeroDeviceModelId } from '../keyboard/devices';
import {
  ALL_HERO68_SWITCH_PROFILES,
  HERO68_XS_SWITCH_PROFILES,
  WIN68_SWITCH_PROFILES,
  type SwitchProfileId
} from '../protocol/hero68/switchProfiles';

type SwitchTone = SwitchProfileId;

type SwitchOption = {
  id: SwitchTone;
  name: string;
  fullName: string;
  brand: string;
  accent: string;
  note: string;
  travelMm?: number;
  xsydFirmwareId?: number;
  front?: string;
  top?: string;
};

const SWITCH_IMAGES: Partial<Record<SwitchTone, { front: string; top: string }>> = {
  white: { front: whiteFront, top: whiteTop },
  black: { front: blackFront, top: blackTop },
  blue: { front: blueFront, top: blueTop },
  clear: { front: clearFront, top: clearTop },
  'switch-4': { front: wingChunFront, top: wingChunTop },
  'wing-chun': { front: wingChunFront, top: wingChunTop },
  'switch-3': { front: uranusFront, top: uranusTop },
  uranus: { front: uranusFront, top: uranusTop },
  'switch-1': { front: jadeProFront, top: jadeProTop },
  'jade-pro': { front: jadeProFront, top: jadeProTop },
  'switch-14': { front: jadeProFront, top: jadeProTop },
  'switch-60': { front: snowgodFront, top: snowgodTop },
  'switch-62': { front: icejadeFront, top: icejadeTop },
  'switch-59': { front: lingyunFront, top: lingyunTop },
  'switch-37': { front: ashwoodFront, top: ashwoodTop },
  'switch-61': { front: nickFront, top: nickTop },
  'switch-76': { front: blueFront, top: blueTop }
};

const HERO68_XS_SWITCH_IDS = new Set<number>(
  HERO68_XS_SWITCH_PROFILES.map(profile => profile.firmwareId)
);

const SWITCH_NOTES: Partial<Record<SwitchTone, string>> = {
  'switch-60': 'ID 60 · 3.3 mm · 28±5 gf · 85–550 Gs · Dual light guide (雪神轴)',
  'switch-62': 'ID 62 · 3.4 mm · 28±5 gf · 80–480 Gs · Single light guide (冰玉轴)',
  'switch-59': 'ID 59 · 3.4 mm · Lingyun Magnetic (灵云轴)',
  'switch-37': 'ID 37 · 3.4 mm · Ash Wood Magnetic (灰木轴)',
  'switch-61': 'ID 61 · 3.4 mm · Nick Magnetic (尼克磁轴)',
  'switch-76': 'ID 76 · 3.4 mm · HERO 68 XS v1.17 preset'
};

const SWITCH_OPTIONS: SwitchOption[] = ALL_HERO68_SWITCH_PROFILES.filter(
  option => ![5, 22, 24].includes(option.firmwareId)
).map(option => ({
  id: option.id,
  name: option.name,
  fullName: `${option.name} Switch`,
  brand: HERO68_XS_SWITCH_IDS.has(option.firmwareId) ? 'HERO 68 XS presets' : 'AULA presets',
  accent: option.color,
  note: SWITCH_NOTES[option.id] ?? `ID ${option.firmwareId} · ${option.travelMm.toFixed(1)} mm`,
  travelMm: option.travelMm,
  xsydFirmwareId: option.xsydFirmwareId,
  ...SWITCH_IMAGES[option.id]
}));

const WIN68_SWITCH_OPTIONS: SwitchOption[] = WIN68_SWITCH_PROFILES.map(option => ({
  id: option.id,
  name: option.name,
  fullName: option.fullName,
  brand: 'WIN 68 HE MAX (XSYD)',
  accent: option.color,
  note: `ID ${option.xsydFirmwareId} · ${option.travelMm.toFixed(1)} mm`,
  travelMm: option.travelMm,
  xsydFirmwareId: option.xsydFirmwareId,
  ...SWITCH_IMAGES[option.id]
}));

function switchOptionsForModel(model?: HeroDeviceModelId): SwitchOption[] {
  if (model && isWin68HeMaxModel(model)) {
    return WIN68_SWITCH_OPTIONS;
  }
  return SWITCH_OPTIONS;
}

export { SWITCH_IMAGES, SWITCH_OPTIONS, WIN68_SWITCH_OPTIONS, switchOptionsForModel };
export type { SwitchTone, SwitchOption };
