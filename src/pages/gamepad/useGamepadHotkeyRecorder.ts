import { useEffect, useRef, useState } from 'react';
import {
  GamepadToggleTracker,
  isToggleModifier,
  normalizeToggleKeybind,
  type GamepadConfiguration
} from '../../keyboard/gamepad';
import { WINDOWS_SCANS } from '../../keyboard/windowsScans';

export function useGamepadHotkeyRecorder({
  config,
  disabled,
  locked,
  profileBusy,
  statusEnabled,
  busy,
  onPatch,
  onToggleHotkey
}: {
  config: GamepadConfiguration;
  disabled: boolean;
  locked: boolean;
  profileBusy: boolean;
  statusEnabled: boolean | undefined;
  busy: boolean;
  onPatch: (next: Partial<GamepadConfiguration>) => void;
  onToggleHotkey: (nextEnabled: boolean) => void;
}) {
  const [recordingKeybind, setRecordingKeybind] = useState(false);
  const [pendingKeybind, setPendingKeybind] = useState<string[]>([]);
  const toggleTracker = useRef(new GamepadToggleTracker());

  useEffect(() => {
    if (locked || profileBusy) {
      setRecordingKeybind(false);
      setPendingKeybind([]);
    }
  }, [locked, profileBusy]);

  useEffect(() => {
    if (!recordingKeybind) {
      return;
    }
    if (disabled) {
      setRecordingKeybind(false);
      setPendingKeybind([]);
      return;
    }
    let currentPending: string[] = [];
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && currentPending.length === 0) {
        event.preventDefault();
        event.stopPropagation();
        setRecordingKeybind(false);
        setPendingKeybind([]);
        return;
      }
      if (WINDOWS_SCANS[event.code] === undefined) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!currentPending.includes(event.code) && currentPending.length < 4) {
        currentPending = normalizeToggleKeybind([...currentPending, event.code]);
        setPendingKeybind(currentPending);
      }
      if (!isToggleModifier(event.code)) {
        onPatch({ toggleKeybind: currentPending });
        setRecordingKeybind(false);
        setPendingKeybind([]);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (WINDOWS_SCANS[event.code] === undefined) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (currentPending.length > 0) {
        onPatch({ toggleKeybind: currentPending });
        setRecordingKeybind(false);
        setPendingKeybind([]);
      }
    };

    const cancel = () => {
      setRecordingKeybind(false);
      setPendingKeybind([]);
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancel();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [recordingKeybind, disabled]);

  useEffect(() => {
    toggleTracker.current.reset();
    if (recordingKeybind || locked || !config.toggleKeybind?.length) {
      return;
    }
    const isEditable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditable(event.target)) {
        return;
      }
      if (toggleTracker.current.event(event.code, true, config.toggleKeybind)) {
        event.preventDefault();
        onToggleHotkey(!statusEnabled);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      toggleTracker.current.event(event.code, false, config.toggleKeybind);
    };

    const onBlur = () => toggleTracker.current.reset();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [recordingKeybind, locked, config, statusEnabled, busy, profileBusy]);

  return {
    recordingKeybind,
    setRecordingKeybind,
    pendingKeybind,
    setPendingKeybind
  };
}
