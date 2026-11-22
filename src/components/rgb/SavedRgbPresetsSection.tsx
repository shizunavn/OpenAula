import { Trash2 } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { SavedRgbPresetItem } from './rgbPresetStorage';

type SavedRgbPresetsSectionProps = {
  presets: SavedRgbPresetItem[];
  disabled: boolean;
  onApply?: (item: SavedRgbPresetItem) => void;
  onDelete?: (id: string) => void;
};

export function SavedRgbPresetsSection({
  presets,
  disabled,
  onApply,
  onDelete
}: SavedRgbPresetsSectionProps) {
  const { tr } = useI18n();
  if (!presets.length) {
    return null;
  }
  return (
    <div className="rgb-saved-presets">
      <h3>{tr('Saved')} RGB</h3>
      <div className="rgb-zone-tabs" role="group" aria-label="Saved RGB">
        {presets.map(item => (
          <div key={item.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <button type="button" disabled={disabled} onClick={() => onApply?.(item)}>
              {item.name}
            </button>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Delete ${item.name}`}
              onClick={() => onDelete?.(item.id)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
