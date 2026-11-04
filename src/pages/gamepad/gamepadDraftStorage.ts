import { BRAND } from '../../brand';
import { HERO68_KEY_LABEL_BY_ID } from '../../app/helpers';
import { heroLayout } from '../../keyboard/layout';
import {
  defaultGamepad,
  restoreGamepad,
  validateGamepad,
  type GamepadAction,
  type GamepadConfiguration,
} from '../../keyboard/gamepad';

const STORAGE_KEY = `${BRAND.storagePrefix}:gamepad:v1`;

export const NEUTRAL_GAMEPAD_LIGHTING = Object.fromEntries(
  heroLayout('hero84')
    .rows.flat()
    .map((key) => [key.id, '#35393b'])
);

export const GAMEPAD_PALETTE: GamepadAction[] = [
  'A',
  'B',
  'X',
  'Y',
  'Start',
  'Back',
  'Guide',
  'Up',
  'Down',
  'Left',
  'Right',
  'LUp',
  'LDown',
  'LLeft',
  'LRight',
  'LClick',
  'RUp',
  'RDown',
  'RLeft',
  'RRight',
  'RClick',
  'LB',
  'LT',
  'RB',
  'RT',
];

const ACTION_DISPLAY_LABELS: Partial<Record<GamepadAction, string>> = {
  LUp: 'L ↑',
  LDown: 'L ↓',
  LLeft: 'L ←',
  LRight: 'L →',
  RUp: 'R ↑',
  RDown: 'R ↓',
  RLeft: 'R ←',
  RRight: 'R →',
  LClick: 'L ⦿',
  RClick: 'R ⦿',
};

export const physicalLabel = (id: string): string => HERO68_KEY_LABEL_BY_ID[id] ?? id;

export const actionLabel = (action: GamepadAction): string =>
  ACTION_DISPLAY_LABELS[action] ?? action;

export function loadGamepadDraft(slot: number): GamepadConfiguration {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return restoreGamepad(parsed[slot]);
  } catch {
    return defaultGamepad();
  }
}

export function hasDraft(slot: number): boolean {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return Boolean(parsed[slot]);
  } catch {
    return false;
  }
}

export function saveGamepadDraft(slot: number, value: GamepadConfiguration): void {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    parsed[slot] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Retain draft in memory when localStorage is unavailable or quota-limited.
  }
}

export function exportGamepadConfigJson(slot: number, config: GamepadConfiguration): void {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          version: 1,
          slot,
          configuration: config,
        },
        null,
        2
      ),
    ],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `HERO68-gamepad-P${slot + 1}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importGamepadConfigFile(file: File): Promise<GamepadConfiguration> {
  if (file.size > 65536) {
    throw Error('File too large');
  }
  const parsed = JSON.parse(await file.text());
  return validateGamepad(parsed.configuration ?? parsed);
}
