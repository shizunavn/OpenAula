import { HERO68_PROTOCOL_KEY_MAP } from './keyMap';
import type { ProfileSlot } from './hero68/types';
import { isWin68HeMaxModel, type HeroDeviceModelId } from '../keyboard/devices';
export type KeyDeviceSettings = {
  keyId: string;
  matrixKey: number;
  matrixHex: string;
  actuationMm: number;
  rapidTriggerEnabled: boolean;
  splitSensitivity: boolean;
  rapidSensitivityMm: number;
  pressSensitivityMm: number;
  releaseSensitivityMm: number;
  deadzoneEnabled: boolean;
  topDeadzoneMm: number;
  bottomDeadzoneMm: number;
  switchProfile: string;
};
export type DeviceConfigurationSnapshot = {
  keys: KeyDeviceSettings[];
  tachyon: boolean;
  /** Which onboard profile slot (0, 1, or 2) to read/write. */
  profileSlot: ProfileSlot;
  /** Target board model used for keyIdToPos mapping when saving. */
  model?: HeroDeviceModelId;
  /** Optional host-facing distance unit override (e.g. `0.005` on HERO 68 XS, `0.01` on HERO 68 HE). */
  precisionMm?: number;
};
export type Hero68ProtocolEncoder = {
  /**
   * RE hook: turn the normalized device snapshot into the exact packets/HEX
   * discovered from the AULA protocol. Keep packet knowledge out of React UI.
   */
  encodeSave(snapshot: DeviceConfigurationSnapshot): string[];
};
export type Hero68Transport = {
  sendHex(hex: string): Promise<void>;
  sendBatchHex?(hexes: readonly string[]): Promise<void>;
};
let protocolEncoder: Hero68ProtocolEncoder | null = null;
let transport: Hero68Transport | null = null;
let xsydProtocolEncoder: Hero68ProtocolEncoder | null = null;
let xsydTransport: Hero68Transport | null = null;
export function registerHero68Protocol(
  encoder: Hero68ProtocolEncoder,
  nextTransport: Hero68Transport
) {
  protocolEncoder = encoder;
  transport = nextTransport;
}
export function registerXsydProtocol(
  encoder: Hero68ProtocolEncoder,
  nextTransport: Hero68Transport
) {
  xsydProtocolEncoder = encoder;
  xsydTransport = nextTransport;
}
export function isHero68ProtocolReady(model?: HeroDeviceModelId) {
  if (isWin68HeMaxModel(model)) {
    return Boolean((xsydProtocolEncoder && xsydTransport) || (protocolEncoder && transport));
  }
  return Boolean(protocolEncoder && transport);
}
export async function saveDeviceConfiguration(snapshot: DeviceConfigurationSnapshot) {
  const useXsyd = isWin68HeMaxModel(snapshot.model) && xsydProtocolEncoder && xsydTransport;
  const activeEncoder = useXsyd ? xsydProtocolEncoder : protocolEncoder;
  const activeTransport = useXsyd ? xsydTransport : transport;
  if (!activeEncoder || !activeTransport) {
    throw new Error('HERO68 protocol is not ready. Reconnect the keyboard and try again.');
  }
  const packets = activeEncoder.encodeSave(snapshot);
  if (activeTransport.sendBatchHex) {
    await activeTransport.sendBatchHex(packets);
  } else {
    for (const packet of packets) {
      await activeTransport.sendHex(packet);
    }
  }
  return {
    mode: 'sent' as const,
    packets
  };
}
export function makeKeyDeviceSettings(
  keyId: string,
  values: Omit<KeyDeviceSettings, 'keyId' | 'matrixKey' | 'matrixHex'>,
  _model?: HeroDeviceModelId
): KeyDeviceSettings {
  const address = HERO68_PROTOCOL_KEY_MAP[keyId];
  return {
    keyId,
    matrixKey: address?.matrixKey ?? 0,
    matrixHex: address?.matrixHex ?? '0x0000',
    ...values
  };
}
