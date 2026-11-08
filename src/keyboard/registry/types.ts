export type HeroDeviceModelId = 'hero68' | 'hero68Xs' | 'hero84' | 'win68HeMax' | 'win68';

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

export type BoardRemapLayers = Record<0 | 1 | 2, Record<string, number>>;

export type BoardDescriptor = {
  id: HeroDeviceModelId;
  name: string;
  label: string;
  layoutTag: '60%' | '65%' | '75%' | '80%' | '96%' | '100%';
  sideTab: boolean;
  thumbnail: string;
  usb: BoardUsbDescriptor;
  capabilities: BoardCapabilities;
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
