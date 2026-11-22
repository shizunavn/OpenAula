import { HERO68_BOARD, HERO68_XS_BOARD } from './models/hero68.board';
import { HERO84_BOARD } from './models/hero84.board';
import { WIN68_HE_MAX_BOARD } from './models/win68HeMax.board';
import { MAX_HE_NAME_PATTERN } from '../maxHe';
import { assertBoardDescriptorValid } from './shared/bytetechCatalog';
import type { BoardDescriptor, HeroDeviceModelId } from './types';

export * from './types';
export {
  generateRapidTriggerValues,
  resolveBoardSwitch,
  resolveEffectiveTravelLimits,
  snapTravelStep,
  type ResolveTravelLimitsOptions
} from './performance';
export {
  BYTETECH_DEFAULT_SPECS,
  BYTETECH_SOCD_OPTIONS,
  BYTETECH_STANDARD_SWITCHES,
  BYTETECH_XS_SPECS,
  BYTETECH_XS_SWITCHES,
  STANDARD_POLLING_RATES,
  XSYD_DEFAULT_SPECS,
  XSYD_DKS_DOC_URL,
  XSYD_SOCD_OPTIONS_SPEC,
  XSYD_WIN68_SWITCHES
} from './shared/presets';
export { assertBoardDescriptorValid, computeKeyCoordinates } from './shared/bytetechCatalog';
export { HERO68_BOARD, HERO68_XS_BOARD } from './models/hero68.board';
export { HERO84_BOARD } from './models/hero84.board';
export {
  WIN68_HE_MAX_BOARD,
  WIN68_HE_MAX_KEY_POSITIONS,
  WIN68_HE_MAX_POS_TO_KEY_ID
} from './models/win68HeMax.board';

const REGISTRY = new Map<string, BoardDescriptor>();
const ALIASES = new Map<string, string>();

const BUILTIN_PROTECTED_IDS = new Set(['hero68', 'hero68Xs', 'hero84', 'win68HeMax']);

export function isWin68HeMaxModel(modelId?: string | null): boolean {
  if (!modelId) {
    return false;
  }
  const canonical = ALIASES.get(modelId) ?? modelId;
  return canonical === 'win68HeMax';
}

export function resolveCanonicalBoardId(modelId: string): string {
  return ALIASES.get(modelId) ?? modelId;
}

export function registerBoard(board: BoardDescriptor): BoardDescriptor {
  assertBoardDescriptorValid(board);
  if (REGISTRY.has(board.id) || ALIASES.has(board.id)) {
    throw new Error(`Duplicate board id or alias "${board.id}"`);
  }
  for (const alias of board.aliases ?? []) {
    if (alias === board.id || REGISTRY.has(alias) || ALIASES.has(alias)) {
      throw new Error(`Duplicate board alias "${alias}" for "${board.id}"`);
    }
  }
  REGISTRY.set(board.id, board);
  for (const alias of board.aliases ?? []) {
    ALIASES.set(alias, board.id);
  }
  return board;
}

export function unregisterBoard(modelId: string): boolean {
  const canonical = ALIASES.get(modelId) ?? modelId;
  if (BUILTIN_PROTECTED_IDS.has(canonical)) {
    throw new Error(`Cannot unregister built-in board "${canonical}"`);
  }
  const existing = REGISTRY.get(canonical);
  if (!existing) {
    return false;
  }
  for (const alias of existing.aliases ?? []) {
    ALIASES.delete(alias);
  }
  return REGISTRY.delete(canonical);
}

// Registration order matters: HERO68_BOARD precedes HERO68_XS_BOARD so shared
// Bytetech UUIDs and product names resolve to base 'hero68' before XS precision detection.
registerBoard(HERO68_BOARD);
registerBoard(HERO68_XS_BOARD);
registerBoard(HERO84_BOARD);
registerBoard(WIN68_HE_MAX_BOARD);

export const BOARD_REGISTRY: ReadonlyMap<string, BoardDescriptor> = REGISTRY;
export const BOARD_ALIASES: ReadonlyMap<string, string> = ALIASES;

export function getBoards(): readonly BoardDescriptor[] {
  return Array.from(REGISTRY.values());
}

export function isBoardModelId(value: unknown): value is HeroDeviceModelId {
  return typeof value === 'string' && (REGISTRY.has(value) || ALIASES.has(value));
}

export function getBoard(modelId: HeroDeviceModelId | string = 'hero68'): BoardDescriptor {
  const canonical = ALIASES.get(modelId) ?? modelId;
  const board = REGISTRY.get(canonical);
  if (!board) {
    throw new RangeError(`Unknown keyboard model: ${modelId}`);
  }
  return board;
}

export function allRegisteredKeyIds(): string[] {
  const seen = new Set<string>();
  for (const board of REGISTRY.values()) {
    for (const keyId of board.keyIds) {
      seen.add(keyId);
    }
  }
  return Array.from(seen);
}

export function allRegisteredKeyPositions(): Readonly<Record<string, number>> {
  const merged: Record<string, number> = {};
  for (const board of REGISTRY.values()) {
    if (board.protocol === 'xsyd') {
      continue;
    }
    Object.assign(merged, board.keyIdToPos);
  }
  return merged;
}

export function allRegisteredPosToKeyId(): ReadonlyMap<number, string> {
  const merged = new Map<number, string>();
  for (const board of REGISTRY.values()) {
    if (board.protocol === 'xsyd') {
      continue;
    }
    for (const [pos, keyId] of board.posToKeyId.entries()) {
      merged.set(pos, keyId);
    }
  }
  return merged;
}

export function maxRegisteredGamepadBindings(): number {
  let max = 68;
  for (const board of REGISTRY.values()) {
    if (board.capabilities.maxGamepadBindings > max) {
      max = board.capabilities.maxGamepadBindings;
    }
  }
  return max;
}

export function detectBoardFromUuid(data?: ArrayLike<number> | null): HeroDeviceModelId | null {
  if (!data || data.length < 6) {
    return null;
  }
  const hex = Array.from(
    {
      length: 6
    },
    (_, index) =>
      Number(data[index] ?? 0)
        .toString(16)
        .padStart(2, '0')
  ).join('');
  for (const board of REGISTRY.values()) {
    if (board.usb.deviceUuids.includes(hex)) {
      return board.id;
    }
  }
  if (data[0] === 0x11 || data[0] === 0x12) {
    if (data[5] === 0x05 || data[5] === 0x15) {
      return 'hero84';
    }
    if (data[5] === 0x03 || data[5] === 0x10) {
      return 'hero68';
    }
    for (const board of REGISTRY.values()) {
      if (data[5] === board.usb.modelByte) {
        return board.id;
      }
    }
  }
  return null;
}

export function detectBoardFromProductName(productName?: string | null): HeroDeviceModelId | null {
  if (!productName) {
    return null;
  }
  const normalized = productName.trim().toLowerCase();
  for (const board of REGISTRY.values()) {
    if (board.protocol === 'xsyd') {
      continue;
    }
    if (board.usb.productNames.some(candidate => candidate.toLowerCase() === normalized)) {
      return board.id;
    }
  }
  if (MAX_HE_NAME_PATTERN.test(productName)) {
    return null;
  }
  if (/hero\s*(?:84|75)/i.test(productName)) {
    return 'hero84';
  }
  if (/hero\s*68/i.test(productName)) {
    return 'hero68';
  }
  for (const board of REGISTRY.values()) {
    if (board.protocol === 'xsyd') {
      continue;
    }
    if (
      normalized.includes(board.name.toLowerCase()) ||
      normalized.includes(board.id.toLowerCase())
    ) {
      return board.id;
    }
  }
  return null;
}
