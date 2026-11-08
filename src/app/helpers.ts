import { HERO68_KEY_IDS, HERO68_LAYOUT } from '../keyboard/hero68Layout';
import { HERO84_ONLY_KEYS } from '../keyboard/hero84Layout';
import { allRegisteredKeyIds, getBoards } from '../keyboard/registry';
import { defaultRemapLayers } from '../protocol/hero68/remap';
import type { HydratedKeySettings } from '../protocol/hero68/hero68Encoder';

const HERO68_KEY_ID_SET = new Set(HERO68_KEY_IDS);

export function normalizeHero68Selection(
  keys: Iterable<string>,
  keyIds: readonly string[] = HERO68_KEY_IDS
) {
  const allowed = keyIds === HERO68_KEY_IDS ? HERO68_KEY_ID_SET : new Set(keyIds);
  return new Set(Array.from(keys).filter(keyId => allowed.has(keyId)));
}

export function isWholeKeyboardSelected(
  keys: ReadonlySet<string>,
  keyIds: readonly string[] = HERO68_KEY_IDS
) {
  return keyIds.every(keyId => keys.has(keyId));
}

export const HERO68_KEY_LABEL_BY_ID: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries([
    ...HERO68_LAYOUT.flat().map(key => [key.id, key.label] as const),
    ...HERO84_ONLY_KEYS.map(key => [key.id, key.label] as const),
    ...getBoards().flatMap(board => board.rows.flat().map(key => [key.id, key.label] as const))
  ])
);

export const FACTORY_REMAP_LAYERS = defaultRemapLayers(allRegisteredKeyIds());

export function hallKeyLabel(keyId: string | null): string {
  if (!keyId) {
    return 'Press a key';
  }
  return HERO68_KEY_LABEL_BY_ID[keyId] ?? keyId.replace(/^Key/, '').replace(/^Digit/, '');
}

export const RAPID_TRIGGER_VALUES = Array.from({ length: 680 }, (_, index) =>
  Number(((index + 1) * 0.005).toFixed(3))
);

/**
 * Formats millimeter distances with 2 decimal places for multiples of `0.01 mm`
 * (`0.10`, `1.60`) and 3 decimal places for `0.005 mm` steps (`0.005`, `0.125`),
 * matching the official AULA web driver (`r % 10 === 0 ? toFixed(2) : toFixed(3)`).
 */
export function formatMillimeters(value: number, minDecimals = 2): string {
  const roundedUm = Math.round(value * 1000);
  if (roundedUm % 10 !== 0) {
    return (roundedUm / 1000).toFixed(3);
  }
  return (roundedUm / 1000).toFixed(minDecimals);
}
export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
export function snapToStep(value: number, min: number, max: number, step: number) {
  const clamped = clampNumber(value, min, max);
  const steps = Math.round((clamped - min) / step);
  return Number((min + steps * step).toFixed(3));
}
export function snapToAllowedValue(value: number, allowedValues: readonly number[]) {
  return allowedValues.reduce(
    (best, candidate) => (Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best),
    allowedValues[0]
  );
}
export function makePerKeyState<T>(value: T, keyIds: readonly string[]) {
  return Object.fromEntries(keyIds.map(keyId => [keyId, value])) as Record<string, T>;
}
export function mergePerKeyState<T>(
  saved: Record<string, T> | undefined,
  fallback: T,
  keyIds: readonly string[]
) {
  const base = makePerKeyState(fallback, keyIds);
  if (!saved) {
    return base;
  }
  for (const keyId of keyIds) {
    if (keyId in saved) {
      base[keyId] = saved[keyId];
    }
  }
  return base;
}
export function mergeHydratedNumbers(
  previous: Record<string, number>,
  hydrated: Map<string, HydratedKeySettings>,
  field: keyof HydratedKeySettings
) {
  const next = {
    ...previous
  };
  for (const [keyId, settings] of hydrated) {
    const value = settings[field];
    if (typeof value === 'number' && Number.isFinite(value)) {
      next[keyId] = Number(value.toFixed(3));
    }
  }
  return next;
}
export function mergeHydratedBooleans(
  previous: Record<string, boolean>,
  hydrated: Map<string, HydratedKeySettings>,
  field: keyof HydratedKeySettings
) {
  const next = {
    ...previous
  };
  for (const [keyId, settings] of hydrated) {
    const value = settings[field];
    if (typeof value === 'boolean') {
      next[keyId] = value;
    }
  }
  return next;
}
export function selectionHasMixedValues<T>(
  selectedKeys: Set<string>,
  valuesByKey: Record<string, T>
) {
  if (selectedKeys.size <= 1) {
    return false;
  }
  const iterator = selectedKeys.values();
  const firstKey = iterator.next().value;
  if (!firstKey) {
    return false;
  }
  const firstValue = valuesByKey[firstKey];
  for (const keyId of iterator) {
    if (valuesByKey[keyId] !== firstValue) {
      return true;
    }
  }
  return false;
}
export function equalSets(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) {
    return false;
  }
  for (const item of left) {
    if (!right.has(item)) {
      return false;
    }
  }
  return true;
}
export function countMatchingKeys<T>(
  valuesByKey: Record<string, T>,
  predicate: (value: T) => boolean,
  keyIds: readonly string[]
) {
  let count = 0;
  for (const keyId of keyIds) {
    if (predicate(valuesByKey[keyId])) {
      count += 1;
    }
  }
  return count;
}
export function summarizeKeyGroup(
  selectedKeys: Set<string>,
  keyLabelById: ReadonlyMap<string, string>,
  totalKeyCount: number
) {
  if (selectedKeys.size === 0) {
    return 'Select keys on the keyboard';
  }
  if (selectedKeys.size === totalKeyCount) {
    return `All keys (${selectedKeys.size})`;
  }
  if (selectedKeys.size === 1) {
    const keyId = Array.from(selectedKeys)[0];
    return keyLabelById.get(keyId) ?? keyId;
  }
  return `${selectedKeys.size} keys selected`;
}
