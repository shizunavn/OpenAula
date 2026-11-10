import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type {
  CustomAppFilter,
  LinkedAppRule,
  StoredProfileRecord
} from '../../src/state/profileTypes';
import type {
  AutoSwitchExecutionResultMode,
  XsydSlot3VirtualizationState
} from './hardwareExecutor';

export interface ForegroundAppInfo {
  pid: number;
  exe: string; // Lowercase basename, e.g., "cs2.exe"
  path: string; // Full executable path, e.g., "C:\\Program Files (x86)\\Steam\\...\\cs2.exe"
  title: string; // Window title, e.g., "Counter-Strike 2"
}

export interface InstalledAppSummary {
  id: string;
  name: string;
  exe: string;
  path: string;
  directory: string;
  sourceType: 'steam' | 'disk';
  steamAppId?: number;
}

export interface AutoSwitchTelemetry {
  enabled: boolean;
  revertToDefault: boolean;
  notifyOnSwitch: boolean;
  activeApp: ForegroundAppInfo | null;
  activeProfileUid: string | null;
  candidateProfileUid: string | null;
  switchCount: number;
  ramAppliesCount: number;
  flashWritesSaved: number;
  lastSwitchAt: number;
  lastError: string | null;
  lastSwitchMode?: AutoSwitchExecutionResultMode;
  pendingXsydSlot3WarmupUid?: string | null;
  pendingXsydSlot3WarmupSince?: number;
  xsydSlot3State?: XsydSlot3VirtualizationState;
}

/** Converts an fnmatch-style wildcard pattern (e.g., "*valorant*.exe") into a safe RegExp */
export function wildcardMatch(text: string, pattern: string): boolean {
  const escaped = pattern
    .toLowerCase()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i').test(text.toLowerCase());
}

/** Evaluates a single CustomAppFilter matching Wootility zJ (L61450) + OpenMAD fnmatch */
export function matchesFilter(app: ForegroundAppInfo, filter: CustomAppFilter): boolean {
  const val = filter.value.trim();
  if (!val) return false;
  switch (filter.kind) {
    case 'processName':
      return wildcardMatch(app.exe, path.win32.basename(val));
    case 'processDirectory': {
      if (!app.path) return false;
      const normAppDir = path.win32.normalize(path.win32.dirname(app.path)).toLowerCase();
      const normRuleDir = path.win32.normalize(val).replace(/[\\/]$/, '').toLowerCase();
      return normAppDir === normRuleDir || normAppDir.startsWith(normRuleDir + '\\');
    }
    case 'processFullPath':
      if (!app.path) return false;
      return path.win32.normalize(app.path).toLowerCase() === path.win32.normalize(val).toLowerCase();
    case 'windowTitle':
      if (!app.title) return false;
      return val.includes('*')
        ? wildcardMatch(app.title, val)
        : app.title.toLowerCase().includes(val.toLowerCase());
    default:
      return false;
  }
}

export function matchesLinkedAppRule(app: ForegroundAppInfo, rule: LinkedAppRule): boolean {
  if (!rule.filters || rule.filters.length === 0) return false;
  return rule.matchType === 'AnyMatches'
    ? rule.filters.some(f => matchesFilter(app, f))
    : rule.filters.every(f => matchesFilter(app, f));
}

export class AutoProfileSwitcher {
  private profiles: StoredProfileRecord[] = [];
  private defaultProfileUid: string | null = 'onboard-0';
  private enabled = true;
  private revertToDefault = true;
  private notifyOnSwitch = true;

  // Anti-Churn / Debounce / Min-Dwell State Machine
  private currentApp: ForegroundAppInfo | null = null;
  private activeProfileUid: string | null = null;
  private candidateProfileUid: string | null = null;
  private candidateSince = 0;
  private lastSwitchAt = 0;
  private backoffIndex = 0;
  private nextRetryAt = 0;
  private switchCount = 0;
  private ramAppliesCount = 0;
  private flashWritesSaved = 0;
  private lastError: string | null = null;
  private lastSwitchMode: AutoSwitchExecutionResultMode = 'slot-switch';

  // XSYD Smart Slot 3 Virtualization Warm-up State (for >4 / 10+ profiles)
  private pendingSlot3WarmupProfile: StoredProfileRecord | null = null;
  private pendingSlot3WarmupSince = 0;

  // Timing constants
  public readonly pollIntervalMs = 400;
  public readonly debounceMs = 800;
  public readonly minDwellMs = 3000;
  /** Continuous active game session dwell before committing a new overflow profile into XSYD Slot 3 */
  public readonly xsydSlot3WarmupDwellMs = 12_000;
  private readonly backoffScheduleMs = [2000, 5000, 15000, 60000];

  constructor(
    private readonly applyToHardware: (
      profile: StoredProfileRecord
    ) => Promise<{
      mode: AutoSwitchExecutionResultMode;
      packetsSent: number;
      needsSlot3WarmupCommit?: boolean;
    }>,
    private readonly onSwitched?: (
      profile: StoredProfileRecord,
      app: ForegroundAppInfo,
      telemetry: AutoSwitchTelemetry
    ) => void,
    private readonly nowFn: () => number = () => performance.now(),
    private readonly commitXsydSlot3OverflowFn?: (
      profile: StoredProfileRecord
    ) => Promise<{ committed: boolean; packetsSent: number }>,
    private readonly getXsydSlot3StateFn?: () => XsydSlot3VirtualizationState
  ) {}

  public updateConfiguration(options: {
    profiles: StoredProfileRecord[];
    defaultProfileUid?: string | null;
    enabled?: boolean;
    revertToDefault?: boolean;
    notifyOnSwitch?: boolean;
  }) {
    this.profiles = options.profiles;
    if (options.defaultProfileUid !== undefined) {
      this.defaultProfileUid = options.defaultProfileUid;
    }
    if (typeof options.enabled === 'boolean') {
      this.enabled = options.enabled;
    }
    if (typeof options.revertToDefault === 'boolean') {
      this.revertToDefault = options.revertToDefault;
    }
    if (typeof options.notifyOnSwitch === 'boolean') {
      this.notifyOnSwitch = options.notifyOnSwitch;
    }
  }

  public getProfiles(): StoredProfileRecord[] {
    return this.profiles;
  }

  public getTelemetry(): AutoSwitchTelemetry {
    return {
      enabled: this.enabled,
      revertToDefault: this.revertToDefault,
      notifyOnSwitch: this.notifyOnSwitch,
      activeApp: this.currentApp,
      activeProfileUid: this.activeProfileUid,
      candidateProfileUid: this.candidateProfileUid,
      switchCount: this.switchCount,
      ramAppliesCount: this.ramAppliesCount,
      flashWritesSaved: this.flashWritesSaved,
      lastSwitchAt: this.lastSwitchAt,
      lastError: this.lastError,
      lastSwitchMode: this.lastSwitchMode,
      pendingXsydSlot3WarmupUid: this.pendingSlot3WarmupProfile?.metadata.uid ?? null,
      pendingXsydSlot3WarmupSince: this.pendingSlot3WarmupSince,
      xsydSlot3State: this.getXsydSlot3StateFn?.()
    };
  }

  /**
   * Automatically assigns smart onboard slots across unlimited profiles:
   * - The first 3 Onboard/Linked profiles with explicit slots 0..2 stay pinned to Slots 0..2 (Instant 0-wear switch).
   * - All additional Linked profiles (#4..#100) are automatically assigned to Smart Dynamic Scratchpad Slot 3 (`mappedOnboardSlot = 3`).
   */
  public resolveTargetProfile(app: ForegroundAppInfo): StoredProfileRecord | null {
    let linkedOrder = 0;
    for (const record of this.profiles) {
      const isLinked = (record.metadata.linkedApps?.length ?? 0) > 0;
      if (isLinked) {
        linkedOrder++;
      }
      if (record.metadata.linkedApps?.some(rule => matchesLinkedAppRule(app, rule))) {
        // If this is profile #4+ or has no pinned slot 0..2, route it to Smart Slot 3 (Slot 4 in UI)
        const slot = record.metadata.mappedOnboardSlot;
        if (slot === undefined || slot >= 3 || linkedOrder > 3) {
          return {
            ...record,
            metadata: {
              ...record.metadata,
              mappedOnboardSlot: 3
            }
          };
        }
        return record;
      }
    }
    if (this.revertToDefault && this.defaultProfileUid) {
      return this.profiles.find(p => p.metadata.uid === this.defaultProfileUid) ?? null;
    }
    return null; // Keep current active profile on the keyboard
  }

  public async onForegroundPoll(app: ForegroundAppInfo | null): Promise<boolean> {
    this.currentApp = app;
    if (!this.enabled || !app || !app.exe) {
      return false;
    }

    const now = this.nowFn();
    if (now < this.nextRetryAt) {
      return false;
    }

    const target = this.resolveTargetProfile(app);
    if (!target) {
      return false;
    }

    const targetUid = target.metadata.uid;

    // 1. If the resolved profile differs from the current candidate, reset the Debounce timer
    //    and cancel any uncommitted XSYD Slot 3 warm-up (preventing Flash writes on brief Alt-Tabs!)
    if (targetUid !== this.candidateProfileUid) {
      this.candidateProfileUid = targetUid;
      this.candidateSince = now;
      if (this.pendingSlot3WarmupProfile && this.pendingSlot3WarmupProfile.metadata.uid !== targetUid) {
        this.pendingSlot3WarmupProfile = null;
        this.pendingSlot3WarmupSince = 0;
        this.flashWritesSaved += 5;
      }
      return false;
    }

    // 2. If the target profile is already active on the keyboard, check if a pending XSYD Slot 3
    //    overflow warm-up has reached the 12s continuous session threshold.
    if (targetUid === this.activeProfileUid) {
      if (
        this.pendingSlot3WarmupProfile &&
        this.pendingSlot3WarmupProfile.metadata.uid === targetUid &&
        this.commitXsydSlot3OverflowFn &&
        now - this.pendingSlot3WarmupSince >= this.xsydSlot3WarmupDwellMs
      ) {
        try {
          const commitRes = await this.commitXsydSlot3OverflowFn(this.pendingSlot3WarmupProfile);
          if (commitRes.committed) {
            this.lastSwitchMode = 'xsyd-slot3-committed';
            this.pendingSlot3WarmupProfile = null;
            this.pendingSlot3WarmupSince = 0;
            this.onSwitched?.(target, app, this.getTelemetry());
            return true;
          }
        } catch (err) {
          this.lastError = err instanceof Error ? err.message : String(err);
        }
      }
      return false;
    }

    // 3. Enforce Debounce window (window must hold focus continuously for >= 800ms)
    if (now - this.candidateSince < this.debounceMs) {
      return false;
    }

    // 4. Enforce Minimum Dwell time (>= 3000ms since last switch to prevent ping-pong)
    if (this.lastSwitchAt > 0 && now - this.lastSwitchAt < this.minDwellMs) {
      return false;
    }

    // 5. Execute Zero-Flash-Wear hardware switch
    try {
      const result = await this.applyToHardware(target);
      this.activeProfileUid = targetUid;
      this.lastSwitchAt = this.nowFn();
      this.lastSwitchMode = result.mode;
      this.backoffIndex = 0;
      this.nextRetryAt = 0;
      this.switchCount++;
      if (result.mode === 'ram-stream') {
        this.ramAppliesCount++;
      }
      if (result.needsSlot3WarmupCommit) {
        this.pendingSlot3WarmupProfile = target;
        this.pendingSlot3WarmupSince = this.lastSwitchAt;
      } else {
        this.pendingSlot3WarmupProfile = null;
        this.pendingSlot3WarmupSince = 0;
      }
      // Each instant switch or Slot 3 Cache Hit avoids a full 5-sector Flash Erase/Write cycle
      this.flashWritesSaved += 5;
      this.lastError = null;
      this.onSwitched?.(target, app, this.getTelemetry());
      return true;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      const delay =
        this.backoffScheduleMs[Math.min(this.backoffIndex, this.backoffScheduleMs.length - 1)];
      this.backoffIndex++;
      this.nextRetryAt = this.nowFn() + delay;
      return false;
    }
  }
}

/** Discovers installed Steam games (libraryfolders.vdf + appmanifest_*.acf) and common disk apps */
export function scanInstalledLinkableApps(extraSteamRoot?: string): {
  steamApps: InstalledAppSummary[];
  diskApps: InstalledAppSummary[];
} {
  const steamApps: InstalledAppSummary[] = [];
  const diskApps: InstalledAppSummary[] = [];

  const candidateSteamRoots = [
    extraSteamRoot,
    process.env['PROGRAMFILES(X86)']
      ? path.join(process.env['PROGRAMFILES(X86)']!, 'Steam')
      : undefined,
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Steam') : undefined,
    'C:\\Program Files (x86)\\Steam',
    'D:\\SteamLibrary',
    'E:\\SteamLibrary'
  ].filter((p): p is string => Boolean(p));

  const steamAppsDirs = new Set<string>();
  for (const root of candidateSteamRoots) {
    const baseSteamApps = path.join(root, 'steamapps');
    if (existsSync(baseSteamApps)) {
      steamAppsDirs.add(baseSteamApps);
      const vdfPath = path.join(baseSteamApps, 'libraryfolders.vdf');
      if (existsSync(vdfPath)) {
        try {
          const vdf = readFileSync(vdfPath, 'utf8');
          const matches = vdf.matchAll(/"path"\s+"([^"]+)"/g);
          for (const m of matches) {
            const libPath = path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps');
            if (existsSync(libPath)) {
              steamAppsDirs.add(libPath);
            }
          }
        } catch {
          // Ignore unreadable VDF
        }
      }
    }
  }

  for (const steamDir of steamAppsDirs) {
    try {
      const files = readdirSync(steamDir);
      for (const file of files) {
        if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue;
        const content = readFileSync(path.join(steamDir, file), 'utf8');
        const appIdMatch = content.match(/"appid"\s+"(\d+)"/);
        const nameMatch = content.match(/"name"\s+"([^"]+)"/);
        const installDirMatch = content.match(/"installdir"\s+"([^"]+)"/);
        if (!nameMatch || !installDirMatch) continue;
        const name = nameMatch[1];
        if (/Steamworks Common Redistributables|Proton|Steam Linux Runtime/i.test(name)) {
          continue;
        }
        const gameDir = path.join(steamDir, 'common', installDirMatch[1]);
        let foundExe = `${installDirMatch[1].toLowerCase().replace(/\s+/g, '')}.exe`;
        let fullExePath = path.join(gameDir, foundExe);
        if (existsSync(gameDir)) {
          try {
            const exes = readdirSync(gameDir).filter(
              f =>
                f.toLowerCase().endsWith('.exe') &&
                !/unins|crash|setup|redist|unitycrash/i.test(f)
            );
            if (exes.length > 0) {
              foundExe = exes[0].toLowerCase();
              fullExePath = path.join(gameDir, exes[0]);
            }
          } catch {
            // Keep inferred exe name
          }
        }
        steamApps.push({
          id: `steam-${appIdMatch?.[1] ?? name}`,
          name,
          exe: foundExe,
          path: fullExePath,
          directory: gameDir,
          sourceType: 'steam',
          steamAppId: appIdMatch ? Number(appIdMatch[1]) : undefined
        });
      }
    } catch {
      // Ignore inaccessible directory
    }
  }

  // Provide well-known competitive games & apps if not already discovered on non-Windows/clean hosts
  const presets: InstalledAppSummary[] = [
    {
      id: 'preset-cs2',
      name: 'Counter-Strike 2',
      exe: 'cs2.exe',
      path: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe',
      directory: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive',
      sourceType: 'steam',
      steamAppId: 730
    },
    {
      id: 'preset-valorant',
      name: 'VALORANT',
      exe: 'valorant-win64-shipping.exe',
      path: 'C:\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64\\VALORANT-Win64-Shipping.exe',
      directory: 'C:\\Riot Games\\VALORANT',
      sourceType: 'disk'
    },
    {
      id: 'preset-overwatch2',
      name: 'Overwatch 2',
      exe: 'overwatch.exe',
      path: 'C:\\Program Files (x86)\\Overwatch\\_retail_\\Overwatch.exe',
      directory: 'C:\\Program Files (x86)\\Overwatch',
      sourceType: 'disk'
    },
    {
      id: 'preset-apex',
      name: 'Apex Legends',
      exe: 'r5apex.exe',
      path: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Apex Legends\\r5apex.exe',
      directory: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Apex Legends',
      sourceType: 'steam',
      steamAppId: 1172470
    },
    {
      id: 'preset-vscode',
      name: 'Visual Studio Code',
      exe: 'code.exe',
      path: 'C:\\Users\\User\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      directory: 'C:\\Users\\User\\AppData\\Local\\Programs\\Microsoft VS Code',
      sourceType: 'disk'
    }
  ];

  const seenExes = new Set(steamApps.map(a => a.exe.toLowerCase()));
  for (const item of presets) {
    if (!seenExes.has(item.exe.toLowerCase())) {
      if (item.sourceType === 'steam') {
        steamApps.push(item);
      } else {
        diskApps.push(item);
      }
    }
  }

  return { steamApps, diskApps };
}
