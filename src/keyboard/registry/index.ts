import { HERO68_BOARD } from './models/hero68.board';
import { HERO84_BOARD } from './models/hero84.board';
import { assertBoardDescriptorValid } from './shared/bytetechCatalog';
import type { BoardDescriptor, HeroDeviceModelId } from './types';
export * from './types';
export { assertBoardDescriptorValid, computeKeyCoordinates } from './shared/bytetechCatalog';
export { HERO68_BOARD } from './models/hero68.board';
export { HERO84_BOARD } from './models/hero84.board';
const REGISTRY = new Map<string, BoardDescriptor>();
export function registerBoard(board: BoardDescriptor): BoardDescriptor {
  assertBoardDescriptorValid(board);
  REGISTRY.set(board.id, board);
  return board;
}
export function unregisterBoard(modelId: string): boolean {
  if (modelId === 'hero68' || modelId === 'hero84') {
    throw new Error(`Cannot unregister built-in board "${modelId}"`);
  }
  return REGISTRY.delete(modelId);
}
registerBoard(HERO68_BOARD);
registerBoard(HERO84_BOARD);
export const BOARD_REGISTRY: ReadonlyMap<string, BoardDescriptor> = REGISTRY;
export function getBoards(): readonly BoardDescriptor[] {
  return Array.from(REGISTRY.values());
}
export function isBoardModelId(value: unknown): value is HeroDeviceModelId {
  return typeof value === 'string' && REGISTRY.has(value);
}
export function getBoard(modelId: HeroDeviceModelId | string = 'hero68'): BoardDescriptor {
  const board = REGISTRY.get(modelId);
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
    Object.assign(merged, board.keyIdToPos);
  }
  return merged;
}
export function allRegisteredPosToKeyId(): ReadonlyMap<number, string> {
  const merged = new Map<number, string>();
  for (const board of REGISTRY.values()) {
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
  const hex = Array.from({
    length: 6
  }, (_, index) => Number(data[index] ?? 0).toString(16).padStart(2, '0')).join('');
  for (const board of REGISTRY.values()) {
    if (board.usb.deviceUuids.includes(hex)) {
      return board.id;
    }
  }
  if (data[0] === 0x11 || data[0] === 0x12) {
    if (data[5] === 0x05 || data[5] === 0x15) {
      return 'hero84';
    }
    if (data[5] === 0x03) {
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
    if (board.usb.productNames.some(candidate => candidate.toLowerCase() === normalized)) {
      return board.id;
    }
  }
  if (/hero\s*(?:84|75)/i.test(productName)) {
    return 'hero84';
  }
  if (/hero\s*68/i.test(productName)) {
    return 'hero68';
  }
  for (const board of REGISTRY.values()) {
    if (normalized.includes(board.name.toLowerCase()) || normalized.includes(board.id.toLowerCase())) {
      return board.id;
    }
  }
  return null;
}
