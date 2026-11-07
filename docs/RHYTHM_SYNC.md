# Rhythm Sync — service 0.3.0 / API 5 & WIN 68 HE MAX WebHID

RGB Settings has Onboard Effects, Custom Effects and Rhythm Sync. Opening a tab
or choosing a mode changes only the draft. Apply starts background playback;
subsequent edits are coalesced and bound to that playback session. A restarted
service or another editor invalidates the old session. Closing the browser
leaves native playback running. Return to onboard stops host playback.

On HERO 68/84 HE without a compatible background service, Rhythm uses the same
blurred, keyboard-inert gate as Custom Effects. On **AULA WIN 68 HE MAX**, Rhythm
Sync works **both** through the Windows background service (`Hero68RgbService.exe`)
**and** directly in the browser over WebHID (`0x18` mode `0x15` + 5 × 14-slot
`0x2A` batch streaming), using either Web Audio capture (Browser Tab / System Audio
or Microphone / Line-In) or the built-in Rhythm Synth.

## Modes and geometry

| Keys | Mode |
| --- | --- |
| 169 | Dazzling Rock |
| 170 | Clouds |
| 171 | Light Field, global `08/02` |
| 172 | Gurgling Stream |
| 173 | Blooming Passion |
| 428 | Dynamic Spectrum |
| 180 | Off |

The HERO68 profile uses all 68 real POS values, including AltRight/POS71.
`tools/generate-rhythm-profile.mjs` filters the RE ring, column and eight bloom
patterns to this board; it checks coverage before writing the native profile.
Legacy mode 168 is rejected. Algorithms follow the supplied RE with immediate
attack and millisecond cadence rather than retaining stock input delays.

Side 500 means leave onboard. Side 501 (one-end meter), 502 (center-out meter)
and 503 (rise/fall light field) have renderers and protocol tests, but **live
side capability is false**. Starting them is rejected by both API and native
helper. Count, LED order, RGB channel order, `0E/01`, `0E/02` and restoration
still need physical verification; demo's 18 positions are illustrative.

## Removed Beat Pulse

Service 0.5.3.2 / UI 0.9.57 removes Beat Pulse (mode 430) because real music
beat detection was not reliable enough. Its detector, renderer and controls
are removed. Saved Beat Pulse presets/drafts migrate to Dynamic Spectrum
(428), retaining shared settings. New API/native requests for 430 are rejected.
The remaining modes use the existing loudness/spectrum pipeline and 14-field
native configuration. Custom Tempo Pulse (manual BPM) is a separate effect.

## WIN 68 HE MAX (XSYD `0x5C`) — Verified on `rhythm_capture.pcapng` & Firmware v1.1.4

The capture, DSP and renderer use the 68-key layout (`XSYD_RHYTHM_KEY_IDS`), and
the wire format is verified byte-for-byte against `rhythm_capture.pcapng` (3,926
packets, 389 full 5-frame cycles) and firmware `VA 0x0C12E..0x0C2D0`:

- **Session init (`0x18`, `LEN = 0x2C`, `#0014`):**
  `5C 2C 18 BD | 01 00 00 00 00 <28B BGR palette> 00 00 00 00 00 04 15 03 02 00 00`
  Switches the board to `mode = 0x15` (`Per-key Color`) at full brightness (`4`),
  speed `3`, `colorIndex = 0`, before the first `0x2A` colour batch.
- **Per-frame streaming (`0x2A`, `LEN = 0x39`, `#0017..#0021`):**
  5 batch reports of **14 slots** each (`01 + 14 × [keyValue, R, G, B]`), covering
  all 68 keys (`4 × 14 + 12 = 68`) with the trailing slots of Batch 4 padded with
  `00 00 00 00` (`CK = 0xF4` when the 14th slot's Blue byte is `0x00`).
  Each slot writes directly to `user_rgb` in SRAM (`0x20001EF8 + 3*cell`,
  `VA 0x0C242..0x0C28C`) with **zero Flash wear** (Flash write `VA 0x11D70` is only
  invoked if a slot contains the `FE FE FE FE` sentinel).
  A frame whose colours did not change sends nothing.
- **Stop / Return to onboard (`stopXsydRhythm` / `rhythm-stop`):**
  Restores the user's onboard `0x18` lighting configuration (or `mode = 0x00` in
  standalone helper mode) so the board does not freeze on the last rhythm frame.
- **Layout and checksum:** `docs/xsyd-protocol.md` sections 1, 8.1, 8.2 and 8.3.

## Native pipeline
Windows 10 1703+/11 shared-mode event-driven WASAPI loopback captures the default
playback endpoint or a fixed endpoint. Capture, sliding PCM window, DSP, rhythm
rendering, encoding and HID writes run in the native helper. Node handles
configuration, persistence and preview; browser work is outside this pipeline.
Capture accepts float32 and PCM16/24/32 and averages channels. Endpoint loss,
format change or discontinuity restarts/resets the sliding window and history.

Scalar input is normalized positive peak minus mean with linear sensitivity.
Attack is immediate; release defaults to 80 ms and ranges from 0–200 ms.
Spectrum uses periodic Hann by default, FFT256, the RE nonlinear magnitude
transform, 64 bins, a double-buffered 256×64 field and the HERO68 samples from
the 22×6 grid. Gain is `db × 30`; latest overlapping samples are used.

The HID owner uses monotonic 16.667 ms deadlines. A late deadline skips older
work, never catches up with a burst. Key frames use report ID09, 56-byte chunks,
checksum, at most 32 color groups/196 bytes/four reports, preserving black.
Configuration batches pause playback and resume it afterward. Hall requests
run between frame batches. API pending work is bounded to 32 transactions;
custom rendering coalesces ticks, and preview retains one unsent latest event
per slow client. OS write completion is not firmware ACK or LED readback.

## API and persistence

- `GET /audio/devices`: active playback endpoints and default flag.
- `POST /rhythm/start`: `{configuration: RhythmConfiguration}` starts a new session.
- `POST /rhythm/config`: `{configuration, sessionId}` edits the active session.
- Existing `/stop` returns to onboard. `/start` with an empty body resumes saved RGB.
- `/status`: supported modes, side capability, audio state/errors, target/actual
  FPS, frame gaps, dropped/repeated frames, stage durations and latency samples.
- `/frames`: completed, quantized key colors, audio level, session and sequence.

Rhythm config version1 lives in `rhythm-preset.json`; Custom presets are retained.
`preset.json` version3 stores playback and saved mode so tray Start saved RGB
continues the last selected engine. Web drafts use a separate localStorage key.

## Verification and limits

Run `npm test`, `npm run build`, `npm run build:service`,
`tools/check-native-rhythm.cmd` and `tools/check-native-audio.cmd`.
The audio probe plays low-volume synthetic pulses through the default endpoint.
`node tools/verify-rhythm-service.mjs 600 .refactor/rhythm-final --audio` runs an
isolated service on port16869 with separate state and restores onboard on exit.
It measures heavy Custom and Spectrum, each with and without ten-key Hall,
for 150 seconds each. Results are in `reports/rhythm-hardware-benchmark.json`.

The acceptance targets are 58–60 completed USB frames/s and frame gap p95≤20 ms
without configuration writes. They measure completed host writes, not light.
Sample-to-write p95≤35 ms and physical audio-to-light p95≤50 ms are separate
targets. Physical latency requires a synchronized sensor measurement.

WASAPI's QPC timestamps use 100 ns units for the first frame
([Microsoft GetBuffer documentation](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudiocaptureclient-getbuffer)).
The helper adds the positive-peak sample offset. This machine's endpoint can
report timestamps ahead of capture receipt. Negative latency samples are
excluded and counted in `audioTimestampInvalid`, rather than clamped to zero.
`captureToWriteP95Ms` measures receipt-to-completed-write separately and does
not prove the sample or physical latency targets. Silence produces no latency
samples. Side output and optical latency remain unverified.

Profile-selection timeout recovery serializes WebHID request/ACK transactions,
uses an origin-wide Web Lock across direct-HID tabs, and reads active slot90
after a missing select10 ACK. It retries only the same idempotent selection,
at most three attempts, and never treats a different slot as success. The same
recovery also runs inside service configuration batches.
