import { useSyncExternalStore } from 'react';
import { getLocalServicePermission } from './localServiceAccess';
import { useRgbServiceState } from './rgbServiceState';
import {
  REQUIRED_AUTO_PROFILE_SERVICE_VERSION,
  type LinkedAppRule,
  type StoredProfileRecord
} from '../state/profileTypes';

export { REQUIRED_AUTO_PROFILE_SERVICE_VERSION };

export function isServiceVersionAtLeast(
  current: string | null | undefined,
  required: string = REQUIRED_AUTO_PROFILE_SERVICE_VERSION
): boolean {
  if (!current) {
    return false;
  }
  const cleanCurrent = current.trim().replace(/^v/i, '').split('-')[0];
  const cleanRequired = required.trim().replace(/^v/i, '').split('-')[0];
  const curParts = cleanCurrent.split('.').map(n => Number.parseInt(n, 10) || 0);
  const reqParts = cleanRequired.split('.').map(n => Number.parseInt(n, 10) || 0);
  const len = Math.max(curParts.length, reqParts.length, 3);
  for (let i = 0; i < len; i++) {
    const a = curParts[i] ?? 0;
    const b = reqParts[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

export type BgServiceConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'permission-denied'
  | 'service-down';

export interface OpenWindowApp {
  pid: number;
  exe: string;
  path: string;
  title: string;
}

export interface InstalledLinkableApp {
  id: string;
  name: string;
  exe: string;
  path: string;
  directory: string;
  sourceType: 'steam' | 'disk';
  steamAppId?: number;
}

export interface AutoProfileServiceState {
  enabled: boolean;
  revertToDefault: boolean;
  notifyOnSwitch: boolean;
  activeApp: OpenWindowApp | null;
  activeProfileUid: string | null;
  candidateProfileUid: string | null;
  switchCount: number;
  ramAppliesCount: number;
  flashWritesSaved: number;
  lastSwitchAt: number;
  lastError: string | null;
}

export interface BgServiceSnapshot {
  connectionState: BgServiceConnectionState;
  openWindows: OpenWindowApp[];
  installedApps: InstalledLinkableApp[];
  autoProfile: AutoProfileServiceState;
  lastUpdated: number;
}

const SERVICE_BASE_URL = 'http://127.0.0.1:16868';

let currentSnapshot: BgServiceSnapshot = {
  connectionState: 'idle',
  openWindows: [],
  installedApps: [],
  autoProfile: {
    enabled: true,
    revertToDefault: true,
    notifyOnSwitch: true,
    activeApp: null,
    activeProfileUid: null,
    candidateProfileUid: null,
    switchCount: 0,
    ramAppliesCount: 0,
    flashWritesSaved: 0,
    lastSwitchAt: 0,
    lastError: null
  },
  lastUpdated: 0
};

const listeners = new Set<() => void>();
let eventSource: EventSource | null = null;

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function getBgServiceSnapshot(): BgServiceSnapshot {
  return currentSnapshot;
}

export async function fetchOpenWindows(): Promise<OpenWindowApp[]> {
  try {
    const res = await fetch(`${SERVICE_BASE_URL}/apps/open-windows`, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) {
      return currentSnapshot.openWindows;
    }
    const data = (await res.json()) as { windows?: OpenWindowApp[] };
    const windows = Array.isArray(data.windows) ? data.windows : [];
    currentSnapshot = {
      ...currentSnapshot,
      connectionState: 'connected',
      openWindows: windows,
      lastUpdated: Date.now()
    };
    emitChange();
    return windows;
  } catch {
    return currentSnapshot.openWindows;
  }
}

export async function fetchLinkableApps(): Promise<InstalledLinkableApp[]> {
  try {
    const res = await fetch(`${SERVICE_BASE_URL}/apps/linkable`, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) {
      return currentSnapshot.installedApps;
    }
    const data = (await res.json()) as {
      steamApps?: InstalledLinkableApp[];
      diskApps?: InstalledLinkableApp[];
    };
    const merged = [...(data.steamApps ?? []), ...(data.diskApps ?? [])];
    currentSnapshot = {
      ...currentSnapshot,
      connectionState: 'connected',
      installedApps: merged,
      lastUpdated: Date.now()
    };
    emitChange();
    return merged;
  } catch {
    return currentSnapshot.installedApps;
  }
}

export async function syncProfilesToBgService(payload: {
  enabled: boolean;
  revertToDefault: boolean;
  notifyOnSwitch: boolean;
  defaultProfileUid: string | null;
  profiles: StoredProfileRecord[];
}): Promise<boolean> {
  try {
    const res = await fetch(`${SERVICE_BASE_URL}/profiles/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      return false;
    }
    const data = (await res.json()) as { autoProfile?: AutoProfileServiceState };
    if (data.autoProfile) {
      currentSnapshot = {
        ...currentSnapshot,
        connectionState: 'connected',
        autoProfile: data.autoProfile,
        lastUpdated: Date.now()
      };
      emitChange();
    }
    return true;
  } catch {
    return false;
  }
}

export async function fetchBgProfilesState(): Promise<AutoProfileServiceState | null> {
  try {
    const res = await fetch(`${SERVICE_BASE_URL}/profiles/state`, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { autoProfile?: AutoProfileServiceState };
    if (data.autoProfile) {
      currentSnapshot = {
        ...currentSnapshot,
        connectionState: 'connected',
        autoProfile: data.autoProfile,
        lastUpdated: Date.now()
      };
      emitChange();
      return data.autoProfile;
    }
    return null;
  } catch {
    return null;
  }
}

function connectProfileEventsStream() {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined' || eventSource) {
    return;
  }
  try {
    const es = new EventSource(`${SERVICE_BASE_URL}/events`);
    eventSource = es;
    es.onmessage = event => {
      try {
        const parsed = JSON.parse(event.data) as {
          type?: string;
          autoProfile?: AutoProfileServiceState;
        };
        if (parsed.autoProfile) {
          currentSnapshot = {
            ...currentSnapshot,
            connectionState: 'connected',
            autoProfile: parsed.autoProfile,
            lastUpdated: Date.now()
          };
          emitChange();
        }
      } catch {
        // Ignore malformed SSE event payload
      }
    };
    es.onerror = () => {
      es.close();
      eventSource = null;
    };
  } catch {
    eventSource = null;
  }
}

export function subscribeBgService(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void fetchOpenWindows();
    void fetchLinkableApps();
    void fetchBgProfilesState();
    connectProfileEventsStream();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}

export function useBgService() {
  const rgbServiceState = useRgbServiceState();
  const snap = useSyncExternalStore(
    subscribeBgService,
    getBgServiceSnapshot,
    getBgServiceSnapshot
  );
  const perm = getLocalServicePermission();

  let connectionState: BgServiceConnectionState = snap.connectionState;
  if (perm === 'denied') {
    connectionState = 'permission-denied';
  } else if (rgbServiceState.checking) {
    connectionState = 'connecting';
  } else if (rgbServiceState.status && !rgbServiceState.reconnecting) {
    connectionState = 'connected';
  } else {
    connectionState = 'service-down';
  }

  const serviceVersion = rgbServiceState.status?.coreVersion ?? rgbServiceState.status?.version ?? null;
  const isServiceConnected = connectionState === 'connected';
  const isServiceOutdated =
    isServiceConnected &&
    Boolean(serviceVersion) &&
    !isServiceVersionAtLeast(serviceVersion, REQUIRED_AUTO_PROFILE_SERVICE_VERSION);

  return {
    ...snap,
    connectionState,
    serviceVersion,
    requiredServiceVersion: REQUIRED_AUTO_PROFILE_SERVICE_VERSION,
    isServiceConnected,
    isServiceOutdated,
    hasBgService: isServiceConnected && !isServiceOutdated,
    refreshApps: async () => {
      await Promise.all([fetchOpenWindows(), fetchLinkableApps(), fetchBgProfilesState()]);
    }
  };
}

const CACHED_APPS_STORAGE_KEY = 'openaula:cached-linked-apps:v1';

export function loadCachedLinkedApps(): LinkedAppRule[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(CACHED_APPS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LinkedAppRule[]) : [];
  } catch {
    return [];
  }
}

export function rememberLinkedAppRule(rule: LinkedAppRule): LinkedAppRule[] {
  const existing = loadCachedLinkedApps();
  const filtered = existing.filter(
    item => item.name.toLowerCase() !== rule.name.toLowerCase() && item.id !== rule.id
  );
  const next = [rule, ...filtered].slice(0, 12);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CACHED_APPS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }
  return next;
}
