import { useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Cpu,
  ExternalLink,
  Gamepad2,
  Keyboard,
  Link2,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import {
  RGB_SERVICE_DOWNLOAD,
  refreshRgbService,
  useRgbServiceState
} from '../protocol/rgbServiceState';
import { useBgService } from '../protocol/bgServiceClient';
import { gamepadService, VIGEMBUS_DOWNLOAD, VIGEMBUS_RELEASE } from '../protocol/gamepadService';
import { useLocalServiceAccess } from '../protocol/localServiceAccess';
import { useHero68Device } from '../protocol/hero68/webhid';
import { useXsydDevice } from '../protocol/xsyd/device';
import { useI18n } from '../i18n';
import { useServiceUpdate, updateMessage } from '../protocol/serviceUpdates';
import '../components/RgbSettingsPage.css';
import './BackgroundServicePage.css';
const VI: Record<string, string> = {
  'Custom RGB, Rhythm Sync and Gamepad keep running when you close the browser.':
    'Custom RGB, Rhythm Sync và Gamepad tiếp tục chạy khi bạn đóng trình duyệt.',
  'Your connection': 'Kết nối của bạn',
  'Windows service': 'Dịch vụ Windows',
  Running: 'Đang chạy',
  'Not running': 'Chưa chạy',
  Connected: 'Đã kết nối',
  'Not connected': 'Chưa kết nối',
  Installed: 'Đã cài',
  'Not installed': 'Chưa cài',
  'Not checked': 'Chưa kiểm tra',
  'Service update needed': 'Cần cập nhật service',
  'Windows app': 'Ứng dụng Windows',
  'Required for Custom RGB, Rhythm Sync and Gamepad.':
    'Cần cho Custom RGB, Rhythm Sync và Gamepad.',
  'Download Windows app': 'Tải ứng dụng Windows',
  'Run setup and choose Desktop shortcut, Auto-start and optional Gamepad driver.':
    'Chạy setup và chọn shortcut Desktop, chạy cùng Windows và driver Gamepad nếu cần.',
  'Run OpenAula.exe; its icon stays in the system tray.':
    'Mở OpenAula.exe; biểu tượng sẽ nằm ở khay hệ thống.',
  'Choose Allow if the browser asks to connect to local apps.':
    'Chọn Cho phép khi trình duyệt hỏi quyền kết nối ứng dụng trên máy.',
  'Xbox controller driver': 'Driver tay cầm Xbox',
  'Only needed for Gamepad. RGB works without this driver.':
    'Chỉ cần cho Gamepad. RGB vẫn hoạt động khi chưa cài driver này.',
  'Download ViGEmBus': 'Tải ViGEmBus',
  'Official release': 'Bản phát hành chính thức',
  'Open the installer and follow its instructions. Windows may ask for administrator permission.':
    'Mở trình cài đặt và làm theo hướng dẫn. Windows có thể yêu cầu quyền quản trị.',
  'Restart Windows if requested, reopen the service, then check the connection here.':
    'Khởi động lại Windows nếu được yêu cầu, mở lại service rồi kiểm tra kết nối tại đây.',
  'Service and keyboard are ready.': 'Service và bàn phím đã sẵn sàng.',
  'Open the Windows app to connect.': 'Mở ứng dụng Windows để kết nối.',
  'Connect HERO68 to your computer.': 'Kết nối HERO68 với máy tính.',
  'Checking the service and driver…': 'Đang kiểm tra service và driver…',
  'Allow local app access in your browser’s site permissions, then check again.':
    'Cho phép truy cập ứng dụng trên máy trong quyền của trang web, rồi kiểm tra lại.',
  'Open Gamepad': 'Mở Gamepad',
  'Need help?': 'Cần trợ giúp?',
  'Start with Windows': 'Chạy cùng Windows',
  'Enable Auto-start from the service tray menu. Keep the app folder in the same location.':
    'Bật Auto-start trong menu khay hệ thống của service. Giữ nguyên vị trí thư mục ứng dụng.',
  'Update the app': 'Cập nhật ứng dụng',
  'Press Update once. The app installs the update and restarts itself; Windows stays running.':
    'Bấm Cập nhật một lần. App tự cài bản mới và mở lại; Windows không khởi động lại.',
  'Keyboard not detected': 'Không tìm thấy bàn phím',
  'Close other keyboard configuration apps and reconnect HERO68.':
    'Đóng ứng dụng cấu hình bàn phím khác và kết nối lại HERO68.',
  'Driver installed but Gamepad unavailable': 'Đã cài driver nhưng chưa dùng được Gamepad',
  'Check again after restarting the service. If Xbox creation still fails, restart Windows.':
    'Kiểm tra lại sau khi khởi động lại service. Nếu vẫn lỗi tạo Xbox controller, khởi động lại Windows.'
};
type DriverState = 'checking' | 'ready' | 'missing' | 'update' | 'unknown' | 'error';
export default function BackgroundServicePage({
  onOpenCustom,
  onOpenGamepad,
  autoProfileEnabled = true,
  onToggleAutoProfile,
  revertToDefaultOnFocusLoss = true,
  onToggleRevertToDefault,
  notifyOnProfileSwitch = true,
  onToggleNotifyOnSwitch
}: {
  onOpenCustom: () => void;
  onOpenGamepad: () => void;
  autoProfileEnabled?: boolean;
  onToggleAutoProfile?: (enabled: boolean) => void;
  revertToDefaultOnFocusLoss?: boolean;
  onToggleRevertToDefault?: (enabled: boolean) => void;
  notifyOnProfileSwitch?: boolean;
  onToggleNotifyOnSwitch?: (enabled: boolean) => void;
}) {
  const { language, tr } = useI18n();
  const t = (text: string) => (language === 'vi' ? (VI[text] ?? tr(text)) : text);
  const { checking, status, reconnecting } = useRgbServiceState();
  const { autoProfile, openWindows, refreshApps, isServiceOutdated, serviceVersion, requiredServiceVersion } = useBgService();
  const heroDevice = useHero68Device();
  const xsydDevice = useXsydDevice();
  const { permission } = useLocalServiceAccess();
  const [driver, setDriver] = useState<DriverState>('checking');
  const [attempt, setAttempt] = useState(0);
  const serviceUpdate = useServiceUpdate(status?.supportsFullUpdate === true);
  const online = !!status && !reconnecting;
  const blocked = permission === 'denied';
  const xsydConnected = xsydDevice.state === 'connected';
  const heroConnected = heroDevice.state === 'connected';
  const keyboardConnected = (online && !!status?.connected) || xsydConnected || heroConnected;
  const activeModel = xsydConnected
    ? 'win68HeMax'
    : (status?.deviceModel ?? heroDevice.detectedModel);
  const keyboardName =
    activeModel === 'win68HeMax'
      ? 'WIN 68 HE MAX'
      : activeModel === 'hero84'
        ? 'HERO84'
        : activeModel === 'hero68Xs' || heroDevice.isXs
          ? 'HERO 68 XS'
          : 'HERO68';
  useEffect(() => {
    if (!online) {
      setDriver('unknown');
      return;
    }
    let active = true;
    let revision = 0;
    setDriver('checking');
    const accept = (value: Awaited<ReturnType<typeof gamepadService.status>>) => {
      if (active) {
        setDriver(
          value.capabilities?.gamepad !== true
            ? 'update'
            : value.driverAvailable === true
              ? 'ready'
              : status?.driverInstalled
                ? 'error'
                : 'missing'
        );
      }
    };
    const close = gamepadService.stream(
      value => {
        revision++;
        accept(value);
      },
      () => {
        revision++;
        if (active) {
          setDriver('unknown');
        }
      }
    );
    void gamepadService
      .status()
      .then(value => {
        if (!revision) {
          accept(value);
        }
      })
      .catch(() => {
        if (active && !revision) {
          setDriver('unknown');
        }
      });
    return () => {
      active = false;
      close();
    };
  }, [online, attempt]);
  const checkingConnection = checking || driver === 'checking';
  const rows = [
    {
      icon: Cpu,
      name: t('Windows service'),
      value: t(
        blocked ? 'Permission blocked' : checking ? 'Checking' : online ? 'Running' : 'Not running'
      ),
      ready: online && !blocked
    },
    {
      icon: Keyboard,
      name: keyboardName,
      value: t(keyboardConnected ? 'Connected' : 'Not connected'),
      ready: keyboardConnected
    },
    {
      icon: Gamepad2,
      name: 'ViGEmBus',
      value: t(
        driver === 'ready'
          ? 'Installed'
          : driver === 'error'
            ? 'Driver installed but Gamepad unavailable'
            : driver === 'missing'
              ? 'Not installed'
              : driver === 'update'
                ? 'Service update needed'
                : driver === 'checking'
                  ? 'Checking'
                  : 'Not checked'
      ),
      ready: online && driver === 'ready'
    }
  ];
  return (
    <div className="page settings-page background-service-page page-enter">
      <header className="bs-heading">
        <h1>{tr('Background Service')}</h1>
        <p>{t('Custom RGB, Rhythm Sync and Gamepad keep running when you close the browser.')}</p>
      </header>
      <section className="bs-connection" aria-label={t('Your connection')}>
        <div className="bs-connection-top">
          <h2>{t('Your connection')}</h2>
          <button
            className="bs-text-button"
            disabled={checkingConnection}
            onClick={() => {
              setAttempt(n => n + 1);
              void refreshRgbService();
              void refreshApps();
            }}
          >
            <RefreshCw size={14} className={checkingConnection ? 'bs-spinning' : ''} />
            {tr('Check again')}
          </button>
        </div>
        <div className="bs-status-grid">
          {rows.map(({ icon: Icon, name, value, ready }) => (
            <div className={`bs-status ${ready ? 'is-ready' : ''}`} key={name}>
              <span className="bs-status-icon">
                <Icon size={19} />
              </span>
              <span>
                <strong>{name}</strong>
                <small>
                  <i />
                  {value}
                </small>
              </span>
              {ready && <Check className="bs-check" size={16} />}
            </div>
          ))}
        </div>
        <p className={`bs-connection-note ${blocked ? 'is-warning' : ''}`} role="status">
          {t(
            blocked
              ? 'Allow local app access in your browser’s site permissions, then check again.'
              : checkingConnection
                ? 'Checking the service and driver…'
                : !online
                  ? 'Open the Windows app to connect.'
                  : !keyboardConnected
                    ? 'Connect HERO68 to your computer.'
                    : 'Service and keyboard are ready.'
          )}
        </p>
      </section>

      {/* Wootility v5 + OpenMAD Auto-Profile Switching & Zero-Flash-Wear Card (E2e / j2e, L88940-L89120) */}
      <section
        className="bs-connection"
        aria-label={tr('Auto-Profile Switching (Zero Flash Wear)')}
      >
        <div className="bs-connection-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={18} color="#4ade80" />
            <h2>{tr('Auto-Profile Switching (Zero Flash Wear)')}</h2>
          </div>
          <span
            className="woot-shortcut-pill"
            style={{
              color: online && !isServiceOutdated ? '#4ade80' : '#facc15',
              borderColor: online && !isServiceOutdated ? 'rgba(74,222,128,0.35)' : 'rgba(250,204,21,0.35)'
            }}
          >
            {online
              ? isServiceOutdated
                ? `UPDATE REQUIRED (v${serviceVersion} → v${requiredServiceVersion})`
                : `v${serviceVersion || requiredServiceVersion} · 400ms Poll · 800ms Debounce · 3000ms Dwell`
              : `OFFLINE (Requires v${requiredServiceVersion}+)`}
          </span>
        </div>

        {(!online || isServiceOutdated) && (
          <div className="woot-bg-warning-banner" style={{ marginTop: 10 }}>
            <div>
              <strong>
                {isServiceOutdated
                  ? tr('Background Service update to v1.8.0 required')
                  : tr('Background Service v1.8.0 is not running')}
              </strong>
              <span>
                {isServiceOutdated
                  ? `${tr('Detected service')} v${serviceVersion} — ${tr('update to')} v${requiredServiceVersion} ${tr('for Auto-Profile & Zero-Flash-Wear.')}`
                  : tr(
                      "Your linked profiles won't switch automatically until Background Service v1.8.0 is connected."
                    )}
              </span>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5 }}>
            <input
              type="checkbox"
              checked={autoProfileEnabled}
              onChange={e => onToggleAutoProfile?.(e.target.checked)}
            />
            <span>{tr('Auto-Profile Switching (Zero Flash Wear)')}</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5 }}>
            <input
              type="checkbox"
              checked={revertToDefaultOnFocusLoss}
              onChange={e => onToggleRevertToDefault?.(e.target.checked)}
            />
            <span>{tr('Revert to Default Profile (Slot 1) when leaving linked apps')}</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5 }}>
            <input
              type="checkbox"
              checked={notifyOnProfileSwitch}
              onChange={e => onToggleNotifyOnSwitch?.(e.target.checked)}
            />
            <span>{tr('Show notification when profile switches automatically')}</span>
          </label>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.03)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            fontSize: 12.5,
            color: 'var(--woot-text-subtle)'
          }}
        >
          <span>
            <Link2 size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />
            Active Foreground App: <strong>{autoProfile.activeApp?.exe || 'None'}</strong>
          </span>
          <span>
            Open Windows Detected: <strong>{openWindows.length}</strong>
          </span>
          <span>
            Auto-Switches: <strong>{autoProfile.switchCount}</strong>
          </span>
          <span>
            Flash Erase/Write Cycles Saved: <strong>{autoProfile.flashWritesSaved}</strong>
          </span>
        </div>
      </section>

      <div className="bs-install-grid">
        <section className="bs-install-card">
          <div className="bs-install-heading">
            <span className="bs-install-icon">
              <Cpu size={25} />
            </span>
            <div>
              <h2>{t('Windows app')}</h2>
              <p>{t('Required for Custom RGB, Rhythm Sync and Gamepad.')}</p>
            </div>
          </div>
          <a className="apply-button bs-download" href={RGB_SERVICE_DOWNLOAD}>
            <ArrowDownToLine size={17} />
            {t('Download Windows app')}
            <span>{`v${requiredServiceVersion} · Windows x64 · EXE`}</span>
          </a>
          <ol className="bs-steps">
            <li>
              {t('Run setup and choose Desktop shortcut, Auto-start and optional Gamepad driver.')}
            </li>
            <li>{t('Run OpenAula.exe; its icon stays in the system tray.')}</li>
            <li>{t('Choose Allow if the browser asks to connect to local apps.')}</li>
          </ol>
        </section>
        {driver === 'missing' && (
          <section className="bs-install-card">
            <div className="bs-install-heading">
              <span className="bs-install-icon">
                <Gamepad2 size={25} />
              </span>
              <div>
                <h2>{t('Xbox controller driver')}</h2>
                <p>{t('Only needed for Gamepad. RGB works without this driver.')}</p>
              </div>
            </div>
            <a className="apply-button bs-download" href={VIGEMBUS_DOWNLOAD}>
              <ArrowDownToLine size={17} />
              {t('Download ViGEmBus')}
              <span>v1.22.0 · EXE</span>
            </a>
            <ol className="bs-steps">
              <li>
                {t(
                  'Open the installer and follow its instructions. Windows may ask for administrator permission.'
                )}
              </li>
              <li>
                {t(
                  'Restart Windows if requested, reopen the service, then check the connection here.'
                )}
              </li>
            </ol>
            <a className="bs-official" href={VIGEMBUS_RELEASE} target="_blank" rel="noreferrer">
              {t('Official release')}
              <ExternalLink size={12} />
            </a>
          </section>
        )}
      </div>
      <section className="bs-connection" aria-label={t('Update the app')}>
        <h2>{t('Update the app')}</h2>
        {status?.supportsFullUpdate || serviceUpdate.busy ? (
          <>
            <button
              className="apply-button"
              disabled={serviceUpdate.busy}
              onClick={() => void serviceUpdate.apply()}
            >
              <RefreshCw size={16} />
              {t('Update the app')}
            </button>
            <p role="status">{updateMessage(serviceUpdate.update, language === 'vi')}</p>
            {serviceUpdate.update.phase === 'downloading' && (
              <progress
                max={serviceUpdate.update.total || 1}
                value={serviceUpdate.update.downloaded || 0}
              />
            )}
            <p>
              {t(
                'Press Update once. The app installs the update and restarts itself; Windows stays running.'
              )}
            </p>
          </>
        ) : (
          <p>
            {language === 'vi'
              ? 'Chạy setup một lần để bật cập nhật tự động.'
              : 'Run setup once to enable automatic updates.'}
          </p>
        )}
      </section>
      <div className="bs-actions">
        <button className="secondary-button" disabled={!online} onClick={onOpenCustom}>
          {tr('Open Custom Effects')}
          <ArrowRight size={15} />
        </button>
        <button
          className="secondary-button"
          disabled={(!online || driver !== 'ready') && !xsydConnected}
          onClick={onOpenGamepad}
        >
          {t('Open Gamepad')}
          <ArrowRight size={15} />
        </button>
        {online && (
          <a
            className="bs-text-button"
            href="http://127.0.0.1:16868/"
            target="_blank"
            rel="noreferrer"
          >
            {tr('Service panel')}
            <ExternalLink size={13} />
          </a>
        )}
      </div>
      <details className="bs-help">
        <summary>
          <CircleHelp size={17} />
          {t('Need help?')}
          <ChevronRight size={16} />
        </summary>
        <div className="bs-help-grid">
          {[
            [
              'Start with Windows',
              'Enable Auto-start from the service tray menu. Keep the app folder in the same location.'
            ],
            [
              'Update the app',
              'Press Update once. The app installs the update and restarts itself; Windows stays running.'
            ],
            [
              'Keyboard not detected',
              'Close other keyboard configuration apps and reconnect HERO68.'
            ],
            [
              'Driver installed but Gamepad unavailable',
              'Check again after restarting the service. If Xbox creation still fails, restart Windows.'
            ]
          ].map(([title, text]) => (
            <div key={title}>
              <h3>{t(title)}</h3>
              <p>{t(text)}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
