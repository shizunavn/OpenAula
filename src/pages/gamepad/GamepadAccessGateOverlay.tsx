import { Download, Gamepad2, RefreshCw } from 'lucide-react';
import type { GamepadAccess } from '../../protocol/gamepadAccess';
import { VIGEMBUS_DOWNLOAD } from '../../protocol/gamepadService';

export function GamepadAccessGateOverlay({
  access,
  loading,
  t,
  onSetup,
  onRefreshConnection
}: {
  access: GamepadAccess;
  loading: boolean;
  t: (text: string) => string;
  onSetup: () => void;
  onRefreshConnection: () => void;
}) {
  return (
    <div className="gp-lock-overlay">
      <section className="gp-lock-card" role="status" aria-live="polite">
        <span className="gp-lock-icon">
          <Gamepad2 size={28} />
        </span>
        <h2>
          {t(
            access === 'checking'
              ? 'Loading service'
              : access === 'driver'
                ? 'ViGEmBus required'
                : access === 'update'
                  ? 'Service update required'
                  : 'Background service required'
          )}
        </h2>
        <p>
          {t(
            access === 'driver'
              ? 'Install ViGEmBus v1.22.0, restart the Windows service, then check again.'
              : access === 'update'
                ? 'Update the Windows service to 0.4.0 or later.'
                : 'Run the Windows service to configure and use Gamepad.'
          )}
        </p>
        <div className="gp-lock-actions">
          {access === 'driver' ? (
            <a
              className="gp-lock-primary"
              href={VIGEMBUS_DOWNLOAD}
              target="_blank"
              rel="noreferrer"
            >
              <Download size={16} />
              {t('Install ViGEmBus')}
            </a>
          ) : (
            <button className="gp-lock-primary" onClick={onSetup}>
              <Download size={16} />
              {t('Download Windows service')}
            </button>
          )}
          <button disabled={loading} onClick={onRefreshConnection}>
            <RefreshCw size={15} />
            {t('Check again')}
          </button>
        </div>
      </section>
    </div>
  );
}
