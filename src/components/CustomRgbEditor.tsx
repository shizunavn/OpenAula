import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  CUSTOM_RGB_EFFECTS,
  CustomRgbEngine,
  RGB_EFFECT_METADATA,
  createRgbLayer,
  restoreCustomRgb,
  type CustomRgbConfiguration,
  type CustomRgbEffect,
  type CustomRgbLayer
} from '../keyboard/customRgb';
import { HERO68_KEY_IDS } from '../keyboard/hero68Layout';
import { isWin68HeMaxModel } from '../keyboard/devices';
import { heroLayout } from '../keyboard/layout';
import { DeviceModelContext } from '../app/DeviceModelContext';
import { mergedKeyRgbModesForModel } from '../keyboard/rgbCatalog';
import { acceptsRgbPreviewKey } from '../keyboard/rgbPreviewInput';
import { rgbPreviewDarkReason } from '../keyboard/rgbPreviewDefaults';
import {
  publishLightingFrame,
  subscribeLightingFrame,
  type LightingFrame
} from '../keyboard/lightingPreviewBus';
import type { RgbColor, RgbProfile } from '../protocol/hero68/rgb';
import type { AdvancedBinding } from '../protocol/hero68/advanced';
import { rgbService } from '../protocol/rgbService';
import { refreshRgbService } from '../protocol/rgbServiceState';
import {
  buildXsydPerKeyWriteFrame,
  buildXsydRgbWriteFrame,
  closestXsydColorSlot,
  normalizeXsydBrightness,
  saveXsydSavedRgb,
  useXsydDevice,
  xsydDeviceManager,
  XsydCustomRgbStreamer
} from '../protocol/xsyd/device';
import { keyValueForCode } from '../protocol/xsyd/features';
import {
  isPerKeyRgbMode,
  normalizeGamingPresetMode,
  resolvePresetColors
} from '../keyboard/gamingPresets';
import type { useCustomRgbPlayback } from './useCustomRgbPlayback';
import type { SavedRgbPresetItem } from './RgbSettingsPage';
import { useI18n } from '../i18n';
const hex = (color: RgbColor) => '#' + color.map(c => c.toString(16).padStart(2, '0')).join('');
const rgb = (value: string): RgbColor =>
  [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)) as RgbColor;
import { CustomRgbToolbar } from './custom-rgb/CustomRgbToolbar';
import { CustomRgbPreviewSection } from './custom-rgb/CustomRgbPreviewSection';
import { CustomRgbLayerStack } from './custom-rgb/CustomRgbLayerStack';
import { CustomRgbEffectSelector } from './custom-rgb/CustomRgbEffectSelector';
import { CustomRgbBaseParameters } from './custom-rgb/CustomRgbBaseParameters';
import { CustomRgbLayerParameters } from './custom-rgb/CustomRgbLayerParameters';
import {
  CustomRgbLockOverlay,
  CustomRgbServiceDetails
} from './custom-rgb/CustomRgbServiceDetails';
import { SavedRgbPresetsSection } from './rgb/SavedRgbPresetsSection';
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
  slot?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  enableUndoShortcuts?: boolean;
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
  savedNotice,
  slot = 1,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  enableUndoShortcuts = false
}: Props) {
  const { tr } = useI18n();
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
  const replayRef = useRef(-1);
  const { status, checking, applied, session } = playback;
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
  const waveBase = config.baseEffect?.effect === 'wave';
  const customBase = auroraBase || waveBase;
  const perKey =
    active === 'base' && !adding && !customBase && isPerKeyRgbMode(config.base.mode, isWin68);
  const selectable = !adding && (perKey || !!layer);
  const samplePreview =
    (!customBase && mode.reactive) ||
    config.layers.some(
      layer =>
        layer.enabled &&
        [
          'pressure-wave',
          'jelly',
          'ripple',
          'touch',
          'reaction',
          'aoe',
          'mixing',
          'trail',
          'rt',
          'afterglow',
          'trigger'
        ].includes(layer.effect)
    );
  const effectiveBaseBrightness = isWin68
    ? normalizeXsydBrightness(config.base.brightness)
    : config.base.brightness;
  const darkReason = customBase
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
      layers: config.layers.map(l =>
        l.id === active
          ? {
              ...l,
              ...patch
            }
          : l
      )
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
    const nextBaseZone = {
      ...config.base,
      ...patch,
      mix: nextMix,
      ...(nextColorIndex !== undefined ? { colorIndex: nextColorIndex } : {}),
      ...(patch.mix !== undefined || patch.rgb !== undefined
        ? {
            mixValue: undefined
          }
        : {})
    };
    const nextConfig: CustomRgbConfiguration = {
      ...config,
      base: nextBaseZone
    };
    const nextProfile: RgbProfile = {
      ...value,
      keys: {
        ...value.keys,
        ...nextBaseZone
      },
      custom: nextConfig
    };
    onChange(nextProfile);
    if (isWin68) {
      if (slot !== undefined) {
        saveXsydSavedRgb(slot, nextProfile);
      }
      if (xsydDeviceManager.connected && !live) {
        void xsydDeviceManager.request(buildXsydRgbWriteFrame(nextBaseZone)).catch(() => {});
      }
    }
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
  function chooseBase(effect: number | 'aurora' | 'wave') {
    if (effect === 'aurora') {
      if (!auroraBase) {
        const nextConfig: CustomRgbConfiguration = {
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
            speed: 0.5
          }
        };
        const nextProfile: RgbProfile = {
          ...value,
          custom: nextConfig
        };
        onChange(nextProfile);
        if (isWin68 && slot !== undefined) {
          saveXsydSavedRgb(slot, nextProfile);
        }
      }
    } else if (effect === 'wave') {
      if (!waveBase) {
        const nextConfig: CustomRgbConfiguration = {
          ...config,
          base: {
            ...config.base,
            mix: true,
            rgb: [255, 0, 0]
          },
          baseEffect: {
            effect: 'wave',
            palette: 'wave',
            width: 2.5,
            speed: 1.5,
            direction: 'left'
          }
        };
        const nextProfile: RgbProfile = {
          ...value,
          custom: nextConfig
        };
        onChange(nextProfile);
        if (isWin68 && slot !== undefined) {
          saveXsydSavedRgb(slot, nextProfile);
        }
      }
    } else {
      const prevMode = config.base.mode;
      const prevCanonical = normalizeGamingPresetMode(prevMode);
      const nextCanonical = normalizeGamingPresetMode(effect);
      const currentPresetColors: Record<number, Record<string, RgbColor>> = {
        ...(value.presetColors ?? {}),
        ...(config.presetColors ?? {})
      };

      if (isPerKeyRgbMode(prevMode, isWin68)) {
        currentPresetColors[prevCanonical] = { ...value.colors };
      }

      const isTargetPerKey = isPerKeyRgbMode(effect, isWin68);
      const nextColors = isTargetPerKey
        ? resolvePresetColors(effect, value.colors, currentPresetColors, modelKeyIds)
        : value.colors;

      if (isTargetPerKey) {
        currentPresetColors[nextCanonical] = { ...nextColors };
      }

      const nextBaseZone = {
        ...config.base,
        mode: effect
      };

      const nextConfig: CustomRgbConfiguration = {
        ...config,
        baseEffect: undefined,
        base: nextBaseZone,
        presetColors: currentPresetColors
      };

      const nextProfile: RgbProfile = {
        ...value,
        keys: {
          ...value.keys,
          ...nextBaseZone,
          mode: effect
        },
        colors: nextColors,
        presetColors: currentPresetColors,
        custom: nextConfig
      };

      onChange(nextProfile);
      if (isWin68) {
        if (slot !== undefined) {
          saveXsydSavedRgb(slot, nextProfile);
        }
        if (xsydDeviceManager.connected && !live) {
          void xsydDeviceManager.request(buildXsydRgbWriteFrame(nextBaseZone)).catch(() => {});
        }
      }
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
    if (engineRef.current) {
      engineRef.current.configure(value);
      if (!live && !paused) {
        engineRef.current.advance(Math.max(110, engineRef.current.milliseconds + 110));
        const nextRendered = engineRef.current.frame();
        setFrame(nextRendered);
        if (Object.values(nextRendered.keys).some(c => c !== '#000000')) {
          publishLightingFrame(nextRendered.keys);
        }
      }
    }
  }, [value, live, paused]);
  useEffect(() => {
    if (active !== 'base' && !config.layers.some(l => l.id === active)) {
      setActive('base');
    }
  }, [active, config.layers]);
  const sampleSignature = JSON.stringify({
    base: auroraBase ? 'aurora' : waveBase ? 'wave' : mode.id,
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
      if (!live || !visible) {
        return;
      }
      return subscribeLightingFrame(nextKeys => {
        setFrame(previous => ({
          keys: nextKeys,
          side: previous.side
        }));
      });
    }
    setSynced(false);
    if (!live || !visible) {
      return;
    }
    let disposed = false;
    let lastSequence = -1;
    const close = rgbService.frames(
      next => {
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
      },
      () => {
        if (!disposed) {
          setSynced(false);
        }
      }
    );
    return () => {
      disposed = true;
      close();
    };
  }, [live, session, visible, isWin68, xsydConnected]);
  useEffect(() => {
    if (paused || live) {
      return;
    }
    const engine =
      replayRef.current === replay && engineRef.current
        ? engineRef.current
        : new CustomRgbEngine(value, model);
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
    const sampleKeys = [
      ...new Set([
        ...baseSampleKeys.slice(17, 22),
        ...config.layers
          .filter(layer => layer.enabled)
          .flatMap(layer =>
            layer.effect === 'mixing'
              ? layer.keys.filter(id => ['ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(id))
              : layer.keys.slice(0, 1)
          )
      ])
    ].slice(0, 13);
    const samples =
      replay > 0
        ? sampleKeys
            .flatMap((id, i) => [
              {
                id,
                at: elapsed + 150 + i * 140,
                pressed: true
              },
              {
                id,
                at: elapsed + 350 + i * 140,
                pressed: false
              }
            ])
            .sort((a, b) => a.at - b.at)
        : [];
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
      if (
        repeatSamples &&
        samples.length &&
        sampleIndex === samples.length &&
        elapsed >= cycleStart + sampleOffset + 3000
      ) {
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
  return (
    <div className="custom-rgb-gate" hidden={!visible}>
      <CustomRgbToolbar
        visible={visible}
        isWin68={isWin68}
        demo={demo}
        disabled={disabled}
        locked={locked}
        playback={playback}
        previewError={previewError}
        canUndo={canUndo}
        canRedo={canRedo}
        enableUndoShortcuts={enableUndoShortcuts}
        onUndo={onUndo}
        onRedo={onRedo}
        onStartCustom={() =>
          void playback.start().then(ok => {
            if (ok) {
              previewDemo(false);
            }
          })
        }
        onSaveRgbPreset={onSaveRgbPreset}
        savedNotice={savedNotice}
      />
      <div className={`custom-rgb-content ${locked ? 'is-locked' : ''}`} inert={locked}>
        <CustomRgbPreviewSection
          demo={demo}
          live={live}
          synced={synced}
          perKey={perKey}
          layer={layer}
          adding={adding}
          samplePreview={samplePreview}
          disabled={disabled}
          isWin68={isWin68}
          selectable={selectable}
          selected={selected}
          paint={paint}
          modelKeyIds={modelKeyIds}
          advancedBindings={advancedBindings}
          frame={frame}
          onSelect={setSelected}
          onToggleKey={toggle}
          onPaintColorChange={setPaint}
          onPaintSelected={() => {
            const colors = {
              ...value.colors
            };
            const paintRgb = rgb(paint);
            for (const id of selected) {
              colors[id] = paintRgb;
              if (isWin68 && xsydDeviceManager.connected && !live) {
                const kv = keyValueForCode(id);
                if (kv !== undefined) {
                  void xsydDeviceManager
                    .request(buildXsydPerKeyWriteFrame(kv, paintRgb))
                    .catch(() => {});
                }
              }
            }
            const currentMode = config.base.mode;
            const canonical = normalizeGamingPresetMode(currentMode);
            const nextPresetColors: Record<number, Record<string, RgbColor>> = {
              ...(value.presetColors ?? {}),
              ...(config.presetColors ?? {}),
              [canonical]: { ...colors }
            };
            const nextConfig: CustomRgbConfiguration = {
              ...config,
              presetColors: nextPresetColors
            };
            const nextProfile: RgbProfile = {
              ...value,
              keys: {
                ...value.keys,
                mode: currentMode
              },
              colors,
              presetColors: nextPresetColors,
              custom: nextConfig
            };
            onChange(nextProfile);
            if (isWin68 && slot !== undefined) {
              saveXsydSavedRgb(slot, nextProfile);
            }
          }}
          onReplay={() => setReplay(n => n + 1)}
          onPatchLayerKeys={keys => patchLayer({ keys })}
        />
        <section className="rgb-custom-editor">
          {darkReason && (
            <div className="rgb-dark-preview-note" role="status">
              <span>
                {tr('Base lighting is dark')} · {tr(darkReason)}
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={disabled}
                onClick={() => {
                  base({
                    mix: true,
                    colorIndex: 0,
                    brightness: effectiveBaseBrightness || (isWin68 ? 4 : 20)
                  });
                  setReplay(n => n + 1);
                }}
              >
                {tr('Use Multicolor')}
              </button>
            </div>
          )}
          <div className="custom-rgb-columns">
            <CustomRgbLayerStack
              config={config}
              active={active}
              adding={adding}
              auroraBase={auroraBase}
              waveBase={waveBase}
              baseModeName={mode.name}
              activeLayer={layer}
              disabled={disabled}
              onSelectBase={() => {
                setActive('base');
                setAdding(false);
                setChoosing(false);
              }}
              onSelectLayer={id => {
                setActive(id);
                setAdding(false);
                setChoosing(false);
              }}
              onToggleLayerEnabled={(id, enabled) =>
                change({
                  ...config,
                  layers: config.layers.map(l => (l.id === id ? { ...l, enabled } : l))
                })
              }
              onStartAddLayer={() => {
                setAdding(true);
                setChoosing(true);
              }}
              onMoveLayer={move}
              onDeleteActiveLayer={() =>
                change({
                  ...config,
                  layers: config.layers.filter(l => l.id !== active)
                })
              }
            />
            <div className="settings-card custom-rgb-inspector">
              <div className="custom-inspector-heading">
                <h2>
                  {adding
                    ? tr('Add an effect')
                    : active === 'base'
                      ? auroraBase
                        ? tr('Aurora')
                        : waveBase
                          ? tr('Dynamic Wave')
                          : tr(mode.name)
                      : tr(definition?.name ?? 'Effect parameters')}
                </h2>
                <div className="custom-rgb-actions">
                  {!adding && !choosing && (
                    <button
                      className="secondary-button"
                      disabled={disabled}
                      onClick={() => setChoosing(true)}
                    >
                      {tr('Change effect')}
                    </button>
                  )}
                </div>
              </div>
              {(adding || choosing) && (
                <CustomRgbEffectSelector
                  isBaseSelection={active === 'base' && !adding}
                  adding={adding}
                  auroraBase={auroraBase}
                  waveBase={waveBase}
                  customBase={customBase}
                  baseModeId={config.base.mode}
                  baseCatalog={baseCatalog}
                  activeLayerEffect={layer?.effect}
                  disabled={disabled}
                  onCancel={() => {
                    setAdding(false);
                    setChoosing(false);
                  }}
                  onChooseBase={chooseBase}
                  onChooseLayerEffect={choose}
                />
              )}
              {!adding && !choosing && (
                <div className="custom-rgb-parameters">
                  <h3>{active === 'base' ? tr('Base parameters') : tr('Effect parameters')}</h3>
                  {active === 'base' ? (
                    <CustomRgbBaseParameters
                      config={config}
                      isWin68={isWin68}
                      effectiveBaseBrightness={effectiveBaseBrightness}
                      customBase={customBase}
                      waveBase={waveBase}
                      mode={mode}
                      baseHex={baseHex}
                      disabled={disabled}
                      onPatchBase={base}
                      onPatchAnimation={animation}
                    />
                  ) : (
                    layer &&
                    metadata && (
                      <CustomRgbLayerParameters
                        layer={layer}
                        metadata={metadata}
                        detailText={definition?.detail ?? ''}
                        layerHex={layerHex}
                        disabled={disabled}
                        live={live}
                        onPatchLayer={patchLayer}
                        onMoveAuroraToBase={moveAuroraToBase}
                      />
                    )
                  )}
                  <SavedRgbPresetsSection
                    presets={savedPresets}
                    disabled={disabled}
                    onApply={onApplySavedPreset}
                    onDelete={onDeleteSavedPreset}
                  />
                  {active === 'base' && !customBase && (
                    <details className="service-details">
                      <summary>{tr('Advanced')}</summary>
                      <div>
                        <button
                          className="secondary-button"
                          disabled={disabled}
                          onClick={() =>
                            onChange({
                              ...value,
                              keys: {
                                ...config.base
                              }
                            })
                          }
                        >
                          {tr('Use base on keyboard')}
                        </button>
                        <p>
                          {tr(
                            'Stages the base for Save. Custom layers remain in your local preset.'
                          )}
                        </p>
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
          <CustomRgbServiceDetails
            isWin68={isWin68}
            xsydConnected={xsydConnected}
            live={live}
            synced={synced}
            demo={demo}
            status={status}
            onSetup={onSetup}
            onRefreshService={() => void refreshRgbService()}
          />
        </section>
      </div>
      {locked && (
        <CustomRgbLockOverlay
          checking={checking}
          onSetup={onSetup}
          onTryDemo={() => previewDemo(true)}
          onRefreshService={() => void refreshRgbService()}
        />
      )}
    </div>
  );
}
