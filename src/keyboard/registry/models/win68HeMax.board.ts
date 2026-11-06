const hero68Thumb = '/src/assets/hero68.png'
import { HERO68_LAYOUT, makeDemoLighting } from '../../hero68Layout'
import { MAX_HE_IDS, MAX_HE_USAGE, MAX_HE_USAGE_PAGE } from '../../maxHe'
import { XSYD_KEYS } from '../../../protocol/xsyd/keymap'
import type { BoardDescriptor, BoardRemapLayers } from '../types'
import { computeKeyCoordinates, keyIdsOf } from '../shared/bytetechCatalog'

/**
 * Hardware keyValue mapping for the AULA WIN 68 HE MAX (XSYD 0x5C protocol).
 * Every capture addresses keys by their 1-byte action/usage code (`usage & 0xff`),
 * where the physical Fn slot (`F1` in the firmware table, usage `0xF001`) maps to `0x01`.
 */
export const WIN68_HE_MAX_KEY_POSITIONS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    XSYD_KEYS.map(entry => [entry.code === 'F1' ? 'Fn' : entry.code, entry.usage & 0xff]),
  ),
)

export const WIN68_HE_MAX_POS_TO_KEY_ID: ReadonlyMap<number, string> = new Map(
  Object.entries(WIN68_HE_MAX_KEY_POSITIONS).map(([keyId, pos]) => [pos, keyId]),
)

function buildWin68FactoryRemapLayers(): BoardRemapLayers {
  const layer0 = { ...WIN68_HE_MAX_KEY_POSITIONS }
  return {
    0: { ...layer0 },
    1: { ...layer0 },
    2: { ...layer0 },
  }
}

const keyIds = keyIdsOf(HERO68_LAYOUT)

export const WIN68_HE_MAX_BOARD: BoardDescriptor = {
  id: 'win68HeMax',
  name: 'Win68HeMax',
  label: 'AULA WIN 68 HE MAX',
  layoutTag: '65%',
  sideTab: false,
  thumbnail: hero68Thumb,
  usb: {
    vendorId: MAX_HE_IDS[1]?.vendorId ?? 0x1ca2,
    productIds: MAX_HE_IDS.map(id => id.productId),
    usagePage: MAX_HE_USAGE_PAGE,
    usage: MAX_HE_USAGE,
    reportId: 0x00,
    productNames: ['WIN 68 HE MAX', 'AULA WIN 68 HE MAX'],
    deviceUuids: [],
    modelByte: 0x5c,
  },
  capabilities: {
    keyCount: 68,
    rowCount: 5,
    widthUnits: 16,
    maxTravelMm: 3.4,
    writablePollingRate: true,
    hasSideRgb: false,
    sideLedCount: 0,
    maxGamepadBindings: 68,
    maxAdvancedBindings: 40,
  },
  rows: HERO68_LAYOUT,
  keyIds,
  keyIdSet: new Set(keyIds),
  keyCoordinates: computeKeyCoordinates(HERO68_LAYOUT),
  keyIdToPos: WIN68_HE_MAX_KEY_POSITIONS,
  posToKeyId: WIN68_HE_MAX_POS_TO_KEY_ID,
  validPositions: new Set(Object.values(WIN68_HE_MAX_KEY_POSITIONS)),
  factoryRemapLayers: buildWin68FactoryRemapLayers(),
  makeDemoLighting,
}
