import type { PollingRate, ProfileSlot } from '../../protocol/hero68/types';
import type { SwitchProfileId } from '../../protocol/hero68/switchProfiles';

export type HeroDeviceModelId = 'hero68' | 'hero68Xs' | 'hero84' | 'win68HeMax' | 'win68';

export type ProtocolFamilyId = 'bytetech' | 'xsyd';
export type AdvancedKeyModeId = 'dks' | 'mt' | 'tgl' | 'socd' | 'mpt' | 'end';
export type RgbColorModel = 'rgb24' | 'palette7';
export type RgbPreviewEngineId = 'bytetech-arm' | 'xsyd';
export type TravelResolutionPolicy =
  /** Uses min(switch.travelMm, firmwareMaxTravelMm ?? Infinity); falls back to defaultMaxTravelMm */
  | 'switch-with-firmware-cap'
  /** Switch travel directly dictates the effective maximum travel */
  | 'switch-authoritative';

export type HeroKeyDefinition = {
  id: string;
  label: string;
  width?: number;
  matrixKey?: number;
  indicator?: 'lock' | 'fn';
  /** Padding slot that keeps a shorter row's columns aligned; never interactive. */
  spacer?: boolean;
};

export type HeroKeyRow = HeroKeyDefinition[];

export type BoardCapabilities = {
  /** Physical interactive key count on the board */
  keyCount: number;
  /** Physical row count for layout scaling and RGB coordinate normalization */
  rowCount: number;
  /** Design width in keycap units (e.g. 16U) */
  widthUnits: number;
  /** Maximum Hall sensor travel shown in the UI (mm) */
  maxTravelMm: number;
  /** Whether polling rate is writable via CMD 0x04 zone 0x17 */
  writablePollingRate: boolean;
  /** Whether the board has a side RGB LED zone (zone 6) */
  hasSideRgb: boolean;
  /** Number of side LEDs */
  sideLedCount: number;
  /** Maximum bindings supported in Gamepad & Advanced Keys */
  maxGamepadBindings: number;
  maxAdvancedBindings: number;
};

export type BoardUsbDescriptor = {
  vendorId: number;
  productIds: readonly number[];
  usagePage: number;
  usage: number;
  reportId: number;
  productNames: readonly string[];
  deviceUuids: readonly string[];
  modelByte: number;
};

/** Describes a switch supported on a board */
export type BoardSwitchSpec = {
  id: SwitchProfileId;
  /** Firmware switch ID for the board's protocol (Bytetech ID or XSYD switchType 0..3) */
  firmwareId: number;
  name: string;
  fullName?: string;
  color: string;
  /** Physical maximum travel of the switch (mm), e.g. 3.3, 3.4, 3.5, 3.8, 4.0 */
  travelMm: number;
  /** Firmware sanitizer cap for this switch if different from travelMm (e.g. XSYD ID 2,3 = 3.3 mm) */
  firmwareMaxTravelMm?: number;
};

/** Switch catalog & travel resolution policy for a board */
export type BoardSwitchCatalogSpec = {
  defaultSwitchId: SwitchProfileId;
  /** True if the board supports mixed switch profiles per key */
  allowPerKeySwitch: boolean;
  /** Policy for computing effective max travel from board + switch + handshake */
  travelPolicy: TravelResolutionPolicy;
  switches: readonly BoardSwitchSpec[];
};

/** Hall sensor resolution, precision steps, and clamp bounds (without hardcoding 3.4 mm ceiling) */
export type BoardPerformanceSpec = {
  /** Single-step distance resolution (mm): 0.005 for HERO68 XS, 0.01 for standard boards */
  distanceUnitMm: number;
  /** Conversion factor from distanceUnits to mm (100 for 10 µm, 200 for 5 µm XS) */
  hallUnitsPerMm: number;
  /** Default max travel when no switch or handshake cap is present (mm) */
  defaultMaxTravelMm: number;
  /** Lower bound for Actuation (mm), e.g. 0.1 */
  minActuationMm: number;
  /** Lower bound for Rapid Trigger (mm): 0.005 for XS, 0.01 for standard */
  minRapidTriggerMm: number;
  /** Step increment for Rapid Trigger (mm); defaults to distanceUnitMm */
  rapidTriggerStepMm: number;
  /** Optional discrete Rapid Trigger values if firmware restricts to a fixed set */
  rapidTriggerAllowedMm?: readonly number[];
  /** Top/bottom deadzone bounds [min, max] (mm) */
  deadzoneRangeMm: readonly [number, number];
  /** Bottom margin reserved for DKS thresholds (mm), e.g. 0.1 -> dksMax = effectiveMaxTravelMm - 0.1 */
  dksBottomMarginMm: number;
};

/** Dynamically resolved travel limits for a single key or a selected set of keys */
export type ResolvedTravelLimits = {
  maxTravelMm: number;
  actuationMinMm: number;
  actuationMaxMm: number;
  rapidTriggerMinMm: number;
  rapidTriggerMaxMm: number;
  rapidTriggerStepMm: number;
  dksMinMm: number;
  dksMaxMm: number;
  gamepadEndMaxMm: number;
};

/** Onboard RGB effect descriptor used by RgbSettingsPage to render controls */
export type BoardRgbModeSpec = {
  /** External Mode ID sent to firmware */
  id: number;
  /** Internal ROM ID if protocol maps external -> internal IDs (e.g. XSYD) */
  internalId?: number;
  name: string;
  reactive: boolean;
  color: boolean;
  speed: boolean;
  reverse?: boolean;
  perKey?: boolean;
};

/** Onboard RGB, Side LED, Custom RGB & Rhythm capabilities */
export type BoardRgbSpec = {
  previewEngine: RgbPreviewEngineId;
  colorModel: RgbColorModel;
  maxBrightness: number;
  sideMaxBrightness?: number;
  maxSpeed: number;
  perKeyModeId: number;
  offModeId: number | null;
  keyModes: readonly BoardRgbModeSpec[];
  hasSideRgb: boolean;
  sideLedCount: number;
  sideModes: readonly BoardRgbModeSpec[];
  supportsCustomRgb: boolean;
  supportsRhythmSync: boolean;
};

/** Onboard profile slot capabilities */
export type BoardProfileSpec = {
  slots: readonly ProfileSlot[];
  supportsRename: boolean;
  supportsAutoSwitch: boolean;
};

export type BoardSocdOptionSpec = {
  value: number;
  labelKey: string;
  title: string;
  desc: string;
  verified?: boolean;
};

/** Advanced Keys (DKS / SOCD / MT / TGL...) capabilities */
export type BoardAdvancedKeysSpec = {
  maxBindings: number;
  supportedModes: readonly AdvancedKeyModeId[];
  socdOptions: readonly BoardSocdOptionSpec[];
  dksSupported: boolean;
  dksUnsupportedDocUrl?: string;
};

/** General device settings capabilities */
export type BoardDeviceSettingsSpec = {
  writablePollingRate: boolean;
  pollingRates: readonly PollingRate[];
  pollingRateNoteKey?: string;
  supportsWinLock: boolean;
  supportsOsMode: boolean;
};

export type BoardRemapLayers = Record<0 | 1 | 2, Record<string, number>>;

export type BoardDescriptor = {
  id: HeroDeviceModelId;
  /** Backward-compatibility aliases (e.g. ['win68'] for 'win68HeMax') */
  aliases?: readonly string[];
  protocol: ProtocolFamilyId;
  name: string;
  label: string;
  layoutTag: '60%' | '65%' | '75%' | '80%' | '96%' | '100%';
  sideTab: boolean;
  thumbnail: string;
  usb: BoardUsbDescriptor;
  /** Preserved for zero-breakage compatibility */
  capabilities: BoardCapabilities;
  switches: BoardSwitchCatalogSpec;
  performance: BoardPerformanceSpec;
  rgb: BoardRgbSpec;
  profiles: BoardProfileSpec;
  advancedKeys: BoardAdvancedKeysSpec;
  deviceSettings: BoardDeviceSettingsSpec;
  /** Physical row and key matrix rendered in the UI (independent per model) */
  rows: HeroKeyRow[];
  /** Ordered interactive key IDs and fast lookup set */
  keyIds: readonly string[];
  keyIdSet: ReadonlySet<string>;
  /** Key center coordinates [x, y] in U units for Custom RGB & Rhythm */
  keyCoordinates: Readonly<Record<string, readonly [number, number]>>;
  /** Bidirectional mapping between frontend keyId and hardware position (pos) */
  keyIdToPos: Readonly<Record<string, number>>;
  posToKeyId: ReadonlyMap<number, string>;
  /** Valid hardware positions for HID packet & Hall stream validation */
  validPositions: ReadonlySet<number>;
  /** Factory default remap keycodes across all 3 layers (0, 1, 2) */
  factoryRemapLayers: BoardRemapLayers;
  /** Offline/demo lighting frame generator */
  makeDemoLighting: () => Record<string, string>;
  /** Optional fallback color sources for 68-key DSP compatibility */
  fallbackColorSources?: Readonly<Record<string, string>>;
};
