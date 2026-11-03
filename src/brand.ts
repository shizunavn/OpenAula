/**
 * Product identity in one place.
 *
 * `displayName` is what users read; it is safe to rename. The identifiers below
 * it are contracts with installed copies (browser storage keys, saved profile
 * schemas, download names) — renaming one silently strands existing users, so
 * they only change together with a migration.
 */
export const BRAND = {
  displayName: 'OpenAula',
  /** Prefix for every localStorage/sessionStorage key in the web app. */
  storagePrefix: 'openhero68',
  /** `schema` field of exported JSON files (profiles, macros). */
  exportSchemaPrefix: 'openhero68',
  docsUrl: 'https://github.com/shizunavn/OpenAula/blob/main/docs/README.md',
  issuesUrl: 'https://github.com/shizunavn/OpenAula/issues',
  /** Canonical web app origin; the pre-rename host shows a move notice. */
  webAppUrl: 'https://open-aula.pages.dev',
  /** Hosts that used to serve the web app and now only forward to webAppUrl. */
  legacyHosts: ['open-hero68.pages.dev'],
} as const

/** True when this page was opened on a pre-rename host. */
export const isLegacyHost = (hostname = typeof location === 'undefined' ? '' : location.hostname) =>
  BRAND.legacyHosts.includes(hostname as (typeof BRAND.legacyHosts)[number])

/** The same path and query on the canonical host, so deep links survive. */
export const currentPageOnCanonicalHost = () =>
  typeof location === 'undefined' ? BRAND.webAppUrl : BRAND.webAppUrl + location.pathname + location.search + location.hash
