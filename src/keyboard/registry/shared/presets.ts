import {
  ALL_HERO68_SWITCH_PROFILES,
  HERO68_SWITCH_PROFILES,
  WIN68_SWITCH_PROFILES
} from '../../../protocol/hero68/switchProfiles';
import type { PollingRate } from '../../../protocol/hero68/types';
import { KEY_RGB_MODES, SIDE_RGB_MODES, WIN68_KEY_RGB_MODES } from '../../rgbCatalog';
import type {
  BoardAdvancedKeysSpec,
  BoardDeviceSettingsSpec,
  BoardPerformanceSpec,
  BoardProfileSpec,
  BoardRgbSpec,
  BoardSocdOptionSpec,
  BoardSwitchCatalogSpec,
  BoardSwitchSpec
} from '../types';

export const XSYD_DKS_DOC_URL = 'docs/xsyd-protocol.md#5-advanced-keys';

export const STANDARD_POLLING_RATES: readonly PollingRate[] = [
  8000, 4000, 2000, 1000, 500, 250, 125
];

export const BYTETECH_SOCD_OPTIONS: readonly BoardSocdOptionSpec[] = [
  {
    value: 1,
    labelKey: 'Last input priority',
    title: 'Last input priority',
    desc: 'The last key pressed overrides the first.'
  },
  {
    value: 3,
    labelKey: 'First key priority',
    title: 'First key priority',
    desc: 'Key 1 wins whenever both keys are active.'
  },
  {
    value: 4,
    labelKey: 'Second key priority',
    title: 'Second key priority',
    desc: 'Key 2 wins whenever both keys are active.'
  },
  {
    value: 0,
    labelKey: 'Neutral',
    title: 'Neutral',
    desc: 'Neither key is active while both are pressed.'
  }
];

export const XSYD_SOCD_OPTIONS_SPEC: readonly BoardSocdOptionSpec[] = [
  {
    value: 0,
    verified: true,
    labelKey: 'Last input priority',
    title: 'Last input priority',
    desc: 'The last key pressed overrides the first.'
  },
  {
    value: 1,
    verified: true,
    labelKey: 'First key priority',
    title: 'First key priority',
    desc: 'Key 1 wins whenever both keys are active.'
  },
  {
    value: 2,
    verified: true,
    labelKey: 'Second key priority',
    title: 'Second key priority',
    desc: 'Key 2 wins whenever both keys are active.'
  },
  {
    value: 3,
    verified: true,
    labelKey: 'Neutral',
    title: 'Neutral',
    desc: 'Neither key is active while both are pressed.'
  }
];

export const BYTETECH_STANDARD_SWITCHES: readonly BoardSwitchSpec[] = HERO68_SWITCH_PROFILES.map(
  sw => ({
    id: sw.id,
    firmwareId: sw.firmwareId,
    name: sw.name,
    color: sw.color,
    travelMm: sw.travelMm
  })
);

export const BYTETECH_XS_SWITCHES: readonly BoardSwitchSpec[] = ALL_HERO68_SWITCH_PROFILES.map(
  sw => ({
    id: sw.id,
    firmwareId: sw.firmwareId,
    name: sw.name,
    color: sw.color,
    travelMm: sw.travelMm
  })
);

export const XSYD_WIN68_SWITCHES: readonly BoardSwitchSpec[] = WIN68_SWITCH_PROFILES.map(sw => ({
  id: sw.id,
  firmwareId: sw.xsydFirmwareId,
  name: sw.name,
  fullName: sw.fullName,
  color: sw.color,
  travelMm: sw.travelMm,
  firmwareMaxTravelMm: sw.travelMm
}));

export const BYTETECH_DEFAULT_SPECS: {
  protocol: 'bytetech';
  switches: BoardSwitchCatalogSpec;
  performance: BoardPerformanceSpec;
  rgb: BoardRgbSpec;
  profiles: BoardProfileSpec;
  advancedKeys: BoardAdvancedKeysSpec;
  deviceSettings: BoardDeviceSettingsSpec;
} = {
  protocol: 'bytetech',
  switches: {
    defaultSwitchId: 'white',
    allowPerKeySwitch: true,
    travelPolicy: 'switch-authoritative',
    switches: BYTETECH_STANDARD_SWITCHES
  },
  performance: {
    distanceUnitMm: 0.01,
    hallUnitsPerMm: 100,
    defaultMaxTravelMm: 3.4,
    minActuationMm: 0.1,
    minRapidTriggerMm: 0.01,
    rapidTriggerStepMm: 0.01,
    deadzoneRangeMm: [0, 0.5],
    dksBottomMarginMm: 0.1
  },
  rgb: {
    previewEngine: 'bytetech-arm',
    colorModel: 'rgb24',
    maxBrightness: 20,
    sideMaxBrightness: 4,
    maxSpeed: 4,
    perKeyModeId: 19,
    offModeId: 0,
    keyModes: KEY_RGB_MODES,
    hasSideRgb: true,
    sideLedCount: 18,
    sideModes: SIDE_RGB_MODES,
    supportsCustomRgb: true,
    supportsRhythmSync: true
  },
  profiles: {
    slots: [0, 1, 2],
    supportsRename: true,
    supportsAutoSwitch: true
  },
  advancedKeys: {
    maxBindings: 40,
    supportedModes: ['dks', 'mt', 'tgl', 'socd', 'mpt', 'end'],
    socdOptions: BYTETECH_SOCD_OPTIONS,
    dksSupported: true
  },
  deviceSettings: {
    writablePollingRate: true,
    pollingRates: STANDARD_POLLING_RATES,
    supportsWinLock: true,
    supportsOsMode: true
  }
};

export const BYTETECH_XS_SPECS = {
  switches: {
    ...BYTETECH_DEFAULT_SPECS.switches,
    switches: BYTETECH_XS_SWITCHES
  } satisfies BoardSwitchCatalogSpec,
  performance: {
    ...BYTETECH_DEFAULT_SPECS.performance,
    distanceUnitMm: 0.005,
    hallUnitsPerMm: 200,
    minRapidTriggerMm: 0.005,
    rapidTriggerStepMm: 0.005
  } satisfies BoardPerformanceSpec
};

export const XSYD_DEFAULT_SPECS: {
  protocol: 'xsyd';
  switches: BoardSwitchCatalogSpec;
  performance: BoardPerformanceSpec;
  rgb: BoardRgbSpec;
  profiles: BoardProfileSpec;
  advancedKeys: BoardAdvancedKeysSpec;
  deviceSettings: BoardDeviceSettingsSpec;
} = {
  protocol: 'xsyd',
  switches: {
    defaultSwitchId: 'switch-4',
    allowPerKeySwitch: true,
    travelPolicy: 'switch-with-firmware-cap',
    switches: XSYD_WIN68_SWITCHES
  },
  performance: {
    distanceUnitMm: 0.01,
    hallUnitsPerMm: 100,
    defaultMaxTravelMm: 3.4,
    minActuationMm: 0.1,
    minRapidTriggerMm: 0.01,
    rapidTriggerStepMm: 0.01,
    deadzoneRangeMm: [0, 0.5],
    dksBottomMarginMm: 0.1
  },
  rgb: {
    previewEngine: 'xsyd',
    colorModel: 'palette7',
    maxBrightness: 4,
    maxSpeed: 4,
    perKeyModeId: 21,
    offModeId: null,
    keyModes: WIN68_KEY_RGB_MODES,
    hasSideRgb: false,
    sideLedCount: 0,
    sideModes: [],
    supportsCustomRgb: true,
    supportsRhythmSync: true
  },
  profiles: {
    slots: [0, 1, 2, 3],
    supportsRename: true,
    supportsAutoSwitch: true
  },
  advancedKeys: {
    maxBindings: 40,
    supportedModes: ['mt', 'tgl', 'socd', 'mpt', 'end'],
    socdOptions: XSYD_SOCD_OPTIONS_SPEC,
    dksSupported: false,
    dksUnsupportedDocUrl: XSYD_DKS_DOC_URL
  },
  deviceSettings: {
    writablePollingRate: true,
    pollingRates: STANDARD_POLLING_RATES,
    supportsWinLock: true,
    supportsOsMode: true
  }
};
