/**
 * Keyboard models supported by OpenHero68.
 *
 * Per official AULA web driver (`index-CeAyNk8A.js` / `BUttzoaC.js`) and
 * firmware binary analysis (`HERO_84_HE_V2.22` vs `HERO_68_HE_V3.24`):
 * - Both models share USB VID `0x372e`, wired PID `0x103e`, usagePage `0xff60`,
 *   usage `0x61`, report ID `0x09`, and the same 27-command ByteTech HID protocol.
 * - HERO84 also supports a 2.4G receiver (`VID 0x372e, PID 0x1000`).
 * - `readDeviceUuid()` (`command: 0x82, zone: 1`) returns 6-byte deviceId:
 *   - HERO68: `11 00 00 00 00 03` (`0x110000000003`, 6-bit deviceId prefix)
 *   - HERO84: `11 00 00 00 00 05` (`0x110000000005` / `0x120000000015`)
 */
export type HeroDeviceModelId = 'hero68' | 'hero84'

export type HeroDeviceModel = {
  id: HeroDeviceModelId
  /** Human name without the vendor prefix, e.g. "Hero84". */
  name: string
  /** Detection label shown on the device card. */
  label: string
  /** 65% has 5 rows (68 keys); 75% has 6 rows including F-row (84 keys). */
  layout: '65%' | '75%'
  /** Side strap bracket on the AULA HERO shell. */
  sideTab: boolean
  /** Official USB productName strings advertised by the keyboard. */
  productNames: readonly string[]
  /** 6-byte hex UUID strings returned by CMD 0x82 zone 1 (`readDeviceUuid`). */
  deviceUuids: readonly string[]
  /** Firmware header model byte (`0x03` = HERO68, `0x05` = HERO84). */
  modelByte: number
  /** Supported USB Product IDs (`0x103e` wired, `0x1000` 2.4G receiver on HERO84). */
  productIds: readonly number[]
}

export const HERO_VENDOR_ID = 0x372e
export const HERO_PRODUCT_IDS = [0x103e, 0x1000] as const

export const HERO_DEVICE_MODELS: readonly HeroDeviceModel[] = [
  {
    id: 'hero68',
    name: 'Hero68',
    label: 'AULA Hero68',
    layout: '65%',
    sideTab: true,
    productNames: ['HERO 68 HE', 'AULA HERO 68 HE', 'AULA Hero68'],
    deviceUuids: ['110000000003'],
    modelByte: 0x03,
    productIds: [0x103e],
  },
  {
    id: 'hero84',
    name: 'Hero84',
    label: 'AULA Hero84',
    layout: '75%',
    sideTab: true,
    productNames: ['HERO 84 HE', 'AULA HERO 84 HE', 'AULA HERO 75 HE', 'AULA Hero84'],
    deviceUuids: ['110000000005', '120000000015'],
    modelByte: 0x05,
    productIds: [0x103e, 0x1000],
  },
]

const HERO_DEVICE_MODEL_BY_ID = new Map(HERO_DEVICE_MODELS.map((model) => [model.id, model]))

export function heroDeviceModel(id: HeroDeviceModelId): HeroDeviceModel {
  const model = HERO_DEVICE_MODEL_BY_ID.get(id)
  if (!model) throw new RangeError(`Unknown keyboard model: ${id}`)
  return model
}

export function detectHeroDeviceModelFromUuid(data?: ArrayLike<number> | null): HeroDeviceModelId | null {
  if (!data || data.length < 6) return null
  const hex = Array.from({ length: 6 }, (_, index) => Number(data[index] ?? 0).toString(16).padStart(2, '0')).join('')
  for (const model of HERO_DEVICE_MODELS) {
    if (model.deviceUuids.includes(hex)) return model.id
  }
  if (data[0] === 0x11 || data[0] === 0x12) {
    if (data[5] === 0x05 || data[5] === 0x15) return 'hero84'
    if (data[5] === 0x03) return 'hero68'
  }
  return null
}

export function detectHeroDeviceModelFromProductName(productName?: string | null): HeroDeviceModelId | null {
  if (!productName) return null
  if (/hero\s*(?:84|75)/i.test(productName)) return 'hero84'
  if (/hero\s*68/i.test(productName)) return 'hero68'
  return null
}
