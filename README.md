# OpenAula

An open-source, browser-based configurator for AULA Hall-effect magnetic keyboards, paired with an optional Windows x64 tray service that keeps Custom RGB, Rhythm Sync, automatic app profile switching, and analog Xbox gamepad output running after the browser closes.

Formerly **OpenHero68** — existing installations upgrade in place and preserve their settings.

[Open Web App](https://open-aula.pages.dev/) · [Download Windows Service](https://github.com/shizunavn/OpenAula/releases/latest) · [Release Notes](https://github.com/shizunavn/OpenAula/releases/latest) · [Report a Bug](https://github.com/shizunavn/OpenAula/issues/new?template=bug-report.yml) · [Request Keyboard Support](https://github.com/shizunavn/OpenAula/issues/new?template=add-a-board.yml)

> **Unofficial community project.** OpenAula is built through reverse engineering and is not affiliated with or endorsed by AULA or Wooting.

## Supported keyboards

| Model                  | Protocol    | Verified support                                                                                             |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| **AULA HERO68**        | ByteTech    | 3 onboard slots (`Fn + P1..P3`), 0.01 mm AP/RT, full WebHID + Windows tray service                           |
| **AULA HERO 68 XS**    | ByteTech    | 3 onboard slots, 0.005 mm (5 µm) precision, 8K receiver, full WebHID + Windows tray service                  |
| **AULA HERO84**        | ByteTech    | 3 onboard slots, verified lighting, Rapid Trigger, Actuation Point, WebHID + Windows tray service            |
| **AULA WIN 68 HE MAX** | XSYD `0x5C` | 4 onboard slots (`Fn + P1..P4`), Smart Slot 3 virtualization, 4-mode SOCD, 7-node DKS, WebHID + Auto-Profile |

> [!IMPORTANT]
> **Own another Hall-effect keyboard?** [Submit a keyboard request](https://github.com/shizunavn/OpenAula/issues/new?template=add-a-board.yml) (see [docs/SUBMIT\_A\_BOARD.md](docs/SUBMIT_A_BOARD.md)). No coding required — share your exact model, firmware version, USB IDs, and a layout photo.

## Features

### Web app (Chrome / Edge via WebHID — no install required)

| Area                          | Highlights                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Profiles**                  | 3-tier system (Onboard, App-Linked, Inactive), drag-and-drop reordering, JSON & `OA2-...` share codes, 89 profile icons, 6 preset banners, and one-click Undo/Reset |
| **Actuation & Rapid Trigger** | Per-key or multi-key actuation (0.10–3.40 mm), Rapid Trigger and deadzone (0.01 mm steps; 0.005 mm / 5 µm on `HERO 68 XS`), with live Hall test overlay             |
| **Key Remap & Advanced Keys** | Multi-layer key remapping with searchable icon catalog, plus SOCD (4 priority modes), 7-node visual DKS, Mod Tap, Toggle, MPT, and END bindings                     |
| **Macros**                    | Local macro library editor synced directly to on-board keyboard memory                                                                                              |
| **RGB & Rhythm Sync**         | On-board key/side effects, per-key paint tools, 16 composable Custom FX layers (Aurora, Dynamic Wave, Trigger Response, etc.), and 16-band audio Rhythm Sync        |
| **Gamepad & Hall Stream**     | Analog Xbox controller mapping with curves, digital AP/RT, live XInput tester, custom toggle hotkey, and real-time full-keyboard Hall travel telemetry              |
| **Device & UI**               | Polling rate (125–8000 Hz), Tachyon Mode, Windows/macOS mode, WinLock, Hall debounce, auto calibration, switch selector, and English / Vietnamese UI                |

### Windows tray service (optional, Windows x64)

- **Runs without the browser:** Keeps Custom RGB, Rhythm Sync, Auto-Profile Switching, and Gamepad active after closing the tab; AP/RT/deadzone remain editable while RGB runs.
- **Native tray flyout & control panel:** Dark Win32 status flyout and local dashboard at `http://127.0.0.1:16868/` (settings and logs stored in `%LOCALAPPDATA%\OpenAula\rgb-service`).
- **Zero-Flash-wear Auto-Profile Switcher:** Switches profiles automatically by foreground app, path, or window title using volatile RAM streaming on ByteTech boards and Smart Slot 3 Virtualization with wear guards on `WIN 68 HE MAX`.
- **Virtual Xbox Gamepad:** Up to 200 Hz analog output via [ViGEmBus 1.22.0](https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0) with a shared Hall polling scheduler and automatic remap recovery.
- **Self-contained & signed updates:** No Node.js, Python, or admin rights needed (admin is only requested if installing the optional ViGEmBus driver). One-click updates verify Ed25519-signed manifests and roll back automatically if health checks fail.

## Quick start

### Use the web app

1. Open [**https://open-aula.pages.dev/**](https://open-aula.pages.dev/) in Chrome or Edge (legacy `https://open-hero68.pages.dev/` also works).
2. Close any other keyboard software (only one app can hold the HID interface at a time).
3. Click **Connect**, select your keyboard, adjust settings, and click **Save to profile N**.

### Install the Windows tray service

1. Download and run `OpenAula-Setup-Windows-x64.exe` from [Releases](https://github.com/shizunavn/OpenAula/releases/latest) (note: without Authenticode signing, Windows SmartScreen may prompt).
2. Launch **OpenAula** from the Start Menu or Desktop shortcut — an **H** icon appears in the system tray.
3. Open the web app and click **Allow** when prompted for local device/service access. Use **Try demo** if you want to preview effects without a keyboard.

To update later, click **Check for updates** in the tray or **Update app** in the control panel. Portable users should run the installer once to migrate; existing settings in `%LOCALAPPDATA%` are preserved.

## Known limitations

- **Platform:** The tray service is **Windows x64 only**; the web app requires a WebHID-capable browser (Chrome or Edge).
- **WIN 68 HE MAX:** Virtual Gamepad and service Custom RGB streaming currently target the HERO68 / HERO 68 XS family.
- **Gamepad v1:** Supports one HERO68 / HERO 68 XS and one virtual Xbox controller; starts disabled on service launch; remove Advanced Keys on assigned keys first; no input-suppression method guarantees anti-cheat approval.
- **Rhythm side lights & Tachyon Mode:** Rhythm side-light modes are demo-only until HERO68 side-LED protocol details are verified. Enabling 8000 Hz Tachyon Mode pauses lighting and Hall polling and restores previous lighting when turned off.

## Development

Requires **Node.js 22.12+** (service builds pin `22.18.0` in `service/version.json`). Building the Windows tray service additionally requires **Windows x64** with **Visual Studio Build Tools** (C++ desktop workload + Windows SDK).

```sh
npm ci
npm run dev
```

Open the HTTPS URL printed by Vite and accept the self-signed local certificate (WebHID requires a secure context). Copy `.env.example` to `.env.local` only if you need extra `HERO68_DEV_HOSTS`; set `HERO68_ALLOWED_ORIGINS` in the **service process** environment (or pass `--allow-origin`) to allow custom origins.

| Command                                                | Description                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `npm run dev` / `npm run preview`                      | Run Vite dev server over HTTPS / preview production build                |
| `npm run build`                                        | Type-check `src/` and build web app into `dist/`                         |
| `npm test`                                             | Run automated test suite (`node --test tests/*.test.mjs`)                |
| `npm run lint` / `npm run format:check`                | Run ESLint and Prettier checks over `src/`                               |
| `npm run typecheck:service` / `npm run build:service`  | Type-check and bundle the Windows service TypeScript                     |
| `npm run prepare:setup` / `build:setup` / `test:setup` | Download pinned toolchain, build Inno Setup EXE, run isolated smoke test |
| `npm run build:landing` / `npm run check:landing`      | Build and verify the standalone site in `landing/`                       |
| `npm run pages:deploy` / `npm run cf:dev`              | Deploy to Cloudflare Pages / preview Worker locally                      |

See [docs/SETUP\_UPDATES.md](docs/SETUP_UPDATES.md) for installer signing and release operations, [docs/CLOUDFLARE\_PAGES.md](docs/CLOUDFLARE_PAGES.md) for Cloudflare deployment, and [landing/README.md](landing/README.md) for the landing page.

### Project structure

```text
src/
  App.tsx                  Main shell, rail/sidebar navigation, and routing
  pages/                   Feature pages (Actuation, Rapid, RGB, Gamepad, Stream, Settings, ...)
    gamepad/               Gamepad setup, config, live tester tabs, and curve/hotkey hooks
  components/              Shared dialogs, keyboard/RGB previews, and feature editors
    advanced-keys/         DKS grid, action picker, and live output tester
    profile/               Profile wizard, linked-app rules, import/export, and drawers
    rgb/ & custom-rgb/     Custom RGB preset storage and layer controls
    macro/                 Macro workspace state helpers
  app/                     App-level contexts, UI primitives, and hooks (sync, workspace, selection)
  keyboard/                Board layouts, switch assets, RGB/rhythm engines, and firmware models
    registry/              BoardRegistry (`models/` for HERO68, HERO 68 XS, HERO84, WIN 68 HE MAX)
  protocol/                WebHID transport, driver abstraction (`driver.ts`), and device bridge
    hero68/                Core ByteTech protocol implementation (codec, commands, encoder, RGB, Hall)
    bytetech/              Thin ByteTech re-export layer over `hero68/`
    xsyd/                  XSYD `0x5C` protocol stack (WIN 68 HE MAX)
  state/                   Persisted drafts, profile hydration/share codes, macros, remap presets
  i18n/                    English (`locales/en.ts`), Vietnamese (`locales/vi/`), and error messages
service/
  main.ts & context.ts     Service entry point (port 16868), shared context, and lifecycle supervision
  server/                  Local HTTP/SSE control panel and API router
  profile/                 Foreground auto-profile switcher and zero-Flash-wear hardware executor
  rgb/                     Aurora RGB engine, frame synthesis, and effect pipeline
  hall/                    Shared Hall polling scheduler and telemetry broker
  gamepad/                 Virtual Xbox controller manager, curve output, and hotkey toggle
  bridge/                  Node <-> native C++ HID bridge & device locking
  native/                  Win32 C++ launcher, tray flyout, HID bridge, WASAPI audio, ViGEmClient
  installer/               Inno Setup script (`OpenHero68.iss`) and installer localizations
functions/ & worker/       Cloudflare Pages Functions & shared Worker handlers (`/api/region`, `/api/health`)
public/                    Static assets, profile icons/preset banners, `_headers`, and `vendor-tap/`
landing/                   Standalone public landing site
tests/                     Automated JS/TS (`*.test.mjs`), native C++ (`native-*.test.cpp`), and `fixtures/`
tools/                     Build, Inno packaging, Ed25519 signing, verification, and benchmark scripts
docs/                      Feature guides, protocol specs, `re-notes/`, `releases/`, and `archive/`
```

## Documentation

- [Custom RGB \& background service](docs/CUSTOM_RGB.md) · [Rhythm Sync](docs/RHYTHM_SYNC.md)
- [Gamepad \& shared Hall](docs/GAMEPAD.md) · [Gamepad validation](docs/GAMEPAD_VALIDATION.md)
- [Macros UI](docs/MACRO_UI.md) · [Advanced Keys UI](docs/ADVANCED_KEYS_UI.md)
- [ByteTech protocol notes](src/protocol/README.md) · [WIN 68 HE MAX (XSYD 0x5C) protocol](docs/xsyd-protocol.md)
- [Windows setup \& releases](docs/SETUP_UPDATES.md) · [All docs \& RE notes](docs/README.md) · [Changelog](CHANGELOG.md)

## Contributing

Bug reports (English or Vietnamese), keyboard support submissions, and pull requests are welcome:

- **Report a bug:** [Bug report form](https://github.com/shizunavn/OpenAula/issues/new?template=bug-report.yml) (only a problem description is required).
- **Add a keyboard:** [Keyboard support form](https://github.com/shizunavn/OpenAula/issues/new?template=add-a-board.yml) and [submission guide](docs/SUBMIT_A_BOARD.md).
- **Before opening a PR:** Run `npm run build` and `npm test` (plus `npm run typecheck:service` if you touch `service/` or shared `src/` modules).

## License

Licensed under the [Apache License 2.0](LICENSE).
