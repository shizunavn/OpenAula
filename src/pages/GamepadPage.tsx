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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const restoreFromService = useRef(!hasDraft(slot));
  const emptyDragImage = useRef<HTMLSpanElement>(null);
  const keyboard = useRef<HTMLDivElement>(null);
  const autoApply = useRef<GamepadAutoApply<GamepadStatus> | null>(null);

  const access = gamepadAccess(status, loading, serviceConnected);
  const locked = access !== 'ready';
  // Keep controls inert while checking, without flashing the missing-service
  // overlay on every mount. A retry keeps an already confirmed gate visible.
  const showGate = locked && (access !== 'checking' || connectionAttempt > 0);
  const disabled = busy || profileBusy || locked;

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
      statusEnabled: status?.enabled,
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
    autoApply.current?.setAvailable(!locked && !profileBusy && !curveDragging);
    autoApply.current?.update(config, status?.slot === slot ? status.configuration : undefined);
  }, [config, locked, profileBusy, slot, curveDragging]);

  // Hand off WebHID when a background toggle keybind is configured so the service can start Gamepad anytime.
  useEffect(() => {
    if (!locked && config.toggleKeybind?.length) {
      void useSharedHallService().catch(() => {});
    }
  }, [locked, config.toggleKeybind]);

  const liveStore = useMemo(() => new GamepadLiveStore(), []);
  useEffect(() => {
    document.addEventListener('visibilitychange', liveStore.visibility);
    return () => {
      document.removeEventListener('visibilitychange', liveStore.visibility);
      liveStore.dispose();
    };
  }, [liveStore]);

  const samples = useMemo(
    () =>
      demo && tab === 'tester'
        ? demoSamples
        : Object.fromEntries(
            (status?.samples ?? [])
              .filter((sample) => (sample.ageMs ?? 0) < 50)
              .map((sample) => [
                sample.keyId,
                { distanceMm: sample.distanceUnits / 100, pressed: sample.pressed },
              ])
          ),
    [demo, demoSamples, status, tab]
  );

  const report =
    demo && tab === 'tester'
      ? mapGamepad(config, samples)
      : status?.report ?? mapGamepad(config, {});

  useEffect(() => {
    liveStore.configure(
      tab === 'tester' && !locked,
      status,
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
        : null
    );
  }, [liveStore, tab, locked, status, demo, demoSamples, config]);

  const labels = Object.fromEntries(config.bindings.map((b) => [b.keyId, actionLabel(b.action)]));
  const binding = config.bindings.find((b) => b.keyId === selected);
  const measuredKeys = (status?.hall.keys ?? []).filter((k) =>
    config.bindings.some((b) => b.keyId === k.keyId && isAnalogAction(b.action))
  );
  const measuredHz = measuredKeys.length
    ? Math.min(...measuredKeys.map((k) => k.hz)).toFixed(1)
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
            overlayMode={tab === 'tester' ? 'stream' : 'none'}
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
          <span className={status?.enabled ? 'on' : ''}>
            {t(
              loading
                ? 'Loading service'
                : demo && tab === 'tester'
                  ? 'Demo'
                  : status?.enabled
                    ? status.armed
                      ? 'Running'
                      : 'Waiting for all bound keys to rest'
                    : status
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
            status={status}
            disabled={disabled}
            loading={loading}
            selected={selected}
            binding={binding}
            dragged={dragged}
            recordingKeybind={recordingKeybind}
            pendingKeybind={pendingKeybind}
            emptyDragImageRef={emptyDragImage}
            t={t}
            onToggleEnabled={() => void runServiceAction(!status?.enabled)}
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
            status={status}
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
            status={status}
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
