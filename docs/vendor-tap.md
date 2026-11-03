# HERO 84 HE web driver, captured through the bundle

How a HERO 84 HE (or any other keyboard the AULA web driver supports but
OpenHero68 does not) gets its packets recorded, without USBPcap or Wireshark and
without asking the person holding the keyboard to do anything technical.

## What is shipped

`https://open-hero68.pages.dev/vendor-tap/` loads **the vendor's own web driver**
inside the page (same origin, so its WebHID permission applies) and records the
packets it exchanges with the keyboard:

| File | Role |
| --- | --- |
| `public/vendor-tap/index.html` | Volunteer-facing page, Vietnamese |
| `public/vendor-tap/capture.js` | Opens the vendor app in an iframe, start/save buttons, counter |
| `public/vendor-tap/app.html` | Hosts the vendor app; calls `loadTappedApp('CPb3bToC')` |
| `public/vendor-tap/tap.js` | Fetches the bundle, patches two call sites, hands the text to the loader |
| `public/vendor-tap/loader.js` | Imports the patched bundle plus each chunk as blob modules whose relative specifiers point at `vendor/` |
| `public/vendor-tap/module-worker.js` | Fetches the chunk texts for the loader (the page evaluates them) |
| `public/vendor-tap/vendor/*` | Verbatim copy of `https://hero.aulastar.com` (bundle, CSS, all 77 reachable chunks) |
| `tools/copy-vendor-tap.mjs` | Re-copies `vendor/*` from `E:/hero84-re/webdriver` |
| `tests/vendor-tap.test.mjs` | Pins the two patch sites to the copy in `vendor/`, plus page/tap contracts |

The bundle is patched in memory only; `vendor/` is never modified. The two sites
live in the main bundle (not in a lazy chunk):

- send: `return this.device.sendReport(this.reportId,this._fillPayload(this._ensureUint8Array(t)))`
- receive: `_setupEventListeners(){this.device.oninputreport=t=>this._handleInputReport(t)}`

Both are routed through `window.__OH_TAP.__ohTap`, which logs 64-byte hex and
returns the payload unchanged, so the vendor app behaves exactly as before.

The patched text cannot be imported from a blob URL directly (relative
`./chunk-*.js` specifiers do not resolve there), so `loader.js` imports it as a
blob module with every relative specifier rewritten to the absolute URL under
`vendor/`; the vendor code still runs in the page realm, the worker only
fetches chunk texts. The bundle is a lazy-loading graph, so the copy is
complete when you run `node tools/copy-vendor-tap.mjs` after a vendor rebuild.

## Volunteer checklist (what the page says)

1. Plug the keyboard in by cable, close other configuration apps.
2. Click **Mở app hãng**, wait for the app, click its own *connect device* button
   and allow keyboard access.
3. Click **Bắt đầu ghi** on the capture page, then in the vendor app: open the
   key settings, change actuation of one key (A→B→A, saving each time), toggle
   rapid trigger, pick an RGB effect, and run the travel test pressing W slowly.
4. Click **Dừng & tải file** and send the `.json` back.

The log holds raw hex only (no key names, no typed text). Pacing is deliberate:
one setting at a time, saved each time, so packets can be matched to actions.

## Log format

```json
{ "format": "openhero68-vendor-tap", "version": 1, "capturedAt": "...", "appVersion": "CPb3bToC",
  "userAgent": "...", "dropped": 0,
  "entries": [{ "at": 1234, "hex": "09..." }] }
```

`at` is milliseconds since the log was started; `hex` is the report as the
keyboard received or sent it. Frames are the vendor transport's own framing, so
read them the way `chunk`/bundle decodes them, not as OpenHero68 reports.

## Bundle table (for reference)

The copy in `vendor/` recognises these models (vendor id / product id / report id):

```
HERO 68 HE, HERO 68 AIR, WIN68HE Ultra, HERO 68 MINI, HERO 84 HE, HERO 68 HE wireless,
HERO 68 HE wireless (pid 4272), 2.4G Wireless 8K Receiver (0x3554/0xFB35),
8K Wireless Receiver, HERO 99, HERO 87 HE, HERO 68 HE NEO, HERO 68 HE JIS, HERO 100,
HERO 99 HE, HERO 100 (2.4G), HERO 84 HE JIS   — 0x372E / 0x103E, report id 9
```

The uuid each entry carries is what OpenHero68's detection compares against; a
new model must be added to `src/keyboard/devices.ts` only after its packets are
verified, not just because the bundle lists it.

## Known limits

- The capture page is not linked from the app UI on purpose.
- `app.html` and `tap.js` are served as `application/javascript`: the static
  host sets that Content-Type for every URL without an extension. Browsers load
  module scripts by MIME type, but opening either file directly shows source; a
  future move to a host with proper extensions should rename them to `.html`.
- Keeping the result correct when AULA ships a new build: run
  `node tools/copy-vendor-tap.mjs`, update the version passed to `loadTappedApp`,
  and `npm test` — the pin test fails loudly if the patch sites moved.
- Not yet checked on hardware: that the vendor app's own traffic flows through
  both patched sites (needs a keyboard plus the vendor app session).
