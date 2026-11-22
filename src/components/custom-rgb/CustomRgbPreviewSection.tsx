import { RotateCcw } from 'lucide-react';
import Hero68Preview from '../Hero68Preview';
import RgbKeyPaintTools, { RgbKeySelectionTools } from '../RgbKeyPaintTools';
import { RgbPreviewPanel } from '../RgbWorkspace';
import { useI18n } from '../../i18n';
import type { CustomRgbLayer } from '../../keyboard/customRgb';
import type { LightingFrame } from '../../keyboard/lightingPreviewBus';
import type { AdvancedBinding } from '../../protocol/hero68/advanced';

type CustomRgbPreviewSectionProps = {
  demo: boolean;
  live: boolean;
  synced: boolean;
  perKey: boolean;
  layer: CustomRgbLayer | undefined;
  adding: boolean;
  samplePreview: boolean;
  disabled: boolean;
  isWin68: boolean;
  selectable: boolean;
  selected: Set<string>;
  paint: string;
  modelKeyIds: readonly string[];
  advancedBindings: AdvancedBinding[];
  frame: { keys: LightingFrame; side: string[] };
  onSelect: (next: Set<string>) => void;
  onToggleKey: (id: string) => void;
  onPaintColorChange: (color: string) => void;
  onPaintSelected: () => void;
  onReplay: () => void;
  onPatchLayerKeys: (keys: string[]) => void;
};

export function CustomRgbPreviewSection({
  demo,
  live,
  synced,
  perKey,
  layer,
  adding,
  samplePreview,
  disabled,
  isWin68,
  selectable,
  selected,
  paint,
  modelKeyIds,
  advancedBindings,
  frame,
  onSelect,
  onToggleKey,
  onPaintColorChange,
  onPaintSelected,
  onReplay,
  onPatchLayerKeys
}: CustomRgbPreviewSectionProps) {
  const { tr } = useI18n();
  return (
    <RgbPreviewPanel
      source={
        demo
          ? tr('Simulation')
          : live
            ? synced
              ? tr('Live keyboard')
              : tr('Waiting for live frames')
            : tr('Draft preview')
      }
      hint={
        perKey
          ? tr('Select keys on the preview to paint.')
          : layer
            ? tr('Select the LED region for this layer.')
            : tr('Side lights keep their onboard effect.')
      }
      actions={
        !live && samplePreview ? (
          <button className="secondary-button" disabled={disabled} onClick={onReplay}>
            <RotateCcw size={15} />
            {tr('Try effect')}
          </button>
        ) : undefined
      }
      footer={
        perKey ? (
          <RgbKeyPaintTools
            selected={selected}
            onSelect={onSelect}
            color={paint}
            onColor={onPaintColorChange}
            disabled={disabled}
            onPaint={onPaintSelected}
          />
        ) : layer && !adding ? (
          <div className="rgb-key-scope-tools">
            <RgbKeySelectionTools selected={selected} onSelect={onSelect} disabled={disabled} />
            <div className="rgb-key-scope-actions">
              <small>
                {tr('Layer affects {count}', {
                  count: layer.keys.length
                })}
              </small>
              <button
                className="apply-button"
                disabled={disabled || !selected.size}
                onClick={() => onPatchLayerKeys([...selected])}
              >
                {tr('Use selection')}
              </button>
              <button
                className="secondary-button"
                disabled={disabled}
                onClick={() => onPatchLayerKeys([...modelKeyIds])}
              >
                {tr('Affect all keys')}
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      <Hero68Preview
        advancedBindings={advancedBindings}
        showAdvancedIcons={false}
        selectedKeys={selectable ? selected : new Set()}
        onToggleKey={onToggleKey}
        onSelectKeys={onSelect}
        lightingFrame={frame.keys}
        lightingSource="local"
        selectionEnabled={selectable}
      />
      {!isWin68 && (
        <div className="rgb-side-preview" aria-label={tr('18 side light positions')}>
          {(frame.side.length ? frame.side : Array(18).fill('#35393b')).map((color, i) => (
            <span
              key={i}
              style={{
                background: color,
                color
              }}
            />
          ))}
        </div>
      )}
    </RgbPreviewPanel>
  );
}
