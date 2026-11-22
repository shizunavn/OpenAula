import type { ProfileSlot } from '../protocol/hero68/types';
import type { StoredProfileRecord, WootProfileMetadata } from './profileTypes';

export type AutoProfileToggleState = {
  enabled: boolean;
  revertToDefault: boolean;
  notifyOnSwitch: boolean;
};

export type ServiceHydrationInput = {
  localOnboardMetadata: Record<ProfileSlot, WootProfileMetadata>;
  localLinkedProfiles: StoredProfileRecord[];
  serviceProfiles: StoredProfileRecord[];
  serviceAutoProfile?: Partial<AutoProfileToggleState> | null;
};

export type ServiceHydrationResult = {
  shouldHydrate: boolean;
  onboardMetadata: Record<ProfileSlot, WootProfileMetadata>;
  linkedProfiles: StoredProfileRecord[];
  autoProfileEnabled?: boolean;
  revertToDefaultOnFocusLoss?: boolean;
  notifyOnProfileSwitch?: boolean;
};

export function hasAutoSwitchRules(
  onboardMetadata: Partial<Record<ProfileSlot, WootProfileMetadata>> | undefined,
  linkedProfiles: readonly StoredProfileRecord[] | undefined
): boolean {
  if (linkedProfiles && linkedProfiles.some(p => (p.metadata?.linkedApps?.length ?? 0) > 0)) {
    return true;
  }
  if (onboardMetadata) {
    for (const slot of [0, 1, 2, 3] as const) {
      if ((onboardMetadata[slot]?.linkedApps?.length ?? 0) > 0) {
        return true;
      }
    }
  }
  return false;
}

export function resolveHydratedProfilesFromService(
  input: ServiceHydrationInput
): ServiceHydrationResult {
  const { localOnboardMetadata, localLinkedProfiles, serviceProfiles, serviceAutoProfile } = input;

  const localHasRules = hasAutoSwitchRules(localOnboardMetadata, localLinkedProfiles);
  const serviceHasRules = serviceProfiles.some(p => (p.metadata?.linkedApps?.length ?? 0) > 0);

  if (localHasRules || !serviceHasRules) {
    return {
      shouldHydrate: false,
      onboardMetadata: localOnboardMetadata,
      linkedProfiles: localLinkedProfiles
    };
  }

  const nextOnboard: Record<ProfileSlot, WootProfileMetadata> = {
    0: localOnboardMetadata[0],
    1: localOnboardMetadata[1],
    2: localOnboardMetadata[2],
    3: localOnboardMetadata[3]
  };
  const nextLinked: StoredProfileRecord[] = [];
  const seenLinkedUids = new Set<string>();

  for (const record of serviceProfiles) {
    const uid = record?.metadata?.uid;
    if (!uid) continue;

    if (uid.startsWith('onboard-')) {
      const slot = Number(uid.slice('onboard-'.length)) as ProfileSlot;
      if (slot === 0 || slot === 1 || slot === 2 || slot === 3) {
        nextOnboard[slot] = {
          ...nextOnboard[slot],
          ...record.metadata,
          uid: `onboard-${slot}`,
          mappedOnboardSlot: slot,
          linkedApps: Array.isArray(record.metadata.linkedApps) ? record.metadata.linkedApps : []
        };
      }
      continue;
    }

    if ((record.metadata.linkedApps?.length ?? 0) > 0 && !seenLinkedUids.has(uid)) {
      seenLinkedUids.add(uid);
      nextLinked.push(record);
    }
  }

  return {
    shouldHydrate: true,
    onboardMetadata: nextOnboard,
    linkedProfiles: nextLinked,
    autoProfileEnabled:
      typeof serviceAutoProfile?.enabled === 'boolean' ? serviceAutoProfile.enabled : undefined,
    revertToDefaultOnFocusLoss:
      typeof serviceAutoProfile?.revertToDefault === 'boolean'
        ? serviceAutoProfile.revertToDefault
        : undefined,
    notifyOnProfileSwitch:
      typeof serviceAutoProfile?.notifyOnSwitch === 'boolean'
        ? serviceAutoProfile.notifyOnSwitch
        : undefined
  };
}
