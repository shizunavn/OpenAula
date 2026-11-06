import {
  detectBoardFromProductName,
  detectBoardFromUuid,
  getBoard,
  getBoards,
  isWin68HeMaxModel,
  WIN68_HE_MAX_BOARD,
  type BoardCapabilities,
  type BoardDescriptor,
  type HeroDeviceModelId,
} from './registry'
import { BYTETECH_USAGE, BYTETECH_USAGE_PAGE, BYTETECH_VENDOR_ID } from './registry/shared/bytetechCatalog'
import { isMaxHeVendorProduct, MAX_HE_IDS, MAX_HE_NAME_PATTERN, MAX_HE_USAGE, MAX_HE_USAGE_PAGE } from './maxHe'

export type { HeroDeviceModelId, BoardDescriptor, BoardCapabilities }
export { isWin68HeMaxModel }

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

export type HeroUsbFilter = {
  vendorId: number
  productId: number
  /** Vendor HID collections that identify this product family. */
  usagePage: number
  usage: number
}

/**
 * Every product family the HERO/XSYD control protocols can bind to.
 * `win68HeMax` speaks the XSYD 0x5C command set and must never be driven by
 * the hero68 0x09 encoders.
 */
export const HERO_USB_FILTERS: readonly HeroUsbFilter[] = [
  ...HERO_PRODUCT_IDS.map(productId => ({
    vendorId: HERO_VENDOR_ID,
    productId,
    usagePage: BYTETECH_USAGE_PAGE,
    usage: BYTETECH_USAGE,
  })),
  ...MAX_HE_IDS.map(({ vendorId, productId }) => ({
    vendorId,
    productId,
    usagePage: MAX_HE_USAGE_PAGE,
    usage: MAX_HE_USAGE,
  })),
]

export type HeroDeviceFamily = 'hero' | 'win68HeMax'

/** Classify an authorized HID product without assuming a command set. */
export function detectHeroDeviceFamily(productName: string | null | undefined, vendorId: number, productId: number): HeroDeviceFamily | null {
  if (isMaxHeVendorProduct(vendorId, productId) || MAX_HE_NAME_PATTERN.test(productName ?? '')) {
    return 'win68HeMax'
  }
  return detectHeroDeviceModelFromProductName(productName) ? 'hero' : null
}

/** Resolve the concrete board model ID from USB identifiers and product name. */
export function detectConnectedDeviceModelId(productName: string | null | undefined, vendorId: number, productId: number): HeroDeviceModelId | null {
  const family = detectHeroDeviceFamily(productName, vendorId, productId)
  if (family === 'win68HeMax') {
    return 'win68HeMax'
  }
  return detectHeroDeviceModelFromProductName(productName)
}

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

export const WIN68_HE_MAX_DEVICE_MODEL: HeroDeviceModel = toHeroDeviceModel(WIN68_HE_MAX_BOARD)

export const ALL_DEVICE_MODELS: readonly HeroDeviceModel[] = [
  ...HERO_DEVICE_MODELS,
  WIN68_HE_MAX_DEVICE_MODEL,
]

export function heroDeviceModel(id: HeroDeviceModelId): HeroDeviceModel {
  return toHeroDeviceModel(getBoard(id))
}

export function detectHeroDeviceModelFromUuid(data?: ArrayLike<number> | null): HeroDeviceModelId | null {
  return detectBoardFromUuid(data)
}

export function detectHeroDeviceModelFromProductName(productName?: string | null): HeroDeviceModelId | null {
  return detectBoardFromProductName(productName)
}
