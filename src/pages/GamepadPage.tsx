import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Gamepad2, Info, RotateCcw, Upload } from 'lucide-react';
import GamepadControlIcon from '../components/GamepadControlIcon';
import GamepadDragPreview from '../components/GamepadDragPreview';
import GamepadKeyboardPreview from '../components/GamepadKeyboardPreview';
import { useI18n } from '../i18n';
import {
  defaultGamepad,
  formatToggleKeybind,
  GAMEPAD_ACTIONS,
  isAnalogAction,
  mapGamepad,
  restoreGamepad,
  type GamepadAction,
  type GamepadConfiguration,
} from '../keyboard/gamepad';
import { heroLayout } from '../keyboard/layout';
import { WINDOWS_SCANS } from '../keyboard/windowsScans';
import { gamepadAccess } from '../protocol/gamepadAccess';
import { GamepadAutoApply, type GamepadSaveState } from '../protocol/gamepadAutoApply';
import { GamepadLiveStore } from '../protocol/gamepadLive';
import { hero68HallStream, useHero68HallStream } from '../protocol/hero68/hallStream';
import { HERO84_KEY_POSITIONS } from '../protocol/hero68/keyPositions';
import { useXsydDevice } from '../protocol/xsyd/device';
import {
  gamepadService,
  isToggleModifierConfigured,
  outOfDateToggleModifier,
  useSharedHallService,
  type GamepadStatus,
} from '../protocol/gamepadService';
import { GamepadAccessGateOverlay } from './gamepad/GamepadAccessGateOverlay';
import { GamepadConfigTab } from './gamepad/GamepadConfigTab';
import { GamepadSetupTab } from './gamepad/GamepadSetupTab';
import { GamepadTesterTab } from './gamepad/GamepadTesterTab';
import {
  actionLabel,
  exportGamepadConfigJson,
  hasDraft,
  importGamepadConfigFile,
  loadGamepadDraft,
  NEUTRAL_GAMEPAD_LIGHTING,
  physicalLabel,
  saveGamepadDraft,
} from './gamepad/gamepadDraftStorage';
import { useGamepadDragAndCurve } from './gamepad/useGamepadDragAndCurve';
import { useGamepadHotkeyRecorder } from './gamepad/useGamepadHotkeyRecorder';
import './GamepadPage.css';

export { loadGamepadDraft };

export default function GamepadPage({
  slot,
  busy: profileBusy = false,
  onSetup,
}: {
  slot: number;
  busy?: boolean;
  onSetup: () => void;
}) {
  const { tr: t } = useI18n();
  const [config, setConfig] = useState(() => loadGamepadDraft(slot));
  const [tab, setTab] = useState<'setup' | 'configuration' | 'tester'>('setup');
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<GamepadStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [serviceConnected, setServiceConnected] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [saveState, setSaveState] = useState<GamepadSaveState>('saved');
  const [demo, setDemo] = useState(false);
  const [demoSamples, setDemoSamples] = useState<
    Record<string, { distanceMm: number; pressed: boolean }>
  >({});
  const xsydDevice = useXsydDevice();
  const hallStream = useHero68HallStream();
  const [xsydEnabled, setXsydEnabled] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const restoreFromService = useRef(!hasDraft(slot));
  const emptyDragImage = useRef<HTMLSpanElement>(null);
  const keyboard = useRef<HTMLDivElement>(null);
  const autoApply = useRef<GamepadAutoApply<GamepadStatus> | null>(null);

  const xsydWebHidMode = xsydDevice.state === 'connected';
  const access = gamepadAccess(status, loading, serviceConnected);
  const locked = !xsydWebHidMode && access !== 'ready';
  // Keep controls inert while checking, without flashing the missing-service
  // overlay on every mount. A retry keeps an already confirmed gate visible.
  const showGate = locked && (access !== 'checking' || connectionAttempt > 0);
  const disabled = busy || profileBusy || locked;

  useEffect(() => {
    if (xsydWebHidMode) {
      setError('');
      setSaveState('saved');
    }
  }, [xsydWebHidMode]);

  function patch(next: Partial<GamepadConfiguration>) {
    restoreFromService.current = false;
    setConfig((current) => {
      const updated = { ...current, ...next };
      if (updated.toggleKeybind && !updated.toggleKeybind.length) {
        delete updated.toggleKeybind;
      }
      return updated;
    });
  }

  function removeBinding(keyId: string) {
    restoreFromService.current = false;
    setConfig((current) => ({
      ...current,
      bindings: current.bindings.filter((b) => b.keyId !== keyId),
    }));
  }

  const {
    dragged,
    setDragged,
    removeTarget,
    setRemoveTarget,
    dropTarget,
    setDropTarget,
    assigned,
    setAssigned,
    curveDragging,
    point,
    setPoint,
    curveSvg,
    clearDrag,
    startCurveDrag,
    moveCurveDrag,
    finishCurve,
    changeCurve,
  } = useGamepadDragAndCurve({
    config,
    disabled,
    locked,
    profileBusy,
    tab,
    keyboardRef: keyboard,
    onPatch: patch,
    onRemoveBinding: removeBinding,
    onCurveDragStateChange: (dragging) => {
      if (dragging) {
        autoApply.current?.setAvailable(false);
      }
    },
  });

  function assign(keyId: string, actionName: GamepadAction) {
    restoreFromService.current = false;
    setConfig((current) => ({
      ...current,
      bindings: [
        ...current.bindings.filter((b) => b.keyId !== keyId),
        { keyId, action: actionName, startMm: 0.1, endMm: 3.4 },
      ],
    }));
    setSelected(keyId);
    setAssigned({ keyId, sequence: Date.now() });
  }

  async function runServiceAction(start: boolean, source: 'hotkey' | 'ui' = 'ui') {
    if (locked || busy || profileBusy) {
      return;
    }
    if (xsydWebHidMode) {
      setBusy(true);
      setError('');
      try {
        if (start) {
          setDemo(false);
          setXsydEnabled(true);
          if (!hallStream.active && !hallStream.starting) {
            await hero68HallStream.start(
              config.bindings.map((b) => b.keyId),
              'direct-poll',
            );
          }
        } else {
          setXsydEnabled(false);
          if (tab !== 'tester' && (hallStream.active || hallStream.starting)) {
            await hero68HallStream.stop();
          }
        }
      } catch (err) {
        if (mounted.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (mounted.current) {
          setBusy(false);
        }
      }
      return;
    }
    setBusy(true);
    if (start) {
      setDemo(false);
    }
    setError('');
    try {
      if (!status?.capabilities?.gamepad) {
        throw Error(t('Update the Windows service to 0.4.0 or later.'));
      }
      await autoApply.current?.run(() =>
        source === 'hotkey'
          ? gamepadService.toggle(slot, config, { source: 'hotkey', expectedEnabled: start })
          : start
            ? gamepadService.start(slot, config)
            : gamepadService.stop()
      );
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  const { recordingKeybind, setRecordingKeybind, pendingKeybind, setPendingKeybind } =
    useGamepadHotkeyRecorder({
      config,
      disabled,
      locked,
      profileBusy,
      statusEnabled: xsydWebHidMode ? xsydEnabled : status?.enabled,
      busy,
      onPatch: patch,
      onToggleHotkey: (nextEnabled) => void runServiceAction(nextEnabled, 'hotkey'),
    });

  useEffect(() => {
    if (!curveDragging) {
      saveGamepadDraft(slot, config);
    }
  }, [slot, config, curveDragging]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    let streamRevision = 0;
    const close = gamepadService.stream(
      (nextStatus) => {
        if (active) {
          streamRevision++;
          if (restoreFromService.current && nextStatus.slot === slot) {
            restoreFromService.current = false;
            setConfig(restoreGamepad(nextStatus.configuration));
          }
          setStatus(nextStatus);
          setServiceConnected(true);
          setLoading(false);
          setError((prev) => (prev === t('Service unavailable') ? '' : prev));
        }
      },
      () => {
        if (active) {
          streamRevision++;
          setLoading(false);
          setStatus(null);
          setServiceConnected(false);
        }
      }
    );
    gamepadService
      .status()
      .then((nextStatus) => {
        if (!active || streamRevision !== 0) {
          return;
        }
        if (restoreFromService.current && nextStatus.slot === slot) {
          restoreFromService.current = false;
          setConfig(restoreGamepad(nextStatus.configuration));
        }
        // A service that reports no Gamepad capability predates the shortcut,
        // yet the saved profile may still carry one; say why it does nothing.
        if (!nextStatus.capabilities?.gamepad && isToggleModifierConfigured(nextStatus.configuration)) {
          setError(t(outOfDateToggleModifier()));
        }
        setStatus(nextStatus);
        setServiceConnected(true);
      })
      .catch(() => {
        if (active && streamRevision === 0) {
          setStatus(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
      mounted.current = false;
      close?.();
    };
  }, [connectionAttempt]);

  useEffect(() => {
    let active = true;
    const queue = new GamepadAutoApply(
      (draft) => gamepadService.configure(slot, draft),
      (value) => {
        if (active) {
          setStatus(value);
        }
      },
      (phase, failure) => {
        if (!active) {
          return;
        }
        setSaveState(phase);
        if (phase === 'error') {
          setError(failure instanceof Error ? failure.message : String(failure));
        } else if (phase === 'saving') {
          setError('');
        }
      }
    );
    autoApply.current = queue;
    return () => {
      active = false;
      queue.dispose();
    };
  }, [slot]);

  useEffect(() => {
    autoApply.current?.setAvailable(!locked && !profileBusy && !curveDragging && !xsydWebHidMode);
    if (!xsydWebHidMode) {
      autoApply.current?.update(config, status?.slot === slot ? status.configuration : undefined);
    }
  }, [config, locked, profileBusy, slot, curveDragging, xsydWebHidMode, status]);

  // Hand off WebHID when a background toggle keybind is configured so the service can start Gamepad anytime.
  useEffect(() => {
    if (!locked && !xsydWebHidMode && config.toggleKeybind?.length) {
      void useSharedHallService().catch(() => {});
    }
  }, [locked, xsydWebHidMode, config.toggleKeybind]);

  const liveStore = useMemo(() => new GamepadLiveStore(), []);
  useEffect(() => {
    document.addEventListener('visibilitychange', liveStore.visibility);
    return () => {
      document.removeEventListener('visibilitychange', liveStore.visibility);
      liveStore.dispose();
    };
  }, [liveStore]);

  useEffect(() => {
    if (!xsydWebHidMode || demo) {
      return;
    }
    if ((xsydEnabled || tab === 'tester') && !hallStream.active && !hallStream.starting) {
      void hero68HallStream
        .start(
          config.bindings.map((b) => b.keyId),
          'direct-poll',
        )
        .catch((err) => {
          if (mounted.current) {
            setError(err instanceof Error ? err.message : String(err));
          }
        });
    }
  }, [xsydWebHidMode, xsydEnabled, tab, demo, hallStream.active, hallStream.starting, config.bindings]);

  const samples = useMemo(
    () =>
      demo && tab === 'tester'
        ? demoSamples
        : xsydWebHidMode
          ? Object.fromEntries(
              Object.entries(hallStream.samples).map(([keyId, sample]) => [
                keyId,
                { distanceMm: sample.visualDistanceMm, pressed: sample.pressed },
              ])
            )
          : Object.fromEntries(
              (status?.samples ?? [])
                .filter((sample) => (sample.ageMs ?? 0) < 50)
                .map((sample) => [
                  sample.keyId,
                  { distanceMm: sample.distanceUnits / 100, pressed: sample.pressed },
                ])
            ),
    [demo, demoSamples, xsydWebHidMode, hallStream.samples, status, tab]
  );

  const report =
    (demo && tab === 'tester') || xsydWebHidMode
      ? mapGamepad(config, samples)
      : status?.report ?? mapGamepad(config, {});

  const effectiveStatus = useMemo<GamepadStatus | null>(() => {
    if (!xsydWebHidMode) {
      return status;
    }
    const active = xsydEnabled || (tab === 'tester' && hallStream.active);
    return {
      enabled: active,
      armed: active,
      stale: false,
      xinputVerified: Boolean(status?.enabled && status?.xinputVerified),
      userIndex: status?.userIndex ?? 0,
      outputHz: hallStream.telemetryHz ?? status?.outputHz ?? 0,
      outputP99Ms: status?.outputP99Ms ?? 0,
      neutralCount: 0,
      error: hallStream.error ?? '',
      report,
      backend: 'vigem',
      slot,
      configuration: config,
      capabilities: {
        gamepad: true,
        keyboardSuppression: false,
      },
      hall: {
        consumers: active
          ? [
              {
                id: 'web:xsyd-hall',
                keys: config.bindings.map((b) => b.keyId),
                hz: config.rate,
              },
            ]
          : [],
        requests: hallStream.frameCount,
        timeouts: 0,
        keys: Object.entries(hallStream.keyTelemetryHz).map(([keyId, hz], idx) => ({
          pos: HERO84_KEY_POSITIONS[keyId] ?? idx + 1,
          keyId,
          requestedHz: config.rate,
          hz,
          intervalP99Ms: 0,
        })),
      },
      samples: Object.values(hallStream.samples).map((sample, idx) => ({
        keyId: sample.keyId,
        pos: sample.pos,
        distanceUnits: sample.distanceUnits,
        adc: sample.rawAdc,
        pressed: sample.pressed,
        timestampMs: sample.timestampMs,
        sequence: idx + 1,
        ageMs: 0,
      })),
    };
  }, [xsydWebHidMode, status, xsydEnabled, tab, hallStream, report, slot, config]);

  useEffect(() => {
    liveStore.configure(
      (tab === 'tester' || (xsydWebHidMode && xsydEnabled)) && !locked,
      effectiveStatus,
      demo
        ? {
            report,
            samples: Object.entries(demoSamples).map(([keyId, sample]) => ({
              keyId,
              pos: 0,
              adc: 0,
              distanceUnits: sample.distanceMm * 100,
              pressed: sample.pressed,
              timestampMs: 0,
              sequence: 1,
              ageMs: 0,
            })),
            source: 'demo',
          }
        : xsydWebHidMode
          ? {
              report,
              samples: effectiveStatus?.samples ?? [],
              source: 'browser',
            }
          : null
    );
  }, [liveStore, tab, locked, effectiveStatus, xsydWebHidMode, xsydEnabled, report, demo, demoSamples, config]);

  const labels = Object.fromEntries(config.bindings.map((b) => [b.keyId, actionLabel(b.action)]));
  const binding = config.bindings.find((b) => b.keyId === selected);
  const measuredKeys = (effectiveStatus?.hall.keys ?? []).filter((k) =>
    config.bindings.some((b) => b.keyId === k.keyId && isAnalogAction(b.action))
  );
  const measuredHz = measuredKeys.length
    ? Math.min(...measuredKeys.map((k) => k.hz)).toFixed(1)
    : effectiveStatus?.outputHz
      ? effectiveStatus.outputHz.toFixed(1)
      : '—';

  const refreshConnection = () => {
    setLoading(true);
    setStatus(null);
    setServiceConnected(false);
    setError('');
    setConnectionAttempt((n) => n + 1);
  };

  return (
    <div className="gp-gate page-enter">
      <span ref={emptyDragImage} className="gp-empty-drag-image" aria-hidden="true" />
      {dragged && (
        <GamepadDragPreview
          {...dragged}
          removing={removeTarget}
          label={t(removeTarget ? 'Drop to remove binding' : 'Drop onto a key')}
        />
      )}
      <div className={`gamepad-page ${showGate ? 'gp-locked' : ''}`} inert={locked} aria-busy={loading}>
        <div className="gp-heading">
          <h2>
            <Gamepad2 size={23} /> Gamepad <small>P{slot + 1}</small>
          </h2>
          <div className="gp-tabs" role="tablist" aria-label="Gamepad">
            {(['setup', 'configuration', 'tester'] as const).map((id, index) => (
              <button
                role="tab"
                aria-selected={tab === id}
                aria-controls={'gp-' + id}
                id={'gp-tab-' + id}
                key={id}
                className={tab === id ? 'active' : ''}
                onClick={() => setTab(id)}
              >
                {t(['Setup & Remap', 'Configuration', 'Gamepad Tester'][index])}
              </button>
            ))}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          hidden
          onChange={async (event) => {
            const uploaded = event.target.files?.[0];
            if (!uploaded) {
              return;
            }
            try {
              patch(await importGamepadConfigFile(uploaded));
              setError('');
            } catch (err) {
              setError(String(err));
            }
            event.target.value = '';
          }}
        />
        <div className="gp-keyboard" ref={keyboard}>
          <GamepadKeyboardPreview
            lightingSource="local"
            lightingFrame={NEUTRAL_GAMEPAD_LIGHTING}
            selectedKeys={new Set(selected ? [selected] : [])}
            liveStore={liveStore}
            keyLabels={labels}
            keyDecorations={{
              ...Object.fromEntries(
                config.bindings.map((b) => [
                  b.keyId,
                  <span
                    key={`${b.keyId}:${assigned?.keyId === b.keyId ? assigned.sequence : 0}`}
                    className={assigned?.keyId === b.keyId ? 'gp-assigned-pop' : ''}
                  >
                    <GamepadControlIcon action={b.action} />
                  </span>,
                ])
              ),
              ...(dropTarget && dragged
                ? {
                    [dropTarget]: (
                      <span className="gp-drop-preview">
                        <GamepadControlIcon action={dragged.action} />
                      </span>
                    ),
                  }
                : {}),
            }}
            keyClassNames={Object.fromEntries(
              heroLayout('hero84')
                .rows.flat()
                .map((key) => [
                  key.id,
                  [
                    key.id === dropTarget && dragged ? 'gp-drop-target' : '',
                    key.id === dragged?.sourceKeyId ? 'gp-drag-source' : '',
                  ]
                    .filter(Boolean)
                    .join(' '),
                ])
            )}
            draggableKeys={new Set(!disabled && tab === 'setup' ? config.bindings.map((b) => b.keyId) : [])}
            onDragStartKey={(id, event) => {
              const source = config.bindings.find((b) => b.keyId === id);
              if (disabled || tab !== 'setup' || !source) {
                event.preventDefault();
                return;
              }
              event.dataTransfer.setData('application/x-openhero-gamepad', source.action);
              event.dataTransfer.effectAllowed = 'move';
              if (emptyDragImage.current) {
                event.dataTransfer.setDragImage(emptyDragImage.current, 0, 0);
              }
              setRemoveTarget(false);
              setDragged({
                action: source.action,
                sourceKeyId: id,
                x: event.clientX,
                y: event.clientY,
              });
            }}
            onDragEndKey={clearDrag}
            keyTooltips={Object.fromEntries(
              config.bindings.map((b) => [
                b.keyId,
                {
                  title: `${physicalLabel(b.keyId)} → ${actionLabel(b.action)}`,
                  detail: isAnalogAction(b.action)
                    ? `${b.startMm.toFixed(2)}–${b.endMm.toFixed(2)} mm`
                    : t('Digital button · Actuation Point + Rapid Trigger'),
                },
              ])
            )}
            onToggleKey={(id) => {
              if (recordingKeybind && !disabled && WINDOWS_SCANS[id] !== undefined) {
                patch({ toggleKeybind: [id] });
                setRecordingKeybind(false);
                setPendingKeybind([]);
                return;
              }
              setSelected(id);
              if (tab === 'tester' && demo) {
                setDemoSamples((prev) => ({
                  ...prev,
                  [id]: {
                    distanceMm: prev[id]?.pressed ? 0 : 3.4,
                    pressed: !prev[id]?.pressed,
                  },
                }));
              }
            }}
            onDropKey={(id, event) => {
              event.preventDefault();
              event.stopPropagation();
              clearDrag();
              if (disabled) {
                return;
              }
              if (dragged?.sourceKeyId) {
                const sourceKeyId = dragged.sourceKeyId;
                if (sourceKeyId === id) {
                  return;
                }
                restoreFromService.current = false;
                setConfig((current) => {
                  const source = current.bindings.find((b) => b.keyId === sourceKeyId);
                  return source
                    ? {
                        ...current,
                        bindings: [
                          ...current.bindings.filter((b) => b.keyId !== sourceKeyId && b.keyId !== id),
                          { ...source, keyId: id },
                        ],
                      }
                    : current;
                });
                setSelected(id);
                setAssigned({ keyId: id, sequence: Date.now() });
                return;
              }
              const droppedAction = event.dataTransfer.getData('application/x-openhero-gamepad') as GamepadAction;
              if (GAMEPAD_ACTIONS.includes(droppedAction)) {
                assign(id, droppedAction);
              }
            }}
            onDragOverKey={(id, event) => {
              if (dragged && !disabled) {
                event.dataTransfer.dropEffect = dragged.sourceKeyId ? 'move' : 'copy';
                setDropTarget(id);
              }
            }}
            onDragLeaveKey={(id) => setDropTarget((current) => (current === id ? null : current))}
            onRemoveKey={(id) => {
              if (!disabled) {
                removeBinding(id);
              }
            }}
            overlayMode={tab === 'tester' || (xsydWebHidMode && xsydEnabled) ? 'stream' : 'none'}
            streamPreviewValues={Object.fromEntries(
              Object.entries(samples).map(([id, sample]) => [
                id,
                { distanceMm: sample.distanceMm, rawAdc: 0, pressed: sample.pressed },
              ])
            )}
          />
        </div>
        {error && (
          <p className="gp-error" role="alert">
            {t(error)}
          </p>
        )}
        <div className="gp-status">
          <span className={effectiveStatus?.enabled ? 'on' : ''}>
            {t(
              loading
                ? 'Loading service'
                : demo && tab === 'tester'
                  ? 'Demo'
                  : effectiveStatus?.enabled
                    ? effectiveStatus.armed
                      ? 'Running'
                      : 'Waiting for all bound keys to rest'
                    : effectiveStatus
                      ? 'Stopped'
                      : 'Service unavailable'
            )}
          </span>
          <span>
            {config.rate} Hz {t('Requested')}
          </span>
          <span>
            {measuredHz} Hz {t('Measured')}
          </span>
          {config.toggleKeybind?.length ? (
            <span>
              {t('Shortcut')}: {formatToggleKeybind(config.toggleKeybind, physicalLabel)}
            </span>
          ) : null}
          <span role="status">
            {t(
              saveState === 'saving'
                ? 'Applying changes…'
                : saveState === 'pending'
                  ? 'Waiting to sync'
                  : saveState === 'error'
                    ? 'Could not sync changes'
                    : 'Applied'
            )}
          </span>
        </div>
        {tab === 'setup' && (
          <GamepadSetupTab
            config={config}
            status={effectiveStatus}
            disabled={disabled}
            loading={loading}
            selected={selected}
            binding={binding}
            dragged={dragged}
            recordingKeybind={recordingKeybind}
            pendingKeybind={pendingKeybind}
            emptyDragImageRef={emptyDragImage}
            t={t}
            onToggleEnabled={() => void runServiceAction(!effectiveStatus?.enabled)}
            onPatch={patch}
            onStartRecordingKeybind={() => {
              setPendingKeybind([]);
              setRecordingKeybind((r) => !r);
            }}
            onClearKeybind={() => {
              setRecordingKeybind(false);
              setPendingKeybind([]);
              patch({ toggleKeybind: [] });
            }}
            onStartDragPaletteAction={(actionName, x, y) =>
              setDragged({ action: actionName, x, y })
            }
            onEndDrag={clearDrag}
            onAssignKey={assign}
          />
        )}
        {tab === 'configuration' && (
          <GamepadConfigTab
            config={config}
            status={effectiveStatus}
            disabled={disabled}
            point={point}
            curveSvgRef={curveSvg}
            t={t}
            onSetPoint={setPoint}
            onPatch={patch}
            onStartCurveDrag={startCurveDrag}
            onMoveCurveDrag={moveCurveDrag}
            onFinishCurve={finishCurve}
            onChangeCurve={changeCurve}
          />
        )}
        {tab === 'tester' && (
          <GamepadTesterTab
            config={config}
            status={effectiveStatus}
            demo={demo}
            demoSamples={demoSamples}
            liveStore={liveStore}
            t={t}
            onSetDemo={setDemo}
            onSetDemoSamples={setDemoSamples}
          />
        )}
        <div className="gp-footer">
          <span className="gp-auto-save">
            <Info size={15} />
            {t('Changes apply automatically')}
          </span>
          <div className="gp-tools">
            <button disabled={disabled} onClick={() => fileInputRef.current?.click()}>
              <Upload size={15} />
              {t('Import')}
            </button>
            <button disabled={disabled} onClick={() => exportGamepadConfigJson(slot, config)}>
              <Download size={15} />
              {t('Export')}
            </button>
            <button disabled={disabled} onClick={() => patch(defaultGamepad())}>
              <RotateCcw size={15} />
              {t('Reset')}
            </button>
          </div>
        </div>
      </div>
      {showGate && (
        <GamepadAccessGateOverlay
          access={access}
          loading={loading}
          t={t}
          onSetup={onSetup}
          onRefreshConnection={refreshConnection}
        />
      )}
    </div>
  );
}
