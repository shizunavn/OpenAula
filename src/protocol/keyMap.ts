import { HERO68_LAYOUT } from '../keyboard/hero68Layout'
import { HERO84_ONLY_KEYS } from '../keyboard/hero84Layout'

export type ProtocolKeyAddress = {
  keyId: string
  label: string
  matrixKey: number
  matrixHex: string
}

const ALL_LAYOUT_KEYS = [...HERO68_LAYOUT.flat(), ...HERO84_ONLY_KEYS]

export const HERO68_PROTOCOL_KEY_MAP: Readonly<Record<string, ProtocolKeyAddress>> = Object.fromEntries(
  ALL_LAYOUT_KEYS.map((key) => {
    const matrixKey = key.matrixKey ?? 0
    return [
      key.id,
      {
        keyId: key.id,
        label: key.label,
        matrixKey,
        matrixHex: `0x${matrixKey.toString(16).padStart(4, '0')}`,
      },
    ]
  }),
)
