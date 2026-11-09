import { useContext, useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Play,
  Square,
  RotateCcw,
  SlidersHorizontal,
  Layers,
  Download
} from 'lucide-react';
import Hero68Preview from './Hero68Preview';
import RgbColorPicker from './RgbColorPicker';
import { RgbPreviewPanel, RgbToolbarSlot } from './RgbWorkspace';
import { UndoRedoButtons, useUndoRedoState } from '../app/components/UndoRedoButtons';
import {
  defaultRhythm,
  validateRhythm,
  restoreRhythm,
  rhythmDemo,
  RHYTHM_MODES,
  RHYTHM_SIDE_MODES,
  type RhythmConfiguration
} from '../keyboard/rhythm';
import { heroLayout } from '../keyboard/layout';
import { isWin68HeMaxModel } from '../keyboard/devices';
import type { AdvancedBinding } from '../protocol/hero68/advanced';
import type { RgbProfile } from '../protocol/hero68/rgb';
import { rgbService, type AudioEndpoint, type RgbServiceFrame } from '../protocol/rgbService';
import {
  publishRgbServiceStatus,
  useRgbServiceState,
  refreshRgbService,
  getRgbServiceState
} from '../protocol/rgbServiceState';
import {
  getXsydCustomRgbFrame,
  startXsydRhythm,
  stopXsydRhythm,
  updateXsydRhythmConfig,
  useXsydRhythmStats
} from '../protocol/serviceLighting';
import { latestUpdates } from '../protocol/latestUpdates';
import { rgbFrameGuard } from '../protocol/rgbFrameGuard';
import { BRAND } from '../brand';
import { hero68DeviceManager } from '../protocol/hero68/webhid';
import { xsydDeviceManager } from '../protocol/xsyd/device';
import { hero68HallStream } from '../protocol/hero68/hallStream';
import { useI18n } from '../i18n';
import { DeviceModelContext } from '../app/DeviceModelContext';
import { AppSelect } from '../app/components/AppSelect';
import './RhythmSyncEditor.css';
const draftKey = `${BRAND.storagePrefix}:rhythm-draft:v1`;
const darkKeys = Object.fromEntries(heroLayout('hero84').keyIds.map(id => [id, '#161a1e']));
function readDraft() {
  try {
    return restoreRhythm(JSON.parse(localStorage.getItem(draftKey) ?? 'null'));
  } catch {
    return defaultRhythm();
  }
}
function Thumbnail({ shape }: { shape: string }) {
  return (
    <svg viewBox="0 0 104 48" aria-hidden="true" className={`rhythm-thumb rhythm-thumb-${shape}`}>
      {shape === 'rings' || shape === 'bloom' ? (
        <g fill="none" stroke="currentColor">
          <ellipse cx={shape === 'rings' ? 52 : 38} cy="24" rx="9" ry="5" />
          <ellipse cx={shape === 'rings' ? 52 : 38} cy="24" rx="21" ry="12" />
          <ellipse cx={shape === 'rings' ? 52 : 38} cy="24" rx="36" ry="21" />
        </g>
      ) : shape === 'field' ? (
        <rect x="10" y="8" width="84" height="32" rx="6" fill="currentColor" opacity=".6" />
      ) : shape === 'off' ? (
        <path d="M34 8L70 40M70 8L34 40" stroke="currentColor" strokeWidth="2" />
      ) : (
        Array.from(
          {
            length: 12
          },
          (_, i) => (
            <rect
              key={i}
              x={10 + i * 7}
              y={
                40 -
                (shape === 'spectrum'
                  ? 8 + Math.sin(i * 0.8) * 12 + 16
                  : 10 + Math.sin(i * 0.6) * 9 + 12)
              }
              width="4"
              height={
                shape === 'spectrum'
                  ? 8 + Math.sin(i * 0.8) * 12 + 16
                  : 10 + Math.sin(i * 0.6) * 9 + 12
              }
              rx="2"
              fill="currentColor"
              opacity={0.4 + i * 0.05}
            />
          )
        )
      )}
    </svg>
  );
}
function RhythmPreview({
  configuration,
  demo,
  live,
  xsydLive,
  paused,
  sessionId,
  advancedBindings,
  isWin68
}: {
  configuration: RhythmConfiguration;
  demo: boolean;
  live: boolean;
  xsydLive: boolean;
  paused: boolean;
  sessionId?: string;
  advancedBindings: AdvancedBinding[];
  isWin68: boolean;
}) {
  const { tr } = useI18n();
  const xsydStats = useXsydRhythmStats();
  const xsydStatsRef = useRef(xsydStats);
  xsydStatsRef.current = xsydStats;
  const [frame, setFrame] = useState<RgbServiceFrame>({
    enabled: false,
    connected: false,
    keys: darkKeys
  });
  const latest = useRef<RgbServiceFrame | null>(null);
  const currentConfig = useRef(configuration);
  currentConfig.current = configuration;
  const simulate = demo || (!live && !xsydLive);
  useEffect(() => {
    let handle = 0;
    let close: (() => void) | undefined;
    let disposed = false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const start = performance.now();
    const accept = rgbFrameGuard(sessionId);
    const render = (now: number) => {
      if (disposed) {
        return;
      }
      if (!document.hidden) {
        if (simulate) {
          const sample = rhythmDemo(
            currentConfig.current,
            reduced.matches ? 0 : now - start,
            isWin68 ? 'win68HeMax' : 'hero68'
          );
          setFrame({
            enabled: false,
            connected: false,
            keys: sample.keys,
            side: sample.side,
            audioLevel: sample.level
          });
        } else if (live) {
          if (latest.current) {
            setFrame(latest.current);
            latest.current = null;
          }
        } else if (xsydLive) {
          const xsydFrame = getXsydCustomRgbFrame() ?? darkKeys;
          const stats = xsydStatsRef.current;
          setFrame({
            enabled: true,
            connected: xsydDeviceManager.connected,
            keys: xsydFrame,
            side: stats.side,
            audioLevel: stats.audioLevel
          });
        }
      }
      handle = requestAnimationFrame(render);
    };
    if (!paused && !simulate && live) {
      close = rgbService.frames(value => {
        if (!disposed && accept(value)) {
          latest.current = {
            ...value,
            keys: value.enabled && value.connected && value.keys ? value.keys : darkKeys
          };
        }
      });
    }
    if (!simulate && !xsydLive) {
      setFrame({
        enabled: false,
        connected: false,
        keys: darkKeys
      });
    }
    if (!paused && (simulate || live || xsydLive)) {
      handle = requestAnimationFrame(render);
    }
    return () => {
      disposed = true;
      cancelAnimationFrame(handle);
      close?.();
      latest.current = null;
    };
  }, [simulate, live, xsydLive, paused, sessionId, isWin68]);
  return (
    <RgbPreviewPanel
      source={tr(demo ? 'Simulation' : xsydLive || live ? 'Live · USB output' : 'Draft preview')}
      hint={tr(
        xsydLive || live
          ? frame.connected || xsydDeviceManager.connected
            ? 'Keyboard connected'
            : 'Previewing · connect WIN 68 HE MAX to stream'
          : 'Side LEDs retain onboard lighting'
      )}
      footer={
        <div className="rhythm-meter">
          <AudioLines size={16} />
          <meter
            aria-label={tr('Audio level')}
            min={0}
            max={1}
            value={Math.min(1, frame.audioLevel ?? 0)}
          />
          <span>{Math.round((frame.audioLevel ?? 0) * 100)}%</span>
        </div>
      }
    >
      <Hero68Preview
        advancedBindings={advancedBindings}
        selectedKeys={new Set()}
        onToggleKey={() => {}}
        showAdvancedIcons={false}
        selectionEnabled={false}
        lightingSource="local"
        lightingFrame={frame.keys}
      />
      {!isWin68 && (
        <div
          className="rgb-side-preview"
          aria-label={demo ? tr('18 illustrative side LEDs') : tr('Side LED output')}
        >
          {(frame.side ?? Array(18).fill('#20262b')).map((color, i) => (
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
export default function RhythmSyncEditor({
  onSetup,
  visible = true,
  advancedBindings = [],
  onboardProfile
}: {
  onSetup: () => void;
  visible?: boolean;
  advancedBindings?: AdvancedBinding[];
  onboardProfile?: RgbProfile;
}) {
  const { tr } = useI18n();
  const contextModel = useContext(DeviceModelContext);
  const isWin68 = isWin68HeMaxModel(contextModel) || xsydDeviceManager.connected;
  const { status, checking, reconnecting } = useRgbServiceState();
  const xsydStats = useXsydRhythmStats();
  const xsydLive = xsydStats.active;
  const [config, setConfig] = useState<RhythmConfiguration>(readDraft);
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState<AudioEndpoint[]>([]);
  const [session, setSession] = useState<string | null>(null);
  const action = useRef(0);
  const current = useRef(config);
  const queue = useRef<ReturnType<typeof latestUpdates<RhythmConfiguration>> | null>(null);
  current.current = config;
  const compatible =
    !!status && (status.apiVersion ?? 0) >= 5 && status.supportedModes?.includes('rhythm');
  const locked = !isWin68 && !demo && (checking || !compatible);
  const serviceLive = Boolean(status?.mode === 'rhythm' && status.enabled);
  const live = serviceLive || xsydLive;
  const applied = xsydLive || (!!session && status?.sessionId === session && serviceLive);
  const sideSupported =
    isWin68 ||
    config.sideMode === 500 ||
    !!status?.supportedRhythmSideModes?.includes(config.sideMode);
  const keySupported = isWin68 || (status?.supportedRhythmModes?.includes(config.keyMode) ?? true);

  function applyRhythmConfiguration(next: RhythmConfiguration) {
    const validated = validateRhythm(next);
    current.current = validated;
    setError(null);
    setConfig(validated);
    if (xsydLive) {
      updateXsydRhythmConfig(validated);
    }
    if (serviceLive && session && !demo) {
      if (!(status?.supportedRhythmModes?.includes(validated.keyMode) ?? true)) {
        setError(tr('Update the background app to use this rhythm mode.'));
        return;
      }
      if (
        !isWin68 &&
        validated.sideMode !== 500 &&
        !status?.supportedRhythmSideModes?.includes(validated.sideMode)
      ) {
        setError(
          tr(
            'This firmware does not support live side rhythm. Keys keep playing with the last supported settings.'
          )
        );
        return;
      }
      queue.current?.stage(validated);
    }
  }

  const rhythmHistory = useUndoRedoState(config, applyRhythmConfiguration, session ?? 'local');

  // Rejoin the service's current configuration. Merely opening this editor never
  // writes the old local draft or restarts audio capture.
  useEffect(() => {
    if (busy || demo) {
      return;
    }
    if (
      compatible &&
      serviceLive &&
      status?.sessionId &&
      status.rhythmConfiguration &&
      session !== status.sessionId
    ) {
      action.current++;
      queue.current?.close();
      queue.current = null;
      const restored = restoreRhythm(status.rhythmConfiguration);
      setConfig(restored);
      setSession(status.sessionId);
      setError(null);
      if (xsydLive && !restored.endpoint.startsWith('web-')) {
        void stopXsydRhythm().catch(() => {});
      }
    } else if (session && (!serviceLive || status?.sessionId !== session)) {
      action.current++;
      queue.current?.close();
      queue.current = null;
      setSession(null);
    }
  }, [compatible, serviceLive, xsydLive, isWin68, status, session, busy, demo]);
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(config));
    } catch {}
  }, [config]);
  useEffect(() => {
    let cancelled = false;
    if (compatible) {
      void rgbService
        .audioDevices()
        .then(devices => {
          if (!cancelled) {
            setEndpoints(devices);
          }
        })
        .catch(e => {
          if (!cancelled) {
            setError(e.message);
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [compatible]);
  useEffect(() => {
    if (!applied || demo || !serviceLive || !session) {
      queue.current?.close();
      queue.current = null;
      return;
    }
    let disposed = false;
    const token = action.current;
    const updates = latestUpdates<RhythmConfiguration>(
      async configuration => {
        const active = getRgbServiceState().status;
        if (
          disposed ||
          !active?.enabled ||
          active.mode !== 'rhythm' ||
          active.sessionId !== session
        ) {
          return;
        }
        const sendable = configuration.endpoint.startsWith('web-')
          ? { ...configuration, endpoint: 'default' }
          : configuration;
        const result = await rgbService.rhythmUpdate(sendable, session!);
        if (
          !disposed &&
          token === action.current &&
          getRgbServiceState().status?.sessionId === session
        ) {
          publishRgbServiceStatus(result);
        }
      },
      e => {
        if (!disposed) {
          setError(e instanceof Error ? e.message : String(e));
        }
      },
      0
    );
    queue.current = updates;
    return () => {
      disposed = true;
      updates.close();
      if (queue.current === updates) {
        queue.current = null;
      }
    };
  }, [applied, serviceLive, session, demo]);
  useEffect(
    () => () => {
      action.current++;
      queue.current?.close();
    },
    []
  );
  function change(patch: Partial<RhythmConfiguration>) {
    applyRhythmConfiguration({
      ...current.current,
      ...patch
    });
  }
  async function apply() {
    if (busy) {
      return;
    }
    if (!compatible && !isWin68) {
      onSetup();
      return;
    }
    if (!keySupported) {
      setError(tr('Update the background app to use this rhythm mode.'));
      return;
    }
    if (!sideSupported) {
      setError(
        tr('Side rhythm is not yet verified on HERO68. Choose Leave onboard to play on the keys.')
      );
      return;
    }
    const token = ++action.current;
    setBusy(true);
    setError(null);
    queue.current?.close();
    setSession(null);
    try {
      // prettier-ignore
      const useBrowserWebAudio = isWin68 && (!compatible || current.current.endpoint.startsWith('web-'));
      if (useBrowserWebAudio) {
        await startXsydRhythm(current.current);
      } else if (xsydLive) {
        await stopXsydRhythm();
      }
      if (compatible && !useBrowserWebAudio) {
        const fresh = await refreshRgbService();
        if (fresh && (fresh.apiVersion ?? 0) >= 5) {
          if (hero68HallStream.getSnapshot().active || hero68HallStream.getSnapshot().starting) {
            await hero68HallStream.stop();
          }
          if (hero68DeviceManager.connected && !hero68DeviceManager.viaService) {
            await hero68DeviceManager.disconnect();
          }
          const serviceConfig: RhythmConfiguration = current.current.endpoint.startsWith('web-')
            ? { ...current.current, endpoint: 'default', sideMode: 500 }
            : isWin68
              ? { ...current.current, sideMode: 500 }
              : current.current;
          const result = await rgbService.rhythmStart(serviceConfig);
          if (token === action.current) {
            publishRgbServiceStatus(result);
            setSession(result.sessionId ?? null);
            if (result.connected && !isWin68 && !xsydDeviceManager.connected) {
              await hero68DeviceManager.connectViaService();
            }
          }
        }
      }
      if (token === action.current) {
        setDemo(false);
      }
    } catch (e) {
      if (token === action.current && !isWin68) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (token === action.current) {
        setBusy(false);
      }
    }
  }
  async function stop() {
    if (busy) {
      return;
    }
    const token = ++action.current;
    setBusy(true);
    setError(null);
    queue.current?.close();
    setSession(null);
    try {
      if (xsydLive) {
        await stopXsydRhythm(onboardProfile);
      }
      if (status?.enabled) {
        const result = await rgbService.stop();
        if (token === action.current) {
          publishRgbServiceStatus(result);
        }
      }
    } catch (e) {
      if (token === action.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (token === action.current) {
        setBusy(false);
      }
    }
  }
  const selected = RHYTHM_MODES.find(mode => mode.id === config.keyMode)!;
  const webAudioOptions = isWin68
    ? [
        {
          value: 'web-system',
          label: tr('Browser Tab / System Audio (Share audio)')
        },
        {
          value: 'web-mic',
          label: tr('Microphone / Line-In (Web Audio)')
        }
      ]
    : [];
  const suppressServiceWriteError = Boolean(
    isWin68 && status?.lastError && status.lastError.includes('RGB write failed')
  );
  return (
    <div className="custom-rgb-gate" hidden={!visible}>
      <RgbToolbarSlot visible={visible}>
        <span
          className="rgb-sync-note"
          data-attention={reconnecting || (!applied && live) || undefined}
          role="status"
        >
          {reconnecting
            ? tr('Reconnecting to background app…')
            : applied
              ? tr('Auto sync')
              : live
                ? tr('Joining running Rhythm…')
                : demo
                  ? tr('Simulation')
                  : null}
        </span>
        <UndoRedoButtons
          canUndo={rhythmHistory.canUndo}
          canRedo={rhythmHistory.canRedo}
          onUndo={rhythmHistory.undo}
          onRedo={rhythmHistory.redo}
          disabled={busy || locked}
          enableShortcuts={visible}
        />
        {!applied && (
          <button
            type="button"
            className="apply-button"
            onClick={() => void apply()}
            disabled={
              busy ||
              (!isWin68 && checking) ||
              locked ||
              (compatible && (!sideSupported || !keySupported))
            }
          >
            <Play size={15} />
            {busy ? tr('Working…') : tr('Start Rhythm')}
          </button>
        )}
        {(status?.enabled || xsydLive) && (
          <button
            type="button"
            className="secondary-button"
            title={tr('Return to onboard')}
            disabled={busy}
            onClick={() => void stop()}
          >
            <Square size={14} /> {tr('Back to onboard')}
          </button>
        )}
      </RgbToolbarSlot>
      <RgbToolbarSlot visible={visible} notice>
        {serviceLive && status?.configurationBusy && (
          <p className="rgb-inline-note" role="status">
            {tr('Saving keyboard configuration · lighting paused')}
          </p>
        )}
        {compatible && !demo && !keySupported && (
          <p className="rgb-inline-note" role="status">
            {tr('Update the background app to use this rhythm mode.')}{' '}
            <button type="button" className="secondary-button" onClick={onSetup}>
              {tr('Setup / Update')}
            </button>
          </p>
        )}
        {error && (
          <p className="stream-error" role="alert">
            {error}
          </p>
        )}
        {serviceLive && status?.lastError && !suppressServiceWriteError && (
          <p className="stream-error" role="alert">
            {status.lastError}
          </p>
        )}
        {serviceLive && status?.audioError && (
          <p className="stream-error" role="alert">
            {status.audioError}
          </p>
        )}
      </RgbToolbarSlot>
      <section
        className={`rhythm-editor custom-rgb-content${locked ? ' is-locked' : ''}`}
        inert={locked}
        aria-label="Rhythm Sync"
      >
        <RhythmPreview
          configuration={config}
          demo={demo}
          live={serviceLive}
          xsydLive={xsydLive}
          paused={locked || !visible}
          sessionId={status?.sessionId}
          advancedBindings={advancedBindings}
          isWin68={isWin68}
        />
        <div className="rhythm-layout">
          <div className="settings-card rhythm-modes">
            <h3>{tr('Key rhythm')}</h3>
            <div className="rhythm-mode-grid">
              {RHYTHM_MODES.map(mode => (
                <button
                  type="button"
                  key={mode.id}
                  className={config.keyMode === mode.id ? 'active' : ''}
                  aria-pressed={config.keyMode === mode.id}
                  onClick={() =>
                    change({
                      keyMode: mode.id
                    })
                  }
                  disabled={
                    busy ||
                    (!isWin68 &&
                      !demo &&
                      !(status?.supportedRhythmModes?.includes(mode.id) ?? true))
                  }
                  title={
                    !isWin68 && !demo && !(status?.supportedRhythmModes?.includes(mode.id) ?? true)
                      ? tr('Update the background app to use this rhythm mode.')
                      : undefined
                  }
                >
                  <Thumbnail shape={mode.shape} />
                  <strong>{tr(mode.name)}</strong>
                  <span>{tr(mode.description)}</span>
                </button>
              ))}
            </div>
            {!isWin68 && (
              <>
                <h3>{tr('Side rhythm')}</h3>
                <div className="rhythm-side-modes" role="group" aria-label={tr('Side rhythm')}>
                  {RHYTHM_SIDE_MODES.map(mode => (
                    <button
                      type="button"
                      key={mode.id}
                      className="secondary-button"
                      aria-pressed={config.sideMode === mode.id}
                      disabled={
                        busy ||
                        (!demo &&
                          mode.id !== 500 &&
                          !status?.supportedRhythmSideModes?.includes(mode.id))
                      }
                      title={
                        !demo &&
                        mode.id !== 500 &&
                        !status?.supportedRhythmSideModes?.includes(mode.id)
                          ? tr('Requires firmware with live side rhythm support')
                          : undefined
                      }
                      onClick={() =>
                        change({
                          sideMode: mode.id
                        })
                      }
                    >
                      {tr(mode.name)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <section className="settings-card rhythm-controls">
            <div className="rhythm-control-heading">
              <h3>
                <SlidersHorizontal size={17} /> {tr(selected.name)}
              </h3>
              <button
                type="button"
                className="rhythm-reset"
                aria-label={tr('Reset mode parameters')}
                title={tr('Reset mode parameters')}
                onClick={() =>
                  change({
                    ...defaultRhythm(),
                    keyMode: config.keyMode,
                    sideMode: config.sideMode,
                    endpoint: config.endpoint
                  })
                }
              >
                <RotateCcw size={16} />
              </button>
            </div>
            <label className="rhythm-select">
              {tr('Audio source')}
              <AppSelect
                label={tr('Audio source')}
                value={config.endpoint}
                disabled={busy}
                onChange={endpoint =>
                  change({
                    endpoint
                  })
                }
                options={[
                  {
                    value: 'default',
                    label: tr('Follow Windows default')
                  },
                  ...webAudioOptions,
                  ...(!endpoints.some(d => d.id === config.endpoint) &&
                  !webAudioOptions.some(d => d.value === config.endpoint) &&
                  config.endpoint !== 'default'
                    ? [
                        {
                          value: config.endpoint,
                          label: tr('Saved device · unavailable')
                        }
                      ]
                    : []),
                  ...endpoints.map(d => ({
                    value: d.id,
                    label: d.name + (d.default ? ' (default)' : '')
                  }))
                ]}
              />
              <small>
                {isWin68
                  ? tr(
                      'Streams 5 × 14-key 0x2A RGB packets (LEN=0x39, CK=0xF4) directly to WIN 68 HE MAX SRAM.'
                    )
                  : tr('Captures music playing through your speakers or headphones.')}
              </small>
            </label>
            <div className="rgb-parameters rhythm-sliders">
              <label>
                {tr('Brightness')} <strong>{config.brightness}%</strong>
                <input
                  aria-label={tr('Rhythm brightness')}
                  type="range"
                  min={0}
                  max={100}
                  value={config.brightness}
                  onChange={e =>
                    change({
                      brightness: +e.target.value
                    })
                  }
                />
              </label>
              <label>
                {config.keyMode === 428 ? tr('Spectrum sensitivity') : tr('Sensitivity')}{' '}
                <strong>
                  {config.keyMode === 428
                    ? config.spectrum.db
                    : `${config.sensitivity.toFixed(1)}×`}
                </strong>
                <input
                  aria-label={tr('Rhythm sensitivity')}
                  type="range"
                  min={config.keyMode === 428 ? 0 : 0.1}
                  max={config.keyMode === 428 ? 100 : 10}
                  step={config.keyMode === 428 ? 1 : 0.1}
                  value={config.keyMode === 428 ? config.spectrum.db : config.sensitivity}
                  onChange={e =>
                    config.keyMode === 428
                      ? change({
                          spectrum: {
                            ...config.spectrum,
                            db: +e.target.value
                          }
                        })
                      : change({
                          sensitivity: +e.target.value
                        })
                  }
                />
              </label>
              <label>
                {tr('Release / smoothing')} <strong>{config.releaseMs} ms</strong>
                <input
                  aria-label={tr('Rhythm release time')}
                  type="range"
                  min={0}
                  max={200}
                  step={5}
                  value={config.releaseMs}
                  onChange={e =>
                    change({
                      releaseMs: +e.target.value
                    })
                  }
                />
                <small>{tr('Fast attack. Release only softens the fade.')}</small>
              </label>
            </div>
            <label className="rhythm-select">
              {tr('Colors')}
              <AppSelect<RhythmConfiguration['palette']>
                label={tr('Colors')}
                value={config.palette}
                onChange={palette =>
                  change({
                    palette
                  })
                }
                options={[
                  {
                    value: 'fixed',
                    label: tr('Single color')
                  },
                  {
                    value: 'rainbow',
                    label: tr('Rainbow')
                  },
                  {
                    value: 'aurora',
                    label: tr('Aurora')
                  },
                  {
                    value: 'fire',
                    label: tr('Fire')
                  }
                ]}
              />
            </label>
            {config.palette === 'fixed' && (
              <div className="rhythm-color">
                <RgbColorPicker
                  label={tr('Rhythm color')}
                  value={config.color}
                  onChange={color =>
                    change({
                      color
                    })
                  }
                />
                <span>{config.color.toUpperCase()}</span>
              </div>
            )}
            <details className="rhythm-advanced">
              <summary>{tr('Details')}</summary>
              <p>
                {xsydLive
                  ? `${xsydStats.fps.toFixed(1)} FPS · XSYD 0x2A (5 × 14 slots)`
                  : serviceLive
                    ? `${(status?.fps ?? 0).toFixed(1)} FPS`
                    : tr('30–60 FPS target')}
              </p>
              {!isWin68 && !status?.sideOutput && (
                <p>
                  {tr(
                    'This keyboard firmware does not support live side rhythm. The side LEDs keep their onboard effect.'
                  )}
                </p>
              )}
              {config.keyMode === 428 && (
                <>
                  <label className="rhythm-select">
                    {tr('FFT window')}
                    <AppSelect<RhythmConfiguration['spectrum']['window']>
                      label={tr('FFT window')}
                      value={config.spectrum.window}
                      onChange={window =>
                        change({
                          spectrum: {
                            ...config.spectrum,
                            window
                          }
                        })
                      }
                      options={[
                        {
                          value: 'hann',
                          label: 'Hann'
                        },
                        {
                          value: 'hamming',
                          label: 'Hamming'
                        },
                        {
                          value: 'blackman',
                          label: 'Blackman'
                        }
                      ]}
                    />
                  </label>
                  <label className="rhythm-radius">
                    {tr('Spatial smoothing')}{' '}
                    <input
                      aria-label={tr('Spectrum spatial radius')}
                      type="range"
                      min={0}
                      max={16}
                      value={config.spectrum.spatialRadius}
                      onChange={e =>
                        change({
                          spectrum: {
                            ...config.spectrum,
                            spatialRadius: +e.target.value
                          }
                        })
                      }
                    />
                    {config.spectrum.spatialRadius}
                  </label>
                </>
              )}
              <dl>
                <dt>{tr('Audio')}</dt>
                <dd>
                  {xsydLive
                    ? `${xsydStats.audioSource === 'system' ? 'Web Audio (System/Tab)' : 'Web Audio (Mic)'} · ${(xsydStats.sampleRate / 1000).toFixed(0)} kHz`
                    : `${status?.audioState ?? tr('Stopped')}${status?.sampleRate ? ` · ${status.sampleRate / 1000} kHz` : ''}`}
                </dd>
                <dt>{tr('Frame time')}</dt>
                <dd>{xsydLive ? '33.00' : (status?.frameMs ?? 0).toFixed(2)} ms</dd>
                <dt>{tr('Frame gap p95')}</dt>
                <dd>{status?.frameGapP95Ms?.toFixed(2) ?? '—'} ms</dd>
                <dt>{tr('Sample → USB p95')}</dt>
                <dd>{status?.audioToWriteP95Ms?.toFixed(2) ?? '—'} ms</dd>
                <dt>{tr('Dropped frames')}</dt>
                <dd>{status?.droppedFrames ?? 0}</dd>
              </dl>
              <p>
                {tr(
                  'USB completion is not LED readback. Physical light latency needs a hardware measurement.'
                )}
              </p>
              {status?.captureToWriteP95Ms != null && (
                <p>
                  {tr('Capture → USB p95')}: {status.captureToWriteP95Ms.toFixed(2)} ms.
                </p>
              )}
              {serviceLive && (
                <p>
                  {tr('Render')}: {(status?.renderMs ?? 0).toFixed(2)} ms · {tr('Encode')}:{' '}
                  {(status?.encodeMs ?? 0).toFixed(2)} ms · {tr('USB write')}:{' '}
                  {(status?.writeMs ?? 0).toFixed(2)} ms.
                </p>
              )}
              {!!status?.audioTimestampInvalid && (
                <p>
                  {tr('Audio endpoint timestamps ahead of the capture clock were excluded')} (
                  {status.audioTimestampInvalid}).{' '}
                  {tr('Sample latency is not verified for those packets.')}
                </p>
              )}
            </details>
          </section>
        </div>
      </section>
      {locked && (
        <div className="custom-rgb-lock-overlay">
          <div className="custom-rgb-lock-card" role="status">
            <span className="custom-lock-icon">
              <Layers size={26} />
            </span>
            <h2>
              {checking
                ? tr('Checking background service…')
                : status
                  ? tr('Background app update required')
                  : tr('Background service required')}
            </h2>
            <p>
              {status
                ? tr(
                    'Update the Windows app to 0.3.0 or later to use Rhythm Sync, or try a preview.'
                  )
                : tr('Run the background app to use Rhythm Sync, or try a preview.')}
            </p>
            <div className="custom-rgb-actions">
              <button type="button" className="apply-button" onClick={onSetup}>
                <Download size={16} />
                {status ? tr('Update app') : tr('Download app')}
              </button>
              <button type="button" className="secondary-button" onClick={() => setDemo(true)}>
                {tr('Try demo')}
              </button>
              <button
                type="button"
                className="custom-text-button"
                onClick={() => void refreshRgbService()}
              >
                {tr('Check again')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
