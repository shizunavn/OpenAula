import { HERO68_KEY_IDS, HERO68_LAYOUT, makeDemoLighting } from './hero68Layout'
import { HERO84_LAYOUT, makeHero84DemoLighting } from './hero84Layout'
import { heroDeviceModel, type HeroDeviceModel, type HeroDeviceModelId } from './devices'
import {
  computeKeyCoordinates,
  detectBoardFromProductName,
  detectBoardFromUuid,
  getBoard,
  getBoards,
  registerBoard,
  unregisterBoard,
  type BoardDescriptor,
  type HeroKeyDefinition,
  type HeroKeyRow,
} from './registry'

export type { HeroKeyDefinition, HeroKeyRow }
export {
  HERO68_KEY_IDS,
  HERO68_LAYOUT,
  HERO84_LAYOUT,
  makeDemoLighting,
  makeHero84DemoLighting,
  getBoard,
  getBoards,
  registerBoard,
  unregisterBoard,
  detectBoardFromUuid,
  detectBoardFromProductName,
  computeKeyCoordinates,
}

export type HeroKeyboardLayout = {
  id: HeroDeviceModelId
  model: HeroDeviceModel
  rows: HeroKeyRow[]
  keyIds: readonly string[]
  keyIdSet: ReadonlySet<string>
  makeDemoLighting: () => Record<string, string>
}

export type HeroLayout = HeroKeyboardLayout

const LAYOUT_CACHE = new WeakMap<BoardDescriptor, HeroKeyboardLayout>()

export function heroLayout(model: HeroDeviceModelId): HeroKeyboardLayout {
  const board = getBoard(model)
  const cached = LAYOUT_CACHE.get(board)
  if (cached) {
    return cached
  }
  const layout: HeroKeyboardLayout = {
    id: board.id,
    model: heroDeviceModel(board.id),
    rows: board.rows,
    keyIds: board.keyIds,
    keyIdSet: board.keyIdSet,
    makeDemoLighting: board.makeDemoLighting,
  }
  LAYOUT_CACHE.set(board, layout)
  return layout
}
