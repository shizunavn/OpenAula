import { KEY_RGB_MODES, SIDE_RGB_MODES, WIN68_KEY_RGB_MODES } from './rgbCatalog';
import type { RgbZone } from '../protocol/hero68/rgb';
export function rgbPreviewDarkReason(zone: RgbZone, side = false, isWin68 = false): string | null {
  if (isWin68) {
    if (zone.brightness === 0) {
      return 'Brightness is 0%.';
    }
    const effect = WIN68_KEY_RGB_MODES.find(item => item.id === zone.mode);
    if (
      effect?.color &&
      !zone.mix &&
      zone.colorIndex !== 0 &&
      zone.rgb.every(channel => channel === 0)
    ) {
      return 'Single color is black (#000000).';
    }
    return null;
  }
  if (zone.mode === 0) {
    return null;
  }
  if (zone.brightness === 0) {
    return 'Brightness is 0%.';
  }
  const effect = (side ? SIDE_RGB_MODES : KEY_RGB_MODES).find(effect => effect.id === zone.mode);
  if (
    effect?.color &&
    !(zone.mixValue === 7 || (zone.mixValue === undefined && zone.mix)) &&
    zone.rgb.every(channel => channel === 0)
  ) {
    return 'Single color is black (#000000).';
  }
  return null;
}
