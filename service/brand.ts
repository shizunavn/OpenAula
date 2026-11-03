import path from 'node:path'

/**
 * Service identity in one place.
 *
 * `displayName` is user-facing. The identifiers below are contracts with
 * installed copies; `legacy` records the pre-1.0 names so an upgrade can take
 * over an existing installation instead of installing beside it.
 */
export const BRAND = {
  displayName: 'OpenAula',
  serviceLabel: 'OpenAula RGB',
  /** %LOCALAPPDATA%/<dataDir> holds settings, logs and updater state. */
  dataDir: 'OpenAula',
  /** Installed launcher, also the autostart target. */
  launcherExe: 'OpenAula.exe',
  /** Core module inside versions/<ver>/. */
  coreExe: 'OpenAulaService.exe',
  setupAsset: 'OpenAula-Setup-Windows-x64.exe',
  setupManifest: 'OpenAula-update.json',
  coreAsset: 'OpenAula-RGB-core.cjs',
  coreManifest: 'OpenAula-RGB-core.json',
  fullPackageAsset: 'OpenAula-RGB-Windows-x64.zip',
  releaseRepo: 'https://github.com/shizunavn/OpenAula',
  legacyReleaseRepo: 'https://github.com/shizunavn/OpenHero68-RGB-Service',
  website: 'https://open-hero68.pages.dev',
  /** Names used before 1.0, read only so an upgrade can migrate them. */
  legacy: {
    dataDir: 'OpenHero68',
    launcherExe: 'OpenHero68.exe',
    coreExe: 'Hero68RgbService.exe',
    setupAsset: 'OpenHero68-Setup-Windows-x64.exe',
    setupManifest: 'OpenHero68-update.json',
    coreAsset: 'OpenHero68-RGB-core.cjs',
    coreManifest: 'OpenHero68-RGB-core.json',
    fullPackageAsset: 'OpenHero68-RGB-Windows-x64.zip',
    installId: 'OpenHero68',
    runName: 'OpenHero68RgbService',
    trayMutex: 'Local\\OpenHero68RgbService',
  },
  /** Registry/app id owned by this install; a stable AppId is what lets setup upgrade in place. */
  installId: 'OpenAula',
  runName: 'OpenAulaRgbService',
} as const

export const serviceStateDir = (localAppData = process.env.LOCALAPPDATA ?? process.cwd()) =>
  path.join(localAppData, BRAND.dataDir, 'rgb-service')

export const legacyStateDir = (localAppData = process.env.LOCALAPPDATA ?? process.cwd()) =>
  path.join(localAppData, BRAND.legacy.dataDir, 'rgb-service')
