import { lazy, useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import AdvancedKeysPage from './components/AdvancedKeysPage';
import KeyRemapPage from './components/KeyRemapPage';
import MacroPage from './components/MacroPage';
import MyProfilePage from './components/MyProfilePage';
import { heroDeviceModel, isWin68HeMaxModel, type HeroDeviceModelId } from './keyboard/devices';
import { GamepadToggleTracker } from './keyboard/gamepad';
import { heroLayout } from './keyboard/layout';
import { isBoardModelId } from './keyboard/registry';
import { gamepadService } from './protocol/gamepadService';
import { REMAP_LAYERS } from './protocol/hero68/remap';
import { hero68HallStream, useHero68HallStream } from './protocol/hero68/hallStream';
import { useHero68Device, type Hero68ConnectionState } from './protocol/hero68/webhid';
import { useXsydDevice } from './protocol/xsyd/device';
import type { PollingRate } from './protocol/hero68/types';
import { loadOpenHeroState } from './state/persistence';
import { I18nProvider } from './i18n';
import { AppShell } from './app/components/AppShell';
import { DeviceConnectionPanel } from './app/components/DeviceConnectionPanel';
import { DeviceFamilyContext, DeviceModelContext } from './app/DeviceModelContext';
import { TachyonContext } from './app/TachyonContext';
import { FACTORY_REMAP_LAYERS } from './app/helpers';
import { useDeviceSettings } from './app/hooks/useDeviceSettings';
import { useDeviceSyncController } from './app/hooks/useDeviceSyncController';
import { useHallStreamViewModel } from './app/hooks/useHallStreamViewModel';
import { useKeySelection } from './app/hooks/useKeySelection';
import { usePerKeyPerformance } from './app/hooks/usePerKeyPerformance';
import { useProfileWorkspace } from './app/hooks/useProfileWorkspace';
import { useUiPreferences } from './app/hooks/useUiPreferences';
import { ActuationPage } from './pages/ActuationPage';
import BackgroundServicePage from './pages/BackgroundServicePage';
import DiagnosticsPage from './pages/DiagnosticsPage';
import GamepadPage, { loadGamepadDraft } from './pages/GamepadPage';
import { GeneralSettingsPage } from './pages/GeneralSettingsPage';
import { HelpPage } from './pages/HelpPage';
import { InterfaceSettingsPage } from './pages/InterfaceSettingsPage';
import { QuickSettingsPage } from './pages/QuickSettingsPage';
import { RapidPage } from './pages/RapidPage';
import { RgbPage } from './pages/RgbPage';
import { StreamPage } from './pages/StreamPage';
import { SwitchSelectorPage } from './pages/SwitchSelectorPage';
const RgbSettingsPage = lazy(() => import('./components/RgbSettingsPage'));
function resolveInitialModel(savedModel: string | undefined): HeroDeviceModelId {
  if (savedModel && isBoardModelId(savedModel)) {
    return savedModel === 'win68' ? 'win68HeMax' : savedModel;
  }
  return 'hero68';
}
function App() {
  const persistedState = useMemo(() => loadOpenHeroState(), []);
  const hero68Device = useHero68Device();
  const xsydDevice = useXsydDevice();
  const hallStream = useHero68HallStream();
  const [deviceModel, setDeviceModel] = useState<HeroDeviceModelId>(() =>
    resolveInitialModel(persistedState?.deviceModel)
  );
  const activeDevice =
    xsydDevice.state === 'connected' ||
    xsydDevice.state === 'connecting' ||
    (isWin68HeMaxModel(deviceModel) && hero68Device.state !== 'connected')
      ? xsydDevice
      : hero68Device;
  const deviceConnectionState: Hero68ConnectionState = activeDevice.state;
  const selectedModel = useMemo(() => heroDeviceModel(deviceModel), [deviceModel]);
  const selectedLayout = useMemo(() => heroLayout(deviceModel), [deviceModel]);
  const modelKeyIds = selectedLayout.keyIds;
  const [tachyon, setTachyon] = useState(() => persistedState?.tachyon ?? false);
  const [tachyonPreviousPollingRate, setTachyonPreviousPollingRate] = useState<PollingRate | null>(
    () => persistedState?.tachyonPreviousPollingRate ?? null
  );
  const [rgbStreamActive, setRgbStreamActive] = useState(false);
  const ui = useUiPreferences(persistedState);
  const tr = ui.tr;
  const selection = useKeySelection({
    initialSelectedKeys: persistedState?.selectedKeys,
    initialKeyIds: heroLayout(resolveInitialModel(persistedState?.deviceModel)).keyIds,
    modelKeyIds,
    keyIdSet: selectedLayout.keyIdSet,
    onBeforeDiscardSelection: () => {
      if (
        ui.activeRail === 'keyboard' &&
        ui.activePage === 'actuation' &&
        (hallStream.active || hallStream.starting)
      ) {
        void hero68HallStream.stop();
      }
    }
  });
  const perf = usePerKeyPerformance({
    persistedState,
    modelKeyIds,
    selectedKeys: selection.selectedKeys,
    model: deviceModel
  });
  const workspace = useProfileWorkspace({
    persistedState,
    modelKeyIds
  });
  const deviceSettings = useDeviceSettings({
    persistedState,
    hallStream,
    rgbStreamActive,
    setRgbStreamActive,
    tachyon,
    setTachyon,
    tachyonPreviousPollingRate,
    setTachyonPreviousPollingRate
  });
  const hallVm = useHallStreamViewModel({
    hallStream,
    modelKeyIds,
    selectedKeys: selection.selectedKeys,
    actuation: perf.actuation,
    actuationByKey: perf.actuationByKey,
    showAdvancedPages: ui.showAdvancedPages,
    activeRail: ui.activeRail,
    activePage: ui.activePage,
    setActivePage: ui.setActivePage,
    setDeviceActionError: deviceSettings.setDeviceActionError
  });
  function selectDeviceModel(nextModel: HeroDeviceModelId) {
    if (nextModel === deviceModel) {
      return;
    }
    const nextKeyIds = heroLayout(nextModel).keyIds;
    setDeviceModel(nextModel);
    selection.normalizeForModel(nextKeyIds);
    hallVm.setHallStreamPinnedKeyId(previous =>
      previous && nextKeyIds.includes(previous) ? previous : null
    );
    perf.expandForModel(nextKeyIds);
    workspace.expandWorkspaceForModel(nextKeyIds);
  }
  const sync = useDeviceSyncController({
    deviceConnectionState,
    deviceModel,
    modelKeyIds,
    selectDeviceModel,
    hallStream,
    rgbStreamActive,
    setRgbStreamActive,
    activeRail: ui.activeRail,
    activePage: ui.activePage,
    activeSettingsPage: ui.activeSettingsPage,
    activeRgbTab: ui.activeRgbTab,
    selectedKeys: selection.selectedKeys,
    setSelectedKeys: selection.setSelectedKeys,
    actuation: perf.actuation,
    rapidTrigger: perf.rapidTrigger,
    splitSensitivity: perf.splitSensitivity,
    rapidSensitivity: perf.rapidSensitivity,
    pressSensitivity: perf.pressSensitivity,
    releaseSensitivity: perf.releaseSensitivity,
    deadzoneEnabled: perf.deadzoneEnabled,
    topDeadzone: perf.topDeadzone,
    bottomDeadzone: perf.bottomDeadzone,
    selectedSwitchId: perf.selectedSwitchId,
    assignedSwitchesByKey: perf.assignedSwitchesByKey,
    actuationByKey: perf.actuationByKey,
    rapidTriggerByKey: perf.rapidTriggerByKey,
    splitSensitivityByKey: perf.splitSensitivityByKey,
    rapidSensitivityByKey: perf.rapidSensitivityByKey,
    pressSensitivityByKey: perf.pressSensitivityByKey,
    releaseSensitivityByKey: perf.releaseSensitivityByKey,
    deadzoneEnabledByKey: perf.deadzoneEnabledByKey,
    topDeadzoneByKey: perf.topDeadzoneByKey,
    bottomDeadzoneByKey: perf.bottomDeadzoneByKey,
    dirtyKeys: perf.dirtyKeys,
    setDirtyKeys: perf.setDirtyKeys,
    restorePerformanceFromDraft: perf.restoreFromDraft,
    applyHydratedPerformance: perf.applyHydratedPerformance,
    tachyon,
    tachyonPreviousPollingRate,
    compactSidebar: ui.compactSidebar,
    showAdvancedPages: ui.showAdvancedPages,
    rememberSelection: ui.rememberSelection,
    languagePreference: ui.languagePreference,
    languageManuallySet: ui.languageManuallySet,
    languageRegionDetected: ui.languageRegionDetected,
    devicePollingRate: deviceSettings.devicePollingRate,
    deviceOsModeMac: deviceSettings.deviceOsModeMac,
    deviceWinLock: deviceSettings.deviceWinLock,
    deviceHallDebounce: deviceSettings.deviceHallDebounce,
    deviceAutoCalibration: deviceSettings.deviceAutoCalibration,
    switchSearch: ui.switchSearch,
    switchBrandFilter: ui.switchBrandFilter,
    profileSlot: workspace.profileSlot,
    setProfileSlot: workspace.setProfileSlot,
    loadedProfileSlot: workspace.loadedProfileSlot,
    setLoadedProfileSlot: workspace.setLoadedProfileSlot,
    profileNames: workspace.profileNames,
    setProfileNames: workspace.setProfileNames,
    profileDrafts: workspace.profileDrafts,
    setProfileDrafts: workspace.setProfileDrafts,
    profileBusyRef: workspace.profileBusyRef,
    setProfileBusy: workspace.setProfileBusy,
    saveState: workspace.saveState,
    setSaveState: workspace.setSaveState,
    remapLayers: workspace.remapLayers,
    setRemapLayers: workspace.setRemapLayers,
    dirtyRemaps: workspace.dirtyRemaps,
    setDirtyRemaps: workspace.setDirtyRemaps,
    remapBaselineRef: workspace.remapBaselineRef,
    rgb: workspace.rgb,
    setRgb: workspace.setRgb,
    rgbBaseline: workspace.rgbBaseline,
    setRgbBaseline: workspace.setRgbBaseline,
    rgbHydratedSlot: workspace.rgbHydratedSlot,
    setRgbHydratedSlot: workspace.setRgbHydratedSlot,
    rgbDirty: workspace.rgbDirty,
    rgbPending: workspace.rgbPending,
    advancedBindings: workspace.advancedBindings,
    setAdvancedBindings: workspace.setAdvancedBindings,
    advancedBaseline: workspace.advancedBaseline,
    setAdvancedBaseline: workspace.setAdvancedBaseline,
    advancedHydratedSlot: workspace.advancedHydratedSlot,
    setAdvancedHydratedSlot: workspace.setAdvancedHydratedSlot,
    advancedReadError: workspace.advancedReadError,
    setAdvancedReadError: workspace.setAdvancedReadError,
    advancedPending: workspace.advancedPending,
    restoreWorkspaceDraft: workspace.restoreWorkspaceDraft,
    setDeviceSettingsState: deviceSettings.setDeviceSettingsState,
    setDeviceReadState: deviceSettings.setDeviceReadState,
    setDeviceActionError: deviceSettings.setDeviceActionError,
    readDeviceGeneralSettings: deviceSettings.readDeviceGeneralSettings
  });
  useEffect(() => {
    if (ui.activeRail === 'keyboard' && ui.activePage === 'gamepad') {
      return;
    }
    if (workspace.profileBusy || tachyon) {
      return;
    }
    const tracker = new GamepadToggleTracker();
    const isEditable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
        Boolean(target.closest('.ak-physical-input, .ak-tester, .macro-record-controls')));
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target) || document.querySelector('.is-recording')) {
        return;
      }
      const draft = loadGamepadDraft(workspace.profileSlot);
      if (!draft.toggleKeybind?.length) {
        return;
      }
      if (tracker.event(e.code, true, draft.toggleKeybind)) {
        e.preventDefault();
        void gamepadService
          .toggle(workspace.profileSlot, draft, {
            source: 'hotkey'
          })
          .catch(error => {
            deviceSettings.setDeviceActionError(
              error instanceof Error ? error.message : String(error)
            );
          });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const draft = loadGamepadDraft(workspace.profileSlot);
      tracker.event(e.code, false, draft.toggleKeybind);
    };
    const onBlur = () => tracker.reset();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [
    ui.activeRail,
    ui.activePage,
    workspace.profileSlot,
    workspace.profileBusy,
    tachyon,
    deviceSettings.setDeviceActionError
  ]);
  const deviceConnected = deviceConnectionState === 'connected';
  const customRgbPending =
    JSON.stringify(workspace.rgb.custom ?? null) !==
    JSON.stringify(workspace.rgbBaseline.custom ?? null);
  const canSaveAll =
    deviceConnected &&
    workspace.loadedProfileSlot === workspace.profileSlot &&
    (perf.dirtyKeys.size > 0 ||
      workspace.dirtyRemaps.size > 0 ||
      workspace.rgbPending > 0 ||
      customRgbPending ||
      workspace.advancedPending);
  const devicePanel = (
    <DeviceConnectionPanel
      deviceConnectionState={deviceConnectionState}
      deviceModel={deviceModel}
      selectedModel={selectedModel}
      onSelectDeviceModel={selectDeviceModel}
      onConnectOrDisconnect={() => void sync.handleDeviceConnection()}
      profileSlot={workspace.profileSlot}
      onSelectProfileSlot={slot => void sync.selectOnboardProfile(slot)}
      onReadFromDevice={() => void sync.handleReadFromDevice()}
      profileBusy={workspace.profileBusy}
      deviceReadState={deviceSettings.deviceReadState}
      deviceActionError={deviceSettings.deviceActionError}
      deviceError={activeDevice.error}
      isXs={Boolean(
        activeDevice.isXs || (activeDevice.deviceName && /xs/i.test(activeDevice.deviceName))
      )}
    />
  );
  return (
    <I18nProvider language={ui.resolvedLanguage}>
      <DeviceFamilyContext.Provider value={isWin68HeMaxModel(deviceModel) ? 'win68HeMax' : 'hero'}>
        <DeviceModelContext.Provider value={deviceModel}>
          <TachyonContext.Provider value={tachyon}>
            <AppShell
              activeRail={ui.activeRail}
              onSelectRail={ui.setActiveRail}
              activePage={ui.activePage}
              onSelectPage={ui.setActivePage}
              activeSettingsPage={ui.activeSettingsPage}
              onSelectSettingsPage={ui.setActiveSettingsPage}
              compactSidebar={ui.compactSidebar}
              onToggleCompactSidebar={() => ui.setCompactSidebar(prev => !prev)}
              showAdvancedPages={ui.showAdvancedPages}
              devicePanel={devicePanel}
              profileSlot={workspace.profileSlot}
              profileNames={workspace.profileNames}
              onSelectProfileSlot={slot => void sync.selectOnboardProfile(slot)}
              activeRgbTab={ui.activeRgbTab}
              deviceConnected={deviceConnected}
              profileBusy={workspace.profileBusy}
              canSaveAll={canSaveAll}
              saveState={workspace.saveState}
              onSaveAll={() => void sync.handleSaveAll()}
              canUndo={sync.canUndo}
              canRedo={sync.canRedo}
              onUndo={sync.undoProfileChange}
              onRedo={sync.redoProfileChange}
            >
              {ui.activeRail === 'keyboard' ? (
                ui.activePage === 'profile' ? (
                  <MyProfilePage
                    model={deviceModel}
                    slot={workspace.profileSlot}
                    names={workspace.profileNames}
                    connected={deviceConnected}
                    loaded={workspace.loadedProfileSlot === workspace.profileSlot}
                    busy={workspace.profileBusy}
                    pending={
                      perf.dirtyKeys.size +
                      workspace.dirtyRemaps.size +
                      workspace.rgbPending +
                      Number(workspace.advancedPending)
                    }
                    rapidKeys={modelKeyIds.filter(keyId => perf.rapidTriggerByKey[keyId]).length}
                    remappedKeys={REMAP_LAYERS.reduce<number>(
                      (count, layer) =>
                        count +
                        modelKeyIds.filter(
                          keyId =>
                            workspace.remapLayers[layer][keyId] !==
                            FACTORY_REMAP_LAYERS[layer][keyId]
                        ).length,
                      0
                    )}
                    advancedKeys={workspace.advancedBindings.length}
                    onSelect={slot => void sync.selectOnboardProfile(slot)}
                    onRename={sync.renameProfile}
                    onExport={sync.exportProfile}
                    onRemap={() => ui.setActivePage('remap')}
                    onAdvanced={() => ui.setActivePage('advanced')}
                    onRefresh={() => void sync.handleReadFromDevice()}
                    onResetProfile={sync.resetProfileToDefaults}
                    onDiscardDraft={sync.discardProfileDraftChanges}
                  />
                ) : ui.activePage === 'macros' ? (
                  <MacroPage />
                ) : ui.activePage === 'remap' ? (
                  <KeyRemapPage
                    advancedBindings={workspace.advancedBindings}
                    key={workspace.profileSlot}
                    layers={workspace.remapLayers}
                    busy={workspace.profileBusy}
                    dirtyCount={workspace.dirtyRemaps.size}
                    canSave={
                      deviceConnected && workspace.loadedProfileSlot === workspace.profileSlot
                    }
                    onSave={() => void sync.handleSaveAll()}
                    onAssign={workspace.assignRemap}
                    onCopyLayer={workspace.copyRemapLayer}
                  />
                ) : ui.activePage === 'advanced' ? (
                  <>
                    {workspace.advancedReadError && (
                      <p className="ak-error" role="alert">
                        {tr(
                          'Advanced Keys could not be read: {error}. Read the profile again before saving these bindings.',
                          {
                            error: workspace.advancedReadError
                          }
                        )}
                      </p>
                    )}
                    <AdvancedKeysPage
                      key={workspace.profileSlot}
                      bindings={workspace.advancedBindings}
                      busy={workspace.profileBusy}
                      pending={workspace.advancedPending}
                      connected={
                        deviceConnected && workspace.loadedProfileSlot === workspace.profileSlot
                      }
                      onSave={() => void sync.handleSaveAll()}
                      onChange={next => {
                        if (!workspace.profileBusyRef.current) {
                          workspace.setAdvancedBindings(next);
                          workspace.setSaveState('idle');
                        }
                      }}
                    />
                  </>
                ) : ui.activePage === 'actuation' ? (
                  <ActuationPage
                    model={deviceModel}
                    actuationPreviewWidth={ui.actuationPreviewWidth}
                    advancedBindings={workspace.advancedBindings}
                    selectedKeys={selection.selectedKeys}
                    toggleKey={selection.toggleKey}
                    actuationByKey={perf.actuationByKey}
                    hallStreamPreviewByKey={hallVm.hallStreamPreviewByKey}
                    setActuationPreviewWidth={ui.setActuationPreviewWidth}
                    hasSelection={selection.hasSelection}
                    allSelected={selection.allSelected}
                    selectAll={selection.selectAll}
                    discardSelection={selection.discardSelection}
                    switchProfileMixed={perf.switchProfileMixed}
                    selectedSwitch={perf.selectedSwitch}
                    actuation={perf.actuation}
                    actuationMixed={perf.actuationMixed}
                    setActuationForSelection={perf.setActuationForSelection}
                    hallStream={hallStream}
                    deviceConnected={deviceConnected}
                    handleActuationHallStreamToggle={hallVm.handleActuationHallStreamToggle}
                    actuationHallTriggered={hallVm.actuationHallTriggered}
                    actuationHallFocusKeyId={hallVm.actuationHallFocusKeyId}
                    actuationHallTravelMm={hallVm.actuationHallTravelMm}
                    actuationHallTravelPercent={hallVm.actuationHallTravelPercent}
                    actuationHallThresholdPercent={hallVm.actuationHallThresholdPercent}
                    actuationHallThresholdMm={hallVm.actuationHallThresholdMm}
                  />
                ) : ui.activePage === 'rapid' ? (
                  <RapidPage
                    model={deviceModel}
                    advancedBindings={workspace.advancedBindings}
                    selectedKeys={selection.selectedKeys}
                    toggleKey={selection.toggleKey}
                    quickPreviewMode={ui.quickPreviewMode}
                    rapidPreviewByKey={perf.rapidPreviewByKey}
                    deadzonePreviewByKey={perf.deadzonePreviewByKey}
                    hasSelection={selection.hasSelection}
                    allSelected={selection.allSelected}
                    selectAll={selection.selectAll}
                    discardSelection={selection.discardSelection}
                    rapidTrigger={perf.rapidTrigger}
                    rapidTriggerMixed={perf.rapidTriggerMixed}
                    setRapidTriggerForSelection={perf.setRapidTriggerForSelection}
                    rapidTriggerControlsEnabled={perf.rapidTriggerControlsEnabled}
                    splitSensitivity={perf.splitSensitivity}
                    splitSensitivityMixed={perf.splitSensitivityMixed}
                    setSplitSensitivityForSelection={perf.setSplitSensitivityForSelection}
                    splitSensitivityControlsEnabled={perf.splitSensitivityControlsEnabled}
                    rapidSensitivity={perf.rapidSensitivity}
                    rapidSensitivityMixed={perf.rapidSensitivityMixed}
                    setRapidSensitivityForSelection={perf.setRapidSensitivityForSelection}
                    pressSensitivity={perf.pressSensitivity}
                    pressSensitivityMixed={perf.pressSensitivityMixed}
                    setPressSensitivityForSelection={perf.setPressSensitivityForSelection}
                    releaseSensitivity={perf.releaseSensitivity}
                    releaseSensitivityMixed={perf.releaseSensitivityMixed}
                    setReleaseSensitivityForSelection={perf.setReleaseSensitivityForSelection}
                    deadzoneEnabled={perf.deadzoneEnabled}
                    deadzoneEnabledMixed={perf.deadzoneEnabledMixed}
                    setDeadzoneEnabledForSelection={perf.setDeadzoneEnabledForSelection}
                    deadzoneControlsEnabled={perf.deadzoneControlsEnabled}
                    topDeadzone={perf.topDeadzone}
                    topDeadzoneMixed={perf.topDeadzoneMixed}
                    setTopDeadzoneForSelection={perf.setTopDeadzoneForSelection}
                    bottomDeadzone={perf.bottomDeadzone}
                    bottomDeadzoneMixed={perf.bottomDeadzoneMixed}
                    setBottomDeadzoneForSelection={perf.setBottomDeadzoneForSelection}
                    setQuickPreviewMode={ui.setQuickPreviewMode}
                    rapidTriggerByKey={perf.rapidTriggerByKey}
                  />
                ) : ui.activePage === 'quick' ? (
                  <QuickSettingsPage
                    model={deviceModel}
                    advancedBindings={workspace.advancedBindings}
                    selectedKeys={selection.selectedKeys}
                    toggleKey={selection.toggleKey}
                    quickPreviewMode={ui.quickPreviewMode}
                    actuationByKey={perf.actuationByKey}
                    rapidPreviewByKey={perf.rapidPreviewByKey}
                    deadzonePreviewByKey={perf.deadzonePreviewByKey}
                    hasSelection={selection.hasSelection}
                    allSelected={selection.allSelected}
                    selectAll={selection.selectAll}
                    discardSelection={selection.discardSelection}
                    selectedSwitch={perf.selectedSwitch}
                    switchProfileMixed={perf.switchProfileMixed}
                    actuation={perf.actuation}
                    actuationMixed={perf.actuationMixed}
                    setActuationForSelection={perf.setActuationForSelection}
                    rapidTrigger={perf.rapidTrigger}
                    rapidTriggerMixed={perf.rapidTriggerMixed}
                    setRapidTriggerForSelection={perf.setRapidTriggerForSelection}
                    rapidTriggerControlsEnabled={perf.rapidTriggerControlsEnabled}
                    splitSensitivity={perf.splitSensitivity}
                    splitSensitivityMixed={perf.splitSensitivityMixed}
                    setSplitSensitivityForSelection={perf.setSplitSensitivityForSelection}
                    splitSensitivityControlsEnabled={perf.splitSensitivityControlsEnabled}
                    rapidSensitivity={perf.rapidSensitivity}
                    rapidSensitivityMixed={perf.rapidSensitivityMixed}
                    setRapidSensitivityForSelection={perf.setRapidSensitivityForSelection}
                    pressSensitivity={perf.pressSensitivity}
                    pressSensitivityMixed={perf.pressSensitivityMixed}
                    setPressSensitivityForSelection={perf.setPressSensitivityForSelection}
                    releaseSensitivity={perf.releaseSensitivity}
                    releaseSensitivityMixed={perf.releaseSensitivityMixed}
                    setReleaseSensitivityForSelection={perf.setReleaseSensitivityForSelection}
                    deadzoneEnabled={perf.deadzoneEnabled}
                    deadzoneEnabledMixed={perf.deadzoneEnabledMixed}
                    setDeadzoneEnabledForSelection={perf.setDeadzoneEnabledForSelection}
                    deadzoneControlsEnabled={perf.deadzoneControlsEnabled}
                    topDeadzone={perf.topDeadzone}
                    topDeadzoneMixed={perf.topDeadzoneMixed}
                    setTopDeadzoneForSelection={perf.setTopDeadzoneForSelection}
                    bottomDeadzone={perf.bottomDeadzone}
                    bottomDeadzoneMixed={perf.bottomDeadzoneMixed}
                    setBottomDeadzoneForSelection={perf.setBottomDeadzoneForSelection}
                    tachyon={tachyon}
                    tachyonBusy={deviceSettings.tachyonBusy}
                    handleTachyonChange={deviceSettings.handleTachyonChange}
                    deviceConnected={deviceConnected}
                    setQuickPreviewMode={ui.setQuickPreviewMode}
                  />
                ) : ui.activePage === 'stream' ? (
                  <StreamPage
                    model={deviceModel}
                    hallStream={hallStream}
                    deviceConnected={deviceConnected}
                    handleHallStreamToggle={hallVm.handleHallStreamToggle}
                    advancedBindings={workspace.advancedBindings}
                    hallStreamPreviewSelection={hallVm.hallStreamPreviewSelection}
                    toggleHallStreamPin={hallVm.toggleHallStreamPin}
                    hallStreamPreviewByKey={hallVm.hallStreamPreviewByKey}
                    hallStreamPinnedKeyId={hallVm.hallStreamPinnedKeyId}
                    hallStreamFocusKeyId={hallVm.hallStreamFocusKeyId}
                    hallStreamFocusSample={hallVm.hallStreamFocusSample}
                    hallStreamFocusPercent={hallVm.hallStreamFocusPercent}
                    hallStreamActiveSamples={hallVm.hallStreamActiveSamples}
                    hallStreamListKeyIds={hallVm.hallStreamListKeyIds}
                  />
                ) : ui.activePage === 'gamepad' ? (
                  <GamepadPage
                    key={workspace.profileSlot}
                    slot={workspace.profileSlot}
                    busy={workspace.profileBusy || tachyon}
                    onSetup={() => {
                      ui.setActiveSettingsPage('background-service');
                      ui.setActiveRail('settings');
                    }}
                  />
                ) : ui.activePage === 'rgb' ? (
                  <RgbPage
                    onSetup={() => {
                      ui.setActiveSettingsPage('background-service');
                      ui.setActiveRail('settings');
                    }}
                    initialCustom={ui.rgbCustomEntry}
                    onEntered={() => ui.setRgbCustomEntry(false)}
                    onTabChange={ui.setActiveRgbTab}
                    advancedBindings={workspace.advancedBindings}
                    profileSlot={workspace.profileSlot}
                    rgb={workspace.rgb}
                    profileBusy={workspace.profileBusy}
                    setRgb={workspace.setRgb}
                    setSaveState={workspace.setSaveState}
                    RgbSettingsPage={RgbSettingsPage}
                    canUndo={sync.canUndo}
                    canRedo={sync.canRedo}
                    onUndo={sync.undoProfileChange}
                    onRedo={sync.redoProfileChange}
                  />
                ) : (
                  <div className="placeholder-page page-enter">
                    <div className="placeholder-icon">
                      <SlidersHorizontal size={28} />
                    </div>
                    <h1>{tr('Profile')}</h1>
                    <p>{tr('This page is not implemented yet.')}</p>
                  </div>
                )
              ) : ui.activeRail === 'settings' ? (
                ui.activeSettingsPage === 'general' ? (
                  <GeneralSettingsPage
                    model={selectedModel}
                    deviceConnected={deviceConnected}
                    deviceSettingsState={deviceSettings.deviceSettingsState}
                    devicePollingRate={deviceSettings.devicePollingRate}
                    deviceOsModeMac={deviceSettings.deviceOsModeMac}
                    setDeviceOsModeMac={deviceSettings.setDeviceOsModeMac}
                    deviceWinLock={deviceSettings.deviceWinLock}
                    setDeviceWinLock={deviceSettings.setDeviceWinLock}
                    deviceHallDebounce={deviceSettings.deviceHallDebounce}
                    setDeviceHallDebounce={deviceSettings.setDeviceHallDebounce}
                    deviceAutoCalibration={deviceSettings.deviceAutoCalibration}
                    setDeviceAutoCalibration={deviceSettings.setDeviceAutoCalibration}
                    showAdvancedPages={ui.showAdvancedPages}
                    readDeviceGeneralSettings={deviceSettings.readDeviceGeneralSettings}
                    handlePollingRateChange={deviceSettings.handlePollingRateChange}
                    applyBooleanDeviceSetting={deviceSettings.applyBooleanDeviceSetting}
                  />
                ) : ui.activeSettingsPage === 'switches' ? (
                  <SwitchSelectorPage
                    model={deviceModel}
                    selectedKeys={selection.selectedKeys}
                    hasSelection={selection.hasSelection}
                    allSelected={selection.allSelected}
                    onToggleKey={selection.toggleKey}
                    onSelectAll={selection.selectAll}
                    onDiscardSelection={selection.discardSelection}
                    switchPreviewByKey={perf.switchPreviewByKey}
                    selectedSwitch={perf.selectedSwitch}
                    switchProfileMixed={perf.switchProfileMixed}
                    onAssignSwitchProfile={perf.assignSwitchProfile}
                    switchSearch={ui.switchSearch}
                    onSwitchSearchChange={ui.setSwitchSearch}
                    switchBrandFilter={ui.switchBrandFilter}
                    onSwitchBrandFilterChange={ui.setSwitchBrandFilter}
                    canSave={
                      deviceConnected &&
                      workspace.loadedProfileSlot === workspace.profileSlot &&
                      (perf.dirtyKeys.size > 0 ||
                        workspace.dirtyRemaps.size > 0 ||
                        workspace.rgbPending > 0)
                    }
                    profileBusy={workspace.profileBusy}
                    saveState={workspace.saveState}
                    onSave={() => void sync.handleSaveAll()}
                    canUndo={sync.canUndo}
                    canRedo={sync.canRedo}
                    onUndo={sync.undoProfileChange}
                    onRedo={sync.redoProfileChange}
                  />
                ) : ui.activeSettingsPage === 'background-service' ? (
                  <BackgroundServicePage
                    onOpenCustom={() => {
                      ui.setRgbCustomEntry(true);
                      ui.setActivePage('rgb');
                      ui.setActiveRail('keyboard');
                    }}
                    onOpenGamepad={() => {
                      ui.setActivePage('gamepad');
                      ui.setActiveRail('keyboard');
                    }}
                  />
                ) : ui.activeSettingsPage === 'diagnostics' ? (
                  <DiagnosticsPage />
                ) : ui.activeSettingsPage === 'interface' ? (
                  <InterfaceSettingsPage
                    languagePreference={ui.languagePreference}
                    onSelectLanguage={ui.selectLanguage}
                    showAdvancedPages={ui.showAdvancedPages}
                    onShowAdvancedPagesChange={ui.setShowAdvancedPages}
                    compactSidebar={ui.compactSidebar}
                    onCompactSidebarChange={ui.setCompactSidebar}
                    rememberSelection={ui.rememberSelection}
                    onRememberSelectionChange={ui.setRememberSelection}
                  />
                ) : (
                  <div className="page settings-page page-enter">
                    <div className="settings-hero">
                      <div>
                        <h1>{tr('Settings')}</h1>
                        <p>
                          {tr(
                            'Choose Interface for language and sidebar preferences, Device Settings for keyboard options, or Background Service for installation and connection help.'
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <HelpPage
                  onOpenBackgroundService={() => {
                    ui.setActiveSettingsPage('background-service');
                    ui.setActiveRail('settings');
                  }}
                  onOpenDiagnostics={() => {
                    ui.setActiveSettingsPage('diagnostics');
                    ui.setActiveRail('settings');
                  }}
                  onOpenProfiles={() => {
                    ui.setActivePage('profile');
                    ui.setActiveRail('keyboard');
                  }}
                />
              )}
            </AppShell>
          </TachyonContext.Provider>
        </DeviceModelContext.Provider>
      </DeviceFamilyContext.Provider>
    </I18nProvider>
  );
}
export default App;
