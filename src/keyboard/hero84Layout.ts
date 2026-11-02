import type { Hero68Key, Hero68Row } from './hero68Layout'

/**
 * AULA Hero84 visual layout (84 keys / 75%, 6 rows × 16U).
 *
 * Compared to the 65% HERO68 (5 rows × 16U = 68 keys), the 75% HERO84:
 * - Adds a dedicated top function row: Esc, F1–F12, PrtSc, Ins, Del (16 × 1U = 16U)
 * - Places `~ / \`` (Backquote) at the start of the number row and `Home` at the end (16U)
 * - Places `End` at the end of the Tab / QWERTY row (16U)
 * - Keeps Caps..PgUp (16U), L-Shift..PgDn (16U), and L-Ctrl..ArrowRight (16U) unchanged
 *
 * Every row is flush at 16U with 84 total keys (the 68 HERO68 keys + 16 HERO84-only keys).
 */

const F_KEY_MATRIX_BASE = 2305
const HERO84_F_KEYS: Hero68Row = Array.from({ length: 13 }, (_, index) => {
  const id = index < 12 ? `F${index + 1}` : 'PrintScreen'
  return { id, label: index < 12 ? `F${index + 1}` : 'PrtSc', matrixKey: F_KEY_MATRIX_BASE + index }
})

const BACKQUOTE_KEY: Hero68Key = { id: 'Backquote', label: '`', matrixKey: 255 }
const HOME_KEY: Hero68Key = { id: 'Home', label: 'Home', matrixKey: 271 }
const END_KEY: Hero68Key = { id: 'End', label: 'End', matrixKey: 783 }

/** The 16 keys the 75% HERO84 shell adds to the 68-key HERO68 set. */
export const HERO84_ONLY_KEYS: readonly Hero68Key[] = [
  BACKQUOTE_KEY,
  ...HERO84_F_KEYS,
  HOME_KEY,
  END_KEY,
]

/** Column-aligned rainbow demo hues for the 16 HERO84-only keys. */
export const HERO84_DEMO_HUES: Readonly<Record<string, number>> = {
  Backquote: 314,
  F1: 270,
  F2: 240,
  F3: 210,
  F4: 180,
  F5: 150,
  F6: 120,
  F7: 91,
  F8: 68,
  F9: 46,
  F10: 46,
  F11: 30,
  F12: 14,
  PrintScreen: 0,
  Home: 0,
  End: 0,
}

/**
 * The custom RGB engine and Rhythm only model the 68 HERO68 keys. On a HERO84 the
 * 16 extra keys copy the colour of the HERO68 key that sits in the same column
 * (or, for Backquote/Home/End, that occupied the same slot on the 68-key board).
 */
export const HERO84_COLOR_SOURCES: Readonly<Record<string, string>> = {
  Backquote: 'Escape',
  F1: 'Digit1', F2: 'Digit2', F3: 'Digit3', F4: 'Digit4', F5: 'Digit5', F6: 'Digit6',
  F7: 'Digit7', F8: 'Digit8', F9: 'Digit9', F10: 'Digit0', F11: 'Minus', F12: 'Equal',
  PrintScreen: 'Backspace',
  Home: 'Insert',
  End: 'Delete',
}

export function buildHero84Layout(hero68Layout: Hero68Row[]): Hero68Row[] {
  const [hero68NumberRow, hero68TopAlphaRow, ...restRows] = hero68Layout
  const escapeKey = hero68NumberRow.find((key) => key.id === 'Escape') ?? { id: 'Escape', label: 'Esc', matrixKey: 256 }
  const insertKey = hero68NumberRow.find((key) => key.id === 'Insert') ?? { id: 'Insert', label: 'Ins', matrixKey: 270 }
  const deleteKey = hero68TopAlphaRow.find((key) => key.id === 'Delete') ?? { id: 'Delete', label: 'Del', matrixKey: 526 }

  const functionRow: Hero68Row = [
    escapeKey,
    ...HERO84_F_KEYS,
    insertKey,
    deleteKey,
  ]

  const numberRow: Hero68Row = hero68NumberRow.map((key) => {
    if (key.id === 'Escape') return BACKQUOTE_KEY
    if (key.id === 'Insert') return HOME_KEY
    return key
  })

  const topAlphaRow: Hero68Row = hero68TopAlphaRow.map((key) => {
    if (key.id === 'Delete') return END_KEY
    return key
  })

  return [
    functionRow,
    numberRow,
    topAlphaRow,
    ...restRows,
  ]
}
