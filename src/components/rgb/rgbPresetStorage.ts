import { BRAND } from '../../brand';
import type { RgbProfile } from '../../protocol/hero68/rgb';

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
export function previousRgbTab(): RgbTab {
  try {
    const tab = sessionStorage.getItem(`${BRAND.storagePrefix}:rgb-tab`);
    return tab === 'custom' || tab === 'rhythm' ? tab : 'onboard';
  } catch {
    return 'onboard';
  }
}
