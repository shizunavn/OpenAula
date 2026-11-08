# Changelog

UI and Windows service versions are independent. Historical notes below retain
their original validation scope; they are not claims of new hardware testing.

## 1.7.0 — AULA WIN 68 HE MAX & HERO 68 XS Hardware Imagery, Switch Visual Assets & 8K Receiver Support

- Hardware Visual Imagery & Keyboard Assets:
  - Added dedicated high-fidelity image asset for AULA WIN 68 HE MAX (`src/assets/win68HeMax.png`).
  - Updated `WIN68_HE_MAX_BOARD` descriptor and `DeviceConnectionPanel` to render the WIN 68 HE MAX hardware thumbnail instead of the generic HERO68 placeholder.
  - Added dedicated crystal-edition hardware asset for AULA HERO 68 XS (`src/assets/hero68xs.png`).
  - Dynamically switches keyboard thumbnail to HERO 68 XS in `DeviceConnectionPanel` when connected device is recognized as HERO 68 XS (via `0x10` sub-device UUID or XS product name).
- Authentic Switch Visual Assets (`src/assets/switches/`, `switchAssets.ts`):
  - Added real front and top switch photo assets:
    - Lingyun Magnetic (`switch-59`, `lingyun-front.png`, `lingyun-top.png`).
    - Snow God / Xue Shen (`switch-60`, `snowgod-front.webp`, `snowgod-top.png`).
    - Nick Magnetic (`switch-61`, `nick-front.png`, `nick-top.png`).
    - Ice Jade (`switch-62`, `icejade-front.png`, `icejade-top.png`).
    - Ash Wood (`switch-37`, `ashwood-front.png`, `ashwood-top.png`).
  - Mapped all 5 new switches in `SWITCH_IMAGES` in `switchAssets.ts`, providing authentic switch card and per-key visual previews on the keyboard stage.
- HERO 68 XS 8K Receiver & 5 µm Precision Scale (`service/native/hid_bridge.cpp`, `hero68Encoder.ts`, `precision.ts`):
  - Added 8K wireless receiver (`PID 0x106C`) to Windows background service HID bridge filter (`service/native/hid_bridge.cpp`).
  - Implemented dynamic distance scaling (`0.005 mm` / `5 µm`) for HERO 68 XS query replies via CMD `0x82` zone 6/8 (`precision_rt` / `precision_distance`).

## 1.6.1.1 — WIN 68 HE MAX Hardware WinLock & OS Mode Switching

- Hardware Windows Key Lock (`src/protocol/xsyd/device.ts`, `GeneralSettingsPage.tsx`, `useDeviceSettings.ts`):
  - Verified and implemented `0x00` subcmd `0x20` for WIN 68 HE MAX firmware v1.1.4 (`VA 0x09CBC` -> `0x09F38`, helper `VA 0x12FAE`).
  - Read query `20 FF FF FF` retrieves current lock status (`00 20 <00|01> FF`).
  - Toggling frame `20 <01|00> FF FF` updates `Left Win` (`0xE3`) disable bit in `0x20006120` and bit 3 of indicator bitmask (`VA 0x12F6A`).
  - Added idempotent `writeXsydWinLock()` guard to prevent accidental toggling when already in the desired state, verified with a follow-up readback.
- Operating System Mode Switching (`src/protocol/xsyd/device.ts`, `GeneralSettingsPage.tsx`, `useDeviceSettings.ts`):
  - Verified and implemented OS mode commands for WIN 68 HE MAX (`VA 0x09CC4`, `0x0A128`, helper `VA 0x12960` reading `0x200031CB`):
    - Subcmd `0x21`: query Windows mode active flag.
    - Subcmd `0x22`: query macOS mode active flag.
    - Subcmd `0x30`: switch to Windows OS mode (`0x200031CB = 0`, loads `VA 0x4A20` keymap bank `0..3`).
    - Subcmd `0x31`: switch to macOS OS mode (`0x200031CB = 1`, loads `VA 0x4630` keymap bank `4..7` with `L-Win`/`L-Alt` swapped, automatically clears WinLock).
  - Automatically unlocks WinLock before returning to Windows mode to protect matrix index 107 (`L-Alt`) from lingering disabled in `0x20006120`.
- Documentation & Verification:
  - Documented disassembled firmware handlers (`VA 0x09F50`, `VA 0x128E8`, etc.) in `docs/xsyd-protocol.md` and `docs/xsyd_knownstate.md`.
  - Added integration unit tests in `tests/xsyd-win68-integration.test.mjs` verifying OS mode reply decoding, GeneralSettingsPage radio controls, idempotent WinLock writes, and macOS/Windows state transitions.

## 1.6.1 — Rhythm Equalizer Full-Scale Scaling, Audio Marquee Row Direction & Radial Chase Shockwave

- Rhythm Sync Spectrum Bars (Mode 429) Full-Scale & Row Distribution (`service/native/rhythm_core.h`, `rhythm.ts`):
  - Normalized magnitude curve by full-scale value at `m = 1.0` (`fullScale ≈ 0.920696`), allowing high-energy frequency bands to reach `1.0` and fully illuminate Row 0 (top number row).
  - Divided height `[0, 1]` evenly across all 5 keyboard rows (`rowFloor = (4 - k.y) / 5`, from bottom row `0.0` to top number row `0.8`).
  - Added sensitivity scaling (`sensitivity / 4.0`) so the UI Sensitivity slider directly and proportionally scales the frequency bands.
  - Smooth edge transitions (`0.35 + 0.65 * edge`) per row.
- Audio Marquee (Mode 432) Horizontal Multi-Directional Bars (`service/native/rhythm_core.h`, `rhythm.ts`):
  - Converted Marquee from vertical time-scrolling to alternating-direction horizontal rhythm bars across each row (even rows `0, 2, 4` sweep left-to-right; odd rows `1, 3` sweep right-to-left).
  - Bars respond dynamically to live volume (`level_`), per-row frequency bands (`bands_`), and beat history ripple (`history_`).
  - Head of each bar shines at full intensity (`1.0`), smoothly fading along the body, and stays completely black (`#000000`) during silence (`level_ == 0`).
- Radial Chase (Mode 434) Beat-Driven Concentric Shockwave Rings (`service/native/rhythm_core.h`, `rhythm.ts`):
  - Replaced time-driven expansion with beat-driven concentric shockwave rings expanding from keyboard center (`distNorm = clamp(hypot((nx-0.5)*2, (k.y/4-0.5)*1.35) / 1.15, 0, 1)`).
  - Shockwaves pulse outward on audio transients (`drive = clamp(bands_[band] > 0 ? level * 0.55 + bands_[band] * 0.65 : level, 0, 1)`).
  - Generates secondary reverberation echo rings at the center on heavy beats (`drive > 0.5`).
- Side Light Hardware Isolation (`useDeviceSyncController.ts`, `CustomRgbEditor.tsx`, `RgbSettingsPage.tsx`, `lighting.ts`):
  - Saving side light edits from tabs other than `onboard` no longer calls `rgbService.mode('onboard')`, preserving running Custom Effects and Rhythm streaming sessions on keys.
  - Added UI notices and Vietnamese localization explaining that Side Light settings are stored directly in keyboard hardware.
- Test Coverage & Documentation:
  - Added unit test in `tests/native-rhythm.test.cpp` verifying Spectrum Bars reach the top number row (keys 0..14) under loud audio.
  - Added test in `tests/rhythm.test.mjs` verifying Spectrum Bars light up Row 0 and Marquee / Radial Chase scale with music energy.
  - Updated architecture and behavior descriptions in `docs/RHYTHM_SYNC_OPENRGB.md`.

## 1.6.0 — Dynamic Wave 9-Direction, Trigger Response, Log-Spaced Rhythm Equalizer & Smooth Multi-Color Wraparound

- Dynamic Wave (`wave`):
  - Multi-directional color waves across all 9 directions (`top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right`) plus legacy horizontal/vertical directions.
  - Supports true radial outward wave (`center`) centered on the keyboard layout.
  - Seamless circular linear interpolation across palette stops, completely eliminating seam color jumps and angular quantization snaps.
  - Usable both as base effect and composable effect layer, with speed, wave width, direction grid, and palette controls.
- Trigger Response (`trigger`):
  - Cross-shaped row and column light wave emitted upon each key press.
  - Per-press cyclic progression across the 5-color trigger palette stops (`RGB_GRADIENT_PALETTES.trigger`).
  - Origin key stays illuminated while physically held, and cross arms blend additively (`addPixel`) when multiple keys overlap.
- Rhythm Sync Log-Spaced Equalizer & Modes (`service/native/rhythm_core.h`, `rhythm.ts`):
  - 16 log-spaced frequency equalizer bands across 64 FFT bins (~187.5 Hz to ~11.8 kHz), spreading speech and musical energy across the full 68-key width rather than bunching in the first column.
  - Added new Rhythm key modes: Mode 429 (Spectrum Bars), Mode 432 (Audio Marquee), and Mode 434 (Radial Chase).
  - Added new Rhythm side modes: Mode 504 (Loop 18 slots), Mode 505 (Peak-hold meter), and Mode 506 (Far-end meter).
  - Added technical architecture documentation in `docs/RHYTHM_SYNC_OPENRGB.md`.
- WIN 68 HE MAX Preview & Multi-Color Smoothing:
  - Eliminated 30-degree quantization jumps and seam snaps in `AulaWin68ExactRgbEngine` across ported modes `201..212`.
  - Added `pendingPress` buffer in `AulaWin68ExactRgbEngine` to latch fast preview key presses between animation frames.
  - Added additive pixel blending (`addPixel`) to prevent overlapping reactive slots from wiping colors.
  - Added WebHID write guard in Custom RGB and Rhythm modes to prevent conflicting live background writes.
  - Preserved color group prior in `service/frame.ts` during palette member merging.
- Code quality & ESLint:
  - Configured ESLint with `@babel/eslint-parser`, `eslint-plugin-react-hooks`, and `eslint-plugin-react-refresh`.
  - Added `npm run lint` script to `package.json`.

## 1.5.2 — Custom Effects Multicolor Restoration, Dedicated Gaming Preset Separation & Profile Save Fixes

- Custom Effects Color Controls:
  - Restored Multicolor toggle and 8-color swatch grid (including Slot 0 Multicolor with rainbow indicator) for non-gradient effects.
  - Automatically hidden Single Color controls for gradient effects (Aurora, Comet, Ember, Starlight, Afterglow, Pulse), directly exposing gradient palettes.
- Dedicated Gaming Preset Colors:
  - Independent `presetColors` caching across Custom Effects and Onboard Effects for Mode 22 (WASD), Mode 23 (MOBA), Mode 24 (RTS), Mode 25 (MMO), and Mode 26 (User Custom).
  - Editing User Custom preset colors no longer mirrors into MOBA or other presets.
  - Built-in recommended default lighting templates for gaming presets.
- Profile Save Fixes:
  - Synchronized `value.keys.mode` with `config.base.mode` when selecting presets in Custom Effects.
  - Removed model restriction gating `customRgbPending`, allowing HERO68 to save Custom Effects to hardware profiles.

## 1.5.1 — WIN 68 HE MAX DKS 7-Node Visual Track & Official Keycap Palette

- DKS 7-Node Visual Track Editor (`AdvancedKeysPage.tsx` & `AdvancedKeysPage.css`):
  - Implemented visual 7-node track matching official AULA DKS UI (`dksVisualTrackState`):
    - Row A (Hold 1: `0x03` → nodes 0 & 1 lit, segment 0 lit)
    - Row B (Hold 2: `0x1C` → nodes 2 & 3 lit, segment 2 lit)
    - Row C (Hold 3: `0x60` → nodes 4 & 5 lit, segment 4 lit)
    - Row D (End: `0xC0` → nodes 5 & 6 lit, segment 5 lit)
  - Added official AULA keycap palette categories: LETTER, NUMBER KEY, SYMBOLIC KEY, BASIC KEY, FUNCTION KEY, KEYBOARD CONTROL.
- WIN 68 HE MAX DKS defaults and action encoding:
  - `newAdvanced` initializes DKS on WIN 68 HE MAX with default actions `[4, 5, 6, 7]` and states `[[14,0,0,0], [0,14,0,0], [0,0,14,0], [0,0,0,10]]` matching official hardware capture `dks_keyW_down1.4-3.4_up3.4-1.4_A-hold1_B-hold2_C-hold3_D-end.pcapng`.
  - Seamlessly transcodes HERO68 32-bit modifier keycodes (e.g. `L_Shift 0x00020000` in DKS Running preset) to native XSYD `0xE1`/`0xE0` action bytes.
- Regression verification:
  - Added test coverage in `tests/xsyd-win68-integration.test.mjs` verifying the 7-node visual track, palette categories, and modifier action encoding.

## 1.5.0 — WIN 68 HE MAX Flash Flush 0x23 Recovery, 200 Hz Hall Stream & Research Synthesis

- Auto-recovery from `0x23` read timeout during Flash flush:
  - Addressed SPI/NOR Flash sector erase freeze (`VA 0x07E28` → `0x11914` → `0x09AF0`): during the ~500–670 ms deferred Flash write window, MCU masks interrupts, dropping incoming `0x23` packets and later emitting unsolicited `5C 04 FF <ck> | 0A FF <hi> <lo>`.
  - `XsydDeviceManager` now automatically retries `0x23` requests up to 2 times upon read timeouts and handles Flash-flush completion frames cleanly, eliminating `WIN 68 HE MAX read timed out (opcode=0x23)` errors.
- 200 Hz High-Speed XSYD Hall Sensor Streaming:
  - Streamlined Hall polling sequence in `src/protocol/hero68/hallStream.ts`, `service/hall/hallController.ts`, and `service/native/hid_bridge.cpp`.
  - Implemented single `0x12 0x03` initial seed for pressed state, followed by 1-round-trip steady-state polling with 3:1 prioritized sampling of depressed keys over idle keys, achieving stable ~200 Hz Hall streaming.
- Firmware static analysis synthesis (`docs/xsyd_knownstate.md`):
  - Added comprehensive 1286-line verified technical specification covering MCU XS105 / SI2828C memory map, Flash sector layouts, jump tables, and HID descriptors for AULA WIN 68 HE MAX (`App v1.1.4_20260204a`).

## 1.4.3 — WIN 68 HE MAX DKS & 4-Mode SOCD Support

- WIN 68 HE MAX DKS (Dynamic Keystroke) implementation:
  - Enabled DKS mode for WIN 68 HE MAX via opcode `0x26`, LEN 16 (`0x10`), handler verified against firmware disassembly (`VA 0x0B718..0x0B9FE`).
  - Implemented 4-phase key actions and phase mask encoding (`payload[10..13]` against ROM table `VA 0x1D524`): Tap Phase 0 (`0x01`), Tap Phase 1 (`0x04`), Tap Phase 2 (`0x20`), Tap Phase 3 (`0xc0`), and Hold spans (`0x03`, `0x1c`, `0x60`, `0x1f`, `0x7c`, `0x7f`).
  - Added actuation depth setting (`payload[14..15]`) clamped to `switchMaxTravelUm - 100`.
- WIN 68 HE MAX SOCD support with 4 priority modes:
  - Implemented opcode `0x2C`, LEN 11 (`0x0B`), handler verified against firmware disassembly (`VA 0x0BD20..0x0BF8E`).
  - Added 4 resolution modes (`payload[8]`): Last input priority (`0x00`), First key priority (`0x01`), Second key priority (`0x02`), Neutral (`0x03`).
- Added `.gitattributes` to standardize LF line endings across platforms.

## 1.4.2 — WIN 68 HE MAX Rhythm Sync Audio Noise Floor Gating & Native Stream Priority

- Audio noise floor gating & dark state fix:
  - FFT bins and RMS calculations are now gated (`raw > 4 ? (raw - 4) / 251 : 0`, `rms > 0.005 ? rms : 0`), dropping audio level cleanly to 0 during silence.
  - When silent (`level < 0.008`), all 68 keys turn completely dark (`#000000`) and side LEDs settle to standby (`#181c20`), preventing visual flicker and artificial synth animations during quiet audio sections.
- Removed legacy `web-synth` endpoint:
  - Automatically migrates persisted `web-synth` configuration drafts to default system audio.
  - Live streaming mode enforces `allowSynthFallback = false`, ensuring real microphone/system audio silence is accurately rendered.
- Service stream priority & stray loop prevention:
  - When the native Windows service is actively handling Rhythm Sync, any background browser Web Audio render loops are cleanly stopped to eliminate race conditions and frame conflicts.
  - Prioritized SSE `/frames` synchronization in `RhythmPreview`, preventing preview jitter between live stream frames and fallback calculations.
- Comprehensive regression testing:
  - Added unit test coverage for 100% dark state on silence across all rhythm modes and SSE frame stability in `tests/rhythm.test.mjs` and `tests/rhythm-xsyd-service.test.mjs`.

## 1.4.1 — WIN 68 HE MAX Rhythm Sync Native USB Write Fix & Unthrottled Web Worker

- Fixed WIN 68 HE MAX Rhythm Sync failure: resolved "Device disconnected or RGB write failed" caused by an overly aggressive board-type check in `writeReport` (`hid_bridge.cpp`) that unconditionally rejected all XSYD writes.
- Implemented proper XSYD Report ID offset (byte 0 report ID padding when `device->output > 64`) and `HidD_FlushQueue` in native HID bridge.
- Transcoded Custom RGB batches for WIN 68 HE MAX: `hid_bridge.cpp` and `rhythm_core.h` now decode queued Custom RGB batches into 68-key frames and encode them into native XSYD `0x18` + `0x2A` packets.
- Background-tab timer fix: replaced throttled `setInterval` with a dedicated Web Worker timer (`startUnthrottledInterval`) so Rhythm Sync and Custom RGB continue at full 30-60 FPS even when the browser tab is hidden or minimized.
- Seamless dual-mode execution: Native background service handles USB writes when connected, while WebHID direct streaming gracefully acts as an automatic fallback when service is offline or reports an error.

## 1.4.0 — WIN 68 HE MAX Rhythm Sync Native & WebHID Direct Streaming

- Full Rhythm Sync support on WIN 68 HE MAX:
  - Direct WebHID streaming: RhythmSyncEditor drives animations directly over WebHID (`0x18` mode `0x15` + `0x2A` 14-slot batch cycles) using the browser's Web Audio API when the background service is offline.
  - Adaptive USB streaming: compact single-key writes (`LEN = 0x05`) when `<= 4` keys change; 14-slot batch writes (`LEN = 0x39`, at most 5 USB packets for 68 keys) when `> 4` keys change.
  - Native service update: `service/native/rhythm_core.h` updated with verified palette matching `rhythm_capture.pcapng` (#0014) and `0x00` padding for unused batch slots.
  - Multi-source audio reactivity: dynamic bandpass filtering, stereo channels, and seamless handover between WebHID and Windows Service.

## 1.3.3.0 - WIN 68 HE MAX Disassembly Protocol: Global Actuation, Switch Calibration & SRAM Guard

- Global Actuation (`0x29` / `0xA9`) implementation for WIN 68 HE MAX: read and write global actuation point in micrometres (100..3400 µm range) across all non-overridden keys (`Header & 0x30 == 0`).
- Complete per-key field table verified against firmware disassembly (`VA 0x1C6DC` write table, `VA 0x1C744` read table):
  - Split Rapid Trigger Press sensitivity (`0x14`) and Release sensitivity (`0x15`).
  - Top Deadzone (`0x16`) and Bottom Deadzone (`0x17`) in micrometres.
  - Key mode header (`0x08`) with Rapid Trigger toggle (bit 5 `0x20`) and advanced key types.
  - Per-key magnetic switch curve ID (`0x19`) and travel sanitization (3400 µm for Wing Chun / Jade Pro, 3300 µm for Black King / Meteor Magnetic).
- Profile slot protection: guarded `0x00 0x70` profile selection against firmware's 500 ms deferred Flash flush (`VA 0x07E28`), preventing stale Flash reload over uncommitted SRAM writes.
- Switch selector UI and per-key performance hooks updated with accurate switch limits and asset mappings.

## 1.3.2.1 - RGB color controls and 1.0 mm dead zone limit

- The dead zone slider limit in both Rapid Trigger and Quick Settings is raised from 0.5 mm to 1.0 mm, matching the firmware range without protocol changes.
- Redesigned RGB color controls across Onboard, Custom Effects, and Per-key lighting:
  - Unified color header with an active custom color picker pill and editable uppercase HEX readout.
  - 8-chip swatch grid (Multicolor rainbow chip + 7 hardware color presets) replacing cluttered tabs and checkboxes.

## 1.3.2 - WIN 68 HE MAX Rhythm Sync and Hall polling

- Rhythm Sync runs on WIN 68 HE MAX from the Windows service. The helper already rendered the shared 68-key frame; it now also encodes it for XSYD: `0x18` with mode `0x15` (Per-key Color) once per session, then `0x2A` batch writes of 14 keys each, five per changed frame and nothing at all when the frame is identical to the last one sent. `rhythm-stop` writes `0x18` mode `0x00` so the board does not freeze on the last frame. The captures in this repository come from the official driver, so it is not validated on a physical board.
- Hall polling on WIN 68 HE MAX no longer falls back to roughly 70-80 Hz when 200 Hz is demanded. A cycle answers travel and pressed as two replies of three 64-byte reports each, so it costs two writes and six blocking reads; the round trip now has a 10 ms write and a 15 ms reply budget instead of 100 ms each.
- A missed Hall read costs one cycle instead of the device: the service no longer closes and reopens the HID handle on a timeout (which cost a 250-2000 ms backoff), accepts travel and pressed independently, and reuses the last pressed reply when only that half is missing. A write failure still drops the handle.
- Writing a HERO68 `0x09` lighting frame to an XSYD board now fails with an error instead of reporting a successful write the board never received.

## 1.3.1 - WIN 68 HE MAX RGB editor fixes

- Rhythm Sync and Custom RGB no longer fail with "Error: unsupported" on WIN 68 HE MAX. The editors handed the board to the HERO68 WebHID manager whenever the service reported `connected`, which sends HERO68's `0x82` identity probe; the handoff now only happens for HERO68/HERO84.
- Custom Effects always show the seven gradient palettes; previously the palette row disappeared while a gradient layer was set to a single color.
- Switching tabs no longer leaves the WIN 68 HE MAX custom preview black. The RGB page kept its own tab state while the shell kept `activeRgbTab`, so the editor was hidden (and its engine released) while the shell still expected its output.
- Multicolor in the onboard color strip works again on WIN 68 HE MAX: the draft is reset to the multicolor color, instead of writing `colorIndex 0` with a stale single color into slot 0.
- Saving key settings on WIN 68 HE MAX no longer fails with `Key setting readback mismatch`. The `0x23` table is only an echo of the write that carries it, and a key the firmware skips is missing rather than wrong.
- The base effect picker now lists the base effects the other board has and this one does not, so a missing onboard effect is visible instead of silently absent. The earlier "Merge preset" button, which imported exported JSON profiles, is removed.

## 1.3.0 — WIN 68 HE MAX lighting, Gamepad connection fix

- WIN 68 HE MAX lighting runs on the XSYD (`0x5C`) stack: global zone `0x18` (effect, brightness, speed, direction, seven-slot palette) and per-key colour `0x2A` (single-key writes and the five-frame 68-key readback). Frames were checked against `connect_keyboard_to_webhidofficial.pcapng`, `profile_1_2_3_4.pcapng` and `Q(green)-E(red) -Z(yellow)-P(Pink).pcapng`; the 27 effect modes come from firmware table `EXT_TO_INT_ROM` (`VA 0x1D2A0`).
- The Custom Effects editor and live preview render the WIN 68 HE MAX layout while editing.
- Gamepad no longer times out on WIN 68 HE MAX when OpenAulaService is already running. WebHID is preferred whenever the board is connected, the handoff to the service is skipped for an XSYD board (it was sending HERO68's `0x82` request, which the board never answers), and Hall demand follows the native output state instead of a mirror that is still `false` during startup.
- XSYD commands the service cannot serve now fail with `error:unsupported` instead of waiting for a reply.

## 1.2.1 — WIN 68 HE MAX Hall stream, reply matching fix

- The Windows service reads WIN 68 HE MAX analogue travel and pressed state over `0x12`/`0x92`: a 63-entry `u16` micrometre table polled twice for the 126 matrix positions, plus one pressed byte per position, mapped onto the 68 physical keys by an explicit table. Verified against `travel_test_press_randomkey.pcapng`, not on a physical board.
- An XSYD reply is now matched against the request that expects its opcode. A late or unsolicited frame is discarded instead of failing the waiting request with `Unexpected XSYD reply opcode`; frames that re-enumerate the board no longer wait for a reply.
- Rappy Snappy and DDKS cards are removed from the WIN 68 HE MAX Advanced Keys page; no capture exists for either layout.
- The keyboard preview no longer shrinks below its key widths on narrow layouts.

## 1.2.0 — AULA WIN 68 HE MAX (XSYD `0x5C`)

- Add WIN 68 HE MAX support on its own protocol stack (`src/protocol/xsyd/`): 64-byte `0x5C` framing with the last-byte checksum the firmware computes, reply reassembly across `inputreport` events, and a key map for the 68-key Hall board. The board is registered as `win68HeMax` and is never driven by the HERO68/HERO84 `0x09` encoders.
- Per-key settings (remap, actuation, rapid trigger, dead zone, switch type) go through the `0x23` field table; every field is a `u16` and travel is in micrometres, not hundredths of a millimetre.
- Advanced keys MT (`0x24`), TGL (`0x25`), MPT (`0x27`) and END (`0x28`) are wired end to end, with layouts checked byte for byte against USBPcap captures of the official web driver.
- Polling rate is read and written through `0x00` subcommand `0x50`, followed by a USB re-enumeration wait; the sequence matches a 4000 → 2000 → 1000 Hz capture.
- Advanced Keys shows an explicit "DKS is not supported on WIN 68 HE MAX" modal instead of writing a guessed frame, and RS, DDKS and non-zero SOCD modes are blocked until a capture proves their layouts.
- `npm run typecheck` now covers the web app and the Windows service in one command.

## 1.1.0 — structure, Gamepad toggle, ubuntu test parity

- Split the monolithic layers so each concern has one owner: the Windows service into `service/server/`, `service/rgb/`, `service/gamepad/`, `service/hall/` and `service/bridge/`; the HERO68 protocol into `src/protocol/bytetech/` (old `src/protocol/hero68/*` paths keep re-exporting); the web app into `src/app/hooks/`, `src/app/components/` and `src/pages/`. Behaviour is unchanged apart from the fix below.
- Gamepad Start/Stop can now be bound to a toggle key (`POST /gamepad/toggle`, `GamepadToggleTracker`); the app sends `expectedEnabled` so a repeated press can never leave the service in the wrong state.
- The My Profile page shows the board's real key count and name instead of the hard-coded HERO68 68 keys.
- Per-model layout views are cached per registered board (`heroLayout`), and `keyIdsOf()` is the single place that drops row padding slots.
- Add `.github/workflows/cloudflare.yml` to build on every push and deploy the Worker (`wrangler deploy`) when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets are set.
- Version 1.1.0 applies to the app and the Windows service together, matching 1.0.0.
- Not validated on hardware: the toggle binding and the 1.1.0 setup were not tried on a physical board.

## 1.0.0 — OpenAula

- The app and the Windows service now ship one version number; 0.9.59 (UI) and 0.6.1 (service) were the last independent pair.
- Rename the product and its technical identifiers to OpenAula: repository, install folder, launcher, service executable, uninstall entry, autostart value and release asset names.
- Upgrading from 0.9.59 keeps your settings: setup removes the old OpenHero68 install first, carries the auto-start choice across, and moves `%LOCALAPPDATA%\OpenHero68\rgb-service` to the new folder on first start. The pre-1.0 `OPENHERO68_*` environment variables are still honoured.
- Move the product name into `src/brand.ts` and `service/brand.ts` so the legacy names sit in one place next to the current ones.
- 624 JavaScript tests pass; web and service TypeScript builds pass. HERO84 remains unvalidated on a physical board, and the 0.9.59 upgrade path was checked by the installer smoke test only.

## Service 0.6.1 / UI 0.9.59 — HERO84 key table verified against the official driver

- Extract the official AULA driver's `AULA_2829` (HERO 84 HE) WIN key layer into `tests/fixtures/hero84-official-layout.json` (`tools/extract-hero84-layout.mjs`) and assert every `pos`, the 16 extra keys and the row order/sizes in `tests/hero84-official-layout.test.mjs`.
- Confirmed: HERO68 and HERO84 share one key table for the 68 common keys, and remap/switch batching matches the driver's chunk sizes.
- Generate the HERO84 F1–F12 layout keys from one base value; the resulting layout is unchanged.
- `docs/hero84-verification.md` lists what is proven and what still needs a physical board.

## Service 0.6.0 / UI 0.9.58 — HERO84 support

- App and service recognize a HERO84 from its device UUID (the web app no longer falls back to the product name) and switch layout, key map and protocol tables to the 84-key (75%) board.
- Custom RGB frames and `/hall/stream` address the 16 extra HERO84 keys; Rhythm preview includes them.
- HERO84-only keys mirror the colour of the HERO68 key in the same column/slot; there is no HERO84 geometry for per-key effects or Rhythm patterns yet.
- Deploy the static app as a Cloudflare Pages Worker (`wrangler.jsonc`, `worker/`, `/api/health`).
- Fix the emulated RGB preview crashing on keys outside the 68-node LED map, name the offending position in per-key colour read errors, and keep the detailed USB product name after model detection.
- The app asks the board for its device UUID on connect (WebHID or the Windows service) and refuses a board without a HERO68/HERO84 UUID; a connected board decides the model, the selector is locked, and profile reads/saves stay blocked until the model is verified.
- Not validated on a physical HERO84: the 212-byte CMD08 frame, mirrored colours and remap/RGB batching still need a real board.
- HERO84 key positions verified against the official AULA web driver (`AULA_2829` WIN layer, extracted with `tools/extract-hero84-layout.mjs`): all 84 keys, the 16 extra keys and the layout row order match, and remap/switch batching matches the driver's chunk sizes (`tests/hero84-official-layout.test.mjs`). Remaining unknowns are tracked in `docs/hero84-verification.md`.

## Unreleased — HERO84 support in the Windows service (untested on hardware)

- Service remembers the connected model (HERO68/HERO84, detected from the device UUID), logs the real model name and reports `deviceModel` in `/status`.
- Custom RGB frames for a HERO84 also address its 16 extra keys (F1–F12, `` ` ``, PrtSc, Home, End). The engine still renders 68 keys, so each extra key copies the colour of the HERO68 key in the same column/slot, adding no palette colours (84 + 32×4 = 212 bytes, still ≤ 4 packets). HERO68 output is unchanged.
- Native Rhythm gets the same mapping through a new `device-model:<id>` bridge command (older bridges ignore it and stay 68-key); the Rhythm preview frame includes the extra keys.
- `/hall/stream` accepts all 84 HERO84 keys once a HERO84 is connected (or before the first connect), and still limits a HERO68 to 68.
- Not yet done: per-key custom effects and Rhythm patterns do not have HERO84 geometry, so the extra keys mirror their source keys instead of animating independently. Needs a real HERO84 to validate the 212-byte CMD08 frame and the mirrored colours.

## Service 0.5.3.2 / UI 0.9.57 — remove Beat Pulse

- Remove audio Beat Pulse from Rhythm Sync because beat detection was unreliable on real music. Remove its native detector, renderer and timing controls.
- Migrate saved Beat Pulse presets and web drafts to Dynamic Spectrum, retaining shared settings; reject new requests for removed mode 430.
- Keep the existing Rhythm loudness/spectrum modes and Custom Tempo Pulse (manual BPM).

## Service 0.5.3.1 — Beat Pulse input fixes

- Normalize quiet PCM gradually before Beat Pulse spectral analysis, preserving transient attacks and existing noise rejection.
- Analyze high-rate audio at no more than 48 kHz; 192 kHz endpoints previously could never fill the required tempo history.
- Report captured PCM amplitude in the Audio meter instead of rendered LED brightness. Detect audio activity from both positive and negative sample peaks.
- Validate beat lock and tempo with 44.1–192 kHz PCM and quiet playback at -50 dB. Physical LED alignment and accuracy across all music remain unverified.

## Service 0.5.3 / UI 0.9.56 — new Custom and Rhythm effects

- Add Ember, Starlight, Afterglow and Tempo Pulse (BPM) effects, and Ember, Ocean, Sakura and Synthwave palettes.
- Fix Ember height, Starlight density bounds, Afterglow tap/re-press continuity and high-BPM Tempo Pulse tails; include new gradient underlays in automatic color contrast.
- Effects can now declare their own width/speed ranges, speed label and width unit (Tempo Pulse uses 40-200 BPM).
- Add audio Beat Pulse (Rhythm mode 430), sample-clock timing, source-specific beat corrections, complete reset and prediction cancellation on unlock.
- Rebuild the Windows service so `supportedEffects` includes the new effects; older installed apps are asked to update.
- Ship Beat Pulse with the updated native helper through the complete Windows installer and signed setup update. Legacy core-only packages cannot add native mode 430.

## UI 0.9.55 — repository cleanup

- Pin the existing dependency versions and declare the build/test toolchain.
- Read the sidebar UI version from package.json.
- Configure local certificate hosts and extra service origins through environment variables.
- Reject device saves when the protocol is not ready; keep local macro saves.
- Organize documentation and bundled font assets. CSS import order is unchanged.

## Windows service update history

The ZIP/core instructions in this section apply only to releases before 0.5.0.
From 0.5.0 onward, use the Windows setup EXE and full application updates as
described in [the current update instructions](README.md#updating). Portable
users run setup once to migrate. Legacy core/ZIP publishing tools are retained
for historical releases; current releases use `tools/publish-service-setup.mjs`
through the Windows setup workflow.

- **Check for updates** in the tray downloads and applies compatible signed core updates automatically.
- When the native launcher also changes (for example for Rhythm Sync), the tray downloads a checksum-verified ZIP instead. Quit the old app, extract all files over the service folder, then start the new launcher. A core-only update is not enough in that case.
- Rhythm Sync needs service core 0.3.0, launcher 0.3.0 and API 5 or newer.
- Firmware keyboard blocking and the fast Gamepad tester require **core 0.4.1, launcher 0.4.1 and API 6**. Upgrade older installations with the complete Windows ZIP because the native helper also changes. Keyboard input stays enabled until Mapped-key override is applied; firmware empty action is its default method. Windows hooking is an optional fallback, disabled by default in Configuration.
- **0.4.2** fixes ViGEm startup cleanup and preserves the original Windows initialization error. Install the complete Windows package for this native fix. Opening Gamepad also avoids a brief blur during the initial check, while still requiring a live service and confirmed ViGEmBus before controls become active.
- **0.4.5** waits for slow initial Xbox driver boot without requiring repeated Start clicks, verifies its own XInput slot and adds drag-out removal for Gamepad bindings. Install the **complete Windows ZIP** for the updated native helper; the signed core requires launcher 0.4.5. RGB/Rhythm also share the new toolbar and preview layout.
- **0.4.6** evaluates digital Gamepad buttons from Hall travel and the selected profile's AP, split Rapid Trigger and deadzones. Changing these settings while running reloads them without recreating Xbox. Install the **complete Windows ZIP**; the signed core requires launcher 0.4.6.
- If you are on 0.2.3 or 0.3.0 and see `Unexpected update source`, download the full 0.3.1 (or newer) ZIP manually once. This is caused by the GitHub repository rename.
- If Auto-start points to an old folder, use **Auto-start: replace old app path** in the new tray menu.

Individual service releases are recorded in [docs/releases](docs/releases/).

## Earlier UI changes

### UI baseline v0.9.42

Actuation Point UI pass based on the supplied Wootility v5 source bundle, while preserving the HERO68 protocol and existing profile behavior.

- Implemented the sidebar **Actuation Point** page instead of the previous placeholder.
- Added per-key/multi-key selection with live actuation overlays on the keyboard preview.
- Added a Wootility-inspired actuation editor with switch preview, vertical travel control, selected-key state, and 0.10–3.40 mm limits.
- Added a local **Visual Feedback** tester that simulates key travel and shows the configured actuation threshold without sending HID packets.
- Actuation values now snap consistently to 0.05 mm when dragging or typing; other controls keep their own configured step.
- Retains the offline RGB preview fix so a fresh profile can show Multicolor before connecting.

### v0.9.37 responsive scaling

Responsive scaling pass based on the Wootility source bundle supplied in the conversation.

- Reworked the main shell so the rail, secondary sidebar, page padding and cards respond continuously to the available viewport instead of jumping between a few fixed desktop widths.
- Reworked the Hero68 preview to use ResizeObserver-driven fitting like Wootility: one measured font-size scale is computed from the preview container and the keyboard geometry is expressed in em units. This avoids transform/zoom scaling and stays much sharper when DevTools is docked or Windows/browser scaling changes.
- Quick Settings now keeps three columns while there is enough real content width, then moves to two/one columns using container queries rather than a viewport-only breakpoint.
- Settings and Switch Selector use container queries so their own available width controls layout changes.
- Switch Selector keyboard preview also scales continuously with its container.
- Wide/2K displays retain the same maximum content size instead of inflating the UI.
- The secondary sidebar now auto-compacts to an icon-only rail when the viewport becomes narrow, matching Wootility's behavior when DevTools is docked; the existing Compact sidebar setting now also forces the same mode manually.

### v0.9.37 dynamic scaling

- Added a live ResizeObserver/visualViewport based app scale for desktop widths below the reference canvas.
- The whole application now scales as one coordinated layout instead of only shrinking individual keyboard/cards.
- Uses CSS `zoom` rather than `transform: scale()` so Chromium reflows/re-rasterizes text and SVG more cleanly.
- Keyboard preview keeps its own container-based ResizeObserver fitting, matching the pattern used by Wootility's keyboard renderer.
- Mobile keeps the existing native responsive layout instead of desktop zoom scaling.


### v0.9.39 — Wootility-style Actuation + embedded Hall Test

- Reworked **Actuation Point** into the Wootility-style keyboard + three-card layout.
- Replaced the old simulated Visual Feedback card with a real **Live Hall Test**.
- Live Hall Test reuses the existing `hero68HallStream.start(..., 'direct-poll')` path from the Hall Stream diagnostic page.
- While Live Hall Test is active, the keyboard preview shows realtime Hall travel overlays for moving keys.
- The test card follows the most recently moving selected key, displays live travel, the selected key's AP threshold, ACTUATED/READY state, and measured refresh rate.
- Hall streaming is now allowed from Actuation Point even when Advanced Pages are hidden, and is stopped automatically when leaving Actuation/Hall Stream pages.


### v0.9.40 — deterministic Select All

- `Select all keys` rebuilds selection from the canonical 68-key layout via a functional state update.
- `allSelected` now verifies every real key ID instead of trusting only `Set.size`.
- Key toggles normalize away stale/invalid IDs before applying the click.
- Selection action buttons explicitly use `type="button"`.
- Repeated partial → Select all → Discard cycles now converge to exactly 68 / 0 keys even while Hall telemetry is causing frequent UI renders.


### v0.9.42 — Actuation deselect stops Live Hall

- Discard selection now stops Actuation Live Hall immediately.
- Manually deselecting the final selected key also stops Live Hall automatically.
- The standalone Hall Stream page is unaffected.
