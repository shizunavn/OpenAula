# HERO84: what the official AULA driver proves, and what still needs a device

Extracted from the official AULA web driver (`AULA_2829` device, "HERO 84 HE").

## Verified without hardware

| Item | Official source | Where it lives here |
|---|---|---|
| 84 key positions (`pos`) | `default_key_layer` 0 / WIN, `wbt` table | `tests/fixtures/hero84-official-layout.json`, checked by `tests/hero84-official-layout.test.mjs` |
| All 68 HERO68 keys share the same `pos` on HERO84 | same table | `HERO84_KEY_POSITIONS` spread of `HERO68_KEY_POSITIONS` |
| The 16 HERO84-only keys and their positions (`2..13`, `14`, `95`, `100`, `101`) | same table | `HERO84_ONLY_KEY_POSITIONS` |
| Layout row sizes and key order (16/15/15/14/14/10) | same table | `HERO84_LAYOUT` |
| Official remap key codes | `value` field, e.g. `0x00100000` = R_Ctrl | fixture `keyCode` |
| Remap write batching | `sync_keys` chunks 9 keys per request | `commands.ts:106` |
| Switch-type write batching | `sync_key_type` = 18 × 3-byte records | `commands.ts:140` |
| Polling rate can be **read** (`CMD 0x84` zone `0x17` → `polling_level`, default 3) | `fetch_polling_level` | `readPollingRate` / `POLLING_RATES` |

## Still unproven (needs a real board)

1. **Writing the polling rate on HERO84** — the driver only has a read command
   and a shared basic-info blob where `polling_level` is index 1
   (`sync_basic_info`); there is no dedicated write path for this board. Here
   `writePollingRate` (`commands.ts:159`, `CMD 0x04` zone `0x17`, HERO68 0323
   re-enumerate path) is unverified on HERO84 — the settings panel warns about it.
2. **`matrixKey` (`row << 8 | column`)** — the official board is 0.75U-pitch with
   a 6.25U Space, so the HERO68 1U/15-column grid cannot hold it; the current
   values are guesses (`src/keyboard/hero84Layout.ts:15-19`). Only `pos`
   (protocol) is proven, and `pos` is what device writes use.
3. **Read chunk sizes** — `fetch_key_type` (36 bytes) and `safe_area` (12) differ
   from the 9-key reads in `commands.ts:118`; remap writes already match.
4. **Hall `distance` unit** and whether HERO84 keys are Hall or optical.
5. **Firmware palette / light-mode values** (zero-filled in the dumped image) and
   which `set_custom_light` variant HERO84 accepts.
6. **HERO84 `tl` switch-ID table** — switch profiles reuse the HERO68 11-entry
   catalog (`switchProfiles.ts`), unverified on HERO84.

## How to close them without owning the board

On the owner's machine, in the official AULA app: change the polling rate, then
remap one key per shape (a letter, L-Shift, Space, Enter, nav `Home`/`End`/`PgUp`/
`PgDn`, `F1`) and capture USB traffic. One capture answers items 1–3 and part of 6.

To refresh the checked-in table when AULA ships a new driver:

```sh
node tools/extract-hero84-layout.mjs app-<hash>.js tests/fixtures/hero84-official-layout.json
npm test -- --test-name-pattern HERO84
```
