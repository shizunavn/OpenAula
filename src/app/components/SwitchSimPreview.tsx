import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import type { SwitchOption } from '../switchAssets';
import { TRAVEL, SwitchSim, SwitchView, loadImage, resolveSwitchSimConfig } from '../switchSim';
import { SwitchStemMenuIcon } from './SwitchStemMenuIcon';

export interface SwitchSimPreviewProps {
  selectedSwitch: SwitchOption;
  switchProfileMixed: boolean;
  hasSelection?: boolean;
  actuation: number;
  actuationMixed?: boolean;
  deadzoneEnabled?: boolean;
  deadzoneEnabledMixed?: boolean;
  topDeadzone?: number;
  topDeadzoneMixed?: boolean;
  bottomDeadzone?: number;
  bottomDeadzoneMixed?: boolean;
  externalTravelMm?: number;
  externalActive?: boolean;
  showSwitchName?: boolean;
}

export function SwitchSimPreview({
  selectedSwitch,
  switchProfileMixed,
  hasSelection = true,
  actuation,
  actuationMixed = false,
  deadzoneEnabled = false,
  deadzoneEnabledMixed = false,
  topDeadzone = 0,
  topDeadzoneMixed = false,
  bottomDeadzone = 0,
  bottomDeadzoneMixed = false,
  externalTravelMm,
  externalActive = false,
  showSwitchName = false
}: SwitchSimPreviewProps) {
  const { tr } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<SwitchSim | null>(null);
  const viewRef = useRef<SwitchView | null>(null);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const maxTravel = selectedSwitch.travelMm ?? TRAVEL;

  // Track which slider (actuation, topDeadzone, or bottomDeadzone) was most recently adjusted,
  // and keep the switch stem held at that position after the slider is released.
  const activeTargetSourceRef = useRef<'actuation' | 'topDeadzone' | 'bottomDeadzone'>('actuation');
  const prevValuesRef = useRef({
    actuation,
    topDeadzone,
    bottomDeadzone
  });

  if (prevValuesRef.current.actuation !== actuation) {
    prevValuesRef.current.actuation = actuation;
    activeTargetSourceRef.current = 'actuation';
  } else if (prevValuesRef.current.topDeadzone !== topDeadzone) {
    prevValuesRef.current.topDeadzone = topDeadzone;
    activeTargetSourceRef.current = 'topDeadzone';
  } else if (prevValuesRef.current.bottomDeadzone !== bottomDeadzone) {
    prevValuesRef.current.bottomDeadzone = bottomDeadzone;
    activeTargetSourceRef.current = 'bottomDeadzone';
  }

  // Compute target travel (mm) to hold based on current selection & mixed states
  let heldTargetMm = -1;
  if (externalActive && typeof externalTravelMm === 'number') {
    heldTargetMm = externalTravelMm <= 0.005 ? -1 : Math.min(maxTravel, externalTravelMm);
  } else if (!hasSelection) {
    heldTargetMm = -1;
  } else if (activeTargetSourceRef.current === 'topDeadzone') {
    if (!deadzoneEnabled || deadzoneEnabledMixed || topDeadzoneMixed) {
      heldTargetMm = -1;
    } else {
      heldTargetMm = topDeadzone <= 0.005 ? -1 : Math.min(maxTravel, topDeadzone);
    }
  } else if (activeTargetSourceRef.current === 'bottomDeadzone') {
    if (!deadzoneEnabled || deadzoneEnabledMixed || bottomDeadzoneMixed) {
      heldTargetMm = -1;
    } else {
      const botDepth = Math.max(0, maxTravel - bottomDeadzone);
      heldTargetMm = botDepth <= 0.005 ? -1 : Math.min(maxTravel, botDepth);
    }
  } else {
    // 'actuation'
    if (actuationMixed) {
      heldTargetMm = -1;
    } else {
      heldTargetMm = actuation <= 0.005 ? -1 : Math.min(maxTravel, actuation);
    }
  }

  const targetRef = useRef({ heldTargetMm, maxTravel });
  targetRef.current = { heldTargetMm, maxTravel };

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    const canvas = canvasRef.current;
    if (!canvas || !selectedSwitch.front) {
      setReady(false);
      setFailed(true);
      return;
    }

    setReady(false);
    setFailed(false);

    loadImage(selectedSwitch.front)
      .then(img => {
        if (cancelled || !canvasRef.current) return;
        const cfg = resolveSwitchSimConfig(selectedSwitch, img.naturalWidth);
        const view = new SwitchView(img, cfg, canvasRef.current);
        const sim = new SwitchSim({
          ...cfg.phys,
          T: selectedSwitch.travelMm ?? TRAVEL
        });
        viewRef.current?.dispose();
        viewRef.current = view;
        simRef.current = sim;

        const initialTarget = targetRef.current.heldTargetMm;
        if (initialTarget > 0) {
          sim.x = initialTarget;
          sim.target = initialTarget;
        }
        view.draw(sim.x, 0);
        setReady(true);

        let lastTime = performance.now();
        const loop = (now: number) => {
          if (cancelled) return;
          const dt = Math.min((now - lastTime) / 1000, 0.05);
          lastTime = now;

          const cur = targetRef.current;
          sim.T = cur.maxTravel;
          if (cur.heldTargetMm <= 0) {
            sim.release();
          } else {
            sim.drag(cur.heldTargetMm);
          }

          sim.update(dt);
          view.draw(sim.x, sim.rz);

          rafId = requestAnimationFrame(loop);
        };

        rafId = requestAnimationFrame(loop);
      })
      .catch(() => {
        if (!cancelled) {
          setReady(false);
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      viewRef.current?.dispose();
      viewRef.current = null;
      simRef.current = null;
    };
  }, [selectedSwitch.id, selectedSwitch.front, selectedSwitch.travelMm]);

  const isMixedVisual = switchProfileMixed || (hasSelection && actuationMixed);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`switch-sim-canvas ${ready ? 'is-ready' : ''} ${isMixedVisual ? 'is-mixed' : ''}`}
        aria-hidden="true"
      />
      {!ready && !failed && selectedSwitch.front && (
        <img
          src={selectedSwitch.front}
          alt={`${selectedSwitch.name} switch`}
          className={isMixedVisual ? 'is-mixed' : undefined}
        />
      )}
      {(failed || !selectedSwitch.front) && <SwitchStemMenuIcon />}
      {showSwitchName && (
        <span>{switchProfileMixed ? tr('Mixed switch profiles') : selectedSwitch.name}</span>
      )}
    </>
  );
}
