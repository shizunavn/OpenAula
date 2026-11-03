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
} as const
