import path from 'node:path'

/**
 * Service identity in one place.
 *
 * `displayName` is user-facing and safe to rename. Everything below is a
 * contract with already-installed copies — the state directory, the executable
 * names, the autostart value name, the uninstall key, the release asset names
 * and the update feed. Changing any of them breaks upgrades from older builds,
 * so they change only alongside an install migration.
 */
export const BRAND = {
  displayName: 'OpenAula',
  serviceLabel: 'OpenAula RGB',
  /** %LOCALAPPDATA%/<dataDir> holds settings, logs and updater state. */
  dataDir: 'OpenHero68',
  /** Installed launcher, also the autostart target. */
  launcherExe: 'OpenHero68.exe',
  /** Core module inside versions/<ver>/. */
  coreExe: 'Hero68RgbService.exe',
  setupAsset: 'OpenHero68-Setup-Windows-x64.exe',
  setupManifest: 'OpenHero68-update.json',
  coreAsset: 'OpenHero68-RGB-core.cjs',
  coreManifest: 'OpenHero68-RGB-core.json',
  fullPackageAsset: 'OpenHero68-RGB-Windows-x64.zip',
  releaseRepo: 'https://github.com/shizunavn/OpenHero68',
  legacyReleaseRepo: 'https://github.com/shizunavn/OpenHero68-RGB-Service',
  website: 'https://open-hero68.pages.dev',
} as const

export const serviceStateDir = (localAppData = process.env.LOCALAPPDATA ?? process.cwd()) =>
  path.join(localAppData, BRAND.dataDir, 'rgb-service')
