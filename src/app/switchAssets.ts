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
import { isWin68HeMaxModel, type HeroDeviceModelId } from '../keyboard/devices';
import {
  HERO68_SWITCH_PROFILES,
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
  'switch-14': { front: jadeProFront, top: jadeProTop }
};

const SWITCH_OPTIONS: SwitchOption[] = HERO68_SWITCH_PROFILES.filter(
  option => ![5, 22, 24].includes(option.firmwareId)
).map(option => ({
  id: option.id,
  name: option.name,
  fullName: `${option.name} Switch`,
  brand: 'AULA presets',
  accent: option.color,
  note: '',
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
