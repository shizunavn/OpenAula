import { HERO68_LAYOUT, makeDemoLighting, type Hero68Row } from './hero68Layout'
import { HERO84_DEMO_HUES, HERO84_ONLY_KEYS, buildHero84Layout } from './hero84Layout'
import { heroDeviceModel, type HeroDeviceModel, type HeroDeviceModelId } from './devices'

/**
 * Model-keyed keyboard definitions. Layouts are keyed by key id, so one
 * lighting frame or key-label map serves whichever model is selected.
 */
export type HeroLayout = {
  model: HeroDeviceModel
  rows: Hero68Row[]
  keyIds: string[]
  keyIdSet: ReadonlySet<string>
  /** Demo lighting frame covering every key on the board. */
  makeDemoLighting: () => Record<string, string>
}

function wootilityHueColor(hue: number) {
  return `hsl(${hue} 80% 41%)`
}

function buildLayout(modelId: HeroDeviceModelId): HeroLayout {
  const rows = modelId === 'hero84' ? buildHero84Layout(HERO68_LAYOUT) : HERO68_LAYOUT
  const keyIds = rows.flat().filter((key) => !key.spacer).map((key) => key.id)
  return {
    model: heroDeviceModel(modelId),
    rows,
    keyIds,
    keyIdSet: new Set(keyIds),
    makeDemoLighting: () => {
      const frame = makeDemoLighting()
      if (modelId === 'hero84') {
        for (const key of HERO84_ONLY_KEYS) {
          frame[key.id] = wootilityHueColor(HERO84_DEMO_HUES[key.id] ?? 0)
        }
      }
      return frame
    },
  }
}

const LAYOUTS: Record<HeroDeviceModelId, HeroLayout> = {
  hero68: buildLayout('hero68'),
  hero84: buildLayout('hero84'),
}

export function heroLayout(modelId: HeroDeviceModelId): HeroLayout {
  const layout = LAYOUTS[modelId]
  if (!layout) throw new RangeError(`Unknown keyboard model: ${modelId}`)
  return layout
}
