import { performance } from 'node:perf_hooks';
import type { HeroDeviceModelId } from '../../src/keyboard/devices';
import { HERO68_KEY_IDS } from '../../src/keyboard/hero68Layout';
import { HERO84_KEY_IDS } from '../../src/keyboard/hero84Layout';
import {
  selectProfile,
  writeActuationBatch,
  writeDeadZoneBatch,
  writeRapidTriggerBatch,
  writeSwitchTypeBatch
} from '../../src/protocol/hero68/commands';
import { keyIdToPos } from '../../src/protocol/hero68/keyPositions';
import {
  switchFirmwareId,
  WIN68_SWITCH_PROFILES,
  type SwitchProfileId
} from '../../src/protocol/hero68/switchProfiles';
import type { ProfileSlot } from '../../src/protocol/hero68/types';
import { xsydReport, xsydSelectProfileSlot } from '../../src/protocol/xsyd/codec';
import {
  buildFieldWriteFrame,
  chunkFieldWrites,
  keyValueForCode,
  mmToUm,
  XsydFeatureField,
  type XsydFieldWrite
} from '../../src/protocol/xsyd/features';
import type { SavedKeyboardProfile, StoredProfileRecord } from '../../src/state/profileTypes';
import {
  validateAutoSwitchRequest,
  WriteBlockedError
} from '../deviceRequests';

export interface HardwareTransport {
  deviceModel?: HeroDeviceModelId | null;
  sendReport: (packet: Uint8Array) => Promise<Uint8Array | void>;
  lastManualSaveAt?: number;
}

export type AutoSwitchTransport = HardwareTransport;

export type AutoSwitchExecutionResultMode =
  | 'slot-switch'
  | 'ram-stream'
  | 'xsyd-slot3-cache-hit'
  | 'xsyd-slot3-warmup'
  | 'xsyd-slot3-committed';

export interface XsydSlot3VirtualizationState {
  cachedProfileUid: string | null;
  cachedProfileName: string | null;
  cachedSignature: string | null;
  cacheHits: number;
  commitsThisHour: number;
  maxCommitsPerHour: number;
  lastCommitAt: number;
  cooldownMs: number;
}

interface HeroKeyHardwareState {
  switchId: SwitchProfileId;
  actuationMm: number;
  rtEnabled: boolean;
  pressMm: number;
  releaseMm: number;
  dzEnabled: boolean;
  topDzMm: number;
  bottomDzMm: number;
}

/**
 * Builds the XSYD 0x5C Per-Key SRAM RGB packet (`0x2A`) without the `FE FE FE FE`
 * Flash sentinel (`docs/xsyd-protocol.md:L346-347`), updating LED colors in SRAM with 0 Flash wear.
 */
export function buildXsydSramColorIndicatorPacket(hexColor: string): Uint8Array {
  const clean = hexColor.replace('#', '');
  const r = parseInt(clean.slice(0, 2) || 'ff', 16) & 0xff;
  const g = parseInt(clean.slice(2, 4) || 'd4', 16) & 0xff;
  const b = parseInt(clean.slice(4, 6) || '5c', 16) & 0xff;
  const payload = new Uint8Array(56);
  payload[0] = 0x00; // chunk 0
  payload[4] = 0; // key index 0 (Esc indicator)
  payload[5] = r;
  payload[6] = g;
  payload[7] = b;
  // Intentionally omit 0xFE 0xFE 0xFE 0xFE sentinel so firmware never flushes to Flash
  return xsydReport(0x2a, payload);
}

/**
 * Computes a deterministic hardware signature of a profile's Hall parameters
 * so XSYD Slot 3 Virtualization can detect exact cache hits across Alt-Tabs.
 */
export function computeProfileHallSignature(profile: SavedKeyboardProfile): string {
  const d = profile.draft;
  const parts: string[] = [];
  for (const keyId of HERO68_KEY_IDS) {
    const sw = (d.assignedSwitchesByKey?.[keyId] ?? 'white') as SwitchProfileId;
    const act = (d.actuationByKey?.[keyId] ?? 1.6).toFixed(3);
    const rt = d.rapidTriggerByKey?.[keyId] ? '1' : '0';
    const split = d.splitSensitivityByKey?.[keyId] ? '1' : '0';
    const press = (
      split === '1'
        ? d.pressSensitivityByKey?.[keyId] ?? 0.5
        : d.rapidSensitivityByKey?.[keyId] ?? 0.65
    ).toFixed(3);
    const rel = (
      split === '1'
        ? d.releaseSensitivityByKey?.[keyId] ?? 0.55
        : d.rapidSensitivityByKey?.[keyId] ?? 0.65
    ).toFixed(3);
    const dz = d.deadzoneEnabledByKey?.[keyId] === false ? '0' : '1';
    const topDz = (d.topDeadzoneByKey?.[keyId] ?? 0).toFixed(3);
    const botDz = (d.bottomDeadzoneByKey?.[keyId] ?? 0).toFixed(3);
    parts.push(`${keyId}:${sw},${act},${rt},${press},${rel},${dz},${topDz},${botDz}`);
  }
  return parts.join('|');
}

function xsydSwitchCurveId(switchId: SwitchProfileId): number {
  const found = WIN68_SWITCH_PROFILES.find((s) => s.id === switchId);
  return found?.xsydFirmwareId ?? 3;
}

/**
 * Adaptive Zero-Flash-Wear Hardware Executor for AULA Keyboards:
 * 1. AULA XSYD (`win68HeMax`):
 *    - **Tier 1 (Pinned Slots 0, 1, 2)**: Instant `0x00 0x70 <slot>` + `0x2A` SRAM RGB indicator (0 Flash wear).
 *    - **Tier 2 (Smart Slot 3 Virtualization for >3 / 10+ Profiles)**:
 *      - Uses hardware Slot 3 (`Slot 4` in UI) as a Smart Dynamic Scratchpad.
 *      - **Cache Hit (`cachedSignature === profileSignature`)**: When returning to the active game after Alt-Tabbing to Desktop/Discord/Browser,
 *        Slot 3 already holds the game's parameters -> switches via `0x00 0x70 0x03` + `0x2A` with **0 Flash writes & instant response**!
 *      - **Cache Miss (Warm-up -> Session Commit)**: Immediately activates Slot 3 + SRAM RGB color indicator (`xsyd-slot3-warmup`, 0 Flash writes).
 *        Only after the user stays in the new game continuously for the session warm-up window (`12s`) AND passes the Token-Bucket
 *        Flash Wear Guard (`<= 10` commits/hour, `45s` cooldown), commits the per-key diff to Slot 3 (`commitXsydSlot3Overflow`).
 * 2. AULA ByteTech v3 (`hero68`, `hero84`, `hero68Xs`):
 *    - `slot-switch` mode (Default): Sends 1 single `CMD 0x10` (`selectProfile(slot)`) packet -> 0 Flash table overwrites!
 *    - `ram-stream` / Diff-based ApplyPlan mode: Computes per-key diff against the last applied baseline,
 *      locks `includeKeymap = false` (never sends `0x03` Remap or `0x05` Macro), and enforces the strict write order:
 *      `0x15 (Switch) -> 0x13 (Actuation) -> 0x19 (Rapid Trigger) -> 0x16 (Deadzone)`.
 */
export class ZeroWearHardwareExecutor {
  private lastAppliedHeroBaseline = new Map<string, HeroKeyHardwareState>();
  private lastCommittedXsydSlot3Baseline = new Map<string, HeroKeyHardwareState>();
  private cachedXsydSlot3ProfileUid: string | null = null;
  private cachedXsydSlot3ProfileName: string | null = null;
  private cachedXsydSlot3Signature: string | null = null;
  private xsydSlot3CacheHits = 0;
  private xsydSlot3CommitTimestamps: number[] = [];
  private lastXsydSlot3CommitAt = 0;

  public readonly maxXsydSlot3CommitsPerHour = 10;
  public readonly xsydSlot3CommitCooldownMs = 45_000;

  public getXsydSlot3State(nowMs: number = performance.now()): XsydSlot3VirtualizationState {
    this.pruneCommitWindow(nowMs);
    return {
      cachedProfileUid: this.cachedXsydSlot3ProfileUid,
      cachedProfileName: this.cachedXsydSlot3ProfileName,
      cachedSignature: this.cachedXsydSlot3Signature,
      cacheHits: this.xsydSlot3CacheHits,
      commitsThisHour: this.xsydSlot3CommitTimestamps.length,
      maxCommitsPerHour: this.maxXsydSlot3CommitsPerHour,
      lastCommitAt: this.lastXsydSlot3CommitAt,
      cooldownMs: this.xsydSlot3CommitCooldownMs
    };
  }

  private pruneCommitWindow(nowMs: number): void {
    const oneHourAgo = nowMs - 3_600_000;
    this.xsydSlot3CommitTimestamps = this.xsydSlot3CommitTimestamps.filter(
      (t) => t >= oneHourAgo
    );
  }

  /**
   * Determines whether an XSYD profile uses Pinned Fast-Switch (Slots 0..2)
   * or Smart Dynamic Scratchpad Virtualization (Slot 3, used for Profile #4..#N).
   */
  public isXsydDynamicOverflowProfile(profile: SavedKeyboardProfile): boolean {
    if (profile.metadata.tier === 'onboard' && (profile.metadata.mappedOnboardSlot ?? 0) <= 2) {
      return false;
    }
    if (profile.metadata.executionMode === 'ram-stream') {
      return true;
    }
    return (profile.metadata.mappedOnboardSlot ?? 3) >= 3;
  }

  public async executeAutoSwitch(
    profile: StoredProfileRecord,
    transport: HardwareTransport,
    nowMs: number = performance.now()
  ): Promise<{
    mode: AutoSwitchExecutionResultMode;
    packetsSent: number;
    packets: Uint8Array[];
    needsSlot3WarmupCommit?: boolean;
  }> {
    const model: HeroDeviceModelId =
      transport.deviceModel ?? profile.metadata.createdFor ?? 'hero68';
    const targetSlot = profile.metadata.mappedOnboardSlot ?? 0;
    const packets: Uint8Array[] = [];

    // Strategy A: AULA XSYD 0x5C (WIN 68 HE MAX)
    if (model === 'win68HeMax') {
      const effectiveGuardTimestamp = Math.max(
        transport.lastManualSaveAt ?? 0,
        this.lastXsydSlot3CommitAt
      );
      if (effectiveGuardTimestamp > 0 && nowMs - effectiveGuardTimestamp < 600) {
        throw new WriteBlockedError(
          'XSYD 600ms post-save guard active: deferring slot switch until SRAM flush completes'
        );
      }

      const isDynamicOverflow = this.isXsydDynamicOverflowProfile(profile);

      // Tier 1: Pinned Slots 0, 1, 2 -> Instant 0-Wear Slot Switch
      if (!isDynamicOverflow) {
        const pinnedSlot = Math.max(0, Math.min(2, targetSlot)) as ProfileSlot;
        const slotPacket = xsydSelectProfileSlot(pinnedSlot);
        validateAutoSwitchRequest(slotPacket, 'xsyd');
        await transport.sendReport(slotPacket);
        packets.push(slotPacket);

        if (profile.metadata.color) {
          const rgbSramPacket = buildXsydSramColorIndicatorPacket(profile.metadata.color);
          validateAutoSwitchRequest(rgbSramPacket, 'xsyd');
          await transport.sendReport(rgbSramPacket);
          packets.push(rgbSramPacket);
        }

        return { mode: 'slot-switch', packetsSent: packets.length, packets };
      }

      // Tier 2: Dynamic Overflow Profile (#4..#N) on Smart Scratchpad Slot 3
      const signature = computeProfileHallSignature(profile);
      const slot3Packet = xsydSelectProfileSlot(3);
      validateAutoSwitchRequest(slot3Packet, 'xsyd');
      await transport.sendReport(slot3Packet);
      packets.push(slot3Packet);

      if (profile.metadata.color) {
        const rgbSramPacket = buildXsydSramColorIndicatorPacket(profile.metadata.color);
        validateAutoSwitchRequest(rgbSramPacket, 'xsyd');
        await transport.sendReport(rgbSramPacket);
        packets.push(rgbSramPacket);
      }

      // Sub-case 2A: Slot 3 Cache Hit! (User Alt-Tabbed out and back to the same overflow game)
      if (this.cachedXsydSlot3Signature === signature) {
        this.xsydSlot3CacheHits++;
        this.cachedXsydSlot3ProfileUid = profile.metadata.uid;
        this.cachedXsydSlot3ProfileName = profile.metadata.name;
        return {
          mode: 'xsyd-slot3-cache-hit',
          packetsSent: packets.length,
          packets,
          needsSlot3WarmupCommit: false
        };
      }

      // Sub-case 2B: Slot 3 Cache Miss -> Enter 0-Wear Warm-up; schedule session commit after sustained dwell
      return {
        mode: 'xsyd-slot3-warmup',
        packetsSent: packets.length,
        packets,
        needsSlot3WarmupCommit: true
      };
    }

    // Strategy B: AULA ByteTech v3 (HERO 68 HE / HERO 84 HE / HERO 68 XS)
    const heroSlot = Math.max(0, Math.min(2, targetSlot)) as ProfileSlot;
    if (profile.metadata.executionMode !== 'ram-stream') {
      const packet = selectProfile(heroSlot);
      validateAutoSwitchRequest(packet, 'bytetech');
      await transport.sendReport(packet);
      packets.push(packet);
      return { mode: 'slot-switch', packetsSent: 1, packets };
    }

    // Strategy C: Guarded Diff-Based ApplyPlan (when user explicitly selects ram-stream for >3 profiles on ByteTech)
    // Hard-locked `includeKeymap = false` (0x03 Remap and 0x05 Macro are strictly excluded)
    // Enforces strict write order: 0x15 (Switch) -> 0x13 (Actuation) -> 0x19 (RT) -> 0x16 (Deadzone)
    const keyIds = model === 'hero84' ? HERO84_KEY_IDS : HERO68_KEY_IDS;
    const precisionMm = model === 'hero68Xs' ? 0.005 : 0.01;
    const draft = profile.draft;

    const changedKeys: string[] = [];
    for (const keyId of keyIds) {
      const nextState: HeroKeyHardwareState = {
        switchId: (draft.assignedSwitchesByKey?.[keyId] ?? 'white') as SwitchProfileId,
        actuationMm: draft.actuationByKey?.[keyId] ?? 1.6,
        rtEnabled: draft.rapidTriggerByKey?.[keyId] ?? false,
        pressMm: draft.splitSensitivityByKey?.[keyId]
          ? (draft.pressSensitivityByKey?.[keyId] ?? 0.5)
          : (draft.rapidSensitivityByKey?.[keyId] ?? 0.65),
        releaseMm: draft.splitSensitivityByKey?.[keyId]
          ? (draft.releaseSensitivityByKey?.[keyId] ?? 0.55)
          : (draft.rapidSensitivityByKey?.[keyId] ?? 0.65),
        dzEnabled: draft.deadzoneEnabledByKey?.[keyId] ?? true,
        topDzMm: draft.topDeadzoneByKey?.[keyId] ?? 0,
        bottomDzMm: draft.bottomDeadzoneByKey?.[keyId] ?? 0
      };
      const prev = this.lastAppliedHeroBaseline.get(keyId);
      if (
        !prev ||
        prev.switchId !== nextState.switchId ||
        Math.abs(prev.actuationMm - nextState.actuationMm) > 0.001 ||
        prev.rtEnabled !== nextState.rtEnabled ||
        Math.abs(prev.pressMm - nextState.pressMm) > 0.001 ||
        Math.abs(prev.releaseMm - nextState.releaseMm) > 0.001 ||
        prev.dzEnabled !== nextState.dzEnabled ||
        Math.abs(prev.topDzMm - nextState.topDzMm) > 0.001 ||
        Math.abs(prev.bottomDzMm - nextState.bottomDzMm) > 0.001
      ) {
        changedKeys.push(keyId);
        this.lastAppliedHeroBaseline.set(keyId, nextState);
      }
    }

    if (changedKeys.length === 0) {
      return { mode: 'ram-stream', packetsSent: 0, packets };
    }

    // 1. 0x15 Switch Type Batch
    const switchPackets = writeSwitchTypeBatch(
      changedKeys.map(
        keyId =>
          [keyIdToPos(keyId, model), switchFirmwareId((draft.assignedSwitchesByKey?.[keyId] ?? 'white') as SwitchProfileId)] as const
      )
    );
    // 2. 0x13 Actuation Batch
    const actuationPackets = writeActuationBatch(
      changedKeys.map(keyId => ({
        profile: heroSlot,
        layer: 0 as const,
        keyId: keyIdToPos(keyId, model),
        distanceMm: draft.actuationByKey?.[keyId] ?? 1.6,
        precisionMm,
        global: true
      }))
    );
    // 3. 0x19 Rapid Trigger Batch
    const rtPackets = writeRapidTriggerBatch(
      changedKeys.map(keyId => {
        const enabled = draft.rapidTriggerByKey?.[keyId] ?? false;
        const split = draft.splitSensitivityByKey?.[keyId] ?? false;
        const rapid = draft.rapidSensitivityByKey?.[keyId] ?? 0.65;
        return {
          profile: heroSlot,
          layer: 0 as const,
          keyId: keyIdToPos(keyId, model),
          enabled,
          pressMm: enabled ? (split ? (draft.pressSensitivityByKey?.[keyId] ?? 0.5) : rapid) : 0,
          releaseMm: enabled
            ? split
              ? (draft.releaseSensitivityByKey?.[keyId] ?? 0.55)
              : rapid
            : 0,
          precisionMm,
          global: true
        };
      })
    );
    // 4. 0x16 Deadzone Batch
    const dzPackets = writeDeadZoneBatch(
      changedKeys.map(keyId => ({
        layer: 0 as const,
        keyId: keyIdToPos(keyId, model),
        topMm: draft.topDeadzoneByKey?.[keyId] ?? 0,
        bottomMm: draft.bottomDeadzoneByKey?.[keyId] ?? 0,
        precisionMm,
        global: true,
        enabled: draft.deadzoneEnabledByKey?.[keyId] ?? true
      }))
    );

    const orderedBatch = [...switchPackets, ...actuationPackets, ...rtPackets, ...dzPackets];
    for (const pkt of orderedBatch) {
      validateAutoSwitchRequest(pkt, 'bytetech', true);
      await transport.sendReport(pkt);
      packets.push(pkt);
    }

    return { mode: 'ram-stream', packetsSent: packets.length, packets };
  }

  /**
   * Commits an overflow profile (#4..#N) into XSYD Slot 3 ONLY after the user has stayed
   * continuously in the target game for the session warm-up window (`12s`) AND passes
   * the Token-Bucket Flash Wear Guard (`<= 10` commits/hour, `>= 45s` cooldown).
   * Once committed, all subsequent Alt-Tabs to/from this game hit the Slot 3 Cache with 0 Flash wear!
   */
  public async commitXsydSlot3Overflow(
    profile: SavedKeyboardProfile,
    transport: HardwareTransport,
    nowMs: number = performance.now()
  ): Promise<{
    committed: boolean;
    reason?: 'already-cached' | 'cooldown-active' | 'hourly-budget-exhausted';
    packetsSent: number;
    packets: Uint8Array[];
  }> {
    const signature = computeProfileHallSignature(profile);
    if (this.cachedXsydSlot3Signature === signature) {
      this.cachedXsydSlot3ProfileUid = profile.metadata.uid;
      this.cachedXsydSlot3ProfileName = profile.metadata.name;
      return { committed: false, reason: 'already-cached', packetsSent: 0, packets: [] };
    }

    this.pruneCommitWindow(nowMs);
    if (
      this.lastXsydSlot3CommitAt > 0 &&
      nowMs - this.lastXsydSlot3CommitAt < this.xsydSlot3CommitCooldownMs
    ) {
      return { committed: false, reason: 'cooldown-active', packetsSent: 0, packets: [] };
    }
    if (this.xsydSlot3CommitTimestamps.length >= this.maxXsydSlot3CommitsPerHour) {
      return { committed: false, reason: 'hourly-budget-exhausted', packetsSent: 0, packets: [] };
    }

    const packets: Uint8Array[] = [];
    // Ensure Slot 3 is active before writing diff fields
    const slot3Packet = xsydSelectProfileSlot(3);
    validateAutoSwitchRequest(slot3Packet, 'xsyd');
    await transport.sendReport(slot3Packet);
    packets.push(slot3Packet);

    const draft = profile.draft;
    const writes: XsydFieldWrite[] = [];

    for (const keyId of HERO68_KEY_IDS) {
      const pos = keyValueForCode(keyId);
      if (pos === undefined) continue;

      const nextState: HeroKeyHardwareState = {
        switchId: (draft.assignedSwitchesByKey?.[keyId] ?? 'white') as SwitchProfileId,
        actuationMm: draft.actuationByKey?.[keyId] ?? 1.6,
        rtEnabled: draft.rapidTriggerByKey?.[keyId] ?? false,
        pressMm: draft.splitSensitivityByKey?.[keyId]
          ? (draft.pressSensitivityByKey?.[keyId] ?? 0.5)
          : (draft.rapidSensitivityByKey?.[keyId] ?? 0.65),
        releaseMm: draft.splitSensitivityByKey?.[keyId]
          ? (draft.releaseSensitivityByKey?.[keyId] ?? 0.55)
          : (draft.rapidSensitivityByKey?.[keyId] ?? 0.65),
        dzEnabled: draft.deadzoneEnabledByKey?.[keyId] ?? true,
        topDzMm: draft.topDeadzoneByKey?.[keyId] ?? 0,
        bottomDzMm: draft.bottomDeadzoneByKey?.[keyId] ?? 0
      };

      const prev = this.lastCommittedXsydSlot3Baseline.get(keyId);
      if (
        !prev ||
        prev.switchId !== nextState.switchId ||
        Math.abs(prev.actuationMm - nextState.actuationMm) > 0.001 ||
        prev.rtEnabled !== nextState.rtEnabled ||
        Math.abs(prev.pressMm - nextState.pressMm) > 0.001 ||
        Math.abs(prev.releaseMm - nextState.releaseMm) > 0.001 ||
        prev.dzEnabled !== nextState.dzEnabled ||
        Math.abs(prev.topDzMm - nextState.topDzMm) > 0.001 ||
        Math.abs(prev.bottomDzMm - nextState.bottomDzMm) > 0.001
      ) {
        writes.push(
          {
            pos,
            field: XsydFeatureField.SwitchType,
            value: xsydSwitchCurveId(nextState.switchId)
          },
          {
            pos,
            field: XsydFeatureField.Travel,
            value: Math.max(100, Math.min(3400, mmToUm(nextState.actuationMm)))
          },
          {
            pos,
            field: XsydFeatureField.Header,
            value: nextState.rtEnabled ? 0x20 : 0x00
          }
        );
        if (nextState.rtEnabled) {
          writes.push(
            {
              pos,
              field: XsydFeatureField.RapidTriggerPress,
              value: Math.max(10, Math.min(3400, Math.round(mmToUm(nextState.pressMm) / 10) * 10))
            },
            {
              pos,
              field: XsydFeatureField.RapidTriggerRelease,
              value: Math.max(10, Math.min(3400, Math.round(mmToUm(nextState.releaseMm) / 10) * 10))
            }
          );
        }
        if (nextState.dzEnabled && (nextState.topDzMm > 0 || nextState.bottomDzMm > 0)) {
          writes.push(
            {
              pos,
              field: XsydFeatureField.TopDeadzone,
              value: Math.max(0, Math.min(1000, mmToUm(nextState.topDzMm)))
            },
            {
              pos,
              field: XsydFeatureField.BottomDeadzone,
              value: Math.max(0, Math.min(1000, mmToUm(nextState.bottomDzMm)))
            }
          );
        }
        this.lastCommittedXsydSlot3Baseline.set(keyId, nextState);
      }
    }

    for (const chunk of chunkFieldWrites(writes)) {
      const frame = buildFieldWriteFrame(chunk);
      validateAutoSwitchRequest(frame, 'xsyd', true);
      await transport.sendReport(frame);
      packets.push(frame);
    }

    if (profile.metadata.color) {
      const rgbSramPacket = buildXsydSramColorIndicatorPacket(profile.metadata.color);
      validateAutoSwitchRequest(rgbSramPacket, 'xsyd');
      await transport.sendReport(rgbSramPacket);
      packets.push(rgbSramPacket);
    }

    this.cachedXsydSlot3ProfileUid = profile.metadata.uid;
    this.cachedXsydSlot3ProfileName = profile.metadata.name;
    this.cachedXsydSlot3Signature = signature;
    this.lastXsydSlot3CommitAt = nowMs;
    this.xsydSlot3CommitTimestamps.push(nowMs);
    transport.lastManualSaveAt = nowMs;

    return { committed: true, packetsSent: packets.length, packets };
  }
}
