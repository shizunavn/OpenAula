import type { Hero68Row } from './hero68Layout'
import {
  HERO84_BOARD,
  HERO84_COLOR_SOURCES,
  HERO84_DEMO_HUES,
  HERO84_LAYOUT,
  HERO84_ONLY_KEYS,
} from './registry/models/hero84.board'

export { HERO84_ONLY_KEYS, HERO84_DEMO_HUES, HERO84_COLOR_SOURCES, HERO84_LAYOUT }

export function makeHero84DemoLighting(): Record<string, string> {
  return HERO84_BOARD.makeDemoLighting()
}

/**
 * Preserved for backward compatibility with existing callers/tests.
 * Returns the self-contained 6-row HERO84 layout from hero84.board.ts.
 */
export function buildHero84Layout(_hero68Layout?: Hero68Row[]): Hero68Row[] {
  return HERO84_LAYOUT.map((row) => [...row])
}
