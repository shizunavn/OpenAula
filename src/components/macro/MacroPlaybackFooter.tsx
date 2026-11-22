import { AppSelect } from '../../app/components/AppSelect';
import { useI18n } from '../../i18n';
import type { MacroDefinition } from '../../state/macros';

const PLAYBACK_LABELS: Record<MacroDefinition['playback'], string> = {
  once: 'Play once',
  repeat: 'Repeat a set number of times',
  hold: 'Repeat while held',
  toggle: 'Tap to start / stop'
};

type MacroPlaybackFooterProps = {
  playback: MacroDefinition['playback'];
  repeatCount: number;
  locked: boolean;
  deviceConnected: boolean;
  onPlaybackChange: (playback: MacroDefinition['playback']) => void;
  onRepeatCountChange: (count: number) => void;
};

export function MacroPlaybackFooter({
  playback,
  repeatCount,
  locked,
  deviceConnected,
  onPlaybackChange,
  onRepeatCountChange
}: MacroPlaybackFooterProps) {
  const { tr } = useI18n();
  return (
    <footer className="macro-playback">
      <div>
        <label>
          <span>{tr('Playback behavior')}</span>
          <AppSelect<MacroDefinition['playback']>
            label={tr('Playback behavior')}
            value={playback}
            disabled={locked}
            onChange={onPlaybackChange}
            options={Object.entries(PLAYBACK_LABELS).map(([value, label]) => ({
              value: value as MacroDefinition['playback'],
              label: tr(label)
            }))}
          />
        </label>
        {playback === 'repeat' && (
          <label className="macro-delay-input">
            <input
              type="number"
              aria-label={tr('Repeat count')}
              min={1}
              max={255}
              value={repeatCount}
              disabled={locked}
              onChange={event => onRepeatCountChange(Number(event.target.value))}
            />
            <span>{tr('times')}</span>
          </label>
        )}
      </div>
      <p>
        {playback === 'once'
          ? tr('Play the complete sequence once per trigger.')
          : playback === 'repeat'
            ? tr('Play the sequence {count} times per trigger.', {
                count: repeatCount
              })
            : playback === 'hold'
              ? tr('Keep repeating while the trigger key is held.')
              : tr('Tap the trigger to start repeating; tap again to stop.')}
      </p>
      <div className="macro-hardware-note">
        <strong>
          {deviceConnected ? tr('On-device sync ready') : tr('Local + device library')}
        </strong>
        <span>
          {deviceConnected
            ? tr(
                'Save writes the complete macro definition library to HERO68 using CMD 0x05. Playback behavior takes effect only after a macro is assigned to a key.'
              )
            : tr(
                'Your editable copy is kept locally. Connect HERO68, then save to write the definitions; assign them from Key Remap → Macros.'
              )}
        </span>
      </div>
    </footer>
  );
}
