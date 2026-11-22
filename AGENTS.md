# AGENTS.md

OpenAula: browser configurator for AULA Hall-effect keyboards (`HERO68`, `HERO 68 XS`, `HERO84`, `WIN 68 HE MAX`) plus an optional Windows x64 tray service (TypeScript core + native C++ bridge, packaged with Inno Setup).

- **Stack**: React 19, TypeScript 7 (`strict: true`), Vite 8, WebHID, Node `22.18.0` (pinned in `service/version.json`), MSVC C++17 (`service/native/`), Cloudflare Pages/Workers (`functions/`, `worker/`).

## Verify before claiming success

Scale local checks to the scope of your change before finishing:

| Changed area                                                                                  | Required local checks                                                                                                             |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Frontend UI (`src/` only, not shared with `service/`)                                         | `node --test tests/<affected>.test.mjs` while iterating; then `npm run build`, `npm test`, `npm run lint`, `npm run format:check` |
| Shared `src/` (`src/protocol/`, `src/keyboard/`, `src/state/`)                                | Frontend checks **plus** `npm run typecheck:service` (and `npm run build:service` if runtime code changed)                        |
| Service TypeScript (`service/**/*.ts`)                                                        | `npm run typecheck:service`, `npm test`, `npm run build:service`                                                                  |
| Installer, updater, or packaging (`service/installer/`, `service/setup*.ts`, `tools/*setup*`) | Service checks **plus** `npm run prepare:setup`, `npm run build:setup`, `npm run test:setup`                                      |
| Native C++ (`service/native/`)                                                                | Every affected `cmd /c tools\check-native-*.cmd` (and `node tools/check-native-ipc.mjs` for IPC) + `.clang-format` check          |
| Landing site (`landing/`)                                                                     | `npm run package:landing`, `npm run check:landing`                                                                                |
| Cloudflare (`functions/`, `worker/`)                                                          | `npm run build`, `npm run typecheck:service`                                                                                      |

Full Windows CI (`.github/workflows/windows.yml`) runs these in order:

```powershell
npm test                               # node --test tests/*.test.mjs (56 files)
cmd /c tools\check-native-rhythm.cmd   # native C++ test; needs MSVC
npm run build                          # tsc --noEmit && vite build (src/ only)
npm run prepare:setup                  # downloads pinned Inno Setup / ViGEmBus into .refactor/
npm run build:setup                    # build:service + Inno packaging -> service/releases/
npm run test:setup                     # isolated install/update/rollback smoke test (minutes)
```

- **Native tests**: `HERO68_VCVARS` is optional — the `tools/check-native-*.cmd` scripts locate MSVC via `vswhere`. There are 8 `.cmd` scripts (`rhythm`, `gamepad`, `gamepad-output`, `audio`, `keyboard-hook`, `tray`, `vigem-startup`, `vigem-live-startup`) plus `tools/check-native-ipc.mjs` covering `tests/native-*.test.cpp` (10 files). CI runs **only** `check-native-rhythm.cmd`, so a native change can pass CI while other native tests fail.
- **Targeted test runs**: `node --test tests/<name>.test.mjs`. `npm run test:rgb` and `npm run test:profile-remap` are the only other test aliases.
- **Typecheck, lint, and format gates**:
  - Root `tsconfig.json` includes **only** `src`, so `npm run build` never typechecks `service/`. Always run `npm run typecheck:service` (`service/tsconfig.json`) after touching `service/` or any `src/` module it imports.
  - `npm run format:check` runs Prettier (`.prettierrc`: single quotes, semicolons, no trailing commas, 100-column width) over `src/**/*.{ts,tsx,css}` **only** — `tests/`, `docs/`, and `service/native/` are excluded.
  - `npm run lint` expects 0 errors (warnings pre-exist).
  - Native C++ follows `.clang-format` (LLVM, C++17, 2-space, `SortIncludes: Never` because Windows SDK headers require dependency order such as `hidsdi.h` before `hidpi.h`).

## Boundaries

- **Always**:
  - Add new user-facing UI strings to **both** `src/i18n/locales/en.ts` and the corresponding module under `src/i18n/locales/vi/`.
  - Keep `service/brand.ts` and `service/build.mjs` brand constants in sync; `installId`, `runName`, and `legacy.*` (`OpenHero68`) are upgrade contracts with existing installations.
  - Add or update tests under `tests/` when changing protocol codecs, board registry rules, or service controllers.
- **Ask first**:
  - Bumping versions (`package.json` + `service/version.json`), creating `v*` git tags, or running release/deploy commands (`sign:setup`, `tools/publish-service-setup.mjs`, `pages:deploy`, `cf:deploy`).
  - Adding npm dependencies or changing pinned toolchain versions (`nodeVersion`, `innoVersion` in `service/version.json`).
- **Never**:
  - Edit or commit generated, vendored, or disposable paths: `.refactor/`, `dist/`, `landing-dist/`, `service/dist/`, `service/releases/`, `public/vendor-tap/vendor/`, `service/native/vendor/ViGEmClient/`, or secrets/keys (`.env.local`, `RELEASE_SIGNING_KEY`, `*.pem`).
  - Invent or emit unverified HID commands, force SPI Flash writes in hot loops (keep RAM-only diff streaming on ByteTech and Smart Slot 3 Virtualization wear guards on XSYD), or enable live Rhythm side-light output on HERO68 (intentionally demo-only until LED count/order/protocol are verified).
  - Delete or weaken failing tests to make a check pass.

## Architecture facts that are easy to get wrong

- **Board registry is the source of truth**: `src/keyboard/registry/`. Read `getBoard(model)` for `protocol`, `keyIds`, `performance`, `switches`, `rgb`. Do not reintroduce per-board constant tables (e.g., `HERO68_KEY_IDS`). Registration order in `src/keyboard/registry/index.ts` matters: `HERO68_BOARD` must precede `HERO68_XS_BOARD` so shared ByteTech UUIDs/names resolve to base `hero68` before XS precision detection.
- **Two HID protocols**: ByteTech (`HERO68` / `HERO 68 XS` / `HERO84`) and XSYD `0x5C` (`WIN 68 HE MAX`, `src/protocol/xsyd/`). `src/protocol/xsyd/device.ts` is a barrel over `commands`, `remap`, `hydrate`, `webhid`, `hall`, `rgb`, `features`, `codec`, `keymap`, `advanced`; add code to the focused module, not the barrel.
- **ByteTech code is split confusingly**: `src/protocol/hero68/` holds the real implementation and is what most of `src/` and `service/` import directly. `src/protocol/bytetech/` is a thin re-export layer over it (plus `macros.ts` -> `src/state/macros`). Put new ByteTech logic in `bytetech/`, but do not fork an encoder/codec that already exists in `hero68/`.
- **`service/` imports `src/` types and pure helpers directly** (e.g., `src/protocol/hero68/codec`, `src/keyboard/gamepad`, `src/state/profileTypes`). Changing those `src/` modules affects the Windows service too — run `npm run typecheck:service` and `npm run build:service` (plus `build:setup` for installer changes).
- **Driver layer**: `src/protocol/driver.ts` (`bytetechDriver` / `xsydDriver`, `getProtocolDriver`, `getActiveConnectedDriver`, `autoConnectAnyProtocol`), consumed by `src/app/hooks/useDeviceSyncController.ts`. When checking callers, grep the real import path (`'../../protocol/driver'`), not just `'./driver'`.
- **Service layout**: `service/main.ts` defaults to port **16868** (`--port` overrides; smoke test uses `17868`). Controllers receive one `ctx` from `service/context.ts`, which spreads `ServiceContextOptions`, so any new option passed to `createServiceContext` is automatically visible to `service/server/router.ts` `/status`. Native code lives in `service/native/` (`hid_bridge.cpp` plus extracted `hid_device_catalog.h`, `hid_packet_policy.h`, `hid_ipc_router.h`).
- **Dev server / CORS**: `npm run dev` serves HTTPS (self-signed, required for WebHID). Allowed service origins are hardcoded in `service/origins.ts` (`https://open-aula.pages.dev`, legacy `https://open-hero68.pages.dev`, `localhost:5173`) plus `HERO68_ALLOWED_ORIGINS` — read from the **service process** env, never from Vite's `.env.local`.

## Release procedure (hard requirements)

1. Bump **both** `package.json` and `service/version.json`. The service version drives the installer, the update manifest, and the artifact names. Do not add a third version source.
2. Create `docs/releases/v<version>.md`. CI fails with `Missing release notes` if absent.
3. `git tag v<version>` **must** equal `service/version.json` `version`, or `Validate release tag` throws `Tag/version mismatch`.
4. Pushing a `v*` tag triggers the `release` job: `npm run sign:setup` (needs `RELEASE_SIGNING_KEY`, or a local PEM at `%LOCALAPPDATA%/OpenHero68/`) -> `npm run verify:setup` -> `node tools/publish-service-setup.mjs`, which refuses to run unless `GITHUB_REF=refs/tags/v<version>` and `HEAD` equals the tag commit. The pre-rename `tools/publish-service-release.*` scripts are historical and unused by CI.

## Writing `docs/releases/v<version>.md`

`tools/publish-service-setup.mjs` reads this file verbatim as the **GitHub Release body**, so it is public documentation for the whole project, not a commit log. `src/` and `service/` share one version, so every note must cover **both** the web app and the tray service.

Order the sections by audience:

```markdown
# OpenAula v<version>

<1-2 sentence summary of what a user gets from this build>

## Web app # user-visible changes, or "No visible UI changes."

## Windows tray service # user-visible changes, or "No functional changes."

## Fixes # one bullet per user-facing bug, in plain language

## Under the hood # files/modules/architecture - optional, keep short

## Validation # what actually ran; state the scope honestly
```

- Lead with what changed **for the user** ("Smart Slot 3 auto-switching fails during warm-up", not "`computeProfileHallSignature` referenced a removed key table"). Name files and functions only under `Under the hood`.
- Reference the issue number when a fix comes from one, as `v1.8.1.md` does (`Issue #4`).
- Never claim hardware verification you did not do. Existing notes close with a "not covered" line when only automated suites ran.
- Prettier-formatted markdown (`npx prettier --write`); `format:check` does not cover `docs/` so it will not catch drift.
- After a release is published, correcting the body **never** needs a new tag or rebuild: commit the edited file, then `gh release edit v<version> --notes-file docs/releases/v<version>.md`. Never move or re-create an existing `v*` tag — the signed installer and `OpenAula-update.json` are pinned to its commit. A real code fix needs a new patch version instead.

## Test quirks

- Tests are `.mjs` files that bundle TypeScript sources with `rolldown` and import them via `data:text/javascript;base64,...`; they use a compact style and are excluded from Prettier.
- Bundling a `service/` module (anything importing `worker/` or shared parts) requires `codeSplitting: false`, otherwise the `data:` URL import fails.
- `tools/smoke-service-setup.mjs` writes its fixture **outside** the repo (`.refactor/setup-smoke/`) and cannot import an absolute `.ts` path — Node rejects the `E:` scheme and service imports are extensionless. It embeds a `rolldown` bundle of `service/setupUpdater.ts` instead; avoid re-declaring names the bundle already exports (`path`, `createServer`, `readFileSync`, ...). It uses its own install dir, state dir, port `17868`, and an ephemeral signing key, and never touches the real install.

## Environment

- **OS & toolchain**: Windows + PowerShell. Native builds require Visual Studio Build Tools (C++ desktop workload + Windows SDK).
- **Node pin**: `service/version.json` (`nodeVersion`, currently `22.18.0`); `rolldown` / bundling behavior can differ across Node versions.
- **Separate sites & Workers**:
  - `landing/` is a standalone public site (`npm run build:landing`, `npm run package:landing`, `npm run check:landing`, deployed via `.github/workflows/landing.yml`).
  - `functions/` + `worker/` are plain `.js` Cloudflare Pages Functions / Workers (`/api/region`, `/api/health`), deployed by `.github/workflows/cloudflare.yml` via `wrangler`. Even though they import nothing from `src/`, `cloudflare.yml` also runs `npm run typecheck:service`, so a broken `src/` module imported by `service/` blocks Pages deployment too.

## Deep-dive docs (read only when relevant)

| Topic                                        | Reference                                       |
| -------------------------------------------- | ----------------------------------------------- |
| ByteTech protocol, save/readback, evidence   | `src/protocol/README.md`                        |
| WIN 68 HE MAX (XSYD `0x5C`) protocol         | `docs/xsyd-protocol.md`                         |
| Custom RGB & background service              | `docs/CUSTOM_RGB.md`                            |
| Rhythm Sync & audio pipeline                 | `docs/RHYTHM_SYNC.md`                           |
| Virtual Xbox Gamepad & shared Hall           | `docs/GAMEPAD.md`, `docs/GAMEPAD_VALIDATION.md` |
| Installer signing, updates, & CI release ops | `docs/SETUP_UPDATES.md`                         |
| Adding a new keyboard model                  | `docs/SUBMIT_A_BOARD.md`                        |
| Full index & firmware RE notes               | `docs/README.md`                                |
