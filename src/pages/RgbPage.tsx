import { useI18n } from '../i18n';
import { Suspense } from 'react';
import type * as React from 'react';
import type { AdvancedBinding } from '../protocol/hero68/advanced';
import type { RgbProfile } from '../protocol/hero68/rgb';
import type { ProfileSlot } from '../protocol/hero68/types';

type RgbSettingsPageComponent = (typeof import('../components/RgbSettingsPage'))['default'];

export interface RgbPageProps {
  onSetup: () => void;
  initialCustom: boolean;
  onEntered: () => void;
  onTabChange: (tab: import('../components/RgbSettingsPage').RgbTab) => void;
  advancedBindings: AdvancedBinding[];
  profileSlot: ProfileSlot;
  rgb: RgbProfile;
  profileBusy: boolean;
  setRgb: React.Dispatch<React.SetStateAction<RgbProfile>>;
  setSaveState: React.Dispatch<React.SetStateAction<'idle' | 'sent'>>;
  RgbSettingsPage: React.LazyExoticComponent<RgbSettingsPageComponent>;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

function RgbPage({
  onSetup,
  initialCustom,
  onEntered,
  onTabChange,
  advancedBindings,
  profileSlot,
  rgb,
  profileBusy,
  setRgb,
  setSaveState,
  RgbSettingsPage,
  canUndo,
  canRedo,
  onUndo,
  onRedo
}: RgbPageProps) {
  const { tr } = useI18n();
  return (
    <Suspense fallback={<div className="page settings-page">{tr('Loading RGB preview…')}</div>}>
      <RgbSettingsPage
        slot={profileSlot}
        onTabChange={onTabChange}
        onSetup={onSetup}
        initialCustom={initialCustom}
        onEntered={onEntered}
        advancedBindings={advancedBindings}
        key={profileSlot}
        value={rgb}
        busy={profileBusy}
        onChange={next => {
          setRgb(next);
          setSaveState('idle');
        }}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
      />
    </Suspense>
  );
}

export { RgbPage };
