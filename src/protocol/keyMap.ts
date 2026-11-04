import { getBoards } from '../keyboard/registry'

export type ProtocolKeyAddress = {
  keyId: string
  label: string
  /** Matrix key code from the reference layout (row << 8 | column). */
  matrixKey: number
  /** Placeholder until RE confirms the wire key index used by HERO68 reports. */
  matrixHex: string
}

const ALL_LAYOUT_KEYS = getBoards().flatMap((board) => board.rows.flat().filter((key) => !key.spacer))

export const HERO68_PROTOCOL_KEY_MAP: Record<string, ProtocolKeyAddress> = Object.fromEntries(
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
