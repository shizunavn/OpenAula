import { useContext, useEffect, useRef, useState } from 'react';
import { Lightbulb, Sparkles, Waves, Palette, RotateCcw, ArrowLeftRight } from 'lucide-react';
import CustomRgbEditor from './CustomRgbEditor';
import RhythmSyncEditor from './RhythmSyncEditor';
import Hero68Preview from './Hero68Preview';
import RgbColorPicker from './RgbColorPicker';
import RgbKeyPaintTools from './RgbKeyPaintTools';
import { RgbPreviewPanel, RgbToolbarSlot, RgbWorkspace } from './RgbWorkspace';
import { FirmwareRgbPreview } from "../keyboard/rgbPreview";
import { XsydFirmwareRgbPreview } from '../keyboard/xsydRgbPreview';
import { useCustomRgbPlayback } from './useCustomRgbPlayback';
import { HERO68_KEY_IDS } from '../keyboard/hero68Layout';
import { isWin68HeMaxModel, type HeroDeviceModelId } from '../keyboard/devices';
import { heroLayout } from '../keyboard/layout';
import { acceptsRgbPreviewKey } from '../keyboard/rgbPreviewInput';
import { BRAND } from '../brand';
import { rgbPreviewDarkReason } from '../keyboard/rgbPreviewDefaults';
import { isWin68PerKeyMode, KEY_RGB_MODES, SIDE_RGB_MODES, WIN68_KEY_RGB_MODES } from '../keyboard/rgbCatalog';
import type { LightingFrame } from '../keyboard/lightingPreviewBus';
import type { RgbColor, RgbProfile, RgbZone } from '../protocol/hero68/rgb';
import type { AdvancedBinding } from '../protocol/hero68/advanced';
import {
  normalizeXsydBrightness,
  XSYD_COLOR_SLOTS,
  XSYD_DEFAULT_PALETTE_RGB,
  XSYD_MAX_BRIGHTNESS,
  xsydColorIndexForZone,
  xsydRgbForColorIndex,
} from '../protocol/xsyd/rgb';
import './RgbSettingsPage.css';
import { useI18n } from '../i18n';
import { TachyonContext } from '../app/TachyonContext';
import { DeviceModelContext } from '../app/DeviceModelContext';
import { useRgbServiceState } from '../protocol/rgbServiceState';
const colorHex = (color: RgbColor) => '#' + color.map(v => v.toString(16).padStart(2, '0')).join('');
const hexColor = (hex: string): RgbColor => ([1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as RgbColor);
export type RgbTab = 'onboard' | 'custom' | 'rhythm';
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
  activeTab?: RgbTab;
  model?: HeroDeviceModelId;
};
export default function RgbSettingsPage(props: RgbSettingsProps) {
  const tachyon = useContext(TachyonContext);
  const {
    tr
  } = useI18n();
  if (tachyon) {
    return <div className="page settings-page rgb-settings-page page-enter">
    <div className="settings-hero">
        <div>
          <h1>{tr('RGB Settings')}</h1>
          <p>{tr('RGB is paused while Tachyon Mode is enabled.')}</p>
        </div>
        <span className="rgb-basic-badge">{tr('Tachyon Mode')}</span>
      </div>
    <div className="rgb-preview-stage"><Hero68Preview selectedKeys={new Set()} onToggleKey={() => {}} selectionEnabled={false} /></div>
    <section className="settings-card">
        <h2>{tr('Brightness')} · 0%</h2>
        <p>{tr('Key and side lighting, Custom Effects and Rhythm Sync are off. Turn off Tachyon Mode to use RGB again.')}</p>
      </section>
  </div>;
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
  activeTab,
  model: modelProp
}: RgbSettingsProps) {
  const {
    tr
  } = useI18n();
  const contextModel = useContext(DeviceModelContext);
  const model = modelProp ?? contextModel;
  const isWin68 = isWin68HeMaxModel(model);
  useEffect(() => {
    onEntered?.();
  }, []);
  const [zone, setZone] = useState<'keys' | 'side'>('keys');
  const activeZone: 'keys' | 'side' = isWin68 ? 'keys' : zone;
  const [selected, setSelected] = useState(new Set<string>());
  const [paint, setPaint] = useState('#ffd95a');
  const [replay, setReplay] = useState(0);
  const [frame, setFrame] = useState<{
    keys: LightingFrame;
    side: string[];
  }>({
    keys: {},
    side: Array(18).fill('#35393b')
  });
  const [error, setError] = useState<string | null>(null);
  const {
    status
  } = useRgbServiceState();
  const [tab, setTab] = useState<RgbTab>(() => {
    if (initialCustom) {
      return 'custom';
    }
    if (status?.mode === 'rhythm' || status?.mode === 'custom' || status?.mode === 'onboard') {
      return status.mode;
    }
    return previousRgbTab();
  });
  // ActiveRgbTab (AppShell) and this tab drive the same editor. Following it keeps
  // the editor visible when the sidebar switches tabs, and publishing ours back
  // tells the shell which editor the preview output belongs to.
  useEffect(() => {
    if (activeTab && activeTab !== tab) {
      setTab(activeTab);
    }
  }, [activeTab]);
  useEffect(() => {
    if (activeTab !== tab) {
      onTabChange?.(tab);
    }
  }, [tab]);
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
    } catch {
}
  }, [tab]);
  const playback = useCustomRgbPlayback(value, onChange, onSetup, slot, tab === 'custom');
  const engineRef = useRef<FirmwareRgbPreview | XsydFirmwareRgbPreview | null>(null);
  const replayRef = useRef(replay);
  const releases = useRef<{
    at: number;
    id: string;
  }[]>([]);
  const effects = isWin68 ? WIN68_KEY_RGB_MODES : activeZone === 'keys' ? KEY_RGB_MODES : SIDE_RGB_MODES;
  const config = value[activeZone];
  const capability = effects.find(mode => mode.id === config.mode);
  const win68Capability = isWin68 ? WIN68_KEY_RGB_MODES.find(mode => mode.id === config.mode) : undefined;
  const perKey = isWin68
    ? activeZone === 'keys' && isWin68PerKeyMode(config.mode)
    : activeZone === 'keys' && config.mode === 19;
  const brightnessMax = isWin68 ? XSYD_MAX_BRIGHTNESS : activeZone === 'side' ? 4 : 20;
  const effectiveBrightness = isWin68 ? normalizeXsydBrightness(config.brightness) : config.brightness;
  const darkReason = rgbPreviewDarkReason(
    isWin68 ? { ...config, brightness: effectiveBrightness } : config,
    activeZone === 'side',
    isWin68
  );
  const activeColorIndex = isWin68 ? xsydColorIndexForZone(config) : config.mix ? 0 : 1;
  const win68Palette = isWin68
    ? (config.palette && config.palette.length === 7
        ? config.palette
        : XSYD_DEFAULT_PALETTE_RGB.map(c => [...c] as RgbColor))
    : [];

  function change(patch: Partial<RgbZone>) {
    onChange({
      ...value,
      [activeZone]: {
        ...config,
        ...(isWin68 ? { brightness: effectiveBrightness } : {}),
        ...patch,
        ...(patch.mix !== undefined || patch.rgb !== undefined ? {
          mixValue: undefined
        } : {})
      }
    });
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
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const keyIds = isWin68 ? heroLayout(model).keyIds : HERO68_KEY_IDS;
    const events = keyIds.slice(17, 22).flatMap((id, i) => [{
      at: 150 + i * 140,
      id,
      pressed: true
    }, {
      at: 350 + i * 140,
      id,
      pressed: false
    }]).sort((a, b) => a.at - b.at);
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
      // A paused/reduced-motion preview still needs a newly generated frame,
      // rather than displaying the previous Single-color frame after MIX changes.
      elapsed = engine.ticks * 0.5 + (!reused || document.hidden || reduced.matches ? 110 : 0.5);
      engine.advance(elapsed);
      setFrame(engine.frame());
      for (const event of events) {
        event.at += elapsed;
      }
      const cycleStart = elapsed;
      const repeatSamples = isWin68
        ? WIN68_KEY_RGB_MODES.find(m => m.id === value.keys.mode)?.reactive
        : KEY_RGB_MODES[value.keys.mode]?.reactive;
      if (reduced.matches) {
        for (const event of events) {
          engine.advance(event.at);
          engine.event(event.id, event.pressed);
        }
        elapsed = events.at(-1)!.at + 25;
        engine.advance(elapsed);
        setFrame(engine.frame());
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
          if (repeatSamples && eventIndex === events.length && elapsed >= cycleStart + sampleOffset + 3000) {
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
          setFrame(engine.frame());
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
        elapsed = Math.max(elapsed, engine.ticks * .5 + (reduced.matches ? 25 : 1));
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
      document.addEventListener("visibilitychange", resume);
      reduced.addEventListener("change", resume);
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
        document.removeEventListener("visibilitychange", resume);
        reduced.removeEventListener("change", resume);
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
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
  const rhythmActive = Boolean(status?.enabled && status.mode === 'rhythm');
  return <RgbWorkspace tab={tab} onTab={setTab} disabled={busy || playback.busy} output={customActive ? 'custom' : rhythmActive ? 'rhythm' : 'onboard'}>
    {(rhythmMode || rhythmVisited) && <RhythmSyncEditor onSetup={onSetup} visible={rhythmMode} advancedBindings={advancedBindings} />}
    <CustomRgbEditor value={value} onChange={onChange} busy={busy} advancedBindings={advancedBindings} visible={customMode} onSetup={onSetup} playback={playback} />
    {!customMode && !rhythmMode && <>
    <RgbToolbarSlot>{(status?.enabled || playback.applied) && <button className="apply-button" disabled={busy || playback.busy} onClick={() => void playback.onboard()}>{tr('Use onboard lighting')}</button>}</RgbToolbarSlot>
    <RgbToolbarSlot notice>{playback.error && <p className="stream-error" role="alert">{tr(playback.error)}</p>}</RgbToolbarSlot>
    <RgbPreviewPanel source={tr('Draft preview')} hint={perKey ? tr('Select keys on the preview to paint.') : tr('Onboard changes use Save to profile.')} actions={capability?.reactive ? <button className="secondary-button" onClick={() => setReplay(x => x + 1)}><RotateCcw size={15} /> {tr('Try effect')}</button> : undefined} footer={perKey && <RgbKeyPaintTools selected={selected} onSelect={setSelected} color={paint} onColor={setPaint} disabled={busy} onPaint={() => {
        const colors = {
          ...value.colors
        };
        for (const id of selected) {
          colors[id] = hexColor(paint);
        }
        onChange({
          ...value,
          colors
        });
      }} />}>
      <Hero68Preview advancedBindings={advancedBindings} showAdvancedIcons={false} selectedKeys={perKey ? selected : new Set()} onToggleKey={toggle} lightingFrame={frame.keys} lightingSource="local" selectionEnabled={perKey} />
      {!isWin68 && <div className="rgb-side-preview" aria-label={tr('18 side light positions')}>{frame.side.map((color, i) => <span key={i} style={{
            background: color,
            color
          }} />)}</div>}
    </RgbPreviewPanel>
    <div className="rgb-editor-layout">
    <aside className="settings-card rgb-effect-library">
      {!isWin68 ? (
        <div className="rgb-zone-tabs" role="group" aria-label={tr('Lighting zone')}>{(['keys', 'side'] as const).map(id => <button key={id} aria-pressed={zone === id} onClick={() => setZone(id)}>{id === 'keys' ? tr('Keys') : tr('Side Light')}</button>)}</div>
      ) : (
        <div className="rgb-section-heading">
          <h2>{tr('WIN 68 HE MAX Effects')}</h2>
          <span>27 {tr('effects stored on your keyboard')}</span>
        </div>
      )}
      {!isWin68 && <h2>{tr('Choose effect')}</h2>}
      <div className="rgb-mode-grid">{effects.map((mode, i) => {
              const Icon = [Lightbulb, Waves, Sparkles, Palette][i % 4];
              return <button key={mode.id} disabled={busy} className={config.mode === mode.id ? 'active' : ''} aria-pressed={config.mode === mode.id} onClick={() => change({
                mode: mode.id
              })}><Icon size={16} /><span>{tr(mode.name)}</span></button>;
            })}</div>
    </aside>
    <section className="settings-card rgb-basic-card">
      <div className="rgb-section-heading">
            <h2>{tr(capability?.name ?? 'Unrecognized onboard mode')}</h2>
            <span>{isWin68 ? `XSYD Mode 0x${config.mode.toString(16).padStart(2, '0').toUpperCase()}` : activeZone === 'keys' ? tr('Key lighting') : tr('Side lighting')}</span>
          </div>
      {!capability && <p className="rgb-inline-note">{tr('Unrecognized onboard mode')} {config.mode}. {tr('It is preserved until you select another effect.')}</p>}
      {darkReason && <div className="rgb-dark-preview-note" role="status">
            <span>{tr('Lighting is dark')} · {darkReason}</span>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => change({
              mix: true,
              colorIndex: isWin68 ? 0 : undefined,
              brightness: effectiveBrightness || brightnessMax
            })}>{tr('Use Multicolor')}</button>
          </div>}
      <div className="rgb-parameters">
        <label>{tr('Brightness')} <strong>{effectiveBrightness <= brightnessMax ? `${effectiveBrightness * (isWin68 || activeZone === 'side' ? 25 : 5)}%` : tr('Unknown ({value})', {
                  value: config.brightness
                })}</strong><input aria-label={tr('RGB brightness')} type="range" min="0" max={brightnessMax} value={Math.min(effectiveBrightness, brightnessMax)} disabled={busy || !capability || (!isWin68 && config.mode === 0)} onChange={e => change({
                brightness: Number(e.target.value)
              })} /></label>
        {capability?.speed && <label>{tr('Speed')} <strong>{config.speed + 1} / 5</strong><input aria-label={tr('RGB speed')} type="range" min="0" max="4" value={config.speed} disabled={busy} onChange={e => change({
                speed: Number(e.target.value)
              })} /></label>}
        {isWin68 && win68Capability?.reverse && (
          <div className="rgb-color-controls">
            <label className="rgb-mix">
              <input
                type="checkbox"
                checked={Boolean(config.reverse)}
                disabled={busy}
                onChange={e => change({ reverse: e.target.checked })}
              />
              <ArrowLeftRight size={15} /> {tr('Reverse direction')}
            </label>
          </div>
        )}
        {capability?.color && !isWin68 && <div className="rgb-color-controls">
              <div className="rgb-active-color">{config.mix ? <span className="rgb-rainbow-swatch" aria-label={tr('Multicolor palette')} /> : <><label>{tr('Color')}<RgbColorPicker label={tr('Effect color')} value={colorHex(config.rgb)} disabled={busy} onChange={hex => change({
                      rgb: hexColor(hex)
                    })} /></label><span>{colorHex(config.rgb).toUpperCase()}</span></>}</div>
              <label className="rgb-mix"><input type="checkbox" checked={config.mix} disabled={busy} onChange={e => change({
                  mix: e.target.checked
                })} /> {tr('Multicolor')}</label>
            </div>}
        {capability?.color && isWin68 && (
          <div className="rgb-color-controls">
            <div className="rgb-active-color">
              {activeColorIndex === 0 ? (
                <span className="rgb-rainbow-swatch" aria-label={tr('Multicolor palette')} />
              ) : (
                <>
                  <label>
                    {tr('Color')}
                    <RgbColorPicker
                      label={tr('Effect color')}
                      value={colorHex(xsydRgbForColorIndex(activeColorIndex, win68Palette))}
                      disabled={busy}
                      onChange={hex => {
                        const rgbTuple = hexColor(hex);
                        const nextPalette = win68Palette.map((c, idx) =>
                          idx === activeColorIndex - 1 ? rgbTuple : ([...c] as RgbColor)
                        );
                        change({
                          mix: false,
                          colorIndex: activeColorIndex,
                          rgb: rgbTuple,
                          palette: nextPalette,
                        });
                      }}
                    />
                  </label>
                  <span>{colorHex(xsydRgbForColorIndex(activeColorIndex, win68Palette)).toUpperCase()}</span>
                </>
              )}
            </div>
            <div className="rgb-zone-tabs" role="group" aria-label={tr('Color slot')}>
              {XSYD_COLOR_SLOTS.map(slotInfo => {
                const selectedSlot = activeColorIndex === slotInfo.index;
                const slotRgb = slotInfo.index === 0
                  ? null
                  : xsydRgbForColorIndex(slotInfo.index, win68Palette);
                return (
                  <button
                    key={slotInfo.index}
                    type="button"
                    disabled={busy}
                    aria-pressed={selectedSlot}
                    title={tr(slotInfo.name)}
                    onClick={() => {
                      if (slotInfo.index === 0) {
                        change({ mix: true, colorIndex: 0 });
                      } else {
                        const nextRgb = xsydRgbForColorIndex(slotInfo.index, win68Palette);
                        change({
                          mix: false,
                          colorIndex: slotInfo.index,
                          rgb: nextRgb,
                        });
                      }
                    }}
                  >
                    {slotRgb ? (
                      <span
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: colorHex(slotRgb),
                          marginRight: 5,
                        }}
                      />
                    ) : null}
                    {tr(slotInfo.name)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {capability?.reactive && <p className="rgb-inline-note">{tr('Preview only · sample key presses repeat automatically. Click or type to try your own keys.')}</p>}
      {!isWin68 && config.brightness > brightnessMax && <p className="rgb-inline-note">{tr('This draft has an unrecognized brightness value. Choose a supported level before saving this zone.')}</p>}
      {error && <p className="stream-error">{tr('Preview unavailable')}: {error}</p>}
      <details className="service-details">
            <summary>{tr('Details')}</summary>
            <p>{isWin68
              ? tr('Preview uses WIN 68 HE MAX firmware v1.1.4 (XSYD 0x18 / 0x2A) integer RGB & HSV calculations.')
              : tr('Preview uses firmware V3.20 RGB calculations. Screen colors may differ from the LEDs.')}</p>
          </details>
    </section>
    </div>
    </>}
  </RgbWorkspace>;
}