import { useEffect, useMemo, useState } from 'react';
import {
  HERO68_HALL_VISUAL_MAX_MM,
  hero68HallStream,
  type Hero68HallStreamState
} from '../../protocol/hero68/hallStream';
export type UseHallStreamViewModelOptions = {
  hallStream: Hero68HallStreamState;
  modelKeyIds: readonly string[];
  selectedKeys: Set<string>;
  actuation: number;
  actuationByKey: Record<string, number>;
  showAdvancedPages: boolean;
  activeRail: 'keyboard' | 'settings' | 'help';
  activePage: string;
  setActivePage: (page: string) => void;
  setDeviceActionError: (error: string | null) => void;
};
function blurActiveControl() {
  if (typeof document === 'undefined') {
    return;
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}
export function useHallStreamViewModel({
  hallStream,
  modelKeyIds,
  selectedKeys,
  actuation,
  actuationByKey,
  showAdvancedPages,
  activeRail,
  activePage,
  setActivePage,
  setDeviceActionError
}: UseHallStreamViewModelOptions) {
  const [hallStreamPinnedKeyId, setHallStreamPinnedKeyId] = useState<string | null>(null);
  const hallStreamPreviewByKey = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(hallStream.samples).map(([keyId, sample]) => [
          keyId,
          {
            distanceMm: sample.visualDistanceMm,
            rawAdc: sample.rawAdc,
            pressed: sample.pressed,
            releaseInferred: sample.releaseInferred
          }
        ])
      ) as Record<
        string,
        {
          distanceMm: number;
          rawAdc: number;
          pressed: boolean;
          releaseInferred: boolean;
        }
      >,
    [hallStream.samples]
  );
  const hallStreamActiveSamples = useMemo(
    () =>
      Object.values(hallStream.samples)
        .filter(sample => sample.pressed || sample.visualDistanceMm >= 0.05)
        .sort((a, b) => b.timestampMs - a.timestampMs),
    [hallStream.samples]
  );
  const hallStreamListKeyIds = hallStreamActiveSamples.map(sample => sample.keyId);
  const hallStreamPreviewSelection = useMemo(
    () => new Set(hallStreamPinnedKeyId ? [hallStreamPinnedKeyId] : []),
    [hallStreamPinnedKeyId]
  );
  const hallStreamFocusKeyId = hallStreamPinnedKeyId ?? hallStreamActiveSamples[0]?.keyId ?? null;
  const hallStreamFocusSample = hallStreamFocusKeyId
    ? hallStream.samples[hallStreamFocusKeyId]
    : undefined;
  const hallStreamFocusPercent = hallStreamFocusSample
    ? Math.max(
        0,
        Math.min(100, (hallStreamFocusSample.visualDistanceMm / HERO68_HALL_VISUAL_MAX_MM) * 100)
      )
    : 0;
  const actuationHallActiveSamples = useMemo(
    () => hallStreamActiveSamples.filter(sample => selectedKeys.has(sample.keyId)),
    [hallStreamActiveSamples, selectedKeys]
  );
  const actuationHallFocusKeyId =
    actuationHallActiveSamples[0]?.keyId ??
    (selectedKeys.size === 1 ? Array.from(selectedKeys)[0] : null);
  const actuationHallFocusSample = actuationHallFocusKeyId
    ? hallStream.samples[actuationHallFocusKeyId]
    : undefined;
  const actuationHallTravelMm = actuationHallFocusSample?.visualDistanceMm ?? 0;
  const actuationHallTravelPercent = Math.max(
    0,
    Math.min(100, (actuationHallTravelMm / HERO68_HALL_VISUAL_MAX_MM) * 100)
  );
  const actuationHallThresholdMm = actuationHallFocusKeyId
    ? (actuationByKey[actuationHallFocusKeyId] ?? actuation)
    : actuation;
  const actuationHallThresholdPercent = Math.max(
    0,
    Math.min(100, (actuationHallThresholdMm / HERO68_HALL_VISUAL_MAX_MM) * 100)
  );
  const actuationHallTriggered = Boolean(
    actuationHallFocusSample && actuationHallTravelMm >= actuationHallThresholdMm
  );
  useEffect(() => {
    if (!showAdvancedPages && ['stream', 'gamepad'].includes(activePage)) {
      setActivePage('quick');
    }
    if (
      (hallStream.active || hallStream.starting) &&
      (activeRail !== 'keyboard' || !['stream', 'actuation', 'gamepad'].includes(activePage))
    ) {
      void hero68HallStream.stop();
    }
    if (
      (hallStream.active || hallStream.starting) &&
      activeRail === 'keyboard' &&
      activePage === 'actuation' &&
      selectedKeys.size === 0
    ) {
      void hero68HallStream.stop();
    }
  }, [
    showAdvancedPages,
    activeRail,
    activePage,
    hallStream.active,
    hallStream.starting,
    selectedKeys.size,
    setActivePage
  ]);
  function toggleHallStreamPin(keyId: string) {
    setHallStreamPinnedKeyId(previous => (previous === keyId ? null : keyId));
  }
  async function toggleHallStream(preferredKeyIds: Iterable<string>) {
    blurActiveControl();
    setDeviceActionError(null);
    try {
      if (hallStream.active || hallStream.starting) {
        await hero68HallStream.stop();
        setHallStreamPinnedKeyId(null);
      } else {
        await hero68HallStream.start(preferredKeyIds, 'direct-poll', modelKeyIds);
      }
    } catch (error) {
      setDeviceActionError(error instanceof Error ? error.message : String(error));
    }
  }
  useEffect(() => {
    if (!hallStream.active || hallStream.starting || activeRail !== 'keyboard') {
      return;
    }
    const requested = hero68HallStream.getRequestedKeyIds();
    const desired =
      activePage === 'stream' ? [] : activePage === 'actuation' ? Array.from(selectedKeys) : null;
    if (desired === null) {
      return;
    }
    const same =
      requested.length === desired.length &&
      requested.every((keyId, index) => keyId === desired[index]);
    if (same) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await hero68HallStream.stop();
        if (!cancelled) {
          await hero68HallStream.start(desired, 'direct-poll', modelKeyIds);
        }
      } catch (error) {
        if (!cancelled) {
          setDeviceActionError(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activePage,
    activeRail,
    hallStream.active,
    hallStream.starting,
    modelKeyIds,
    selectedKeys,
    setDeviceActionError
  ]);
  async function handleHallStreamToggle() {
    await toggleHallStream([]);
  }
  async function handleActuationHallStreamToggle() {
    await toggleHallStream(selectedKeys);
  }
  return {
    hallStreamPinnedKeyId,
    setHallStreamPinnedKeyId,
    hallStreamPreviewByKey,
    hallStreamActiveSamples,
    hallStreamListKeyIds,
    hallStreamPreviewSelection,
    hallStreamFocusKeyId,
    hallStreamFocusSample,
    hallStreamFocusPercent,
    actuationHallFocusKeyId,
    actuationHallTravelMm,
    actuationHallTravelPercent,
    actuationHallThresholdMm,
    actuationHallThresholdPercent,
    actuationHallTriggered,
    toggleHallStreamPin,
    handleHallStreamToggle,
    handleActuationHallStreamToggle
  };
}
