const hero84Thumb = '/src/assets/hero84.png';
import type { BoardDescriptor, HeroKeyDefinition, HeroKeyRow } from '../types';
import {
  BYTETECH_REPORT_ID,
  BYTETECH_USAGE,
  BYTETECH_USAGE_PAGE,
  BYTETECH_VENDOR_ID,
  buildDemoLightingFromHues,
  buildFactoryRemapLayersFromCatalog,
  computeKeyCoordinates
} from '../shared/bytetechCatalog';

const F_KEY_MATRIX_BASE = 2305;
const HERO84_F_KEYS: HeroKeyRow = Array.from({ length: 13 }, (_, index) => {
  const id = index < 12 ? `F${index + 1}` : 'PrintScreen';
  return {
    id,
    label: index < 12 ? `F${index + 1}` : 'PrtSc',
    matrixKey: F_KEY_MATRIX_BASE + index
  };
});

const BACKQUOTE_KEY: HeroKeyDefinition = { id: 'Backquote', label: '`', matrixKey: 255 };
const HOME_KEY: HeroKeyDefinition = { id: 'Home', label: 'Home', matrixKey: 271 };
const END_KEY: HeroKeyDefinition = { id: 'End', label: 'End', matrixKey: 783 };

export const HERO84_ONLY_KEYS: readonly HeroKeyDefinition[] = [
  BACKQUOTE_KEY,
  ...HERO84_F_KEYS,
  HOME_KEY,
  END_KEY
];

/**
 * Self-contained AULA Hero84 visual layout (84 keys / 75%, 6 rows × 16U).
 * Defined independently without slicing or mutating HERO68_LAYOUT.
 */
export const HERO84_LAYOUT: HeroKeyRow[] = [
  [
    { id: 'Escape', label: 'Esc', matrixKey: 256 },
    ...HERO84_F_KEYS,
    { id: 'Insert', label: 'Ins', matrixKey: 270 },
    { id: 'Delete', label: 'Del', matrixKey: 526 }
  ],
  [
    BACKQUOTE_KEY,
    { id: 'Digit1', label: '1', matrixKey: 257 },
    { id: 'Digit2', label: '2', matrixKey: 258 },
    { id: 'Digit3', label: '3', matrixKey: 259 },
    { id: 'Digit4', label: '4', matrixKey: 260 },
    { id: 'Digit5', label: '5', matrixKey: 261 },
    { id: 'Digit6', label: '6', matrixKey: 262 },
    { id: 'Digit7', label: '7', matrixKey: 263 },
    { id: 'Digit8', label: '8', matrixKey: 264 },
    { id: 'Digit9', label: '9', matrixKey: 265 },
    { id: 'Digit0', label: '0', matrixKey: 266 },
    { id: 'Minus', label: '-', matrixKey: 267 },
    { id: 'Equal', label: '=', matrixKey: 268 },
    { id: 'Backspace', label: 'Backspace', width: 2, matrixKey: 269 },
    HOME_KEY
  ],
  [
    { id: 'Tab', label: 'Tab', width: 1.5, matrixKey: 512 },
    { id: 'KeyQ', label: 'Q', matrixKey: 513 },
    { id: 'KeyW', label: 'W', matrixKey: 514 },
    { id: 'KeyE', label: 'E', matrixKey: 515 },
    { id: 'KeyR', label: 'R', matrixKey: 516 },
    { id: 'KeyT', label: 'T', matrixKey: 517 },
    { id: 'KeyY', label: 'Y', matrixKey: 518 },
    { id: 'KeyU', label: 'U', matrixKey: 519 },
    { id: 'KeyI', label: 'I', matrixKey: 520 },
    { id: 'KeyO', label: 'O', matrixKey: 521 },
    { id: 'KeyP', label: 'P', matrixKey: 522 },
    { id: 'BracketLeft', label: '[', matrixKey: 523 },
    { id: 'BracketRight', label: ']', matrixKey: 524 },
    { id: 'Backslash', label: '\\', width: 1.5, matrixKey: 525 },
    END_KEY
  ],
  [
    { id: 'CapsLock', label: 'Caps', width: 1.75, matrixKey: 768, indicator: 'lock' },
    { id: 'KeyA', label: 'A', matrixKey: 769 },
    { id: 'KeyS', label: 'S', matrixKey: 770 },
    { id: 'KeyD', label: 'D', matrixKey: 771 },
    { id: 'KeyF', label: 'F', matrixKey: 772 },
    { id: 'KeyG', label: 'G', matrixKey: 773 },
    { id: 'KeyH', label: 'H', matrixKey: 774 },
    { id: 'KeyJ', label: 'J', matrixKey: 775 },
    { id: 'KeyK', label: 'K', matrixKey: 776 },
    { id: 'KeyL', label: 'L', matrixKey: 777 },
    { id: 'Semicolon', label: ';', matrixKey: 778 },
    { id: 'Quote', label: "'", matrixKey: 779 },
    { id: 'Enter', label: 'Enter', width: 2.25, matrixKey: 781 },
    { id: 'PageUp', label: 'PgUp', matrixKey: 782 }
  ],
  [
    { id: 'ShiftLeft', label: 'L-Shift', width: 2.25, matrixKey: 1024 },
    { id: 'KeyZ', label: 'Z', matrixKey: 1026 },
    { id: 'KeyX', label: 'X', matrixKey: 1027 },
    { id: 'KeyC', label: 'C', matrixKey: 1028 },
    { id: 'KeyV', label: 'V', matrixKey: 1029 },
    { id: 'KeyB', label: 'B', matrixKey: 1030 },
    { id: 'KeyN', label: 'N', matrixKey: 1031 },
    { id: 'KeyM', label: 'M', matrixKey: 1032 },
    { id: 'Comma', label: ',', matrixKey: 1033 },
    { id: 'Period', label: '.', matrixKey: 1034 },
    { id: 'Slash', label: '/', matrixKey: 1035 },
    { id: 'ShiftRight', label: 'R-Shift', width: 1.75, matrixKey: 1037 },
    { id: 'ArrowUp', label: '↑', matrixKey: 1038 },
    { id: 'PageDown', label: 'PgDn', matrixKey: 1039 }
  ],
  [
    { id: 'ControlLeft', label: 'L-Ctrl', width: 1.25, matrixKey: 1280 },
    { id: 'MetaLeft', label: 'L-Win', width: 1.25, matrixKey: 1281 },
    { id: 'AltLeft', label: 'L-Alt', width: 1.25, matrixKey: 1282 },
    { id: 'Space', label: 'Spacebar', width: 6.25, matrixKey: 1286 },
    { id: 'AltRight', label: 'R-Alt', matrixKey: 1290 },
    { id: 'Fn', label: 'Fn', matrixKey: 1291, indicator: 'fn' },
    { id: 'ControlRight', label: 'R-Ctrl', matrixKey: 1292 },
    { id: 'ArrowLeft', label: '←', matrixKey: 1293 },
    { id: 'ArrowDown', label: '↓', matrixKey: 1294 },
    { id: 'ArrowRight', label: '→', matrixKey: 1295 }
  ]
];

export const HERO84_DEMO_HUES: Readonly<Record<string, number>> = {
  Backquote: 314,
  F1: 270,
  F2: 240,
  F3: 210,
  F4: 180,
  F5: 150,
  F6: 120,
  F7: 91,
  F8: 68,
  F9: 46,
  F10: 46,
  F11: 30,
  F12: 14,
  PrintScreen: 0,
  Home: 0,
  End: 0
};

const ALL_HERO84_DEMO_HUES: Readonly<Record<string, number>> = {
  Escape: 314,
  Digit1: 270,
  Digit2: 240,
  Digit3: 210,
  Digit4: 180,
  Digit5: 150,
  Digit6: 120,
  Digit7: 91,
  Digit8: 68,
  Digit9: 46,
  Digit0: 46,
  Minus: 30,
  Equal: 14,
  Backspace: 0,
  Insert: 0,
  Tab: 314,
  KeyQ: 270,
  KeyW: 240,
  KeyE: 210,
  KeyR: 180,
  KeyT: 150,
  KeyY: 120,
  KeyU: 91,
  KeyI: 68,
  KeyO: 46,
  KeyP: 46,
  BracketLeft: 30,
  BracketRight: 14,
  Backslash: 0,
  Delete: 0,
  CapsLock: 314,
  KeyA: 270,
  KeyS: 240,
  KeyD: 210,
  KeyF: 180,
  KeyG: 150,
  KeyH: 120,
  KeyJ: 91,
  KeyK: 68,
  KeyL: 46,
  Semicolon: 46,
  Quote: 30,
  Enter: 0,
  PageUp: 0,
  ShiftLeft: 314,
  KeyZ: 270,
  KeyX: 240,
  KeyC: 210,
  KeyV: 180,
  KeyB: 150,
  KeyN: 120,
  KeyM: 91,
  Comma: 68,
  Period: 46,
  Slash: 46,
  ShiftRight: 14,
  ArrowUp: 7,
  PageDown: 0,
  ControlLeft: 314,
  MetaLeft: 314,
  AltLeft: 270,
  AltRight: 46,
  Fn: 30,
  ControlRight: 14,
  ArrowLeft: 14,
  ArrowDown: 7,
  ArrowRight: 0,
  ...HERO84_DEMO_HUES
};

export const HERO84_COLOR_SOURCES: Readonly<Record<string, string>> = {
  Backquote: 'Escape',
  F1: 'Digit1',
  F2: 'Digit2',
  F3: 'Digit3',
  F4: 'Digit4',
  F5: 'Digit5',
  F6: 'Digit6',
  F7: 'Digit7',
  F8: 'Digit8',
  F9: 'Digit9',
  F10: 'Digit0',
  F11: 'Minus',
  F12: 'Equal',
  PrintScreen: 'Backspace',
  Home: 'Insert',
  End: 'Delete'
};

export const HERO84_ONLY_KEY_POSITIONS: Readonly<Record<string, number>> = {
  F1: 2,
  F2: 3,
  F3: 4,
  F4: 5,
  F5: 6,
  F6: 7,
  F7: 8,
  F8: 9,
  F9: 10,
  F10: 11,
  F11: 12,
  F12: 13,
  Backquote: 14,
  PrintScreen: 95,
  Home: 100,
  End: 101
};

export const HERO84_BOARD_KEY_POSITIONS: Readonly<Record<string, number>> = {
  Escape: 1,
  F1: 2,
  F2: 3,
  F3: 4,
  F4: 5,
  F5: 6,
  F6: 7,
  F7: 8,
  F8: 9,
  F9: 10,
  F10: 11,
  F11: 12,
  F12: 13,
  Backquote: 14,
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
  ControlLeft: 67,
  MetaLeft: 68,
  AltLeft: 69,
  Space: 70,
  AltRight: 71,
  Fn: 72,
  ControlRight: 73,
  ArrowUp: 74,
  ArrowDown: 75,
  ArrowLeft: 76,
  ArrowRight: 77,
  PrintScreen: 95,
  Insert: 98,
  Delete: 99,
  Home: 100,
  End: 101,
  PageUp: 102,
  PageDown: 103
};

export const HERO84_BOARD_POS_TO_KEY_ID: ReadonlyMap<number, string> = new Map(
  Object.entries(HERO84_BOARD_KEY_POSITIONS).map(([keyId, pos]) => [pos, keyId])
);

export const HERO84_EXTRA_FACTORY_KEYCODES: Readonly<Record<string, number>> = {
  Backquote: 53,
  F1: 58,
  F2: 59,
  F3: 60,
  F4: 61,
  F5: 62,
  F6: 63,
  F7: 64,
  F8: 65,
  F9: 66,
  F10: 67,
  F11: 68,
  F12: 69,
  PrintScreen: 70,
  Home: 74,
  End: 77
};

const keyIds = HERO84_LAYOUT.flat()
  .filter(key => !key.spacer)
  .map(key => key.id);

export const HERO84_BOARD: BoardDescriptor = {
  id: 'hero84',
  name: 'Hero84',
  label: 'AULA Hero84',
  layoutTag: '75%',
  sideTab: true,
  thumbnail: hero84Thumb,
  usb: {
    vendorId: BYTETECH_VENDOR_ID,
    productIds: [0x103e, 0x1000],
    usagePage: BYTETECH_USAGE_PAGE,
    usage: BYTETECH_USAGE,
    reportId: BYTETECH_REPORT_ID,
    productNames: ['HERO 84 HE', 'AULA HERO 84 HE', 'AULA HERO 75 HE', 'AULA Hero84'],
    deviceUuids: ['110000000005', '120000000015'],
    modelByte: 0x05
  },
  capabilities: {
    keyCount: 84,
    rowCount: 6,
    widthUnits: 16,
    maxTravelMm: 3.4,
    writablePollingRate: false,
    hasSideRgb: true,
    sideLedCount: 18,
    maxGamepadBindings: 84,
    maxAdvancedBindings: 40
  },
  rows: HERO84_LAYOUT,
  keyIds,
  keyIdSet: new Set(keyIds),
  keyCoordinates: computeKeyCoordinates(HERO84_LAYOUT),
  keyIdToPos: HERO84_BOARD_KEY_POSITIONS,
  posToKeyId: HERO84_BOARD_POS_TO_KEY_ID,
  validPositions: new Set(Object.values(HERO84_BOARD_KEY_POSITIONS)),
  factoryRemapLayers: buildFactoryRemapLayersFromCatalog(
    HERO84_BOARD_POS_TO_KEY_ID,
    HERO84_EXTRA_FACTORY_KEYCODES
  ),
  makeDemoLighting: () => buildDemoLightingFromHues(HERO84_LAYOUT, ALL_HERO84_DEMO_HUES),
  fallbackColorSources: HERO84_COLOR_SOURCES
};
