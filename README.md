# OpenAula

An open-source, browser-based configurator for **AULA HERO68 / HERO84 / HERO 68 XS / WIN 68 HE MAX** Hall-effect keyboards, plus an optional **Windows tray service** that keeps custom RGB, Rhythm Sync, automatic application profile switching, and analog Xbox gamepad output running after the browser is closed.

Formerly OpenHero68; the rename reflects support for the wider AULA line. Existing installs upgrade in place and keep their settings.

[**Website**](https://open-aula.pages.dev/) · [Open the web app](https://open-aula.pages.dev/) · [Download the Windows service](https://github.com/shizunavn/OpenAula/releases/latest) · [Release notes](https://github.com/shizunavn/OpenAula/releases/latest)

**Found a problem? [Report a bug](https://github.com/shizunavn/OpenAula/issues/new?template=bug-report.yml)** — web app, keyboard features, Windows service or installer.

> [!IMPORTANT]
> **Own a HERO84 or another Hall-effect keyboard? Help bring support to your model.**
>
> **[Request keyboard support →](https://github.com/shizunavn/OpenAula/issues/new?template=add-a-board.yml)** · [Submission guide](docs/SUBMIT_A_BOARD.md)
>
> No coding needed. Share your exact model, firmware version, USB IDs and a layout photo; write **Unknown** if you need help. Protocol captures are optional. Owners who can test on real hardware are especially welcome.
>
> **Currently verified: AULA HERO68 / HERO84 (verified lighting, RT, AP) / HERO 68 XS (5 µm high precision, 8K receiver) / WIN 68 HE MAX.** Other models still need protocol and hardware validation. WIN 68 HE MAX speaks a separate protocol (XSYD `0x5C`); its per-key settings, Rapid Trigger, 4 onboard profile slots (`0..3`, `Fn + P1..P4`), Smart Slot 3 Virtualization for zero-wear game profile switching, 4-mode SOCD, 7-node visual DKS, OS switching, WinLock, and WebHID configuration are fully supported.

> **Unofficial project.** OpenAula is a community effort based on reverse engineering. It is not affiliated with or endorsed by AULA or the makers of Wootility.

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [RGB tray service (Windows)](#rgb-tray-service-windows)
- [Development](#development)
- [Cloudflare deployment](#cloudflare-deployment-pages)
- [Building the Windows service](#building-the-windows-service)
- [Project structure](#project-structure)
- [Documentation](#documentation)
- [Status and known limitations](#status-and-known-limitations)
- [Contributing](#contributing)

## Features

**Web app** (Chrome or Edge, via WebHID — no driver or install needed)

| Area | What you can do |
| --- | --- |
| Profiles | 3-tier profile system (Onboard, Linked with Apps, Inactive); switch between 3 on-board hardware slots (`0..2`, `Fn + P1..P3`) on `HERO68`, `HERO84`, and `HERO 68 XS`, or **4 on-board slots (`0..3`, `Fn + P1..P4`) on `WIN 68 HE MAX`** with Smart Slot 3 virtualization, plus unlimited linked application profiles; **Auto-Profile** app switching with zero Flash wear via Background Service v1.8.0; 89 SVG profile icons across 3 categories (`SWITCHY & UwU`, `WOOTING`, `GRADIENTS`) and 6 preset banners (including **TenZ Pro FPS**); drag-and-drop profile reordering & duplication (hold `Ctrl` to copy); export/import JSON and `OA2-...` Profile Share Codes, discard unsaved draft edits, or reset a profile to factory defaults with one-click Undo; displays dynamic key counts and model names for recognized boards (`HERO68`, `HERO84`, `HERO 68 XS`, `WIN 68 HE MAX`) |
| Actuation Point | Per-key or multi-key actuation from 0.10 to 3.40 mm (with fine 0.005 mm / 5 µm step rounding on `HERO 68 XS` and 0.01 mm step rounding on other boards), live Hall test overlay on the keyboard |
| Rapid Trigger | Rapid Trigger and deadzone settings from 0.01 to 3.40 mm on `HERO68`, `HERO84`, and `WIN 68 HE MAX` (clamped at 0.01 mm minimum and automatically rounded to 0.01 mm steps, e.g. `0.005` → `0.01`, `0.155` → `0.16`), and from 0.005 to 3.400 mm on `HERO 68 XS` (clamped at 0.005 mm minimum and automatically rounded to 0.005 mm / 5 µm steps, e.g. `0.164` → `0.165`, `0.172` → `0.17`, `0.173` → `0.175`) |
| Key Remap | Remap keys across layers, with a searchable icon catalog |
| Advanced Keys | SOCD (4 priority modes), DKS (7-node visual track & official keycap palette), Mod Tap, Toggle, MPT and END bindings (Main Layer), with one-click binding deletion, Clear All, and instant Undo |
| Macros | Macro editor with a local library synced to the keyboard |
| RGB Settings | On-board effects for keys and side light, plus **Custom Effects** (Dynamic Wave across 9 directions, Trigger Response, Aurora, and 16 FX layers) and **Rhythm Sync** (with 16 log-spaced equalizer bands, Spectrum Bars, Audio Marquee, Radial Chase & Peak-hold side meters); per-key painting tools sit directly below the keyboard preview |
| Gamepad | Setup & Remap with automatic saves, analog response curves/travel, digital AP/RT, Snappy, circle/square, angle adjustment, live tester with XInput verification, and **custom toggle keybinding** to start/stop emulation in-game |
| Hall Stream | Real-time full-keyboard Hall travel telemetry with interactive key pinning/unpinning and live travel readouts |
| Device settings | Polling rate (125 Hz – 8000 Hz, with 8K wireless receiver support), Tachyon Mode, OS mode (Windows/macOS), Windows key lock, Hall debounce, auto calibration, authentic switch selector with photo assets |
| Help & Support | Built-in bilingual Help center with direct links to pre-filled GitHub Bug Report and Add-a-Board templates, quick navigation to Background Service & Diagnostics, and troubleshooting guides |
| Interface | English and Vietnamese UI, optional advanced pages (Hall Stream), compact sidebar |

**RGB tray service** (Windows x64, installed)

- **Native System Tray Flyout:** custom dark-themed Win32 GDI flyout with live status cards (ViGEm driver status, WebHID bridge connection, active profile slot, RT/AP mode, and RGB/Gamepad state) and one-click quick action buttons.
- **Service Control Panel:** responsive dark-mode diagnostic and management dashboard at `http://127.0.0.1:16868/` with real-time telemetry, profile switching, and updater integration.
- **Auto-Profile Switcher & Zero Flash Wear Engine:** monitors the active foreground application (400 ms Win32 poll, 800 ms Alt-Tab debounce, 3000 ms min dwell) and switches profiles by executable name (`cs2.exe`, `*valorant*.exe`), installation folder, or window title. Uses zero-wear slot switching (`CMD 0x10` on ByteTech / `0x00 0x70` on XSYD) or volatile RAM diff streaming (`0x15 -> 0x13 -> 0x19 -> 0x16`) on `HERO68` / `HERO84` / `HERO 68 XS`, and slot switching + SRAM RGB indicator (`0x2A`) + Smart Slot 3 Virtualization session caching (`12 s` warm-up dwell and token-bucket wear guard) on `WIN 68 HE MAX` to prevent SPI Flash wear.
- **HERO 68 XS Wire Travel Normalization:** high-resolution 5 µm wire travel normalized across Gamepad analog output and RGB pressure waves.
- **Custom Effects:** an Aurora or Dynamic Wave base with composable effects (Dynamic Wave, Trigger Response, Comet, Pressure Wave, Ripple, Reaction, Touch, Jelly, AOE, Scan, Breath, Mixing, Trail, RT Display, plus the ambient Ember, Starlight, Afterglow and Tempo Pulse (BPM)) and a layer editor with 9-direction control and smooth circular palette transitions. Start/Stop controls with automatic live updates, session recovery and preserved drafts.
- **Rhythm Sync:** 10 key modes driven by native system-audio capture with 16 log-spaced FFT bands, 7 side meter modes (including Peak-hold & Far-end), live preview and a 60 FPS USB scheduler shared with Custom Effects.
- **Gamepad:** one virtual Xbox controller through ViGEmBus 1.22.0, up to 200 Hz analog output, automatically saved configurations for three profile slots, tray Start/Stop, and keybind toggle (`POST /gamepad/toggle`) with `expectedEnabled` state guard and automatic Xbox attach retry. Curve edits save on release; digital buttons follow keyboard AP/RT. The tester has a separate fast input stream; assigned keyboard keys can use firmware empty action with automatic remap recovery.
- **Shared Hall:** one native scheduler polls active source keys only, sharing common samples between Gamepad, RGB, Hall Stream and visual feedback. RGB Hall demand stays 100 Hz; LED output retains its 60 FPS target.
- **Keeps playing** when the browser is closed; AP, Rapid Trigger and deadzone stay editable while RGB runs.
- **Try demo:** edit and preview effects locally without the service or a keyboard.
- No Node.js, Python or administrator rights are needed on the user's PC.

## Quick start

### Just want to use it?

1. Open **[https://open-aula.pages.dev/](https://open-aula.pages.dev/)** in Chrome or Edge (the legacy origin `https://open-hero68.pages.dev/` also remains supported).
2. Click **Connect** and select your keyboard.
3. Change settings, then click **Save to profile N**.

Close other keyboard configuration apps (for example the vendor software) while connecting, as only one app can own the HID connection at a time.

For Custom Effects, Rhythm Sync, Auto-Profile Switching, and Gamepad, also install the [tray service](#rgb-tray-service-windows). Gamepad additionally needs the separately installed official [ViGEmBus 1.22.0 driver](https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0); driver installation requires administrator rights. Ordinary keyboard input stays enabled. Enable advanced pages to show Gamepad, bind controls and enable it; release all assigned keys before using the controller.

### Want to run it from source?

Requires **Node.js 22.12 or later**.

```sh
npm ci
npm run dev
```

Open the HTTPS URL printed by Vite. WebHID requires a secure context, so Vite creates a local development certificate; accept the browser warning.

## RGB tray service (Windows)

1. Download and run the Windows x64 setup EXE from [Releases](https://github.com/shizunavn/OpenAula/releases/latest). Choose Desktop shortcut (on by default) and optional Auto-start (off by default). The optional Gamepad driver task appears only when the driver is not installed.
2. Open OpenAula from Start Menu or the Desktop shortcut. An **H** icon appears in the system tray.
3. Open the web app and choose **Allow** if the browser asks for access to apps and services on this device.
4. Go to **RGB Settings → Custom Effects** or **Rhythm Sync**, pick a preset and click **Start Custom** or **Start Rhythm Sync**. Running edits sync automatically; returning to the editor joins existing playback.
5. Close the browser if you like — playback continues. Click or right-click the tray icon to open the native status flyout.

**Tray flyout & actions:** Live status cards (ViGEm driver presence, WebHID bridge connection, device profile slot, RT/AP mode, RGB/Gamepad status) · Open web app · Open control panel · Start saved RGB · Stop RGB · Start saved Gamepad · Stop Gamepad · Check for updates · Open log folder · Auto-start · Quit.

Gamepad starts disabled whenever the service starts. Once enabled, it keeps running when the browser closes. Its independent 50 ms watchdog neutralizes stale input and waits for all assigned keys to rest before rearming. Start/Stop can also be toggled with your configured hotkey or shortcut.

| | |
| --- | --- |
| Control panel | [http://127.0.0.1:16868/](http://127.0.0.1:16868/) |
| Presets and logs | `%LOCALAPPDATA%\OpenAula\rgb-service` |
| Auto-start | Optional, per Windows account, off by default. Uses the installed stable launcher. |
| Allowed origins | The deployed web app (`https://open-aula.pages.dev`), legacy origin `https://open-hero68.pages.dev`, and `localhost:5173` / `127.0.0.1:5173`. For another host, start the service with `--allow-origin https://your-host:port`. |

### Updating

Click **Check for updates** in the tray, **Update app** in the control panel, or **Update the app** in Settings > Background Service. One click checks the stable GitHub release, downloads the setup and verifies it against its Ed25519-signed update manifest, closes the app safely, installs the full payload and restarts **the app only**. Windows is never restarted automatically. A failed health check restores the previous app and saved data.

The installer does not currently have Windows Authenticode publisher signing, so Windows may show a SmartScreen prompt. Update manifest signing verifies the downloaded package separately.

Portable users must run setup once to migrate. Settings stay in the same LocalAppData folder; the old portable directory is not deleted. Installed builds use their bundled core and do not activate legacy downloaded cores.

The installer keeps shortcut and Auto-start choices during automatic updates. Gamepad starts disabled after every app restart. RGB/Rhythm retain their saved configuration. Driver installation is optional and may ask for administrator permission; any Windows restart required by the driver is left to the user.

## Development

The separate public landing page lives in `landing/`. Build it with
`npm run build:landing`, check with `npm run check:landing`, and package it with
`npm run package:landing`. See [landing page development and deployment](landing/README.md).

Production builds and tests require development dependencies. Use `npm ci` (or
`npm ci --include=dev` if your environment defaults to omitting them) before
building; the resulting `dist/` contains static browser assets.

Copy `.env.example` to `.env.local` to configure `HERO68_DEV_HOSTS`: optional
comma-separated hostnames/IPs added to the local Vite certificate. Localhost and
127.0.0.1 remain available without configuration.

Set `HERO68_ALLOWED_ORIGINS` in the **service process environment** to allow
additional exact HTTP(S) origins, separated by commas. Paths, credentials and
wildcards are rejected. The service does not load Vite's `.env.local`; its
deployed Pages and localhost defaults remain available, and `--allow-origin`
still adds origins explicitly. These variables are not exposed to browser code.

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server over HTTPS |
| `npm run build` | Type-check and build the web app into `dist/` (serve it over HTTPS for WebHID) |
| `npm run preview` | Preview the production build |
| `npm test` | Run all tests (`node --test tests/*.test.mjs`) |
| `npm run test:rgb` | Run only the RGB tests |
| `npm run test:profile-remap` | Run only the profile/remap tests |
| `npm run typecheck:service` | Type-check the Windows service TypeScript without emitting |
| `npm run build:service` | Type-check and bundle the service's TypeScript into `service/dist/` |
| `npm run pages:deploy` | Build and deploy the web app to Cloudflare Pages (`open-aula.pages.dev`) |
| `npm run cf:dev` | Build and preview as a Cloudflare Worker locally |
| `npm run cf:deploy` | Build and deploy as a Cloudflare Worker |

Tech stack: React 19, TypeScript 7, Vite 8, WebHID; the service uses a bundled Node runtime with a native C++ launcher and HID bridge.

### Cloudflare deployment (Pages)

The web app is deployed to **Cloudflare Pages** at [https://open-aula.pages.dev/](https://open-aula.pages.dev/).

API endpoints (`/api/region` for language detection and `/api/health` for monitoring) are implemented via Cloudflare Pages Functions in `functions/api/`, which wrap the shared Worker handlers in `worker/`. Static frontend assets are compiled into `dist/`.

- **Automatic deployment via CI**: On every push to `main`, `.github/workflows/cloudflare.yml` runs TypeScript checks for both the service and the web app, builds the assets, and deploys directly to Cloudflare Pages using `wrangler pages deploy dist --project-name open-aula --branch main` when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets are set. Pull requests from forks skip deployment.
- **Manual deployment via CLI**:
  ```sh
  npm run pages:deploy
  ```
- **Local preview / Workers mode**: Run `npm run cf:dev` to test Worker APIs and asset serving locally with Wrangler.

## Building the Windows service

Requires Windows with **Visual Studio Build Tools** (C++ desktop workload and Windows SDK).

```powershell
$env:HERO68_VCVARS = 'C:\path\to\VC\Auxiliary\Build\vcvars64.bat'
npm ci
npm run build:service
npm run prepare:setup
npm run build:setup
```

The launcher and HID bridge are compiled with MSVC. The TypeScript RGB engine and the Node runtime are bundled into `service/dist/`. Packaging writes `OpenAula-Setup-Windows-x64.exe` to `service/releases/`. `service/version.json` controls the service version, API and pinned toolchain. MSVC is discovered using vswhere; `HERO68_VCVARS` remains an override.

Run `npm run test:setup` for isolated installer/update/rollback smoke tests. See [Setup and release operations](docs/SETUP_UPDATES.md) for release signing and GitHub Actions.

Helper scripts in `tools/` cover verification (`verify-service-package.mjs`, `verify-service-live.mjs`, …), benchmarking, signing and release publishing.

## Project structure

```text
src/
  App.tsx            Main shell: rail, sidebar, routing
  assets/            Fonts (Nunito Sans), remap icons, switch definitions
  styles/            Ordered shared stylesheets
  pages/             Feature pages (My Profile, Remap, Macros, RGB, Gamepad, Settings, …)
  components/        UI dialogs, banners, profile wizard/drawers, and feature components
  app/               Shared UI pieces, hooks (workspace, selection, sync state), helpers
  keyboard/          Keyboard layout models, registry (HERO68, HERO 68 XS, HERO84, WIN 68 HE MAX), and layout caching
  protocol/          WebHID transport and protocol implementations:
    bytetech/        Core Bytetech protocol engine (HERO68 / HERO 68 XS / HERO84)
    xsyd/            XSYD 0x5C protocol (WIN 68 HE MAX)
    hero68/          Backward-compatible re-exports
  state/             Persisted app state, profile library/share codes, macros, remap presets
  i18n/              English / Vietnamese translations
functions/           Cloudflare Pages Functions wrapper (/api/region, /api/health)
worker/              Cloudflare Worker handlers (region detection, health check)
public/              Static assets, profile icons/preset banners, headers, and manifests
service/             Modular tray service (TypeScript core + native C++):
  server/            HTTP API server and route handlers
  profile/           Auto-profile switcher and zero-Flash-wear hardware executor
  gamepad/           Virtual Xbox controller, ViGEmBus manager, and toggle tracker
  rgb/               Aurora RGB engine, frame synthesis, and effect pipeline
  hall/              Hall sensor polling and shared data streaming
  bridge/            Native HID bridge communication
  native/            C++ launcher, foreground process monitor, ViGEm helper, and HID bridge
tools/               Build, packaging, verification and release scripts
tests/               Automated test suite and layout fixtures
docs/                Reverse-engineering notes, feature docs, release notes
```

## Documentation

- [Custom RGB and the background service](docs/CUSTOM_RGB.md)
- [Rhythm Sync](docs/RHYTHM_SYNC.md)
- [Gamepad and shared Hall](docs/GAMEPAD.md) · [Recorded validation results](docs/GAMEPAD_VALIDATION.md)
- [Macros UI](docs/MACRO_UI.md) · [Advanced Keys UI](docs/ADVANCED_KEYS_UI.md)
- [Protocol integration notes](src/protocol/README.md)
- [WIN 68 HE MAX (XSYD 0x5C) protocol](docs/xsyd-protocol.md)
- [All docs, including reverse-engineering notes](docs/README.md)
- [Changelog](CHANGELOG.md) · [Service release notes](docs/releases/)

## Status and known limitations

- **Gamepad v1** supports one HERO68 / HERO 68 XS and one Xbox controller on Windows x64. Firmware blocking saves exact original remaps before writing zero and recovers them after service restart. Advanced Keys on assigned keys must be removed first. Windows hook fallback affects matching keys on other keyboards, may not block Raw Input, and displays an anti-cheat warning when selected. No suppression method guarantees anti-cheat approval. DirectInput, mouse-to-stick and kernel keyboard filters are outside v1.
- **WIN 68 HE MAX** operates on a separate XSYD 0x5C protocol stack. Per-key AP/RT (0.01 mm step resolution), 4 onboard profile slots (`0..3`, `Fn + P1..P4`), 4-mode SOCD, 7-node visual DKS, OS mode switching, WinLock, WebHID configuration, and Auto-Profile app switching via Smart Slot 3 Virtualization are fully supported; virtual Gamepad and custom service RGB streaming currently target the HERO68 / HERO 68 XS family.
- **Rhythm side-light modes** work in the demo only. Live side output stays disabled until the HERO68 LED count, order and protocol are verified; side LEDs keep their on-board effect while key playback runs.
- **Tachyon Mode** (8000 Hz polling) turns key and side lighting off to minimize latency. Custom Effects, Rhythm Sync and automatic Hall polling are paused while it is on, and your previous lighting is restored when you turn it off.
- The tray service supports **Windows x64 only**. The web app needs a WebHID browser (Chrome or Edge).

## Contributing

Want another keyboard model or hardware revision supported? Use the
[keyboard support form](https://github.com/shizunavn/OpenAula/issues/new?template=add-a-board.yml)
and [submission guide](docs/SUBMIT_A_BOARD.md). Include the exact model, installed
firmware, USB IDs for each connection and layout. Protocol captures are optional;
you can submit basic details first and volunteer for hardware testing later.

Issues and pull requests are welcome. Before opening a pull request, run:

```sh
npm run build
npm test
```

Found a problem? Use the [bug report form](https://github.com/shizunavn/OpenAula/issues/new?template=bug-report.yml)
and tell us what happened in your own words. **Only the problem description is required.**
English and Vietnamese reports are welcome; screenshots, steps and technical details are optional.
You do not need to find logs or version numbers to report a bug. We can ask follow-up questions if needed.

## License

APACHE 2.0
