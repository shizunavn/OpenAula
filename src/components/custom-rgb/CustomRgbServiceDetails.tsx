import { Download, Layers } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { useCustomRgbPlayback } from '../useCustomRgbPlayback';

type CustomRgbServiceDetailsProps = {
  isWin68: boolean;
  xsydConnected: boolean;
  live: boolean;
  synced: boolean;
  demo: boolean;
  status: ReturnType<typeof useCustomRgbPlayback>['status'];
  onSetup: () => void;
  onRefreshService: () => void;
};

export function CustomRgbServiceDetails({
  isWin68,
  xsydConnected,
  live,
  synced,
  demo,
  status,
  onSetup,
  onRefreshService
}: CustomRgbServiceDetailsProps) {
  const { tr } = useI18n();
  return (
    <>
      <details className="service-details">
        <summary>{tr('Details')}</summary>
        <div>
          <p>
            {isWin68
              ? `${xsydConnected ? tr('Keyboard connected (WebHID XSYD 0x2A)') : tr('Local preview · connect WIN 68 HE MAX to stream live')} · ${live ? tr('Streaming Custom RGB') : tr('Draft preview')}`
              : status
                ? `${status.fps.toFixed(1)} FPS · ${status.connected ? tr('Keyboard connected') : tr('Waiting for keyboard')} · ${synced ? tr('Preview synced') : tr('Local preview or waiting for frames')}`
                : tr('The background service is not responding.')}
          </p>
          {status?.lastError && <p>{status.lastError}</p>}
          {!isWin68 && (
            <div className="custom-rgb-actions">
              <button className="secondary-button" onClick={onSetup}>
                {tr('Setup / Update')}
              </button>
              {status && (
                <a
                  className="secondary-button"
                  href="http://127.0.0.1:16868/"
                  target="_blank"
                  rel="noreferrer"
                >
                  {tr('Service panel')}
                </a>
              )}
              <button className="secondary-button" onClick={onRefreshService}>
                {tr('Check again')}
              </button>
            </div>
          )}
        </div>
      </details>
      <p className="rgb-preview-note">
        {!isWin68 && `${tr('Side lights keep their onboard effect.')} `}
        {demo
          ? tr('Demo only changes the preview.')
          : tr('Custom runs in the background; changes sync automatically.')}
      </p>
    </>
  );
}

type CustomRgbLockOverlayProps = {
  checking: boolean;
  onSetup: () => void;
  onTryDemo: () => void;
  onRefreshService: () => void;
};

export function CustomRgbLockOverlay({
  checking,
  onSetup,
  onTryDemo,
  onRefreshService
}: CustomRgbLockOverlayProps) {
  const { tr } = useI18n();
  return (
    <div className="custom-rgb-lock-overlay">
      <div className="custom-rgb-lock-card" role="status">
        <span className="custom-lock-icon">
          <Layers size={27} />
        </span>
        <h2>{checking ? tr('Checking background service…') : tr('Background service required')}</h2>
        <p>{tr('Run the background app to use Custom Effects, or try a preview.')}</p>
        <div className="custom-rgb-actions">
          <button className="apply-button" onClick={onSetup}>
            <Download size={16} /> {tr('Download app')}
          </button>
          <button className="secondary-button" onClick={onTryDemo}>
            {tr('Try demo')}
          </button>
          <button className="custom-text-button" onClick={onRefreshService}>
            {tr('Check again')}
          </button>
        </div>
      </div>
    </div>
  );
}
