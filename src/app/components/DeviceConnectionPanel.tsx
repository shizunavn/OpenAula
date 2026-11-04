import { useMemo } from 'react'
import { Activity } from 'lucide-react'
import hero68Thumb from '../../assets/hero68.png'
import hero84Thumb from '../../assets/hero84.png'

const BUILTIN_THUMBNAILS: Readonly<Record<string, string>> = {
  hero68: hero68Thumb,
  hero84: hero84Thumb,
}
import { AppSelect } from './AppSelect'
import { useT } from '../../i18n'
import { HERO_DEVICE_MODELS, type HeroDeviceModel, type HeroDeviceModelId } from '../../keyboard/devices'
import type { Hero68ConnectionState } from '../../protocol/hero68/webhid'
import type { ProfileSlot } from '../../protocol/hero68/types'

export type DeviceConnectionPanelProps = {
  deviceConnectionState: Hero68ConnectionState
  deviceModel: HeroDeviceModelId
  selectedModel: HeroDeviceModel
  onSelectDeviceModel: (nextModel: HeroDeviceModelId) => void
  onConnectOrDisconnect: () => void
  profileSlot: ProfileSlot
  onSelectProfileSlot: (slot: ProfileSlot) => void
  onReadFromDevice: () => void
  profileBusy: boolean
  deviceReadState: 'idle' | 'reading' | 'success' | 'error'
  deviceActionError: string | null
  deviceError: string | null
}

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
}: DeviceConnectionPanelProps) {
  const tr = useT()
  const deviceConnected = deviceConnectionState === 'connected'
  const deviceConnecting = deviceConnectionState === 'connecting'
  const deviceStatusLabel = deviceConnectionState === 'connected'
    ? tr('Connected')
    : deviceConnectionState === 'connecting'
      ? tr('Connecting…')
      : deviceConnectionState === 'unsupported'
        ? tr('WebHID unavailable')
        : deviceConnectionState === 'error'
          ? tr('Connection error')
          : tr('Not connected')
  const rawFeedback = deviceActionError ?? deviceError
  const deviceFeedback = (rawFeedback ? tr(rawFeedback) : null)
    ?? (deviceReadState === 'success' ? tr('Profile {slot} loaded from keyboard.', { slot: profileSlot }) : null)

  const deviceModelOptions = useMemo(
    () => HERO_DEVICE_MODELS.map((option) => ({ value: option.id, label: option.label, meta: option.layout })),
    [],
  )
  // A connected keyboard decides the model by its UUID. Letting the selector
  // switch it would write another model's key tables into this board.
  const modelLocked = deviceConnected || deviceConnectionState === 'connecting'

  return (
    <div className={`device-panel is-${deviceConnectionState}`}>
      <div className="device-card device-card-static">
        <span className="device-thumb">
          <img key={deviceModel} src={BUILTIN_THUMBNAILS[deviceModel] ?? selectedModel.thumbnail} alt={selectedModel.label} />
        </span>
        <span className="device-copy">
          <small><span className="device-status-dot" aria-hidden="true" />{deviceStatusLabel}</small>
          <AppSelect<HeroDeviceModelId>
            className="device-model-select"
            label={tr('Keyboard model')}
            value={deviceModel}
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
          {deviceConnecting ? tr('Connecting…') : deviceConnected ? tr('Disconnect') : tr('Connect')}
        </button>

        <div className="profile-slot-row">
          <span>{tr('Profile slot')}</span>
          <div className="profile-slot-buttons" role="group" aria-label={tr('Profile slot')}>
            {([0, 1, 2] as const).map((slot) => (
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
        <div className={`device-feedback ${deviceActionError || deviceError ? 'is-error' : 'is-success'}`}>
          {deviceFeedback}
        </div>
      )}
    </div>
  )
}

export default DeviceConnectionPanel
