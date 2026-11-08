const hero68Thumb = '/src/assets/hero68.png';
const hero68XsThumb = '/src/assets/hero68xs.png';
import { HERO68_LAYOUT, makeDemoLighting } from '../../hero68Layout';
import type { BoardDescriptor } from '../types';
import {
  BYTETECH_REPORT_ID,
  BYTETECH_USAGE,
  BYTETECH_USAGE_PAGE,
  BYTETECH_VENDOR_ID,
  buildFactoryRemapLayersFromCatalog,
  computeKeyCoordinates,
  keyIdsOf
} from '../shared/bytetechCatalog';

export const HERO68_BOARD_KEY_POSITIONS: Readonly<Record<string, number>> = {
  Escape: 1,
  Digit1: 15,
  Digit2: 16,
  Digit3: 17,
  Digit4: 18,
  Digit5: 19,
  Digit6: 20,
  Digit7: 21,
  Digit8: 22,
  Digit9: 23,
  Digit0: 24,
  Minus: 25,
  Equal: 26,
  Backspace: 27,
  Insert: 98,

  Tab: 28,
  KeyQ: 29,
  KeyW: 30,
  KeyE: 31,
  KeyR: 32,
  KeyT: 33,
  KeyY: 34,
  KeyU: 35,
  KeyI: 36,
  KeyO: 37,
  KeyP: 38,
  BracketLeft: 39,
  BracketRight: 40,
  Backslash: 41,
  Delete: 99,

  CapsLock: 42,
  KeyA: 43,
  KeyS: 44,
  KeyD: 45,
  KeyF: 46,
  KeyG: 47,
  KeyH: 48,
  KeyJ: 49,
  KeyK: 50,
  KeyL: 51,
  Semicolon: 52,
  Quote: 53,
  Enter: 54,
  PageUp: 102,

  ShiftLeft: 55,
  KeyZ: 56,
  KeyX: 57,
  KeyC: 58,
  KeyV: 59,
  KeyB: 60,
  KeyN: 61,
  KeyM: 62,
  Comma: 63,
  Period: 64,
  Slash: 65,
  ShiftRight: 66,
  ArrowUp: 74,
  PageDown: 103,

  ControlLeft: 67,
  MetaLeft: 68,
  AltLeft: 69,
  Space: 70,
  AltRight: 71,
  Fn: 72,
  ControlRight: 73,
  ArrowLeft: 76,
  ArrowDown: 75,
  ArrowRight: 77
};

export const HERO68_BOARD_POS_TO_KEY_ID: ReadonlyMap<number, string> = new Map(
  Object.entries(HERO68_BOARD_KEY_POSITIONS).map(([keyId, pos]) => [pos, keyId])
);

const keyIds = keyIdsOf(HERO68_LAYOUT);

export const HERO68_BOARD: BoardDescriptor = {
  id: 'hero68',
  name: 'Hero68',
  label: 'AULA Hero68',
  layoutTag: '65%',
  sideTab: true,
  thumbnail: hero68Thumb,
  usb: {
    vendorId: BYTETECH_VENDOR_ID,
    productIds: [0x103e, 0x1000, 0x106c],
    usagePage: BYTETECH_USAGE_PAGE,
    usage: BYTETECH_USAGE,
    reportId: BYTETECH_REPORT_ID,
    productNames: ['HERO 68 HE', 'AULA HERO 68 HE', 'AULA Hero68', 'HERO 68 XS', 'AULA HERO 68 XS'],
    deviceUuids: ['110000000003', '120000000010', '110000000010'],
    modelByte: 0x03
  },
  capabilities: {
    keyCount: 68,
    rowCount: 5,
    widthUnits: 16,
    maxTravelMm: 3.4,
    writablePollingRate: true,
    hasSideRgb: true,
    sideLedCount: 18,
    maxGamepadBindings: 68,
    maxAdvancedBindings: 40
  },
  rows: HERO68_LAYOUT,
  keyIds,
  keyIdSet: new Set(keyIds),
  keyCoordinates: computeKeyCoordinates(HERO68_LAYOUT),
  keyIdToPos: HERO68_BOARD_KEY_POSITIONS,
  posToKeyId: HERO68_BOARD_POS_TO_KEY_ID,
  validPositions: new Set(Object.values(HERO68_BOARD_KEY_POSITIONS)),
  factoryRemapLayers: buildFactoryRemapLayersFromCatalog(HERO68_BOARD_POS_TO_KEY_ID),
  makeDemoLighting
};

export const HERO68_XS_BOARD: BoardDescriptor = {
  ...HERO68_BOARD,
  id: 'hero68Xs',
  name: 'Hero68 XS',
  label: 'AULA HERO 68 XS',
  thumbnail: hero68XsThumb,
  usb: {
    ...HERO68_BOARD.usb,
    productNames: ['HERO 68 XS', 'AULA HERO 68 XS'],
    deviceUuids: ['120000000010', '110000000010'],
    modelByte: 0x10
  }
};
