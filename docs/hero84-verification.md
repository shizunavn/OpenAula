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

## Still unproven (needs one remap dump from a real board)

1. **HERO84 `matrixKey` (matrixKey = `row << 8 | column`)** — the official board
   is 0.75U-pitch with a 6.25U Space, so the HERO68 1U/15-column grid cannot hold
   it; the current values are guesses (`src/keyboard/hero84Layout.ts:15-33`).
   Only `pos` (protocol) is proven, and `pos` is what device writes use.
2. **Per-command chunk sizes** — `fetch_key_type`/`safe_area` use 36/12-byte
   reads; local reads use 9 keys per request (`commands.ts:118`). Unverified on
   HERO84, but remap writes already match the driver.
3. **`safe_area` / `distance` chunking** (12 records in the driver).
4. **Hall `distance` unit** and whether HERO84 keys are Hall or optical.
5. **Firmware palette / light-mode values** (zero-filled in the dumped image) and
   which `set_custom_light` variant HERO84 accepts.
6. **HERO84 `tl` switch-ID table** — switch profiles currently reuse the HERO68
   11-entry catalog (`switchProfiles.ts`), unverified on HERO84.

Already confirmed from the driver: remap writes use the same `sync_keys` chunker
as here (9 keys per record batch, `commands.ts:106`) and switch type uses 18
records. Nothing in the driver requires a HERO84-specific chunk size for remap.

## How to close them without owning the board

On the owner's machine, in the official AULA app: remap one key per shape (a
letter, L-Shift, Space, Enter, Num-Lock-less nav `Home`/`End`/`PgUp`/`PgDn`, `F1`)
and capture USB traffic. One capture answers items 1–3 and part of 6.

To refresh the checked-in table when AULA ships a new driver:

```sh
node tools/extract-hero84-layout.mjs app-<hash>.js tests/fixtures/hero84-official-layout.json
npm test -- --test-name-pattern HERO84
```
