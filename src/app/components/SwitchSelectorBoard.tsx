import { heroLayout } from '../../keyboard/layout'
import type { HeroDeviceModelId } from '../../keyboard/devices'
import { SwitchStemMenuIcon } from './SwitchStemMenuIcon'

function SwitchSelectorBoard({
  model,
  selectedKeys,
  onToggleKey,
  switchImagesByKey,
}: {
  model: HeroDeviceModelId
  selectedKeys: Set<string>
  onToggleKey: (keyId: string) => void
  switchImagesByKey: Record<string, string>
}) {
  const rows = heroLayout(model).rows
  return (
    <div className={`switch-board-wrap is-${model}`}>
      <div className="switch-board-preview">
        {rows.map((row, rowIndex) => (
          <div className="switch-board-row" key={rowIndex}>
            {row.map((key) => (
              <button
                key={key.id}
                type="button"
                className={`switch-board-key ${selectedKeys.has(key.id) ? 'is-selected' : ''}`}
                style={{ ['--key-units' as any]: key.width ?? 1 }}
                onClick={() => onToggleKey(key.id)}
                aria-label={key.label}
              >
                {switchImagesByKey[key.id]
                  ? <img src={switchImagesByKey[key.id]} alt="" aria-hidden="true" className="switch-board-switch" />
                  : <span className="switch-board-generic" aria-hidden="true"><SwitchStemMenuIcon /></span>}
                <span className="switch-board-key-label" aria-hidden="true">{key.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export { SwitchSelectorBoard }
