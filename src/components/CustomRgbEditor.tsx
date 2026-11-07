import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Layers, Plus, Play, Square, RotateCcw, Sparkles, Trash2, Waves, Save } from 'lucide-react';
import Hero68Preview from './Hero68Preview';
import RgbColorPicker from './RgbColorPicker';
import RgbKeyPaintTools, { RgbKeySelectionTools } from './RgbKeyPaintTools';
import { RgbPreviewPanel, RgbToolbarSlot } from './RgbWorkspace';
import { CUSTOM_RGB_EFFECTS, CustomRgbEngine, MAX_RGB_LAYERS, RGB_EFFECT_METADATA, RGB_GRADIENT_PALETTES, createRgbLayer, restoreCustomRgb, type CustomRgbConfiguration, type CustomRgbEffect, type CustomRgbLayer, type RgbGradientPalette } from '../keyboard/customRgb';
import { HERO68_KEY_IDS } from '../keyboard/hero68Layout';
import { isWin68HeMaxModel } from '../keyboard/devices';
import { heroLayout } from '../keyboard/layout';
import { DeviceModelContext } from '../app/DeviceModelContext';
import { isWin68PerKeyMode, mergedKeyRgbModesForModel } from '../keyboard/rgbCatalog';
import { acceptsRgbPreviewKey } from '../keyboard/rgbPreviewInput';
import { rgbPreviewDarkReason } from '../keyboard/rgbPreviewDefaults';
import { publishLightingFrame, type LightingFrame } from '../keyboard/lightingPreviewBus';
import type { RgbColor, RgbProfile } from '../protocol/hero68/rgb';
import type { AdvancedBinding } from '../protocol/hero68/advanced';
import { rgbService } from '../protocol/rgbService';
import { refreshRgbService } from '../protocol/rgbServiceState';
import {
  closestXsydColorSlot,
  normalizeXsydBrightness,
  useXsydDevice,
  XSYD_COLOR_SLOTS,
  xsydDeviceManager,
  XsydCustomRgbStreamer,
} from '../protocol/xsyd/device';
import type { useCustomRgbPlayback } from './useCustomRgbPlayback';
import type { SavedRgbPresetItem } from './RgbSettingsPage';
import { useI18n } from '../i18n';
const hex = (color: RgbColor) => '#' + color.map(c => c.toString(16).padStart(2, '0')).join('');
const rgb = (value: string): RgbColor => ([1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)) as RgbColor);
function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const {
    tr
  } = useI18n();
  const translatedLabel = tr(label);
  return <label className="custom-rgb-slider"><span>{translatedLabel}</span><div>
      <input aria-label={translatedLabel} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))} />
      <input aria-label={`${translatedLabel} value`} type="number" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e => {
        const n = e.target.valueAsNumber;
        if (Number.isFinite(n)) {
          onChange(Math.max(min, Math.min(max, n)));
        }
      }} />
      <small>{unit}</small>
    </div></label>;
}
type Props = {
  value: RgbProfile;
  onChange: (v: RgbProfile) => void;
  busy: boolean;
  advancedBindings: AdvancedBinding[];
  visible: boolean;
  onSetup: () => void;
  playback: ReturnType<typeof useCustomRgbPlayback>;
  savedPresets?: SavedRgbPresetItem[];
  onSaveRgbPreset?: () => void;
  onApplySavedPreset?: (item: SavedRgbPresetItem) => void;
  onDeleteSavedPreset?: (id: string) => void;
  savedNotice?: string | null;
};
export default function CustomRgbEditor({
  value,
  onChange,
  busy,
  advancedBindings,
  visible,
  onSetup,
  playback,
  savedPresets = [],
  onSaveRgbPreset,
  onApplySavedPreset,
  onDeleteSavedPreset,
  savedNotice
}: Props) {
  const {
    tr
  } = useI18n();
  const model = useContext(DeviceModelContext);
  const isWin68 = isWin68HeMaxModel(model);
  const xsydSnap = useXsydDevice();
  const xsydConnected = isWin68 && xsydSnap.state === 'connected';
  const modelKeyIds = useMemo(() => heroLayout(model).keyIds, [model]);
  const config = restoreCustomRgb(value.custom, value);
  const [active, setActive] = useState('base');
  const [selected, setSelected] = useState(new Set<string>());
  const [paint, setPaint] = useState('#ffd95a');
  const [replay, setReplay] = useState(0);
  const [adding, setAdding] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [demo, setDemo] = useState(false);
  const [frame, setFrame] = useState<{
    keys: LightingFrame;
    side: string[];
  }>({
    keys: Object.fromEntries(modelKeyIds.map(id => [id, '#35393b'])),
    side: []
  });
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const engineRef = useRef<CustomRgbEngine | null>(null);
  const streamerRef = useRef<XsydCustomRgbStreamer | null>(null);
  const streamingBusyRef = useRef(false);
  const replayRef = useRef(-1);
  const {
    status,
    checking,
    applied,
    session,
    updateRequired
  } = playback;
  function previewDemo(enabled: boolean) {
    playback.demo(enabled);
    setDemo(enabled);
  }
  const locked = !isWin68 && !demo && (checking || !status);
  const paused = !visible || locked;
  const live = applied && !demo;
  const disabled = busy || playback.busy;
  const layer = config.layers.find(l => l.id === active);
  const definition = layer ? CUSTOM_RGB_EFFECTS.find(e => e.id === layer.effect) : undefined;
  const metadata = layer ? RGB_EFFECT_METADATA[layer.effect] : undefined;
  const baseCatalog = useMemo(() => mergedKeyRgbModesForModel(isWin68), [isWin68]);
  const mode = baseCatalog.find(m => m.id === config.base.mode) ?? baseCatalog[0]!;
  const auroraBase = config.baseEffect?.effect === 'aurora';
  const perKey = active === 'base' && !adding && !auroraBase && (isWin68 ? isWin68PerKeyMode(config.base.mode) : (config.base.mode === 19 || (config.base.mode >= 221 && config.base.mode <= 226)));
  const selectable = !adding && (perKey || !!layer);
  const samplePreview = !auroraBase && mode.reactive || config.layers.some(layer => layer.enabled && ['pressure-wave', 'jelly', 'ripple', 'touch', 'reaction', 'aoe', 'mixing', 'trail', 'rt', 'afterglow'].includes(layer.effect));
  const effectiveBaseBrightness = isWin68 ? normalizeXsydBrightness(config.base.brightness) : config.base.brightness;
  const darkReason = auroraBase
    ? effectiveBaseBrightness === 0
      ? 'Brightness is 0%.'
      : !config.base.mix && config.base.rgb.every(c => c === 0)
        ? 'Single color is black (#000000).'
        : null
    : rgbPreviewDarkReason(
        isWin68 ? { ...config.base, brightness: effectiveBaseBrightness } : config.base,
        false,
        isWin68
      );
  function animation(patch: Partial<NonNullable<CustomRgbConfiguration['baseEffect']>>) {
    if (config.baseEffect) {
      change({
        ...config,
        baseEffect: {
          ...config.baseEffect,
          ...patch
        }
      });
    }
  }
  function change(next: CustomRgbConfiguration) {
    onChange({
      ...value,
      custom: next
    });
  }
  function patchLayer(patch: Partial<CustomRgbLayer>) {
    change({
      ...config,
      layers: config.layers.map(l => l.id === active ? {
        ...l,
        ...patch
      } : l)
    });
  }
  function base(patch: Partial<CustomRgbConfiguration['base']>) {
    const nextMix = patch.mix !== undefined ? patch.mix : config.base.mix;
    const nextRgb = patch.rgb ?? config.base.rgb;
    const nextColorIndex =
      patch.colorIndex !== undefined
        ? patch.colorIndex
        : patch.mix !== undefined
          ? patch.mix
            ? 0
            : config.base.colorIndex && config.base.colorIndex >= 1
              ? config.base.colorIndex
              : closestXsydColorSlot(nextRgb)
          : config.base.colorIndex;
    change({
      ...config,
      base: {
        ...config.base,
        ...patch,
        mix: nextMix,
        ...(nextColorIndex !== undefined ? { colorIndex: nextColorIndex } : {}),
        ...(patch.mix !== undefined || patch.rgb !== undefined ? {
          mixValue: undefined
        } : {})
      }
    });
  }
  function choose(effect: CustomRgbEffect) {
    if (adding) {
      const next = createRgbLayer(effect);
      change({
        ...config,
        layers: [...config.layers, next]
      });
      setActive(next.id);
      setAdding(false);
    } else if (layer && layer.effect !== effect) {
      const next = createRgbLayer(effect, layer.id);
      patchLayer({
        ...next,
        keys: layer.keys,
        enabled: layer.enabled
      });
    }
    setChoosing(false);
  }
  function chooseBase(effect: number | 'aurora') {
    if (effect === 'aurora') {
      if (!auroraBase) {
        change({
          ...config,
          base: {
            ...config.base,
            mix: true,
            rgb: [34, 211, 238]
          },
          baseEffect: {
            effect: 'aurora',
            palette: 'aurora',
            width: 2.5,
            speed: .5
          }
        });
      }
    } else {
      change({
        ...config,
        baseEffect: undefined,
        base: {
          ...config.base,
          mode: effect
        }
      });
    }
    setChoosing(false);
  }
  function moveAuroraToBase() {
    if (!layer || layer.effect !== 'aurora') {
      return;
    }
    change({
      ...config,
      base: {
        ...config.base,
        rgb: layer.color,
        mix: layer.multicolor,
        brightness: isWin68 ? Math.round(layer.opacity / 25) : Math.round(layer.opacity / 5)
      },
      baseEffect: {
        effect: 'aurora',
        palette: layer.palette ?? 'aurora',
        width: layer.width,
        speed: layer.speed
      },
      layers: config.layers.filter(l => l.id !== layer.id)
    });
    setActive('base');
  }
  function move(offset: number) {
    const layers = [...config.layers];
    const i = layers.findIndex(l => l.id === active);
    const target = i + offset;
    if (i < 0 || target < 0 || target >= layers.length) {
      return;
    }
    [layers[i], layers[target]] = [layers[target], layers[i]];
    change({
      ...config,
      layers
    });
  }
  useEffect(() => {
    engineRef.current?.configure(value);
    if (engineRef.current && (!live || isWin68) && !paused) {
      const nextRendered = engineRef.current.frame();
      setFrame(nextRendered);
      if (Object.values(nextRendered.keys).some(c => c !== '#000000')) {
        publishLightingFrame(nextRendered.keys);
      }
    }
  }, [value, live, paused, isWin68]);
  useEffect(() => {
    if (active !== 'base' && !config.layers.some(l => l.id === active)) {
      setActive('base');
    }
  }, [active, config.layers]);
  const sampleSignature = JSON.stringify({
    base: auroraBase ? 'aurora' : mode.id,
    layers: config.layers.filter(layer => layer.enabled).map(layer => [layer.effect, layer.keys])
  });
  useEffect(() => {
    if (visible && !live && samplePreview) {
      setReplay(n => n + 1);
    }
  }, [visible, live, sampleSignature]);
  useEffect(() => {
    if (isWin68) {
      setSynced(Boolean(live && xsydConnected));
      return;
    }
    setSynced(false);
    if (!live || !visible) {
      return;
    }
    let disposed = false;
    let lastSequence = -1;
    const close = rgbService.frames(next => {
      if (disposed || next.sessionId !== session) {
        return;
      }
      if (next.sequence !== undefined && next.sequence <= lastSequence) {
        return;
      }
      if (next.sequence !== undefined) {
        lastSequence = next.sequence;
      }
      if (next.enabled && next.connected && next.keys) {
        setFrame(previous => ({
          keys: next.keys!,
          side: next.side ?? previous.side
        }));
        setSynced(true);
      } else {
        setSynced(false);
      }
    }, () => {
      if (!disposed) {
        setSynced(false);
      }
    });
    return () => {
      disposed = true;
      close();
    };
  }, [live, session, visible, isWin68, xsydConnected]);
  useEffect(() => {
    if (paused || (live && !isWin68)) {
      return;
    }
    const engine = replayRef.current === replay && engineRef.current ? engineRef.current : new CustomRgbEngine(value, model);
    replayRef.current = replay;
    engineRef.current = engine;
    engine.configure(value);
    if (isWin68 && !streamerRef.current) {
      streamerRef.current = new XsydCustomRgbStreamer();
    }
    let handle = 0;
    let previous = 0;
    let elapsed = Math.max(110, engine.milliseconds);
    let disposed = false;
    let sampleIndex = 0;
    let sampleOffset = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const held = new Set<string>();
    const releases: {
      id: string;
      at: number;
    }[] = [];
    const baseSampleKeys = isWin68 ? modelKeyIds : HERO68_KEY_IDS;
    const sampleKeys = [...new Set([...baseSampleKeys.slice(17, 22), ...config.layers.filter(layer => layer.enabled).flatMap(layer => layer.effect === 'mixing' ? layer.keys.filter(id => ['ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(id)) : layer.keys.slice(0, 1))])].slice(0, 13);
    const samples = replay > 0 ? sampleKeys.flatMap((id, i) => [{
      id,
      at: elapsed + 150 + i * 140,
      pressed: true
    }, {
      id,
      at: elapsed + 350 + i * 140,
      pressed: false
    }]).sort((a, b) => a.at - b.at) : [];
    const cycleStart = elapsed;
    const repeatSamples = samplePreview;
    const render = () => {
      try {
        engine.advance(elapsed);
        const nextFrame = engine.frame();
        setFrame(nextFrame);
        if (Object.values(nextFrame.keys).some(c => c !== '#000000')) {
          publishLightingFrame(nextFrame.keys);
        }

      } catch (reason) {
        setPreviewError(String(reason));
      }
    };
    const tick = (now: number) => {
      if (disposed || document.hidden || reduced.matches) {
        return;
      }
      elapsed += previous ? Math.min(now - previous, 100) : 0;
      previous = now;
      if (repeatSamples && samples.length && sampleIndex === samples.length && elapsed >= cycleStart + sampleOffset + 3000) {
        sampleOffset += 3000;
        sampleIndex = 0;
      }
      while (sampleIndex < samples.length && samples[sampleIndex].at + sampleOffset <= elapsed) {
        const event = samples[sampleIndex++];
        engine.advance(event.at + sampleOffset);
        engine.event(event.id, event.pressed);
      }
      while (releases.length && releases[0].at <= elapsed) {
        const event = releases.shift()!;
        engine.event(event.id, false);
      }
      render();
      handle = requestAnimationFrame(tick);
    };
    const keydown = (event: KeyboardEvent) => {
      if (!acceptsRgbPreviewKey(event)) {
        return;
      }
      held.add(event.code);
      engine.event(event.code, true);
      // A quick down/up can fit between RAF callbacks. Run the firmware while
      // the key is still held so reactive bases do not lose that press.
      elapsed = Math.max(elapsed, engine.milliseconds + (reduced.matches ? 25 : 1));
      render();
    };
    const keyup = (event: KeyboardEvent) => {
      if (held.delete(event.code)) {
        engine.event(event.code, false);
        if (reduced.matches) {
          render();
        }
      }
    };
    const blur = () => {
      held.clear();
      engine.releaseAll();
      render();
    };
    const resume = () => {
      cancelAnimationFrame(handle);
      previous = 0;
      if (document.hidden) {
        blur();
      } else if (!reduced.matches) {
        handle = requestAnimationFrame(tick);
      } else {
        render();
      }
    };
    const click = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      engine.event(id, true);
      if (reduced.matches) {
        elapsed += 50;
        render();
        engine.event(id, false);
      } else {
        releases.push({
          id,
          at: elapsed + 180
        });
      }
    };
    if (reduced.matches && samples.length) {
      for (const event of samples) {
        engine.advance(event.at);
        engine.event(event.id, event.pressed);
        engine.frame();
      }
      elapsed = samples.at(-1)!.at + 50;
    }
    setPreviewError(null);
    render();
    resume();
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    window.addEventListener('custom-rgb-preview-press', click);
    document.addEventListener('visibilitychange', resume);
    reduced.addEventListener('change', resume);
    return () => {
      disposed = true;
      cancelAnimationFrame(handle);
      engine.releaseAll();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      window.removeEventListener('custom-rgb-preview-press', click);
      document.removeEventListener('visibilitychange', resume);
      reduced.removeEventListener('change', resume);
    };
  }, [replay, paused, live, isWin68, model, modelKeyIds]);
  function toggle(id: string) {
    if (locked || !selectable) {
      return;
    }
    setSelected(old => {
      const next = new Set(old);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }
  const baseHex = hex(config.base.rgb);
  const layerHex = layer ? hex(layer.color) : '#ffffff';
  return <div className="custom-rgb-gate" hidden={!visible}>
    <RgbToolbarSlot visible={visible}>
      <span className="rgb-sync-note" data-attention={playback.reconnecting || playback.conflict || !applied && status?.mode === 'custom' || undefined} role="status">{playback.reconnecting ? tr('Reconnecting to background app…') : playback.conflict ? tr('Changes paused') : applied ? tr(playback.syncing ? 'Syncing changes…' : 'Auto sync') : status?.mode === 'custom' ? tr('Joining running Custom…') : demo ? tr('Simulation') : null}</span>
      {!applied && <button className="apply-button" disabled={disabled || (!isWin68 && (checking || locked))} onClick={() => void playback.start().then(ok => {
        if (ok) {
          previewDemo(false);
        }
      })}><Play size={15} />{playback.busy ? tr('Working…') : !isWin68 && updateRequired ? tr('Update app') : tr('Start Custom')}</button>}
      {(status?.enabled || (isWin68 && applied)) && <button className="secondary-button" title={tr('Return to onboard')} disabled={disabled} onClick={() => void playback.onboard()}><Square size={14} />{tr('Back to onboard')}</button>}
      {onSaveRgbPreset && <button type="button" className="secondary-button" disabled={disabled} onClick={onSaveRgbPreset}><Save size={15} /> {savedNotice ?? tr('Save')}</button>}
    </RgbToolbarSlot>
    <RgbToolbarSlot visible={visible} notice>
      {playback.backup && <div className="rgb-draft-recovery">
        <span>{tr(playback.conflict ? 'Changes paused · restore your draft to continue' : 'Your previous draft is available.')}</span>
        <button className="secondary-button" disabled={disabled} onClick={playback.restoreDraft}>{tr('Restore draft')}</button>
      </div>}
      {(playback.error || previewError) && <p className="stream-error" role="alert">{tr(playback.error || previewError || '')}</p>}
      {status?.enabled && status.mode === 'custom' && status.lastError && !(isWin68 && status.lastError.includes('RGB write failed')) && <p className="stream-error" role="alert">{status.lastError}</p>}
    </RgbToolbarSlot>
    <div className={`custom-rgb-content ${locked ? 'is-locked' : ''}`} inert={locked}>
      <RgbPreviewPanel source={demo ? tr('Simulation') : live ? synced ? tr('Live keyboard') : tr('Waiting for live frames') : tr('Draft preview')} hint={perKey ? tr('Select keys on the preview to paint.') : layer ? tr('Select the LED region for this layer.') : tr('Side lights keep their onboard effect.')} actions={!live && samplePreview ? <button className="secondary-button" disabled={disabled} onClick={() => setReplay(n => n + 1)}><RotateCcw size={15} />{tr('Try effect')}</button> : undefined} footer={perKey ? <RgbKeyPaintTools selected={selected} onSelect={setSelected} color={paint} onColor={setPaint} disabled={disabled} onPaint={() => {
        const colors = {
          ...value.colors
        };
        for (const id of selected) {
          colors[id] = rgb(paint);
        }
        onChange({
          ...value,
          colors
        });
      }} /> : layer && !adding ? <div className="rgb-key-scope-tools">
          <RgbKeySelectionTools selected={selected} onSelect={setSelected} disabled={disabled} />
          <div className="rgb-key-scope-actions">
            <small>{tr('Layer affects {count}', {
              count: layer.keys.length
            })}</small>
            <button className="apply-button" disabled={disabled || !selected.size} onClick={() => patchLayer({
            keys: [...selected]
          })}>{tr('Use selection')}</button>
            <button className="secondary-button" disabled={disabled} onClick={() => patchLayer({
            keys: [...modelKeyIds]
          })}>{tr('Affect all keys')}</button>
          </div>
        </div> : undefined}>
        <Hero68Preview advancedBindings={advancedBindings} showAdvancedIcons={false} selectedKeys={selectable ? selected : new Set()} onToggleKey={toggle} lightingFrame={frame.keys} lightingSource="local" selectionEnabled={selectable} />
        {!isWin68 && <div className="rgb-side-preview" aria-label={tr('18 side light positions')}>{(frame.side.length ? frame.side : Array(18).fill('#35393b')).map((color, i) => <span key={i} style={{
            background: color,
            color
          }} />)}</div>}
      </RgbPreviewPanel>
      <section className="rgb-custom-editor">
        {darkReason && <div className="rgb-dark-preview-note" role="status">
          <span>{tr('Base lighting is dark')} · {tr(darkReason)}</span>
          <button type="button" className="secondary-button" disabled={disabled} onClick={() => {
            base({
              mix: true,
              colorIndex: 0,
              brightness: effectiveBaseBrightness || (isWin68 ? 4 : 20)
            });
            setReplay(n => n + 1);
          }}>{tr('Use Multicolor')}</button>
        </div>}
        <div className="custom-rgb-columns">
          <aside className="settings-card custom-rgb-stack">
            <h3>{tr('Base layer')}</h3>
            <button className={`custom-rgb-layer ${active === 'base' && !adding ? 'active' : ''}`} disabled={disabled} onClick={() => {
              setActive('base');
              setAdding(false);
              setChoosing(false);
            }}><Waves size={16} /><span>{auroraBase ? tr('Aurora') : tr(mode.name)}</span></button>
            <h3>{tr('Effect layers')}</h3>
            <p className="custom-rgb-stack-note">{tr('Lower layers blend over earlier ones.')}</p>
            {config.layers.map((item, i) => <div key={item.id} className={`custom-rgb-layer ${active === item.id && !adding ? 'active' : ''} ${!item.enabled ? 'muted' : ''}`}>
              <button className="custom-rgb-layer-select" disabled={disabled} onClick={() => {
                setActive(item.id);
                setAdding(false);
                setChoosing(false);
              }}><span className="layer-color-dot" style={{
                  background: hex(item.color)
                }} /><span>{tr(CUSTOM_RGB_EFFECTS.find(e => e.id === item.effect)?.name ?? '')}</span><small>{i + 1}</small></button>
              <input type="checkbox" aria-label={`Enable ${CUSTOM_RGB_EFFECTS.find(e => e.id === item.effect)?.name} layer ${i + 1}`} checked={item.enabled} disabled={disabled} onChange={e => change({
                ...config,
                layers: config.layers.map(l => l.id === item.id ? {
                  ...l,
                  enabled: e.target.checked
                } : l)
              })} />
            </div>)}
            <button className="custom-rgb-add" disabled={disabled || config.layers.length >= MAX_RGB_LAYERS} onClick={() => {
              setAdding(true);
              setChoosing(true);
            }}><Plus size={16} /> {tr('Add layer')}</button>
            {!config.layers.length && <p className="custom-rgb-empty">{tr('Choose a layer to bring your base colors to life.')}</p>}
            {layer && !adding && <div className="custom-rgb-order">
              <button className="secondary-button" aria-label={tr('Move layer up')} disabled={disabled || config.layers[0]?.id === active} onClick={() => move(-1)}><ArrowUp size={15} /></button>
              <button className="secondary-button" aria-label={tr('Move layer down')} disabled={disabled || config.layers.at(-1)?.id === active} onClick={() => move(1)}><ArrowDown size={15} /></button>
              <button className="secondary-button" aria-label={tr('Delete selected layer')} disabled={disabled} onClick={() => change({
                ...config,
                layers: config.layers.filter(l => l.id !== active)
              })}><Trash2 size={15} /></button>
            </div>}
          </aside>
          <div className="settings-card custom-rgb-inspector">
          <div className="custom-inspector-heading">
              <h2>{adding ? tr('Add an effect') : active === 'base' ? auroraBase ? tr('Aurora') : tr(mode.name) : tr(definition?.name ?? 'Effect parameters')}</h2>
              <div className="custom-rgb-actions">
                {!adding && !choosing && <button className="secondary-button" disabled={disabled} onClick={() => setChoosing(true)}>{tr('Change effect')}</button>}
              </div>
            </div>
          {(adding || choosing) && <section className="custom-rgb-selection">
              <div className="custom-inspector-heading">
                <h3>{tr(adding ? 'Add an effect' : 'Choose effect')}</h3>
                <button className="secondary-button" onClick={() => {
                  setAdding(false);
                  setChoosing(false);
                }}>{tr('Cancel')}</button>
              </div>
              <div className="custom-rgb-effect-grid">{active === 'base' && !adding ? <><button disabled={disabled} aria-pressed={auroraBase} onClick={() => chooseBase('aurora')}><Sparkles size={15} />{tr('Aurora')}</button>{baseCatalog.map(item => <button key={item.id} disabled={disabled} aria-pressed={!auroraBase && config.base.mode === item.id} onClick={() => chooseBase(item.id)}><Waves size={15} />{tr(item.name)}</button>)}</> : CUSTOM_RGB_EFFECTS.filter(effect => effect.id !== 'aurora' || layer?.effect === 'aurora' && !adding).map(effect => <button key={effect.id} disabled={disabled} aria-pressed={!adding && layer?.effect === effect.id} onClick={() => choose(effect.id)}><Sparkles size={15} />{tr(effect.name)}</button>)}</div>
            </section>}
          {!adding && !choosing && <div className="custom-rgb-parameters"><h3>{active === 'base' ? tr('Base parameters') : tr('Effect parameters')}</h3>{active === 'base' ? <><Slider label="Brightness" value={isWin68 ? effectiveBaseBrightness * 25 : config.base.brightness * 5} min={0} max={100} step={isWin68 ? 25 : 5} unit="%" disabled={disabled} onChange={v => base({
                  brightness: isWin68 ? v / 25 : v / 5
                })} />{auroraBase && config.baseEffect ? <>
            <p className="custom-rgb-description">{tr('Soft color curtains across all keys. Add FX layers for key reactions.')}</p>
            <div className="custom-slider-grid">
                    <Slider label="Ribbon width" value={config.baseEffect.width} min={.25} max={12} step={.25} unit="keys" disabled={disabled} onChange={v => animation({
                      width: v
                    })} />
                    <Slider label="Speed" value={config.baseEffect.speed} min={.5} max={3} step={.5} unit="×" disabled={disabled} onChange={v => animation({
                      speed: v
                    })} />
                  </div>
            <div className="custom-rgb-direction">
                    <span>{tr('Color mode')}</span>
                    <div>
                      <button disabled={disabled} aria-pressed={!config.base.mix} onClick={() => base({
                        mix: false
                      })}>{tr('Single color')}</button>
                      <button disabled={disabled} aria-pressed={config.base.mix} onClick={() => base({
                        mix: true
                      })}>{tr('Palette')}</button>
                    </div>
                  </div>
            {config.base.mix ? <div className="custom-palette-options">{Object.entries(RGB_GRADIENT_PALETTES).map(([id, palette]) => <button key={id} disabled={disabled} aria-pressed={config.baseEffect?.palette === id} onClick={() => animation({
                      palette: (id as RgbGradientPalette)
                    })}><span style={{
                        background: `linear-gradient(90deg,${palette.colors.join(',')})`
                      }} />{tr(palette.name)}</button>)}</div> : <div className="rgb-color-controls">
                      <div className="rgb-color-header">
                        <span className="rgb-color-label">{tr('Base color')}</span>
                        <div className="rgb-custom-color-box is-active">
                          <label className="rgb-color-picker-trigger" title={tr('Base effect color')}>
                            <RgbColorPicker label={tr('Base effect color')} value={baseHex} disabled={disabled} onChange={v => base({
                              rgb: rgb(v),
                              mix: false
                            })} />
                          </label>
                          <span className="rgb-color-hex-readout">{baseHex.toUpperCase()}</span>
                        </div>
                      </div>
                      <div className="rgb-swatch-grid is-seven" role="group" aria-label={tr('Color slot')}>
                        {XSYD_COLOR_SLOTS.filter(slotInfo => slotInfo.index > 0).map(slotInfo => {
                          const presetHex = hex(slotInfo.rgb);
                          return (
                            <button
                              key={slotInfo.index}
                              type="button"
                              className="rgb-swatch-chip"
                              disabled={disabled}
                              aria-pressed={!config.base.mix && baseHex.toLowerCase() === presetHex.toLowerCase()}
                              title={tr(slotInfo.name)}
                              onClick={() => base({
                                mix: false,
                                colorIndex: slotInfo.index,
                                rgb: [...slotInfo.rgb] as RgbColor
                              })}
                            >
                              <span className="rgb-swatch-dot" style={{ background: presetHex }} aria-hidden="true" />
                              <span className="rgb-swatch-name">{tr(slotInfo.name)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>}
          </> : <>{mode.speed && <Slider label="Base speed" value={config.base.speed + 1} min={1} max={5} unit="/ 5" disabled={disabled} onChange={v => base({
                    speed: v - 1
                  })} />} {mode.color && <div className="rgb-color-controls">
                    <div className="rgb-color-header">
                      <span className="rgb-color-label">{tr('Base color')}</span>
                      <div className={`rgb-custom-color-box ${!config.base.mix ? 'is-active' : 'is-multicolor'}`}>
                        <label className="rgb-color-picker-trigger" title={tr('Base effect color')}>
                          <RgbColorPicker label={tr('Base effect color')} value={baseHex} disabled={disabled} onChange={v => base({
                            rgb: rgb(v),
                            mix: false,
                            colorIndex: closestXsydColorSlot(rgb(v))
                          })} />
                        </label>
                        <span className="rgb-color-hex-readout">{baseHex.toUpperCase()}</span>
                      </div>
                    </div>
                    <div className="rgb-swatch-grid" role="group" aria-label={tr('Color slot')}>
                      {XSYD_COLOR_SLOTS.map(slotInfo => {
                        const isMulticolor = slotInfo.index === 0;
                        const presetHex = hex(slotInfo.rgb);
                        const selectedSlot = isMulticolor
                          ? Boolean(config.base.mix)
                          : !config.base.mix && baseHex.toLowerCase() === presetHex.toLowerCase();
                        return (
                          <button
                            key={slotInfo.index}
                            type="button"
                            className={`rgb-swatch-chip ${isMulticolor ? 'is-multicolor' : ''}`}
                            disabled={disabled}
                            aria-pressed={selectedSlot}
                            title={tr(slotInfo.name)}
                            onClick={() => {
                              if (isMulticolor) {
                                base({ mix: true, colorIndex: 0 });
                              } else {
                                base({
                                  mix: false,
                                  colorIndex: slotInfo.index,
                                  rgb: [...slotInfo.rgb] as RgbColor
                                });
                              }
                            }}
                          >
                            <span
                              className={`rgb-swatch-dot ${isMulticolor ? 'is-rainbow' : ''}`}
                              style={isMulticolor ? undefined : { background: presetHex }}
                              aria-hidden="true"
                            />
                            <span className="rgb-swatch-name">{tr(slotInfo.name)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>}</>}</> : layer && metadata && <><p className="custom-rgb-description">{tr(definition?.detail ?? '')}</p>{layer.effect === "aurora" && <div className="custom-rgb-base-migration">
                  <p>{tr('Aurora is now a Base effect. Move this layer to cover all keys and control its brightness directly.')}</p>
                  <button className="secondary-button" disabled={disabled} onClick={moveAuroraToBase}>{tr('Move Aurora to Base')}</button>
                </div>}{!metadata.semanticColor && <>
                  <div className="custom-rgb-direction">
                    <span>{tr('Color mode')}</span>
                    <div>
                      <button disabled={disabled} aria-pressed={!layer.multicolor} onClick={() => patchLayer({
                        multicolor: false
                      })}>{tr('Single color')}</button>
                      <button disabled={disabled} aria-pressed={layer.multicolor} onClick={() => patchLayer({
                        multicolor: true,
                        palette: layer.palette ?? metadata.defaults?.palette ?? 'aurora'
                      })}>{tr('Palette')}</button>
                    </div>
                  </div>
                  {layer.multicolor ? (
                    <div className="custom-palette-options">{Object.entries(RGB_GRADIENT_PALETTES).map(([id, palette]) => <button key={id} disabled={disabled} aria-pressed={layer.multicolor && (layer.palette ?? metadata.defaults?.palette ?? 'aurora') === id} onClick={() => patchLayer({
                      multicolor: true,
                      palette: (id as RgbGradientPalette)
                    })}><span style={{
                      background: `linear-gradient(90deg,${palette.colors.join(',')})`
                    }} />{tr(palette.name)}</button>)}</div>
                  ) : (
                    <div className="rgb-color-controls">
                      <div className="rgb-color-header">
                        <span className="rgb-color-label">{tr('Effect color')}</span>
                        <div className="rgb-custom-color-box is-active">
                          <label className="rgb-color-picker-trigger" title={tr('Layer color')}>
                            <RgbColorPicker label={tr('Layer color')} value={layerHex} disabled={disabled} onChange={v => patchLayer({
                              color: rgb(v),
                              multicolor: false
                            })} />
                          </label>
                          <span className="rgb-color-hex-readout">{layerHex.toUpperCase()}</span>
                        </div>
                      </div>
                      <div className="rgb-swatch-grid is-seven" role="group" aria-label={tr('Color slot')}>
                        {XSYD_COLOR_SLOTS.filter(slotInfo => slotInfo.index > 0).map(slotInfo => {
                          const presetHex = hex(slotInfo.rgb);
                          return (
                            <button
                              key={slotInfo.index}
                              type="button"
                              className="rgb-swatch-chip"
                              disabled={disabled}
                              aria-pressed={!layer.multicolor && layerHex.toLowerCase() === presetHex.toLowerCase()}
                              title={tr(slotInfo.name)}
                              onClick={() => patchLayer({
                                color: [...slotInfo.rgb] as RgbColor,
                                multicolor: false
                              })}
                            >
                              <span className="rgb-swatch-dot" style={{ background: presetHex }} aria-hidden="true" />
                              <span className="rgb-swatch-name">{tr(slotInfo.name)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>}<div className="custom-slider-grid">
                  <Slider label="Opacity" value={layer.opacity} min={0} max={100} unit="%" disabled={disabled} onChange={v => patchLayer({
                    opacity: v
                  })} />
                  {metadata.width && <Slider label={metadata.width} value={layer.width} min={metadata.widthRange?.[0] ?? .25} max={metadata.widthRange?.[1] ?? 12} step={metadata.widthRange?.[2] ?? .25} unit={metadata.widthUnit ?? 'keys'} disabled={disabled} onChange={v => patchLayer({
                    width: v
                  })} />}
                  {metadata.speed && <Slider label={metadata.speedLabel ?? 'Speed'} value={layer.speed} min={metadata.speedRange?.[0] ?? .5} max={metadata.speedRange?.[1] ?? 30} step={metadata.speedRange?.[2] ?? .5} unit={metadata.speed} disabled={disabled} onChange={v => patchLayer({
                    speed: v
                  })} />}
                  {metadata.scanPause && <Slider label={metadata.scanPause} value={layer.scanPauseMs ?? 0} min={0} max={5000} step={50} unit="ms" disabled={disabled} onChange={v => patchLayer({
                    scanPauseMs: v
                  })} />}
                  {metadata.duration && <Slider label={metadata.duration} value={layer.duration} min={100} max={4000} step={50} unit="ms" disabled={disabled} onChange={v => patchLayer({
                    duration: v
                  })} />}
                </div>{metadata.direction && <div className="custom-rgb-direction">
                  <span>{tr('Direction')}</span>
                  <div>{(['horizontal', 'vertical'] as const).map(direction => <button key={direction} disabled={disabled} aria-pressed={layer.direction === direction} onClick={() => patchLayer({
                      direction
                    })}>{direction === 'horizontal' ? tr('Horizontal') : tr('Vertical')}</button>)}</div>
                </div>}{metadata.hall && <p className="custom-rgb-description">{live ? tr('Analog feedback runs automatically in the background app.') : tr('Use Try effect to simulate presses. Start Custom for actual analog feedback.')}</p>}</>}
          {savedPresets.length > 0 && (
            <div className="rgb-saved-presets">
              <h3>{tr('Saved')} RGB</h3>
              <div className="rgb-zone-tabs" role="group" aria-label="Saved RGB">
                {savedPresets.map(item => (
                  <div key={item.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <button type="button" disabled={disabled} onClick={() => onApplySavedPreset?.(item)}>
                      {item.name}
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Delete ${item.name}`}
                      onClick={() => onDeleteSavedPreset?.(item.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {active === 'base' && !auroraBase && <details className="service-details">
                <summary>{tr('Advanced')}</summary>
                <div>
                  <button className="secondary-button" disabled={disabled} onClick={() => onChange({
                    ...value,
                    keys: {
                      ...config.base
                    }
                  })}>{tr('Use base on keyboard')}</button>
                  <p>{tr('Stages the base for Save. Custom layers remain in your local preset.')}</p>
                </div>
              </details>}</div>}</div>
        </div>
        <details className="service-details">
          <summary>{tr('Details')}</summary>
          <div>
            <p>{isWin68
              ? `${xsydConnected ? tr('Keyboard connected (WebHID XSYD 0x2A)') : tr('Local preview · connect WIN 68 HE MAX to stream live')} · ${live ? tr('Streaming Custom RGB') : tr('Draft preview')}`
              : status ? `${status.fps.toFixed(1)} FPS · ${status.connected ? tr('Keyboard connected') : tr('Waiting for keyboard')} · ${synced ? tr('Preview synced') : tr('Local preview or waiting for frames')}` : tr('The background service is not responding.')}</p>
            {status?.lastError && <p>{status.lastError}</p>}
            {!isWin68 && <div className="custom-rgb-actions">
              <button className="secondary-button" onClick={onSetup}>{tr('Setup / Update')}</button>
              {status && <a className="secondary-button" href="http://127.0.0.1:16868/" target="_blank" rel="noreferrer">{tr('Service panel')}</a>}
              <button className="secondary-button" onClick={() => void refreshRgbService()}>{tr('Check again')}</button>
            </div>}
          </div>
        </details>
        <p className="rgb-preview-note">{!isWin68 && `${tr('Side lights keep their onboard effect.')} `}{demo ? tr('Demo only changes the preview.') : tr('Custom runs in the background; changes sync automatically.')}</p>
      </section>
    </div>
    {locked && <div className="custom-rgb-lock-overlay"><div className="custom-rgb-lock-card" role="status">
        <span className="custom-lock-icon"><Layers size={27} /></span>
        <h2>{checking ? tr('Checking background service…') : tr('Background service required')}</h2>
        <p>{tr('Run the background app to use Custom Effects, or try a preview.')}</p>
        <div className="custom-rgb-actions">
          <button className="apply-button" onClick={onSetup}><Download size={16} /> {tr('Download app')}</button>
          <button className="secondary-button" onClick={() => previewDemo(true)}>{tr('Try demo')}</button>
          <button className="custom-text-button" onClick={() => void refreshRgbService()}>{tr('Check again')}</button>
        </div>
      </div></div>}
  </div>;
}
