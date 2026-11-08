import type { RefObject } from 'react';
import { Info, Keyboard, X } from 'lucide-react';
import { AppSelect } from '../../app/components/AppSelect';
import GamepadControlIcon from '../../components/GamepadControlIcon';
import {
  formatToggleKeybind,
  isAnalogAction,
  type GamepadAction,
  type GamepadBinding,
  type GamepadConfiguration
} from '../../keyboard/gamepad';
import type { GamepadStatus } from '../../protocol/gamepadService';
import { actionLabel, GAMEPAD_PALETTE, physicalLabel } from './gamepadDraftStorage';
import type { DraggedGamepadBinding } from './useGamepadDragAndCurve';

export function GamepadSetupTab({
  config,
  status,
  disabled,
  loading,
  selected,
  binding,
  dragged,
  recordingKeybind,
  pendingKeybind,
  emptyDragImageRef,
  t,
  onToggleEnabled,
  onPatch,
  onStartRecordingKeybind,
  onClearKeybind,
  onStartDragPaletteAction,
  onEndDrag,
  onAssignKey
}: {
  config: GamepadConfiguration;
  status: GamepadStatus | null;
  disabled: boolean;
  loading: boolean;
  selected: string | null;
  binding: GamepadBinding | undefined;
  dragged: DraggedGamepadBinding | null;
  recordingKeybind: boolean;
  pendingKeybind: string[];
  emptyDragImageRef: RefObject<HTMLSpanElement | null>;
  t: (text: string) => string;
  onToggleEnabled: () => void;
  onPatch: (next: Partial<GamepadConfiguration>) => void;
  onStartRecordingKeybind: () => void;
  onClearKeybind: () => void;
  onStartDragPaletteAction: (action: GamepadAction, x: number, y: number) => void;
  onEndDrag: () => void;
  onAssignKey: (keyId: string, action: GamepadAction) => void;
}) {
  return (
    <div role="tabpanel" id="gp-setup" aria-labelledby="gp-tab-setup" className="gp-columns">
      <section className="gp-card">
        <div className="gp-card-heading">
          <h3>{t('Enable Gamepad')}</h3>
          <button
            className="gp-enable-switch"
            role="switch"
            aria-checked={status?.enabled === true}
            aria-label={t('Enable Gamepad')}
            disabled={disabled || loading}
            onClick={onToggleEnabled}
          >
            <span />
          </button>
        </div>
        <p>{t('Your HERO68 can work as an Xbox controller, using analog key travel.')}</p>
        <label>
          <span className="gp-field-title">{t('Controller type')}</span>
          <AppSelect
            value="xbox"
            options={[{ value: 'xbox', label: 'Xbox Controller (XInput)' }]}
            label="Controller type"
            onChange={() => {}}
          />
        </label>
        <label>
          <span className="gp-field-title">{t('Polling rate')}</span>
          <AppSelect
            value={config.rate}
            options={[50, 100, 200].map(value => ({
              value,
              label: `${value} Hz`
            }))}
            label="Polling rate"
            disabled={disabled}
            onChange={value => onPatch({ rate: value as 50 | 100 | 200 })}
          />
        </label>
        <div className="gp-keybind-field">
          <span className="gp-field-title">{t('Toggle keybind')}</span>
          <div className="gp-keybind-row">
            <button
              type="button"
              className={`gp-keybind-button ${recordingKeybind ? 'active is-recording' : ''}`}
              aria-label={t('Toggle keybind')}
              aria-pressed={recordingKeybind}
              disabled={disabled}
              onClick={onStartRecordingKeybind}
            >
              <Keyboard size={16} />
              <span>
                {recordingKeybind
                  ? pendingKeybind.length
                    ? `${formatToggleKeybind(pendingKeybind, physicalLabel)} + …`
                    : t('Press a key or combo… (Esc to cancel)')
                  : config.toggleKeybind?.length
                    ? formatToggleKeybind(config.toggleKeybind, physicalLabel)
                    : t('Click to bind shortcut')}
              </span>
            </button>
            {(Boolean(config.toggleKeybind?.length) || recordingKeybind) && (
              <button
                type="button"
                className="gp-keybind-clear"
                aria-label={t('Clear toggle keybind')}
                title={t('Clear toggle keybind')}
                disabled={disabled}
                onClick={onClearKeybind}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <small className="gp-keybind-hint">
            {t('Quickly toggle Gamepad on or off with a key or shortcut, even while in-game.')}
          </small>
        </div>
        <div className="gp-info">
          <Info size={20} />
          <p>
            {t(
              config.keyboardSuppressionMode === 'hook'
                ? 'Windows hooking can conflict with anti-cheat. Turn off Gamepad and this fallback before playing VALORANT or League of Legends (Vanguard), Fortnite (EAC), or other games using kernel anti-cheat. Other games may work if their rules allow it; user-mode anti-cheat is not a guarantee.'
                : 'Mapped keys can be disabled directly in firmware and restored when Gamepad stops.'
            )}
          </p>
        </div>
      </section>
      <section className="gp-card">
        <h3>{t('Controller Mapping')}</h3>
        <p>
          {t(
            'Drag a control onto a key, or select a key and click a control. Drag a mapped control outside the keyboard or right-click its key to remove the binding.'
          )}
        </p>
        <div className="gp-palette">
          {GAMEPAD_PALETTE.map(action => (
            <button
              key={action}
              className={
                'gp-action gp-action-' +
                action +
                (dragged?.action === action && !dragged.sourceKeyId ? ' is-dragging' : '')
              }
              draggable={!disabled}
              disabled={disabled}
              aria-label={'Bind ' + action}
              onDragStart={event => {
                event.dataTransfer.setData('application/x-openhero-gamepad', action);
                event.dataTransfer.effectAllowed = 'copy';
                if (emptyDragImageRef.current) {
                  event.dataTransfer.setDragImage(emptyDragImageRef.current, 0, 0);
                }
                onStartDragPaletteAction(action, event.clientX, event.clientY);
              }}
              onDragEnd={onEndDrag}
              onClick={() => selected && onAssignKey(selected, action)}
            >
              <GamepadControlIcon action={action} />
            </button>
          ))}
        </div>
        <div className="gp-binding">
          <strong>
            {binding
              ? `${physicalLabel(binding.keyId)} → ${actionLabel(binding.action)}`
              : t('No gamepad binding selected')}
          </strong>
          {binding && isAnalogAction(binding.action) && (
            <>
              <label>
                {t('Start travel')}
                <input
                  type="number"
                  min="0"
                  max={binding.endMm - 0.01}
                  step=".01"
                  value={binding.startMm}
                  onChange={event => {
                    const nextStart = event.target.valueAsNumber;
                    if (
                      Number.isFinite(nextStart) &&
                      nextStart >= 0 &&
                      nextStart <= binding.endMm - 0.01
                    ) {
                      onPatch({
                        bindings: config.bindings.map(item =>
                          item === binding ? { ...item, startMm: nextStart } : item
                        )
                      });
                    }
                  }}
                />
              </label>
              <label>
                {t('Full output at')}
                <input
                  type="number"
                  min={binding.startMm + 0.01}
                  max="3.4"
                  step=".01"
                  value={binding.endMm}
                  onChange={event => {
                    const nextEnd = event.target.valueAsNumber;
                    if (
                      Number.isFinite(nextEnd) &&
                      nextEnd >= binding.startMm + 0.01 &&
                      nextEnd <= 3.4
                    ) {
                      onPatch({
                        bindings: config.bindings.map(item =>
                          item === binding ? { ...item, endMm: nextEnd } : item
                        )
                      });
                    }
                  }}
                />
              </label>
            </>
          )}
          {binding && !isAnalogAction(binding.action) && (
            <p className="gp-digital-note">
              <Info size={16} />
              {t("Uses this key's Actuation Point and Rapid Trigger settings.")}
            </p>
          )}
        </div>
        <label className="gp-switch">
          {t('Keep keyboard keys')}
          <input
            type="checkbox"
            role="switch"
            checked={!config.suppressMappedKeys}
            disabled={disabled || !status?.capabilities.keyboardSuppression}
            onChange={event => onPatch({ suppressMappedKeys: !event.target.checked })}
          />
        </label>
        <label className="gp-switch">
          {t('Mapped-key override')}
          <input
            type="checkbox"
            role="switch"
            checked={config.suppressMappedKeys}
            disabled={disabled || !status?.capabilities.keyboardSuppression}
            onChange={event => onPatch({ suppressMappedKeys: event.target.checked })}
          />
        </label>
        <p>
          {t(
            config.keyboardSuppressionMode === 'hook'
              ? 'Fallback: Windows WH_KEYBOARD_LL. It affects matching keys on every keyboard and may not block Raw Input.'
              : 'Firmware: mapped keys use empty action 0x00000000. Original remaps are backed up and restored on Stop.'
          )}
        </p>
        {!status?.capabilities.keyboardSuppression && (
          <p>
            {t(
              'Update the full Windows service package to 0.4.1 or later for mapped-key blocking.'
            )}
          </p>
        )}
        {status?.keyboardSuppressionError && (
          <p className="gp-error" role="alert">
            {status.keyboardSuppressionError}
          </p>
        )}
        {status?.firmwareRecoveryPending && (
          <p className="gp-error" role="alert">
            {t(
              'Keyboard remap recovery is pending. Reconnect the original HERO68; Stop retries recovery.'
            )}
          </p>
        )}
      </section>
    </div>
  );
}
