// Frontend key id -> real hardware key ID ("pos" / "keyValue" in the official AULA web driver).
//
// Both AULA HERO 68 HE (`deviceId = 0x110000000003`) and AULA HERO 84 HE
// (`deviceId = 0x110000000005`) share the exact same physical `keyValue` IDs
// (`1..103`) in the official ByteTech SDK:
// - All 68 keys of HERO68 keep the exact same `keyValue` on HERO84.
// - HERO84 adds 16 keys:
//   - `2..13`: `F1`..`F12`
//   - `14`: `Backquote` (`~ / \``)
//   - `95`: `PrintScreen` (`PrtSc`)
//   - `100`: `Home`
//   - `101`: `End`
// Verified key by key against the AULA_2829 WIN layer of the official driver
// (`tests/fixtures/hero84-official-layout.json`, `tests/hero84-official-layout.test.mjs`).
import { HERO68_KEY_IDS } from "../../keyboard/hero68Layout";
import { HERO84_ONLY_KEYS } from "../../keyboard/hero84Layout";
import type { HeroDeviceModelId } from "../../keyboard/devices";

export const HERO68_KEY_POSITIONS: Readonly<Record<string, number>> = {
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
  ArrowRight: 77,
};

/** The 16 hardware keyValue positions added by the 75% AULA HERO 84 HE layout. */
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
  End: 101,
};

export const HERO84_KEY_POSITIONS: Readonly<Record<string, number>> = {
  ...HERO68_KEY_POSITIONS,
  ...HERO84_ONLY_KEY_POSITIONS,
};

export const HERO68_KEY_ID_BY_POSITION: ReadonlyMap<number, string> = new Map(
  Object.entries(HERO68_KEY_POSITIONS).map(([keyId, pos]) => [pos, keyId]),
);

export const HERO84_KEY_ID_BY_POSITION: ReadonlyMap<number, string> = new Map(
  Object.entries(HERO84_KEY_POSITIONS).map(([keyId, pos]) => [pos, keyId]),
);

export function keyPositionsForModel(model: HeroDeviceModelId = "hero68"): Readonly<Record<string, number>> {
  return model === "hero84" ? HERO84_KEY_POSITIONS : HERO68_KEY_POSITIONS;
}

export function keyIdToPos(keyId: string): number {
  const pos = HERO84_KEY_POSITIONS[keyId];
  if (pos === undefined) throw new RangeError(`no hardware position mapping for key id "${keyId}"`);
  return pos;
}

export function posToKeyId(pos: number): string | undefined {
  return HERO84_KEY_ID_BY_POSITION.get(pos);
}

// Fail loudly at import time (mirroring layout.py's own self-check) rather than
// silently mis-addressing keys: catches a missing/duplicated entry immediately
// instead of at first device write.
(function assertKeyPositionsComplete() {
  const mapped68Ids = Object.keys(HERO68_KEY_POSITIONS);
  if (mapped68Ids.length !== HERO68_KEY_IDS.length) {
    throw new Error(
      `HERO68_KEY_POSITIONS has ${mapped68Ids.length} entries but HERO68_LAYOUT declares ${HERO68_KEY_IDS.length} keys`,
    );
  }
  for (const keyId of HERO68_KEY_IDS) {
    if (!(keyId in HERO68_KEY_POSITIONS)) throw new Error(`HERO68_KEY_POSITIONS is missing frontend key id "${keyId}"`);
  }
  const positions68 = Object.values(HERO68_KEY_POSITIONS);
  if (new Set(positions68).size !== positions68.length) {
    throw new Error("HERO68_KEY_POSITIONS assigns the same hardware pos to more than one key id");
  }

  const expected84Ids = [...HERO68_KEY_IDS, ...HERO84_ONLY_KEYS.map((key) => key.id)];
  const mapped84Ids = Object.keys(HERO84_KEY_POSITIONS);
  if (mapped84Ids.length !== expected84Ids.length) {
    throw new Error(
      `HERO84_KEY_POSITIONS has ${mapped84Ids.length} entries but HERO84 layout declares ${expected84Ids.length} keys`,
    );
  }
  for (const keyId of expected84Ids) {
    if (!(keyId in HERO84_KEY_POSITIONS)) throw new Error(`HERO84_KEY_POSITIONS is missing frontend key id "${keyId}"`);
  }
  const positions84 = Object.values(HERO84_KEY_POSITIONS);
  if (new Set(positions84).size !== positions84.length) {
    throw new Error("HERO84_KEY_POSITIONS assigns the same hardware pos to more than one key id");
  }
})();
