import { HERO68_KEY_IDS, HERO68_LAYOUT } from '../keyboard/hero68Layout';
import { HERO84_ONLY_KEYS } from '../keyboard/hero84Layout';
import { allRegisteredKeyIds, getBoards } from '../keyboard/registry';
import { defaultRemapLayers } from '../protocol/hero68/remap';
import type { HydratedKeySettings } from '../protocol/hero68/hero68Encoder';
const HERO68_KEY_LABEL_BY_ID: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries([
    ...HERO68_LAYOUT.flat().map(key => [key.id, key.label] as const),
    ...HERO84_ONLY_KEYS.map(key => [key.id, key.label] as const),
    ...getBoards().flatMap(board => board.rows.flat().map(key => [key.id, key.label] as const))
  ])
);
const FACTORY_REMAP_LAYERS = defaultRemapLayers(allRegisteredKeyIds());
function hallKeyLabel(keyId: string | null): string {
  if (!keyId) {
    return 'Press a key';
  }
  return HERO68_KEY_LABEL_BY_ID[keyId] ?? keyId.replace(/^Key/, '').replace(/^Digit/, '');
}
function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
function snapToStep(value: number, min: number, max: number, step: number) {
  const clamped = clampNumber(value, min, max);
  const decimals = (step.toString().split('.')[1] ?? '').length;
  const snapped = Math.round((clamped - min) / step) * step + min;
  return Number(snapped.toFixed(decimals));
}
const RAPID_TRIGGER_VALUES = Array.from(
  {
    length: 340
  },
  (_, index) => Number(((index + 1) * 0.01).toFixed(2))
) as readonly number[];
function snapToAllowedValue(value: number, allowedValues: readonly number[]) {
  if (!allowedValues.length) {
    return value;
  }
  return allowedValues.reduce(
    (closest, candidate) =>
      Math.abs(candidate - value) < Math.abs(closest - value) ? candidate : closest,
    allowedValues[0]
  );
}
function selectionHasMixedValues<T>(selectedKeys: Set<string>, values: Record<string, T>) {
  if (selectedKeys.size <= 1) {
    return false;
  }
  const keys = Array.from(selectedKeys);
  const first = values[keys[0]];
  return keys.some(keyId => values[keyId] !== first);
}
const HERO68_KEY_ID_SET = new Set(HERO68_KEY_IDS);
function normalizeHero68Selection(
  keys: Iterable<string>,
  keyIds: readonly string[] = HERO68_KEY_IDS
) {
  const allowed = keyIds === HERO68_KEY_IDS ? HERO68_KEY_ID_SET : new Set(keyIds);
  return new Set(Array.from(keys).filter(keyId => allowed.has(keyId)));
}
function isWholeKeyboardSelected(
  keys: ReadonlySet<string>,
  keyIds: readonly string[] = HERO68_KEY_IDS
) {
  return keyIds.every(keyId => keys.has(keyId));
}
function mergePerKeyState<T>(
  saved: Record<string, T> | undefined,
  fallback: T,
  keyIds: readonly string[] = HERO68_KEY_IDS
) {
  return Object.fromEntries(keyIds.map(keyId => [keyId, saved?.[keyId] ?? fallback])) as Record<
    string,
    T
  >;
}
type HydratedNumberField =
  | 'actuationMm'
  | 'rapidSensitivityMm'
  | 'pressSensitivityMm'
  | 'releaseSensitivityMm'
  | 'topDeadzoneMm'
  | 'bottomDeadzoneMm';
type HydratedBooleanField = 'rapidTriggerEnabled' | 'splitSensitivity' | 'deadzoneEnabled';
function mergeHydratedNumbers(
  previous: Record<string, number>,
  hydrated: Map<string, HydratedKeySettings>,
  field: HydratedNumberField
) {
  const next = {
    ...previous
  };
  for (const [keyId, settings] of hydrated) {
    const value = settings[field];
    if (value !== undefined) {
      next[keyId] = value;
    }
  }
  return next;
}
function mergeHydratedBooleans(
  previous: Record<string, boolean>,
  hydrated: Map<string, HydratedKeySettings>,
  field: HydratedBooleanField
) {
  const next = {
    ...previous
  };
  for (const [keyId, settings] of hydrated) {
    const value = settings[field];
    if (value !== undefined) {
      next[keyId] = value;
    }
  }
  return next;
}
export {
  clampNumber,
  snapToStep,
  snapToAllowedValue,
  RAPID_TRIGGER_VALUES,
  selectionHasMixedValues,
  normalizeHero68Selection,
  isWholeKeyboardSelected,
  mergePerKeyState,
  mergeHydratedNumbers,
  mergeHydratedBooleans,
  hallKeyLabel,
  HERO68_KEY_LABEL_BY_ID,
  HERO68_KEY_ID_SET,
  FACTORY_REMAP_LAYERS
};
export type { HydratedNumberField, HydratedBooleanField };
