import { VI_COMMON } from './common';
import { VI_PERFORMANCE } from './performance';
import { VI_REMAP_AND_MACRO } from './remapAndMacro';
import { VI_LIGHTING } from './lighting';
import { VI_SERVICE_AND_SETTINGS } from './serviceAndSettings';
import { VI_GAMEPAD } from './gamepad';

export {
  VI_COMMON,
  VI_PERFORMANCE,
  VI_REMAP_AND_MACRO,
  VI_LIGHTING,
  VI_SERVICE_AND_SETTINGS,
  VI_GAMEPAD
};

export const VI_MODULES = [
  ['common', VI_COMMON],
  ['performance', VI_PERFORMANCE],
  ['remapAndMacro', VI_REMAP_AND_MACRO],
  ['lighting', VI_LIGHTING],
  ['serviceAndSettings', VI_SERVICE_AND_SETTINGS],
  ['gamepad', VI_GAMEPAD]
] as const;

export const VI: Readonly<Record<string, string>> = {
  ...VI_COMMON,
  ...VI_PERFORMANCE,
  ...VI_REMAP_AND_MACRO,
  ...VI_LIGHTING,
  ...VI_SERVICE_AND_SETTINGS,
  ...VI_GAMEPAD
};
