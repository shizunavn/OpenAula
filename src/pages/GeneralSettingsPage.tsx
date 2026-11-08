import { Toggle } from '../app/components/Toggle';
import { useT } from '../i18n';
import { isWin68HeMaxModel, type HeroDeviceModel } from '../keyboard/devices';
import type { BoardDescriptor } from '../keyboard/registry/types';
import {
  POLLING_RATES,
  readAutoCalibration,
  readHallDebounce,
  readOsMode,
  readWinLock,
  writeAutoCalibration,
  writeHallDebounce,
  writeOsMode,
  writeWinLock
} from '../protocol/hero68/commands';
import type { PollingRate } from '../protocol/hero68/types';

export type GeneralSettingsPageProps = {
  model: HeroDeviceModel | BoardDescriptor;
  deviceConnected: boolean;
  deviceSettingsState: 'idle' | 'reading' | 'ready' | 'saving' | 'error';
  devicePollingRate: PollingRate | null;
  deviceOsModeMac: boolean;
  setDeviceOsModeMac: (next: boolean) => void;
  deviceWinLock: boolean;
  setDeviceWinLock: (next: boolean) => void;
  deviceHallDebounce: boolean;
  setDeviceHallDebounce: (next: boolean) => void;
  deviceAutoCalibration: boolean;
  setDeviceAutoCalibration: (next: boolean) => void;
  showAdvancedPages: boolean;
  readDeviceGeneralSettings: () => Promise<void>;
  handlePollingRateChange: (rate: PollingRate) => Promise<void>;
  applyBooleanDeviceSetting: (
    label: string,
    value: boolean,
    zone: 17 | 21 | 24 | 25,
    writeReport: Uint8Array,
    readReport: Uint8Array,
    setter: (next: boolean) => void
  ) => Promise<void>;
};

export function GeneralSettingsPage({
  model,
  deviceConnected,
  deviceSettingsState,
  devicePollingRate,
  deviceOsModeMac,
  setDeviceOsModeMac,
  deviceWinLock,
  setDeviceWinLock,
  deviceHallDebounce,
  setDeviceHallDebounce,
  deviceAutoCalibration,
  setDeviceAutoCalibration,
  showAdvancedPages,
  readDeviceGeneralSettings,
  handlePollingRateChange,
  applyBooleanDeviceSetting
}: GeneralSettingsPageProps) {
  const tr = useT();
  const isWin68 = isWin68HeMaxModel(model.id);
  const busyOrDisconnected =
    !deviceConnected || deviceSettingsState === 'reading' || deviceSettingsState === 'saving';
  const controlsDisabled = busyOrDisconnected || isWin68;
  const pollingDisabled = busyOrDisconnected || !model.capabilities.writablePollingRate;

  return (
    <div className="page settings-page general-device-settings page-enter">
      <div className="settings-hero general-settings-hero">
        <div>
          <h1>{tr('General Settings')}</h1>
          <p>
            {tr(
              'Device-wide HERO68 settings. Values are read from the keyboard and writes are verified with readback.'
            )}
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={busyOrDisconnected}
          onClick={() => void readDeviceGeneralSettings()}
        >
          {deviceSettingsState === 'reading' ? tr('Reading…') : tr('Refresh device settings')}
        </button>
      </div>

      <section className="general-settings-stack">
        <article className="settings-card wooting-settings-card">
          <div className="device-setting-section first">
            <div className="device-setting-copy">
              <h2>{tr('Polling Rate')}</h2>
              <p>
                {tr(
                  'A higher polling rate lets the keyboard report to the computer more often. Changing it makes firmware 0323 briefly reconnect over USB.'
                )}
              </p>
              {!model.capabilities.writablePollingRate && (
                <p className="device-setting-hint">
                  {isWin68
                    ? tr('Unverified on WIN 68 HE MAX — blocked until USB capture is available.')
                    : tr(
                        'HERO84: not verified. The official AULA driver has no polling-rate command for this board; it only reads the value. Changing it may show an error or be ignored.'
                      )}
                </p>
              )}
            </div>
            <div
              className="device-option-list polling-options"
              role="radiogroup"
              aria-label={tr('Polling rate')}
            >
              {[...POLLING_RATES].reverse().map(rate => (
                <button
                  key={rate}
                  type="button"
                  role="radio"
                  aria-checked={devicePollingRate === rate}
                  className={`device-option-row ${devicePollingRate === rate ? 'is-selected' : ''}`}
                  disabled={pollingDisabled}
                  title={!model.capabilities.writablePollingRate ? tr('Unverified') : undefined}
                  onClick={() => void handlePollingRateChange(rate)}
                >
                  <span className="device-radio-dot" aria-hidden="true" />
                  <span>{rate} Hz</span>
                  {rate === 8000 && <small>{tr('Lowest latency')}</small>}
                </button>
              ))}
            </div>
          </div>

          <div className="device-setting-section">
            <div className="device-setting-copy">
              <h2>{tr('Operating System Mode')}</h2>
              <p>{tr('Select the keyboard OS mode stored by the HERO68 firmware.')}</p>
            </div>
            <div
              className="device-option-list"
              role="radiogroup"
              aria-label={tr('Operating system mode')}
            >
              <button
                type="button"
                role="radio"
                aria-checked={!deviceOsModeMac}
                className={`device-option-row ${!deviceOsModeMac ? 'is-selected' : ''}`}
                disabled={controlsDisabled}
                onClick={() =>
                  void applyBooleanDeviceSetting(
                    'OS mode',
                    false,
                    17,
                    writeOsMode(false),
                    readOsMode(),
                    setDeviceOsModeMac
                  )
                }
              >
                <span className="device-radio-dot" aria-hidden="true" />
                <span>{tr('Windows mode')}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={deviceOsModeMac}
                className={`device-option-row ${deviceOsModeMac ? 'is-selected' : ''}`}
                disabled={controlsDisabled}
                onClick={() =>
                  void applyBooleanDeviceSetting(
                    'OS mode',
                    true,
                    17,
                    writeOsMode(true),
                    readOsMode(),
                    setDeviceOsModeMac
                  )
                }
              >
                <span className="device-radio-dot" aria-hidden="true" />
                <span>{tr('macOS mode')}</span>
              </button>
            </div>
          </div>

          <div className="device-setting-section toggle-setting-section">
            <div className="device-setting-copy">
              <h2>{tr('Windows Key Lock')}</h2>
              <p>{tr('Lock or unlock the Windows key using the keyboard firmware setting.')}</p>
            </div>
            <Toggle
              checked={deviceWinLock}
              onChange={enabled =>
                void applyBooleanDeviceSetting(
                  'Windows key lock',
                  enabled,
                  21,
                  writeWinLock(enabled),
                  readWinLock(),
                  setDeviceWinLock
                )
              }
              label={tr('Windows key lock')}
              disabled={controlsDisabled}
            />
          </div>

          <div className="device-setting-section toggle-setting-section">
            <div className="device-setting-copy">
              <h2>{tr('Hall Debounce')}</h2>
              <p>
                {tr(
                  'Firmware Hall-switch debounce (feature zone 24). Leave it off for the most direct Hall response unless you specifically need filtering.'
                )}
              </p>
            </div>
            <Toggle
              checked={deviceHallDebounce}
              onChange={enabled =>
                void applyBooleanDeviceSetting(
                  'Hall debounce',
                  enabled,
                  24,
                  writeHallDebounce(enabled),
                  readHallDebounce(),
                  setDeviceHallDebounce
                )
              }
              label={tr('Hall debounce')}
              disabled={controlsDisabled}
            />
          </div>

          {showAdvancedPages && (
            <div className="device-setting-section toggle-setting-section advanced-device-setting">
              <div className="device-setting-copy">
                <h2>
                  {tr('Auto Calibration')} <span className="advanced-badge">{tr('ADVANCED')}</span>
                </h2>
                <p>
                  {tr(
                    'Expose the firmware auto-calibration feature toggle recovered from the AULA driver. This is separate from the live Hall Stream page.'
                  )}
                </p>
              </div>
              <Toggle
                checked={deviceAutoCalibration}
                onChange={enabled =>
                  void applyBooleanDeviceSetting(
                    'Auto calibration',
                    enabled,
                    25,
                    writeAutoCalibration(enabled),
                    readAutoCalibration(),
                    setDeviceAutoCalibration
                  )
                }
                label={tr('Auto calibration')}
                disabled={controlsDisabled}
              />
            </div>
          )}
        </article>

        <div className={`device-settings-read-status is-${deviceSettingsState}`}>
          {!deviceConnected
            ? tr('Connect HERO68 to read device settings.')
            : deviceSettingsState === 'reading'
              ? tr('Reading settings from HERO68…')
              : deviceSettingsState === 'saving'
                ? tr('Applying and verifying setting…')
                : deviceSettingsState === 'error'
                  ? tr('A device setting failed. See the device panel for details.')
                  : tr('Device settings are synchronized with the keyboard.')}
        </div>
      </section>
    </div>
  );
}

export default GeneralSettingsPage;
