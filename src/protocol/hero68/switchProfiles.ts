export type SwitchProfileId =
  'white' | 'black' | 'blue' | 'clear' | 'wing-chun' | 'jade-pro' | 'uranus' | `switch-${number}`;

const LEGACY_SWITCH_PROFILE_ALIASES: Readonly<Record<string, SwitchProfileId>> = {
  'wing-chun': 'switch-4',
  'jade-pro': 'switch-1',
  uranus: 'switch-3'
};

export function normalizeSwitchProfileId(profile: string): SwitchProfileId {
  return LEGACY_SWITCH_PROFILE_ALIASES[profile] ?? (profile as SwitchProfileId);
}

// Names from the official English catalog, IDs confirmed by the user's
// 2026-09-26 individual-key USB capture. Legacy IDs remain stable in storage.
export const HERO68_SWITCH_PROFILES = [
  {
    id: 'switch-4',
    firmwareId: 4,
    xsydFirmwareId: 0,
    name: 'Wing Chun',
    color: '#c535f8',
    travelMm: 3.4
  },
  {
    id: 'white',
    firmwareId: 13,
    xsydFirmwareId: 3,
    name: 'Meteor Magnetic',
    color: '#8f18ff',
    travelMm: 3.4
  },
  {
    id: 'switch-1',
    firmwareId: 1,
    xsydFirmwareId: 1,
    name: 'Jade Pro',
    color: '#07fd56',
    travelMm: 3.4
  },
  {
    id: 'switch-3',
    firmwareId: 3,
    xsydFirmwareId: 2,
    name: 'Uranus Gaming',
    color: '#6363ff',
    travelMm: 3.4
  },
  {
    id: 'switch-5',
    firmwareId: 5,
    xsydFirmwareId: 0,
    name: 'Magneto King',
    color: '#01c341',
    travelMm: 3.4
  },
  {
    id: 'switch-14',
    firmwareId: 14,
    xsydFirmwareId: 1,
    name: 'Jade King',
    color: '#ffb500',
    travelMm: 3.4
  },
  {
    id: 'blue',
    firmwareId: 15,
    xsydFirmwareId: 1,
    name: 'Dragon King',
    color: '#0004ff',
    travelMm: 3.4
  },
  {
    id: 'clear',
    firmwareId: 16,
    xsydFirmwareId: 0,
    name: 'Jade',
    color: '#6569f8',
    travelMm: 3.4
  },
  {
    id: 'switch-22',
    firmwareId: 22,
    xsydFirmwareId: 0,
    name: 'Pink King Scroll',
    color: '#ff0ed6',
    travelMm: 3.4
  },
  {
    id: 'switch-24',
    firmwareId: 24,
    xsydFirmwareId: 1,
    name: 'Jade Emperor Scroll',
    color: '#00ff76',
    travelMm: 3.4
  },
  {
    id: 'black',
    firmwareId: 8,
    xsydFirmwareId: 2,
    name: 'Black King',
    color: '#b1f835',
    travelMm: 3.4
  }
] as const satisfies readonly {
  id: SwitchProfileId;
  firmwareId: number;
  xsydFirmwareId: number;
  name: string;
  color: string;
  travelMm: number;
}[];

/**
 * Additional switch presets present in HERO 68 XS firmware v1.17 (`VA 0x08029D7E` indices 11..16):
 * - `59` (`0x3B`): Lingyun (`灵云轴`, 3.4 mm)
 * - `60` (`0x3C`): Snow God / Xue Shen (`雪神轴`, 3.3 mm, dual light guide, 28±5gf, 85–550Gs)
 * - `37` (`0x25`): Ash Wood (`灰木轴`, 3.4 mm)
 * - `61` (`0x3D`): Nick Magnetic (`尼克磁轴`, 3.4 mm)
 * - `62` (`0x3E`): Ice Jade (`冰玉轴`, 3.4 mm, single light guide, 28±5gf, 80–480Gs)
 * - `76` (`0x4C`): HERO 68 XS Custom (`ID 76`, 3.4 mm)
 */
export const HERO68_XS_SWITCH_PROFILES = [
  {
    id: 'switch-60',
    firmwareId: 60,
    xsydFirmwareId: 1,
    name: 'Snow God (Xue Shen)',
    color: '#f8f8ff',
    travelMm: 3.3
  },
  {
    id: 'switch-62',
    firmwareId: 62,
    xsydFirmwareId: 1,
    name: 'Ice Jade',
    color: '#e0fff7',
    travelMm: 3.4
  },
  {
    id: 'switch-59',
    firmwareId: 59,
    xsydFirmwareId: 1,
    name: 'Lingyun',
    color: '#b3e6ff',
    travelMm: 3.4
  },
  {
    id: 'switch-37',
    firmwareId: 37,
    xsydFirmwareId: 0,
    name: 'Ash Wood',
    color: '#c5c5c5',
    travelMm: 3.4
  },
  {
    id: 'switch-61',
    firmwareId: 61,
    xsydFirmwareId: 3,
    name: 'Nick Magnetic',
    color: '#ffe4b5',
    travelMm: 3.4
  },
  {
    id: 'switch-76',
    firmwareId: 76,
    xsydFirmwareId: 1,
    name: 'HERO 68 XS Custom (ID 76)',
    color: '#7ee8fa',
    travelMm: 3.4
  }
] as const satisfies readonly {
  id: SwitchProfileId;
  firmwareId: number;
  xsydFirmwareId: number;
  name: string;
  color: string;
  travelMm: number;
}[];

export const ALL_HERO68_SWITCH_PROFILES = [
  ...HERO68_SWITCH_PROFILES,
  ...HERO68_XS_SWITCH_PROFILES
] as const;

/**
 * Native 4-switch table in WIN 68 HE MAX firmware v1.1.4 (`VA 0x1D48C`, `0x04E44`, `0x05644`, `0x12CEA..0x12D14`):
 * - `0`: Wing Chun / Graywood (`switch-4`, Curve 0 at `0x04E44`, max travel `3.40 mm` / `3400 µm`)
 * - `1`: Jade Pro / Magnetic Jade (`switch-1`, Curve 0 at `0x04E44`, max travel `3.40 mm` / `3400 µm`)
 * - `2`: Black King / Black Emperor (`black`, Curve 1 at `0x05644`, max travel `3.30 mm` / `3300 µm`)
 * - `3`: Meteor Magnetic / TTC King (`white`, Curve 1 at `0x05644`, max travel `3.30 mm` / `3300 µm`)
 */
export const WIN68_SWITCH_PROFILES = [
  {
    id: 'switch-4' as const,
    xsydFirmwareId: 0,
    name: 'Wing Chun',
    fullName: 'Leobog Wing Chun / Graywood Magnetic (3.4mm)',
    color: '#c535f8',
    travelMm: 3.4,
    travelUm: 3400
  },
  {
    id: 'switch-1' as const,
    xsydFirmwareId: 1,
    name: 'Jade Pro',
    fullName: 'Gateron / AULA Magnetic Jade Pro (3.4mm)',
    color: '#07fd56',
    travelMm: 3.4,
    travelUm: 3400
  },
  {
    id: 'black' as const,
    xsydFirmwareId: 2,
    name: 'Black King',
    fullName: 'AULA Black King / Black Emperor (3.3mm)',
    color: '#b1f835',
    travelMm: 3.3,
    travelUm: 3300
  },
  {
    id: 'white' as const,
    xsydFirmwareId: 3,
    name: 'Meteor Magnetic',
    fullName: 'TTC King / Meteor Magnetic (3.3mm)',
    color: '#8f18ff',
    travelMm: 3.3,
    travelUm: 3300
  }
] as const;

export function switchFirmwareId(profile: string): number {
  const normalized = normalizeSwitchProfileId(profile);
  const known = ALL_HERO68_SWITCH_PROFILES.find(option => option.id === normalized);
  if (known) {
    return known.firmwareId;
  }
  const match = /^switch-(\d+)$/.exec(normalized);
  const value = match ? Number(match[1]) : NaN;
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`Unknown switch profile: ${profile}`);
  }
  return value;
}

export function switchProfileId(firmwareId: number): SwitchProfileId {
  if (!Number.isInteger(firmwareId) || firmwareId < 0 || firmwareId > 255) {
    throw new RangeError('Switch ID must fit in one byte');
  }
  return (
    ALL_HERO68_SWITCH_PROFILES.find(option => option.firmwareId === firmwareId)?.id ??
    `switch-${firmwareId}`
  );
}

export function isSwitchProfileId(value: unknown): value is SwitchProfileId {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    switchFirmwareId(value);
    return true;
  } catch {
    return false;
  }
}

export function switchProfileLabel(profile: string): string {
  const normalized = normalizeSwitchProfileId(profile);
  return (
    ALL_HERO68_SWITCH_PROFILES.find(option => option.id === normalized)?.name ??
    `Stored profile (ID ${switchFirmwareId(normalized)})`
  );
}
