import type { RemapLayers } from '../protocol/hero68/remap';
import type { RgbProfile, RgbDirty } from '../protocol/hero68/rgb';
import type { AdvancedBinding } from '../protocol/hero68/advanced';
import type { HeroDeviceModelId } from '../keyboard/devices';
import type { LanguagePreference } from '../i18n';
import type {
  LinkedAppRule,
  ProfileId,
  StoredProfileRecord,
  WootProfileMetadata
} from './profileTypes';
import { BRAND } from '../brand';
export const OPENHERO68_STATE_KEY = `${BRAND.storagePrefix}:web-state:v1`;
export type PersistedOpenHeroState = {
  activeRail?: 'keyboard' | 'settings' | 'help';
  activePage?: string;
  activeSettingsPage?: string;
  deviceModel?: HeroDeviceModelId;
  selectedKeys?: string[];
  selectedSwitchId?: string;
  assignedSwitchesByKey?: Record<string, string>;
  actuationByKey?: Record<string, number>;
  rapidTriggerByKey?: Record<string, boolean>;
  splitSensitivityByKey?: Record<string, boolean>;
  rapidSensitivityByKey?: Record<string, number>;
  pressSensitivityByKey?: Record<string, number>;
  releaseSensitivityByKey?: Record<string, number>;
  deadzoneEnabledByKey?: Record<string, boolean>;
  topDeadzoneByKey?: Record<string, number>;
  bottomDeadzoneByKey?: Record<string, number>;
  tachyon?: boolean;
  tachyonPreviousPollingRate?: 125 | 250 | 500 | 1000 | 2000 | 4000 | 8000;
  compactSidebar?: boolean;
  showAdvancedPages?: boolean;
  rememberSelection?: boolean;
  languagePreference?: LanguagePreference;
  languageManuallySet?: boolean;
  languageRegionDetected?: boolean;
  pollingRate?: 125 | 250 | 500 | 1000 | 2000 | 4000 | 8000;
  osModeMac?: boolean;
  winLock?: boolean;
  hallDebounce?: boolean;
  autoCalibration?: boolean;
  switchSearch?: string;
  switchBrandFilter?: string;
  profileSlot?: 0 | 1 | 2 | 3;
  profileNames?: Record<0 | 1 | 2 | 3, string>;
  remapLayers?: RemapLayers;
  profileDrafts?: Partial<Record<0 | 1 | 2 | 3, ProfileDraft>>;
  // Wootility v5 + OpenMAD 3-Tier Profile Storage
  activeProfileId?: ProfileId;
  onboardMetadata?: Partial<Record<0 | 1 | 2 | 3, WootProfileMetadata>>;
  linkedProfiles?: StoredProfileRecord[];
  inactiveProfiles?: StoredProfileRecord[];
  cachedLinkedApps?: LinkedAppRule[];
  autoProfileEnabled?: boolean;
  revertToDefaultOnFocusLoss?: boolean;
  notifyOnProfileSwitch?: boolean;
};
export type ProfileDraft = Pick<
  PersistedOpenHeroState,
  | 'assignedSwitchesByKey'
  | 'actuationByKey'
  | 'rapidTriggerByKey'
  | 'splitSensitivityByKey'
  | 'rapidSensitivityByKey'
  | 'pressSensitivityByKey'
  | 'releaseSensitivityByKey'
  | 'deadzoneEnabledByKey'
  | 'topDeadzoneByKey'
  | 'bottomDeadzoneByKey'
  | 'remapLayers'
  | 'selectedKeys'
> & {
  advancedBindings?: AdvancedBinding[];
  advancedBaseline?: AdvancedBinding[];
  dirtyKeys?: string[];
  dirtyRemaps?: string[];
  remapBaseline?: RemapLayers;
  rgb?: RgbProfile;
  rgbBaseline?: RgbProfile;
  rgbDirty?: RgbDirty;
  rgbFormat?: 1;
  uiScalarValues?: {
    actuation: number;
    rapidTrigger: boolean;
    splitSensitivity: boolean;
    rapidSensitivity: number;
    pressSensitivity: number;
    releaseSensitivity: number;
    deadzoneEnabled: boolean;
    topDeadzone: number;
    bottomDeadzone: number;
    selectedSwitchId: string;
  };
};
export function loadOpenHeroState(): PersistedOpenHeroState | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(OPENHERO68_STATE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    // Migrate the previous visible `auto` language option into the new hidden
    // automatic-detection mode. Explicit en/vi choices from the old build are
    // treated as manual overrides; auto/missing keeps region detection enabled.
    const previousLanguagePreference = parsed.languagePreference;
    if (previousLanguagePreference !== 'en' && previousLanguagePreference !== 'vi') {
      delete parsed.languagePreference;
    }
    if (typeof parsed.languageManuallySet !== 'boolean') {
      parsed.languageManuallySet =
        previousLanguagePreference === 'en' || previousLanguagePreference === 'vi';
    }
    // Older builds did not cache completion of automatic region detection.
    // Leave it false so they perform at most one final lookup, then persist it.
    if (typeof parsed.languageRegionDetected !== 'boolean') {
      parsed.languageRegionDetected = false;
    }
    return parsed as PersistedOpenHeroState;
  } catch {
    return null;
  }
}
export function saveOpenHeroState(state: PersistedOpenHeroState) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(OPENHERO68_STATE_KEY, JSON.stringify(state));
  } catch {} // Storage can be unavailable in private / restricted browser contexts.
}
