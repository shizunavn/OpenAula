import {
  detectBoardFromProductName,
  detectBoardFromUuid,
  getBoard,
  getBoards,
  type BoardCapabilities,
  type BoardDescriptor,
  type HeroDeviceModelId,
} from './registry'
import { BYTETECH_VENDOR_ID } from './registry/shared/bytetechCatalog'

export type { HeroDeviceModelId, BoardDescriptor, BoardCapabilities }

export type HeroDeviceModel = {
  id: HeroDeviceModelId
  /** Human name without the vendor prefix, e.g. "Hero84". */
  name: string
  /** Detection label shown on the device card. */
  label: string
  /** 65% has 5 rows (68 keys); 75% has 6 rows including F-row (84 keys). */
  layout: BoardDescriptor['layoutTag']
  /** Side strap bracket on the AULA HERO shell. */
  sideTab: boolean
  /** Thumbnail image asset for the board. */
  thumbnail: string
  /** Board hardware capabilities. */
  capabilities: BoardCapabilities
  /** Official USB productName strings advertised by the keyboard. */
  productNames: readonly string[]
  /** 6-byte hex UUID strings returned by CMD 0x82 zone 1 (`readDeviceUuid`). */
  deviceUuids: readonly string[]
  /** Firmware header model byte (`0x03` = HERO68, `0x05` = HERO84). */
  modelByte: number
  /** Supported USB Product IDs (`0x103e` wired, `0x1000` 2.4G receiver on HERO84). */
  productIds: readonly number[]
}

export const HERO_VENDOR_ID = BYTETECH_VENDOR_ID
export const HERO_PRODUCT_IDS = [0x103e, 0x1000] as const

/**
 * The board registry is the only key table; this module only reshapes it for
 * existing consumers, so a layout edit never has to be repeated here.
 */
function toHeroDeviceModel(board: BoardDescriptor): HeroDeviceModel {
  return {
    id: board.id,
    name: board.name,
    label: board.label,
    layout: board.layoutTag,
    sideTab: board.sideTab,
    thumbnail: board.thumbnail,
    capabilities: board.capabilities,
    productNames: board.usb.productNames,
    deviceUuids: board.usb.deviceUuids,
    modelByte: board.usb.modelByte,
    productIds: board.usb.productIds,
  }
}

export const HERO_DEVICE_MODELS: readonly HeroDeviceModel[] = getBoards().map(toHeroDeviceModel)

export function heroDeviceModel(id: HeroDeviceModelId): HeroDeviceModel {
  return toHeroDeviceModel(getBoard(id))
}

export function detectHeroDeviceModelFromUuid(data?: ArrayLike<number> | null): HeroDeviceModelId | null {
  return detectBoardFromUuid(data)
}

export function detectHeroDeviceModelFromProductName(productName?: string | null): HeroDeviceModelId | null {
  return detectBoardFromProductName(productName)
}


