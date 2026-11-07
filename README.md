# OpenAula

An open-source, browser-based configurator for **AULA HERO68 / HERO84 / WIN 68 HE MAX** Hall-effect keyboards, plus an optional **Windows tray service** that keeps custom RGB, Rhythm Sync and analog Xbox gamepad output running after the browser is closed.

Formerly OpenHero68; the rename reflects support for the wider AULA line. Existing installs upgrade in place and keep their settings.

[**Website**](https://open-aula.pages.dev/) · [Open the web app](https://www.google.com/search?q=https://open-aula.pages.dev/) · [Download the Windows service](https://www.google.com/search?q=https://github.com/shizunavn/OpenAula/releases/latest) · [Release notes](https://www.google.com/search?q=https://github.com/shizunavn/OpenAula/releases/latest)

**Found a problem? [Report a bug](https://www.google.com/search?q=https://github.com/shizunavn/OpenAula/issues/new%3Ftemplate%3Dbug-report.yml)** — web app, keyboard features, Windows service or installer.

> [!IMPORTANT]
> **Own a HERO84 or another Hall-effect keyboard? Help bring support to your model.**
>
> **[Request keyboard support →](https://www.google.com/search?q=https://github.com/shizunavn/OpenAula/issues/new%3Ftemplate%3Dadd-a-board.yml)** · [Submission guide](https://www.google.com/search?q=docs/SUBMIT_A_BOARD.md)
>
> No coding needed. Share your exact model, firmware version, USB IDs and a layout photo; write **Unknown** if you need help. Protocol captures are optional. Owners who can test on real hardware are especially welcome.
>
> **Currently verified: AULA HERO68/HERO84(ONLY VERIFIED LIGHTING,RT,AP)/WIN68 MAX.** Other models still need protocol and hardware validation. WIN 68 HE MAX speaks a separate protocol (XSYD `0x5C`); its per-key settings and advanced keys are checked byte for byte against USB captures, but DKS and non-default SOCD modes stay disabled until a capture proves their layout.




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
| Profiles | Switch between 3 on-board profile slots, read from and save to device; displays dynamic key counts and model names for recognized boards (e.g. HERO68, HERO84, WIN 68 HE MAX) |
| Actuation Point | Per-key or multi-key actuation from 0.10 to 3.40 mm, with a live Hall test overlay on the keyboard |
| Rapid Trigger | Rapid Trigger and deadzone settings |
| Key Remap | Remap keys across layers, with a searchable icon catalog |
| Advanced Keys | SOCD, DKS, Mod Tap, Toggle, MPT and END bindings (Main Layer). DKS and non-default SOCD are disabled on WIN 68 HE MAX until a USB capture proves their frame layout |
| Macros | Macro editor with a local library synced to the keyboard |
| RGB Settings | On-board effects for keys and side light, plus **Custom Effects** and **Rhythm Sync**; per-key painting tools sit directly below the keyboard preview |
| Gamepad | Setup & Remap with automatic saves, analog response curves/travel, digital AP/RT, Snappy, circle/square, angle adjustment, live tester with XInput verification, and **custom toggle keybinding** to start/stop emulation in-game |
| Device settings | Polling rate (125 Hz – 8000 Hz), Tachyon Mode, OS mode, Windows key lock, Hall debounce, auto calibration, switch selector |
| Interface | English and Vietnamese UI, optional advanced pages (Hall Stream), compact sidebar |

**RGB tray service** (Windows x64, installed)

- **Custom Effects:** an Aurora base with composable effects (Comet, Pressure Wave, Ripple, Reaction, Touch, Jelly, AOE, Scan, Breath, Mixing, Trail, RT Display, plus the ambient Ember, Starlight, Afterglow and Tempo Pulse (BPM)) and a layer editor. Start/Stop controls with automatic live updates, session recovery and preserved drafts.
- **Rhythm Sync:** seven key modes driven by native system-audio capture, with live preview and a 60 FPS USB scheduler shared with Custom Effects.
- **Gamepad:** one virtual Xbox controller through ViGEmBus 1.22.0, up to 200 Hz analog output, automatically saved configurations for three profile slots, tray Start/Stop, and keybind toggle (`POST /gamepad/toggle`) with `expectedEnabled` state guard and automatic Xbox attach retry. Curve edits save on release; digital buttons follow keyboard AP/RT. The tester has a separate fast input stream; assigned keyboard keys can use firmware empty action with automatic remap recovery.
- **Shared Hall:** one native scheduler polls active source keys only, sharing common samples between Gamepad, RGB, Hall Stream and visual feedback. RGB Hall demand stays 100 Hz; LED output retains its 60 FPS target.
- **Keeps playing** when the browser is closed; AP, Rapid Trigger and deadzone stay editable while RGB runs.
- **Try demo:** edit and preview effects locally without the service or a keyboard.
- No Node.js, Python or administrator rights are needed on the user's PC.

## Quick start

### Just want to use it?

1. Open **[https://open-aula.pages.dev/](https://www.google.com/search?q=https://open-aula.pages.dev/)** in Chrome or Edge (the legacy origin `https://open-hero68.pages.dev/` also remains supported).
2. Click **Connect** and select your keyboard.
3. Change settings, then click **Save to profile N**.

Close other keyboard configuration apps (for example the vendor software) while connecting, as only one app can own the HID connection at a time.

For Custom Effects, Rhythm Sync and Gamepad, also install the [tray service](#rgb-tray-service-windows). Gamepad additionally needs the separately installed official [ViGEmBus 1.22.0 driver](https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0); driver installation requires administrator rights. Ordinary keyboard input stays enabled. Enable advanced pages to show Gamepad, bind controls and enable it; release all assigned keys before using the controller.

### Want to run it from source?

Requires **Node.js 22.12 or later**.

```sh
npm ci
npm run dev
```

Open the HTTPS URL printed by Vite. WebHID requires a secure context, so Vite creates a local development certificate; accept the browser warning.

## RGB tray service (Windows)

1. Download and run the Windows x64 setup EXE from [Releases](https://www.google.com/search?q=https://github.com/shizunavn/OpenAula/releases/latest). Choose Desktop shortcut (on by default) and optional Auto-start (off by default). The optional Gamepad driver task appears only when the driver is not installed.
2. Open OpenAula from Start Menu or the Desktop shortcut. An **H** icon appears in the system tray.
3. Open the web app and choose **Allow** if the browser asks for access to apps and services on this device.
4. Go to **RGB Settings → Custom Effects** or **Rhythm Sync**, pick a preset and click **Start Custom** or **Start Rhythm Sync**. Running edits sync automatically; returning to the editor joins existing playback.
5. Close the browser if you like — playback continues. Right-click the tray icon for controls.

**Tray menu:** Open web app · Open control panel · Start saved RGB · Stop RGB · Start saved Gamepad · Stop Gamepad · Check for updates · Open log folder · Auto-start · Quit.

Gamepad starts disabled whenever the service starts. Once enabled, it keeps running when the browser closes. Its independent 50 ms watchdog neutralizes stale input and waits for all assigned keys to rest before rearming. Start/Stop can also be toggled with your configured hotkey or shortcut.

| | |
| --- | --- |
| Control panel | [http://127.0.0.1:16868/](https://www.google.com/search?q=http://127.0.0.1:16868/) |
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
`npm run package:landing`. See [landing page development and deployment](https://www.google.com/search?q=landing/README.md).

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

The web app is deployed to **Cloudflare Pages** at [https://open-aula.pages.dev/](https://www.google.com/search?q=https://open-aula.pages.dev/).

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

Run `npm run test:setup` for isolated installer/update/rollback smoke tests. See [Setup and release operations](https://www.google.com/search?q=docs/SETUP_UPDATES.md) for release signing and GitHub Actions.

Helper scripts in `tools/` cover verification (`verify-service-package.mjs`, `verify-service-live.mjs`, …), benchmarking, signing and release publishing.

## Project structure

```text
src/
  App.tsx            Main shell: rail, sidebar, routing
  assets/            Fonts (Nunito Sans), remap icons, switch definitions
  styles/            Ordered shared stylesheets
  pages/             Feature pages (My Profile, Remap, Macros, RGB, Gamepad, Settings, …)
  components/        UI dialogs, banners, and feature components
  app/               Shared UI pieces, hooks (workspace, selection, sync state), helpers
  keyboard/          Keyboard layout models, registry (HERO68, HERO84, WIN 68 HE MAX), and layout caching
  protocol/          WebHID transport and protocol implementations:
    bytetech/        Core Bytetech protocol engine (HERO68/HERO84)
    xsyd/            XSYD 0x5C protocol (WIN 68 HE MAX)
    hero68/          Backward-compatible re-exports
  state/             Persisted app state, macros, remap presets
  i18n/              English / Vietnamese translations
functions/           Cloudflare Pages Functions wrapper (/api/region, /api/health)
worker/              Cloudflare Worker handlers (region detection, health check)
public/              Static assets, headers (WebHID Permissions-Policy), and manifests
service/             Modular tray service (TypeScript core + native C++):
  server/            HTTP API server and route handlers
  gamepad/           Virtual Xbox controller, ViGEmBus manager, and toggle tracker
  rgb/               Aurora RGB engine, frame synthesis, and effect pipeline
  hall/              Hall sensor polling and shared data streaming
  bridge/            Native HID bridge communication
  native/            C++ launcher, ViGEm helper, and HID bridge
tools/               Build, packaging, verification and release scripts
tests/               Automated test suite and layout fixtures
docs/                Reverse-engineering notes, feature docs, release notes
```

## Documentation

- [Custom RGB and the background service](https://www.google.com/search?q=docs/CUSTOM_RGB.md)
- [Rhythm Sync](https://www.google.com/search?q=docs/RHYTHM_SYNC.md)
- [Gamepad and shared Hall](https://www.google.com/search?q=docs/GAMEPAD.md) · [Recorded validation results](https://www.google.com/search?q=docs/GAMEPAD_VALIDATION.md)
- [Macros UI](https://www.google.com/search?q=docs/MACRO_UI.md) · [Advanced Keys UI](https://www.google.com/search?q=docs/ADVANCED_KEYS_UI.md)
- [Protocol integration notes](https://www.google.com/search?q=src/protocol/README.md)
- [WIN 68 HE MAX (XSYD 0x5C) protocol](docs/xsyd-protocol.md)
- [All docs, including reverse-engineering notes](https://www.google.com/search?q=docs/README.md)
- [Changelog](CHANGELOG.md) · [Service release notes](https://www.google.com/search?q=docs/releases/)

## Known limitations

- **Gamepad v1** supports one HERO68 and one Xbox controller on Windows x64. Firmware blocking saves exact original remaps before writing zero and recovers them after service restart. Advanced Keys on assigned keys must be removed first. Windows hook fallback affects matching keys on other keyboards, may not block Raw Input, and displays an anti-cheat warning when selected. No suppression method guarantees anti-cheat approval. DirectInput, mouse-to-stick and kernel keyboard filters are outside v1.
- **WIN 68 HE MAX** is a separate protocol stack, so Gamepad, RGB, Rhythm Sync and Hall Stream are HERO68/HERO84 features and do not apply to it yet. DKS, Rappy Snappy, DDKS and non-default SOCD modes are blocked until a USB capture proves their frame layout; the UI explains this instead of guessing.
- **Rhythm side-light modes** work in the demo only. Live side output stays disabled until the HERO68 LED count, order and protocol are verified; side LEDs keep their on-board effect while key playback runs.
- **Tachyon Mode** (8000 Hz polling) turns key and side lighting off to minimize latency. Custom Effects, Rhythm Sync and automatic Hall polling are paused while it is on, and your previous lighting is restored when you turn it off.
- The tray service supports **Windows x64 only**. The web app needs a WebHID browser (Chrome or Edge).

## Contributing

Want another keyboard model or hardware revision supported? Use the
[keyboard support form](https://www.google.com/search?q=https://github.com/shizunavn/OpenAula/issues/new%3Ftemplate%3Dadd-a-board.yml)
and [submission guide](https://www.google.com/search?q=docs/SUBMIT_A_BOARD.md). Include the exact model, installed
firmware, USB IDs for each connection and layout. Protocol captures are optional;
you can submit basic details first and volunteer for hardware testing later.

Issues and pull requests are welcome. Before opening a pull request, run:

```sh
npm run build
npm test
```

Found a problem? Use the [bug report form](https://www.google.com/search?q=https://github.com/shizunavn/OpenAula/issues/new%3Ftemplate%3Dbug-report.yml)
and tell us what happened in your own words. **Only the problem description is required.**
English and Vietnamese reports are welcome; screenshots, steps and technical details are optional.
You do not need to find logs or version numbers to report a bug. We can ask follow-up questions if needed.

## License

APACHE 2.0
