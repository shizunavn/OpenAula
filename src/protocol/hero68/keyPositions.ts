import {
  allRegisteredKeyPositions,
  allRegisteredPosToKeyId,
  getBoard,
  type HeroDeviceModelId
} from '../../keyboard/registry';
import {
  HERO68_BOARD_KEY_POSITIONS,
  HERO68_BOARD_POS_TO_KEY_ID
} from '../../keyboard/registry/models/hero68.board';
import {
  HERO84_BOARD_KEY_POSITIONS,
  HERO84_BOARD_POS_TO_KEY_ID,
  HERO84_ONLY_KEY_POSITIONS
} from '../../keyboard/registry/models/hero84.board';

export const HERO68_KEY_POSITIONS: Readonly<Record<string, number>> = HERO68_BOARD_KEY_POSITIONS;
export { HERO84_ONLY_KEY_POSITIONS };
export const HERO84_KEY_POSITIONS: Readonly<Record<string, number>> = HERO84_BOARD_KEY_POSITIONS;
export const HERO68_KEY_ID_BY_POSITION: ReadonlyMap<number, string> = HERO68_BOARD_POS_TO_KEY_ID;
export const HERO84_KEY_ID_BY_POSITION: ReadonlyMap<number, string> = HERO84_BOARD_POS_TO_KEY_ID;

export function keyPositionsForModel(
  model: HeroDeviceModelId = 'hero68'
): Readonly<Record<string, number>> {
  return getBoard(model).keyIdToPos;
}

export function posToKeyIdMapForModel(
  model: HeroDeviceModelId = 'hero68'
): ReadonlyMap<number, string> {
  return getBoard(model).posToKeyId;
}

export function keyIdToPos(keyId: string, model?: HeroDeviceModelId): number {
  const table = model ? getBoard(model).keyIdToPos : allRegisteredKeyPositions();
  const pos = table[keyId];
  if (pos === undefined) {
    throw new RangeError(`no hardware position mapping for key id "${keyId}"`);
  }
  return pos;
}

export function posToKeyId(pos: number, model?: HeroDeviceModelId): string | undefined {
  const map = model ? getBoard(model).posToKeyId : allRegisteredPosToKeyId();
  return map.get(pos);
}
