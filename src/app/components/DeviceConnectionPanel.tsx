import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import hero68Thumb from '../../assets/hero68.png';
import hero68XsThumb from '../../assets/hero68xs.png';
import hero84Thumb from '../../assets/hero84.png';
import win68Thumb from '../../assets/win68HeMax.png';

const BUILTIN_THUMBNAILS: Readonly<Record<string, string>> = {
  hero68: hero68Thumb,
  hero68xs: hero68XsThumb,
  hero84: hero84Thumb,
  win68HeMax: win68Thumb,
  win68: win68Thumb
};
import { AppSelect } from './AppSelect';
import { useT } from '../../i18n';
import {
  ALL_DEVICE_MODELS,
  type HeroDeviceModel,
  type HeroDeviceModelId
} from '../../keyboard/devices';
import type { Hero68ConnectionState } from '../../protocol/hero68/webhid';
import type { ProfileSlot } from '../../protocol/hero68/types';

export type DeviceConnectionPanelProps = {
  deviceConnectionState: Hero68ConnectionState;
  deviceModel: HeroDeviceModelId;
  selectedModel: HeroDeviceModel;
  onSelectDeviceModel: (nextModel: HeroDeviceModelId) => void;
  onConnectOrDisconnect: () => void;
  profileSlot: ProfileSlot;
  onSelectProfileSlot: (slot: ProfileSlot) => void;
  onReadFromDevice: () => void;
  profileBusy: boolean;
  deviceReadState: 'idle' | 'reading' | 'success' | 'error';
  deviceActionError: string | null;
  deviceError: string | null;
  isXs?: boolean;
};

export function DeviceConnectionPanel({
  deviceConnectionState,
  deviceModel,
  selectedModel,
  onSelectDeviceModel,
  onConnectOrDisconnect,
  profileSlot,
  onSelectProfileSlot,
  onReadFromDevice,
  profileBusy,
  deviceReadState,
  deviceActionError,
  deviceError,
  isXs
}: DeviceConnectionPanelProps) {
  const tr = useT();
  const deviceConnected = deviceConnectionState === 'connected';
  const showHero68XsThumb = deviceConnected && Boolean(isXs) && deviceModel === 'hero68';
  const activeThumbnail = showHero68XsThumb
    ? hero68XsThumb
    : (BUILTIN_THUMBNAILS[deviceModel] ?? selectedModel.thumbnail);
  const deviceConnecting = deviceConnectionState === 'connecting';
  const deviceStatusLabel =
    deviceConnectionState === 'connected'
      ? tr('Connected')
      : deviceConnectionState === 'connecting'
        ? tr('Connecting…')
        : deviceConnectionState === 'unsupported'
          ? tr('WebHID unavailable')
          : deviceConnectionState === 'error'
            ? tr('Connection error')
            : tr('Not connected');
  const rawFeedback = deviceActionError ?? deviceError;
  const deviceFeedback =
    (rawFeedback ? tr(rawFeedback) : null) ??
    (deviceReadState === 'success'
      ? tr('Profile {slot} loaded from keyboard.', { slot: profileSlot })
      : null);

  const deviceModelOptions = useMemo(
    () =>
      ALL_DEVICE_MODELS.map(option => ({
        value: option.id,
        label: option.label,
        meta: option.layout
      })),
    []
  );
  // A connected keyboard decides the model by its UUID or handshake. Letting the selector
  // switch it would write another model's key tables into this board.
  const modelLocked = deviceConnected || deviceConnectionState === 'connecting';

  return (
    <div className={`device-panel is-${deviceConnectionState}`}>
      <div className="device-card device-card-static">
        <span className="device-thumb">
          <img
            key={`${deviceModel}-${showHero68XsThumb ? 'xs' : 'std'}`}
            src={activeThumbnail}
            alt={showHero68XsThumb ? 'AULA HERO 68 XS' : selectedModel.label}
          />
        </span>
        <span className="device-copy">
          <small>
            <span className="device-status-dot" aria-hidden="true" />
            {deviceStatusLabel}
          </small>
          <AppSelect<HeroDeviceModelId>
            className="device-model-select"
            label={tr('Keyboard model')}
            value={deviceModel === 'win68' ? 'win68HeMax' : deviceModel}
            onChange={onSelectDeviceModel}
            options={deviceModelOptions}
            disabled={modelLocked}
          />
        </span>
        <Activity size={17} className="device-state-icon" aria-hidden="true" />
      </div>

      <div className="device-controls">
        <button
          type="button"
          className={`device-connect-button ${deviceConnected ? 'is-connected' : ''}`}
          onClick={onConnectOrDisconnect}
          disabled={profileBusy || deviceConnecting || deviceConnectionState === 'unsupported'}
        >
          {deviceConnecting
            ? tr('Connecting…')
            : deviceConnected
              ? tr('Disconnect')
              : tr('Connect')}
        </button>

        <div className="profile-slot-row">
          <span>{tr('Profile slot')}</span>
          <div className="profile-slot-buttons" role="group" aria-label={tr('Profile slot')}>
            {([0, 1, 2] as const).map(slot => (
              <button
                type="button"
                key={slot}
                className={profileSlot === slot ? 'is-active' : ''}
                aria-pressed={profileSlot === slot}
                disabled={profileBusy}
                onClick={() => onSelectProfileSlot(slot)}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="device-read-button"
          onClick={onReadFromDevice}
          disabled={!deviceConnected || profileBusy}
        >
          {deviceReadState === 'reading' ? tr('Reading…') : tr('Read from device')}
        </button>
      </div>

      {deviceFeedback && (
        <div
          className={`device-feedback ${deviceActionError || deviceError ? 'is-error' : 'is-success'}`}
        >
          {deviceFeedback}
        </div>
      )}
    </div>
  );
}

export default DeviceConnectionPanel;
