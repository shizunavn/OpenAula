import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Lightbulb,
  Sparkles,
  Waves,
  Palette,
  RotateCcw,
  ArrowLeftRight,
  Save,
  Trash2
} from 'lucide-react';
import CustomRgbEditor from './CustomRgbEditor';
import RhythmSyncEditor from './RhythmSyncEditor';
import Hero68Preview from './Hero68Preview';
import RgbColorPicker from './RgbColorPicker';
import RgbKeyPaintTools from './RgbKeyPaintTools';
import { RgbPreviewPanel, RgbToolbarSlot, RgbWorkspace } from './RgbWorkspace';
import { UndoRedoButtons, useUndoRedoState } from '../app/components/UndoRedoButtons';
import { FirmwareRgbPreview } from '../keyboard/rgbPreview';
import { XsydFirmwareRgbPreview } from '../keyboard/xsydRgbPreview';
import { useCustomRgbPlayback } from './useCustomRgbPlayback';
import { HERO68_KEY_IDS } from '../keyboard/hero68Layout';
import { isWin68HeMaxModel, type HeroDeviceModelId } from '../keyboard/devices';
import { heroLayout } from '../keyboard/layout';
import { acceptsRgbPreviewKey } from '../keyboard/rgbPreviewInput';
import { BRAND } from '../brand';
import { rgbPreviewDarkReason } from '../keyboard/rgbPreviewDefaults';
import {
  isWin68PerKeyMode,
  mergedKeyRgbModesForModel,
  SIDE_RGB_MODES,
  WIN68_KEY_RGB_MODES
} from '../keyboard/rgbCatalog';
import {
  isPerKeyRgbMode,
  normalizeGamingPresetMode,
  resolvePresetColors
} from '../keyboard/gamingPresets';
import { publishLightingFrame, type LightingFrame } from '../keyboard/lightingPreviewBus';
import type { RgbColor, RgbProfile, RgbZone } from '../protocol/hero68/rgb';
import type { AdvancedBinding } from '../protocol/hero68/advanced';
import {
  buildXsydPerKeyWriteFrame,
  buildXsydRgbWriteFrame,
  closestXsydColorSlot,
  normalizeXsydBrightness,
  saveXsydSavedRgb,
  XSYD_COLOR_SLOTS,
  XSYD_DEFAULT_PALETTE_RGB,
  XSYD_MAX_BRIGHTNESS,
  xsydDeviceManager,
  xsydRgbForColorIndex
} from '../protocol/xsyd/device';
import { keyValueForCode } from '../protocol/xsyd/features';
import { stopXsydRhythm, useXsydRhythmStats } from '../protocol/serviceLighting';
import './RgbSettingsPage.css';
import { useI18n } from '../i18n';
import { TachyonContext } from '../app/TachyonContext';
import { DeviceModelContext } from '../app/DeviceModelContext';
import { useRgbServiceState } from '../protocol/rgbServiceState';
const colorHex = (color: RgbColor) =>
  '#' + color.map(v => v.toString(16).padStart(2, '0')).join('');
const hexColor = (hex: string): RgbColor =>
  [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as RgbColor;
export type RgbTab = 'onboard' | 'custom' | 'rhythm';
const SAVED_RGB_PRESETS_KEY = `${BRAND.storagePrefix}:saved-rgb-presets:v1`;
export type SavedRgbPresetItem = {
  id: string;
  name: string;
  profile: RgbProfile;
};
export function loadSavedRgbPresets(): SavedRgbPresetItem[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_RGB_PRESETS_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter(item => item && item.id && item.name && item.profile)
      : [];
  } catch {
    return [];
  }
}
export function persistSavedRgbPresets(list: SavedRgbPresetItem[]): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(SAVED_RGB_PRESETS_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors
  }
}
function previousRgbTab(): RgbTab {
  try {
    const tab = sessionStorage.getItem(`${BRAND.storagePrefix}:rgb-tab`);
    return tab === 'custom' || tab === 'rhythm' ? tab : 'onboard';
  } catch {
    return 'onboard';
  }
}
type RgbSettingsProps = {
  value: RgbProfile;
  onChange: (value: RgbProfile) => void;
  busy: boolean;
  advancedBindings: AdvancedBinding[];
  onSetup: () => void;
  initialCustom?: boolean;
  onEntered?: () => void;
  slot?: number;
  onTabChange?: (tab: RgbTab) => void;
  model?: HeroDeviceModelId;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
};
export default function RgbSettingsPage(props: RgbSettingsProps) {
  const tachyon = useContext(TachyonContext);
  const { tr } = useI18n();
  if (tachyon) {
    return (
      <div className="page settings-page rgb-settings-page page-enter">
        <div className="settings-hero">
          <div>
            <h1>{tr('RGB Settings')}</h1>
            <p>{tr('RGB is paused while Tachyon Mode is enabled.')}</p>
          </div>
          <span className="rgb-basic-badge">{tr('Tachyon Mode')}</span>
        </div>
        <div className="rgb-preview-stage">
          <Hero68Preview selectedKeys={new Set()} onToggleKey={() => {}} selectionEnabled={false} />
        </div>
        <section className="settings-card">
          <h2>{tr('Brightness')} · 0%</h2>
          <p>
            {tr(
              'Key and side lighting, Custom Effects and Rhythm Sync are off. Turn off Tachyon Mode to use RGB again.'
            )}
          </p>
        </section>
      </div>
    );
  }
  return <ActiveRgbSettingsPage {...props} />;
}
function ActiveRgbSettingsPage({
  value,
  onChange,
  busy,
  advancedBindings,
  onSetup,
  initialCustom = false,
  onEntered,
  slot = 0,
  onTabChange,
  model: modelProp,
  canUndo,
  canRedo,
  onUndo,
  onRedo
}: RgbSettingsProps) {
  const { tr } = useI18n();
  const contextModel = useContext(DeviceModelContext);
  const model = modelProp ?? contextModel;
  const isWin68 = isWin68HeMaxModel(model);
  const modelKeyIds = useMemo(
    () => (isWin68 ? heroLayout(model).keyIds : HERO68_KEY_IDS),
    [isWin68, model]
  );
  useEffect(() => {
    onEntered?.();
  }, []);
  const [zone, setZone] = useState<'keys' | 'side'>('keys');
  const activeZone: 'keys' | 'side' = isWin68 ? 'keys' : zone;
  const [selected, setSelected] = useState(new Set<string>());
  const [paint, setPaint] = useState('#ffd95a');
  const [replay, setReplay] = useState(0);
  const [savedPresets, setSavedPresets] = useState<SavedRgbPresetItem[]>(() =>
    loadSavedRgbPresets()
  );
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [frame, setFrame] = useState<{
    keys: LightingFrame;
    side: string[];
  }>({
    keys: {},
    side: Array(18).fill('#35393b')
  });
  const [error, setError] = useState<string | null>(null);
  const { status } = useRgbServiceState();
  const xsydRhythmStats = useXsydRhythmStats();
  const [tab, setTab] = useState<RgbTab>(() => {
    if (initialCustom) {
      return 'custom';
    }
    if (xsydRhythmStats.active) {
      return 'rhythm';
    }
    if (status?.mode === 'rhythm' || status?.mode === 'custom' || status?.mode === 'onboard') {
      return status.mode;
    }
    return previousRgbTab();
  });
  const customMode = tab === 'custom';
  const rhythmMode = tab === 'rhythm';
  const [rhythmVisited, setRhythmVisited] = useState(rhythmMode);
  useEffect(() => {
    if (rhythmMode) {
      setRhythmVisited(true);
    }
  }, [rhythmMode]);
  useEffect(() => {
    try {
      sessionStorage.setItem(`${BRAND.storagePrefix}:rgb-tab`, tab);
    } catch {}
  }, [tab]);
  useEffect(() => {
    onTabChange?.(tab);
  }, [tab, onTabChange]);
  const playback = useCustomRgbPlayback(value, onChange, onSetup, slot, tab === 'custom');
  const engineRef = useRef<FirmwareRgbPreview | XsydFirmwareRgbPreview | null>(null);
  const replayRef = useRef(replay);
  const internalEditRef = useRef(false);
  const mountedRef = useRef(false);
  const releases = useRef<
    {
      at: number;
      id: string;
    }[]
  >([]);
  const effects = activeZone === 'keys' ? mergedKeyRgbModesForModel(isWin68) : SIDE_RGB_MODES;
  const config = value[activeZone];
  const capability = effects.find(mode => mode.id === config.mode);
  // Native WIN68 modes carry their own direction flag; borrowed HERO68 modes
  // (`100 + id`) only inherit the reverse-free HERO68 capability.
  const win68Capability: { reverse?: boolean } | undefined = isWin68
    ? config.mode <= 26
      ? WIN68_KEY_RGB_MODES.find(mode => mode.id === config.mode)
      : undefined
    : undefined;
  const perKey = isWin68
    ? activeZone === 'keys' && isWin68PerKeyMode(config.mode)
    : activeZone === 'keys' && (config.mode === 19 || (config.mode >= 221 && config.mode <= 226));
  const brightnessMax = isWin68 ? XSYD_MAX_BRIGHTNESS : activeZone === 'side' ? 4 : 20;
  const effectiveBrightness = isWin68
    ? normalizeXsydBrightness(config.brightness)
    : config.brightness;
  const darkReason = rgbPreviewDarkReason(
    isWin68 ? { ...config, brightness: effectiveBrightness } : config,
    activeZone === 'side',
    isWin68
  );
  const activeColorIndex = config.mix
    ? 0
    : config.colorIndex && config.colorIndex >= 1 && config.colorIndex <= 7
      ? config.colorIndex
      : closestXsydColorSlot(config.rgb);
  const paletteSlots =
    config.palette && config.palette.length === 7
      ? config.palette
      : XSYD_DEFAULT_PALETTE_RGB.map(c => [...c] as RgbColor);
  const activeSingleRgb: RgbColor =
    !config.mix && config.colorIndex && config.colorIndex >= 1 && config.colorIndex <= 7
      ? xsydRgbForColorIndex(config.colorIndex, paletteSlots)
      : config.rgb;
  const activeHex = colorHex(activeSingleRgb);
  const [hexInput, setHexInput] = useState(() => activeHex.toUpperCase());
  useEffect(() => {
    setHexInput(activeHex.toUpperCase());
  }, [activeHex]);

  function pushWin68LiveZone(nextZone: RgbZone) {
    if (
      !isWin68 ||
      !xsydDeviceManager.connected ||
      customMode ||
      playback.applied ||
      xsydRhythmStats.active
    ) {
      return;
    }
    void xsydDeviceManager.request(buildXsydRgbWriteFrame(nextZone)).catch(() => {});
  }

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (internalEditRef.current) {
      internalEditRef.current = false;
      return;
    }
    if (isWin68) {
      saveXsydSavedRgb(slot, value);
      pushWin68LiveZone(value[activeZone]);
    }
  }, [value]);

  const localHistory = useUndoRedoState(
    value,
    next => {
      onChange(next);
      if (isWin68) {
        saveXsydSavedRgb(slot, next);
        pushWin68LiveZone(next[activeZone]);
      }
    },
    slot
  );
  const hasExternalUndoRedo = Boolean(onUndo && onRedo);
  const effectiveCanUndo = hasExternalUndoRedo ? Boolean(canUndo) : localHistory.canUndo;
  const effectiveCanRedo = hasExternalUndoRedo ? Boolean(canRedo) : localHistory.canRedo;
  const handleUndo = () => {
    if (hasExternalUndoRedo) {
      onUndo?.();
    } else {
      localHistory.undo();
    }
  };
  const handleRedo = () => {
    if (hasExternalUndoRedo) {
      onRedo?.();
    } else {
      localHistory.redo();
    }
  };

  function change(patch: Partial<RgbZone>) {
    const nextMix = patch.mix !== undefined ? patch.mix : config.mix;
    const nextRgb = patch.rgb ?? config.rgb;
    const nextColorIndex =
      patch.colorIndex !== undefined
        ? patch.colorIndex
        : patch.mix !== undefined
          ? patch.mix
            ? 0
            : config.colorIndex && config.colorIndex >= 1 && config.colorIndex <= 7
              ? config.colorIndex
              : closestXsydColorSlot(nextRgb)
          : config.colorIndex;
    const nextZone: RgbZone = {
      ...config,
      ...(isWin68 ? { brightness: effectiveBrightness } : {}),
      ...patch,
      mix: nextMix,
      ...(nextColorIndex !== undefined ? { colorIndex: nextColorIndex } : {}),
      ...(patch.mix !== undefined || patch.rgb !== undefined
        ? {
            mixValue: undefined
          }
        : {})
    };
    let nextColors = value.colors;
    let nextPresetColors = value.presetColors ? { ...value.presetColors } : undefined;
    if (patch.mode !== undefined && activeZone === 'keys') {
      const prevMode = config.mode;
      const prevCanonical = normalizeGamingPresetMode(prevMode);
      const nextCanonical = normalizeGamingPresetMode(patch.mode);
      nextPresetColors = {
        ...(value.presetColors ?? {}),
        ...(value.custom?.presetColors ?? {})
      };
      if (isPerKeyRgbMode(prevMode, isWin68)) {
        nextPresetColors[prevCanonical] = { ...value.colors };
      }
      if (isPerKeyRgbMode(patch.mode, isWin68)) {
        nextColors = resolvePresetColors(patch.mode, value.colors, nextPresetColors, modelKeyIds);
        nextPresetColors[nextCanonical] = { ...nextColors };
      }
    }
    const nextProfile: RgbProfile = {
      ...value,
      [activeZone]: nextZone,
      ...(nextPresetColors ? { presetColors: nextPresetColors } : {}),
      ...(nextColors !== value.colors ? { colors: nextColors } : {}),
      ...(value.custom && nextPresetColors
        ? {
            custom: {
              ...value.custom,
              presetColors: nextPresetColors,
              base: {
                ...value.custom.base,
                mode: patch.mode !== undefined ? patch.mode : value.custom.base.mode
              }
            }
          }
        : {})
    };
    internalEditRef.current = true;
    onChange(nextProfile);
    if (isWin68) {
      saveXsydSavedRgb(slot, nextProfile);
      pushWin68LiveZone(nextZone);
    }
  }

  function applyCustomColor(rawHex: string) {
    const normalized = '#' + rawHex.replace('#', '').toLowerCase();
    const rgbTuple = hexColor(normalized);
    const targetSlot =
      !config.mix && activeColorIndex >= 1 && activeColorIndex <= 7
        ? activeColorIndex
        : closestXsydColorSlot(rgbTuple);
    const nextPalette = paletteSlots.map((c, idx) =>
      idx === targetSlot - 1 ? rgbTuple : ([...c] as RgbColor)
    );
    change({
      mix: false,
      colorIndex: targetSlot,
      rgb: rgbTuple,
      palette: nextPalette
    });
  }

  function handleSaveRgbPreset() {
    const presetName = `${capability?.name ?? 'RGB'} #${savedPresets.length + 1}`;
    const item: SavedRgbPresetItem = {
      id: `rgb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: presetName,
      profile: structuredClone(value)
    };
    const nextList = [item, ...savedPresets].slice(0, 12);
    setSavedPresets(nextList);
    persistSavedRgbPresets(nextList);
    if (isWin68) {
      saveXsydSavedRgb(slot, value);
      pushWin68LiveZone(value.keys);
    }
    setSavedNotice(tr('Saved'));
    if (typeof window !== 'undefined' && window.setTimeout) {
      window.setTimeout(() => setSavedNotice(null), 1600);
    }
  }

  function handleApplySavedPreset(item: SavedRgbPresetItem) {
    const nextProfile = structuredClone(item.profile);
    internalEditRef.current = true;
    onChange(nextProfile);
    if (isWin68) {
      saveXsydSavedRgb(slot, nextProfile);
      pushWin68LiveZone(nextProfile.keys);
    }
  }

  function handleDeleteSavedPreset(id: string) {
    const nextList = savedPresets.filter(item => item.id !== id);
    setSavedPresets(nextList);
    persistSavedRgbPresets(nextList);
  }

  useEffect(() => {
    if (customMode || rhythmMode) {
      return;
    }
    let handle = 0;
    let elapsed = 0;
    let previous = 0;
    let eventIndex = 0;
    let disposed = false;
    let sampleOffset = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const keyIds = isWin68 ? heroLayout(model).keyIds : HERO68_KEY_IDS;
    const events = keyIds
      .slice(17, 22)
      .flatMap((id, i) => [
        {
          at: 150 + i * 140,
          id,
          pressed: true
        },
        {
          at: 350 + i * 140,
          id,
          pressed: false
        }
      ])
      .sort((a, b) => a.at - b.at);
    setError(null);
    releases.current = [];
    try {
      const reused = isWin68
        ? engineRef.current instanceof XsydFirmwareRgbPreview && replayRef.current === replay
        : engineRef.current instanceof FirmwareRgbPreview && replayRef.current === replay;
      const engine = reused
        ? engineRef.current!
        : isWin68
          ? new XsydFirmwareRgbPreview(value)
          : new FirmwareRgbPreview(value);
      const held = new Set<string>();
      engine.configure(value);
      engineRef.current = engine;
      replayRef.current = replay;
      // Advance by 110ms on every configuration update so re-initialized firmware
      // effects and Multicolor toggles render their new colors immediately.
      elapsed = engine.ticks * 0.5 + 110;
      engine.advance(elapsed);
      const initialFrame = engine.frame();
      setFrame(initialFrame);
      if (Object.values(initialFrame.keys).some(c => c !== '#000000')) {
        publishLightingFrame(initialFrame.keys);
      }
      for (const event of events) {
        event.at += elapsed;
      }
      const cycleStart = elapsed;
      const repeatSamples = capability?.reactive;
      if (reduced.matches) {
        for (const event of events) {
          engine.advance(event.at);
          engine.event(event.id, event.pressed);
        }
        elapsed = events.at(-1)!.at + 25;
        engine.advance(elapsed);
        const nextRendered = engine.frame();
        setFrame(nextRendered);
        if (Object.values(nextRendered.keys).some(c => c !== '#000000')) {
          publishLightingFrame(nextRendered.keys);
        }
        eventIndex = events.length;
      }
      function render(now: number) {
        if (disposed || document.hidden || reduced.matches) {
          previous = 0;
          return;
        }
        elapsed += previous ? Math.min(now - previous, 100) : 0;
        previous = now;
        try {
          if (
            repeatSamples &&
            eventIndex === events.length &&
            elapsed >= cycleStart + sampleOffset + 3000
          ) {
            sampleOffset += 3000;
            eventIndex = 0;
          }
          while (eventIndex < events.length && events[eventIndex].at + sampleOffset <= elapsed) {
            const event = events[eventIndex++];
            engine.advance(event.at + sampleOffset);
            engine.event(event.id, event.pressed);
          }
          while (releases.current.length && releases.current[0].at <= elapsed) {
            const event = releases.current.shift()!;
            engine.advance(event.at);
            engine.event(event.id, false);
          }
          engine.advance(elapsed);
          const nextRendered = engine.frame();
          setFrame(nextRendered);
          if (Object.values(nextRendered.keys).some(c => c !== '#000000')) {
            publishLightingFrame(nextRendered.keys);
          }
          handle = requestAnimationFrame(render);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
      const keydown = (event: KeyboardEvent) => {
        if (!acceptsRgbPreviewKey(event) || document.hidden) {
          return;
        }
        held.add(event.code);
        engine.event(event.code, true);
        elapsed = Math.max(elapsed, engine.ticks * 0.5 + (reduced.matches ? 25 : 1));
        engine.advance(elapsed);
        setFrame(engine.frame());
      };
      const keyup = (event: KeyboardEvent) => {
        if (held.delete(event.code)) {
          engine.event(event.code, false);
        }
      };
      const blur = () => {
        for (const id of held) {
          engine.event(id, false);
        }
        held.clear();
      };
      const resume = () => {
        cancelAnimationFrame(handle);
        previous = 0;
        if (document.hidden) {
          blur();
        } else if (!reduced.matches) {
          handle = requestAnimationFrame(render);
        }
      };
      window.addEventListener('keydown', keydown);
      window.addEventListener('keyup', keyup);
      window.addEventListener('blur', blur);
      document.addEventListener('visibilitychange', resume);
      reduced.addEventListener('change', resume);
      resume();
      return () => {
        disposed = true;
        cancelAnimationFrame(handle);
        blur();
        for (const event of releases.current) {
          engine.event(event.id, false);
        }
        window.removeEventListener('keydown', keydown);
        window.removeEventListener('keyup', keyup);
        window.removeEventListener('blur', blur);
        document.removeEventListener('visibilitychange', resume);
        reduced.removeEventListener('change', resume);
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [value, replay, customMode, rhythmMode, isWin68, model]);
  function toggle(id: string) {
    if (perKey) {
      setSelected(previous => {
        const next = new Set(previous);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    } else {
      const engine = engineRef.current;
      if (engine) {
        engine.event(id, true);
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          engine.advance(engine.ticks * 0.5 + 50);
          setFrame(engine.frame());
          engine.event(id, false);
        } else {
          releases.current.push({
            at: engine.ticks * 0.5 + 150,
            id
          });
        }
      }
    }
  }
  const customActive = playback.applied || Boolean(status?.enabled && status.mode === 'custom');
  const rhythmActive =
    xsydRhythmStats.active || Boolean(status?.enabled && status.mode === 'rhythm');
  const matchesPresetColor =
    !config.mix &&
    XSYD_COLOR_SLOTS.slice(1).some(
      s => s.index === activeColorIndex && colorHex(s.rgb).toLowerCase() === activeHex.toLowerCase()
    );
  return (
    <RgbWorkspace
      tab={tab}
      onTab={setTab}
      disabled={busy || playback.busy}
      output={customActive ? 'custom' : rhythmActive ? 'rhythm' : 'onboard'}
    >
      {(rhythmMode || rhythmVisited) && (
        <RhythmSyncEditor
          onSetup={onSetup}
          visible={rhythmMode}
          advancedBindings={advancedBindings}
          onboardProfile={value}
        />
      )}
      <CustomRgbEditor
        value={value}
        onChange={onChange}
        busy={busy}
        advancedBindings={advancedBindings}
        visible={customMode}
        onSetup={onSetup}
        playback={playback}
        savedPresets={savedPresets}
        onSaveRgbPreset={handleSaveRgbPreset}
        onApplySavedPreset={handleApplySavedPreset}
        onDeleteSavedPreset={handleDeleteSavedPreset}
        savedNotice={savedNotice}
        slot={slot}
        canUndo={effectiveCanUndo}
        canRedo={effectiveCanRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        enableUndoShortcuts={!hasExternalUndoRedo}
      />
      {!customMode && !rhythmMode && (
        <>
          <RgbToolbarSlot>
            <UndoRedoButtons
              canUndo={effectiveCanUndo}
              canRedo={effectiveCanRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
              disabled={busy || playback.busy}
              enableShortcuts={!hasExternalUndoRedo}
            />
            {(status?.enabled || playback.applied || xsydRhythmStats.active) && (
              <button
                className="apply-button"
                disabled={busy || playback.busy}
                onClick={() => {
                  if (xsydRhythmStats.active) {
                    void stopXsydRhythm(value);
                  }
                  if (status?.enabled || playback.applied) {
                    void playback.onboard();
                  }
                }}
              >
                {tr('Use onboard lighting')}
              </button>
            )}
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={handleSaveRgbPreset}
            >
              <Save size={15} /> {savedNotice ?? tr('Save')}
            </button>
          </RgbToolbarSlot>
          <RgbToolbarSlot notice>
            {playback.error && (
              <p className="stream-error" role="alert">
                {tr(playback.error)}
              </p>
            )}
          </RgbToolbarSlot>
          <RgbPreviewPanel
            source={tr('Draft preview')}
            hint={
              perKey
                ? tr('Select keys on the preview to paint.')
                : tr('Onboard changes use Save to profile.')
            }
            actions={
              capability?.reactive ? (
                <button className="secondary-button" onClick={() => setReplay(x => x + 1)}>
                  <RotateCcw size={15} /> {tr('Try effect')}
                </button>
              ) : undefined
            }
            footer={
              perKey && (
                <RgbKeyPaintTools
                  selected={selected}
                  onSelect={setSelected}
                  color={paint}
                  onColor={setPaint}
                  disabled={busy}
                  onPaint={() => {
                    const colors = {
                      ...value.colors
                    };
                    const rgbTuple = hexColor(paint);
                    for (const id of selected) {
                      colors[id] = rgbTuple;
                      if (isWin68 && xsydDeviceManager.connected) {
                        const kv = keyValueForCode(id);
                        if (kv !== undefined) {
                          void xsydDeviceManager
                            .request(buildXsydPerKeyWriteFrame(kv, rgbTuple))
                            .catch(() => {});
                        }
                      }
                    }
                    const currentCanonical = normalizeGamingPresetMode(config.mode);
                    const nextPresetColors: Record<number, Record<string, RgbColor>> = {
                      ...(value.presetColors ?? {}),
                      ...(value.custom?.presetColors ?? {}),
                      [currentCanonical]: { ...colors }
                    };
                    const nextProfile: RgbProfile = {
                      ...value,
                      colors,
                      presetColors: nextPresetColors,
                      ...(value.custom
                        ? {
                            custom: {
                              ...value.custom,
                              presetColors: nextPresetColors
                            }
                          }
                        : {})
                    };
                    internalEditRef.current = true;
                    onChange(nextProfile);
                    if (isWin68) {
                      saveXsydSavedRgb(slot, nextProfile);
                    }
                  }}
                />
              )
            }
          >
            <Hero68Preview
              advancedBindings={advancedBindings}
              showAdvancedIcons={false}
              selectedKeys={perKey ? selected : new Set()}
              onToggleKey={toggle}
              onSelectKeys={setSelected}
              lightingFrame={frame.keys}
              lightingSource="local"
              selectionEnabled={perKey}
            />
            {!isWin68 && (
              <div className="rgb-side-preview" aria-label={tr('18 side light positions')}>
                {frame.side.map((color, i) => (
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
          <div className="rgb-editor-layout">
            <aside className="settings-card rgb-effect-library">
              {!isWin68 ? (
                <div className="rgb-zone-tabs" role="group" aria-label={tr('Lighting zone')}>
                  {(['keys', 'side'] as const).map(id => (
                    <button key={id} aria-pressed={zone === id} onClick={() => setZone(id)}>
                      {id === 'keys' ? tr('Keys') : tr('Side Light')}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rgb-section-heading">
                  <h2>{tr('WIN 68 HE MAX Effects')}</h2>
                  <span>
                    {effects.length} {tr('effects stored on your keyboard')}
                  </span>
                </div>
              )}
              {!isWin68 && <h2>{tr('Choose effect')}</h2>}
              <div className="rgb-mode-grid">
                {effects.map((mode, i) => {
                  const Icon = [Lightbulb, Waves, Sparkles, Palette][i % 4];
                  return (
                    <button
                      key={mode.id}
                      disabled={busy}
                      className={config.mode === mode.id ? 'active' : ''}
                      aria-pressed={config.mode === mode.id}
                      onClick={() =>
                        change({
                          mode: mode.id
                        })
                      }
                    >
                      <Icon size={16} />
                      <span>{tr(mode.name)}</span>
                    </button>
                  );
                })}
              </div>
            </aside>
            <section className="settings-card rgb-basic-card">
              <div className="rgb-section-heading">
                <h2>{tr(capability?.name ?? 'Unrecognized onboard mode')}</h2>
                <span>
                  {isWin68
                    ? `XSYD Mode 0x${config.mode.toString(16).padStart(2, '0').toUpperCase()}`
                    : activeZone === 'keys'
                      ? tr('Key lighting')
                      : tr('Side lighting')}
                </span>
              </div>
              {!capability && (
                <p className="rgb-inline-note">
                  {tr('Unrecognized onboard mode')} {config.mode}.{' '}
                  {tr('It is preserved until you select another effect.')}
                </p>
              )}
              {darkReason && (
                <div className="rgb-dark-preview-note" role="status">
                  <span>
                    {tr('Lighting is dark')} · {darkReason}
                  </span>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() =>
                      change({
                        mix: true,
                        colorIndex: 0,
                        brightness: effectiveBrightness || brightnessMax
                      })
                    }
                  >
                    {tr('Use Multicolor')}
                  </button>
                </div>
              )}
              <div className="rgb-parameters">
                <label>
                  {tr('Brightness')}{' '}
                  <strong>
                    {effectiveBrightness <= brightnessMax
                      ? `${effectiveBrightness * (isWin68 || activeZone === 'side' ? 25 : 5)}%`
                      : tr('Unknown ({value})', {
                          value: config.brightness
                        })}
                  </strong>
                  <input
                    aria-label={tr('RGB brightness')}
                    type="range"
                    min="0"
                    max={brightnessMax}
                    value={Math.min(effectiveBrightness, brightnessMax)}
                    disabled={busy || !capability || (!isWin68 && config.mode === 0)}
                    onChange={e =>
                      change({
                        brightness: Number(e.target.value)
                      })
                    }
                  />
                </label>
                {capability?.speed && (
                  <label>
                    {tr('Speed')} <strong>{config.speed + 1} / 5</strong>
                    <input
                      aria-label={tr('RGB speed')}
                      type="range"
                      min="0"
                      max="4"
                      value={config.speed}
                      disabled={busy}
                      onChange={e =>
                        change({
                          speed: Number(e.target.value)
                        })
                      }
                    />
                  </label>
                )}
                {win68Capability?.reverse && (
                  <div className="rgb-reverse-row">
                    <label className="rgb-reverse-toggle">
                      <span className="rgb-reverse-label">
                        <ArrowLeftRight size={15} />
                        <span>{tr('Reverse direction')}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(config.reverse)}
                        disabled={busy}
                        onChange={e => change({ reverse: e.target.checked })}
                      />
                    </label>
                  </div>
                )}
                {capability?.color && (
                  <div className="rgb-color-controls">
                    <div className="rgb-color-header">
                      <span className="rgb-color-label">{tr('Color')}</span>
                      <div
                        className={`rgb-custom-color-box ${!config.mix ? (matchesPresetColor ? 'is-active' : 'is-custom-active') : 'is-multicolor'}`}
                      >
                        <label className="rgb-color-picker-trigger" title={tr('Effect color')}>
                          <RgbColorPicker
                            label={tr('Effect color')}
                            value={activeHex}
                            disabled={busy}
                            onChange={applyCustomColor}
                          />
                        </label>
                        <input
                          type="text"
                          className="rgb-color-hex-input"
                          aria-label="HEX color"
                          value={hexInput}
                          maxLength={7}
                          spellCheck={false}
                          disabled={busy}
                          onChange={e => {
                            const next = e.target.value;
                            setHexInput(next);
                            if (/^#?[0-9a-f]{6}$/i.test(next)) {
                              applyCustomColor(next);
                            }
                          }}
                          onBlur={() => setHexInput(activeHex.toUpperCase())}
                        />
                      </div>
                    </div>
                    <div className="rgb-swatch-grid" role="group" aria-label={tr('Color slot')}>
                      {XSYD_COLOR_SLOTS.map(slotInfo => {
                        const isMulticolor = slotInfo.index === 0;
                        const presetHex = colorHex(slotInfo.rgb);
                        const selectedSlot = isMulticolor
                          ? Boolean(config.mix)
                          : !config.mix &&
                            activeColorIndex === slotInfo.index &&
                            activeHex.toLowerCase() === presetHex.toLowerCase();
                        return (
                          <button
                            key={slotInfo.index}
                            type="button"
                            className={`rgb-swatch-chip ${isMulticolor ? 'is-multicolor' : ''}`}
                            disabled={busy}
                            aria-pressed={selectedSlot}
                            title={tr(slotInfo.name)}
                            onClick={() => {
                              if (isMulticolor) {
                                change({ mix: true, colorIndex: 0 });
                              } else {
                                const presetRgb: RgbColor = [...slotInfo.rgb] as RgbColor;
                                const nextPalette = paletteSlots.map((c, idx) =>
                                  idx === slotInfo.index - 1 ? presetRgb : ([...c] as RgbColor)
                                );
                                change({
                                  mix: false,
                                  colorIndex: slotInfo.index,
                                  rgb: presetRgb,
                                  palette: nextPalette
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
                  </div>
                )}
              </div>
              {savedPresets.length > 0 && (
                <div className="rgb-saved-presets">
                  <h3>{tr('Saved')} RGB</h3>
                  <div className="rgb-zone-tabs" role="group" aria-label="Saved RGB">
                    {savedPresets.map(item => (
                      <div
                        key={item.id}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleApplySavedPreset(item)}
                        >
                          {item.name}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Delete ${item.name}`}
                          onClick={() => handleDeleteSavedPreset(item.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {capability?.reactive && (
                <p className="rgb-inline-note">
                  {tr(
                    'Preview only · sample key presses repeat automatically. Click or type to try your own keys.'
                  )}
                </p>
              )}
              {!isWin68 && config.brightness > brightnessMax && (
                <p className="rgb-inline-note">
                  {tr(
                    'This draft has an unrecognized brightness value. Choose a supported level before saving this zone.'
                  )}
                </p>
              )}
              {error && (
                <p className="stream-error">
                  {tr('Preview unavailable')}: {error}
                </p>
              )}
              <details className="service-details">
                <summary>{tr('Details')}</summary>
                <p>
                  {isWin68
                    ? tr(
                        'Preview uses WIN 68 HE MAX firmware v1.1.4 (XSYD 0x18 / 0x2A) integer RGB & HSV calculations.'
                      )
                    : tr(
                        'Preview uses firmware V3.20 RGB calculations. Screen colors may differ from the LEDs.'
                      )}
                </p>
              </details>
            </section>
          </div>
        </>
      )}
    </RgbWorkspace>
  );
}
