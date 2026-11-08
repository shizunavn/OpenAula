# AULA WIN 68 HE MAX — Firmware & Protocol Technical Reference

> Consolidated byte-verified reverse engineering reference for firmware `XS105_SI2828C_WIN 68 HE MAX_App_v1.1.4_20260204a.bin`, vendor updater `XSYD_UPDATE_LZ.exe`, and USBPcap hardware captures.
>
> * **Last Updated:** 2026-11-07
> * **Verification Suite:** 12 static verification suites (473 checks, 0 failures) + 10 capture verification scripts + 659 OpenAula unit tests.

---

## 1. Device Identification

| Property | Value | Source |
| :--- | :--- | :--- |
| **Product** | AULA WIN 68 HE **MAX** | `config.ini` |
| **MCU / SoC** | XS105 / SI2828C (RISC-V RV32IMC) | Firmware filename |
| **Firmware Version** | `App v1.1.4_20260204a` | Embedded image string |
| **Image Size** | 105,048 bytes | Binary size |
| **Link Base (VA)** | `VA = file_offset + 0x4000` | Verified via descriptors & strings |
| **VID / PID** | `0x1C4F` / `0xEE88` (`7247` / `61064`) | `config.ini` |
| **Usage Page / Usage** | `0xFFA0` (`65440`) / `0x01` | `config.ini` + HID descriptor |
| **Board ID** | `100800769` (`0x06021901`) | `config.ini` |
| **Protocol Version** | `1.0.9` (`5C 05 80 15 \| 00 01 09 01`) | Handshake reply |
| **Reset Vector** | `j 0x49E6` | Image offset `0x0000` |
| **HID Descriptor VA** | `0x1C2EC` (`06 A0 FF 09 01 A1 01`) | File offset `0x182EC` |

> **Note:** The WIN 68 HE MAX uses the **XSYD `0x5C`** protocol over Usage Page `0xFFA0`. It is completely distinct from the HERO68 protocol (`0x09` framing on `0xFF00`).

---

## 2. Framing & Transport (`0x5C`)

### Frame Layout

```text
byte 0        : 0x5C            (Magic)
byte 1        : LEN             (Payload length after checksum)
byte 2        : OPCODE          (Request: OP, Reply: OP | 0x80)
byte 3        : CHECKSUM
byte 4 ..     : payload         (LEN bytes)
byte 4+LEN    : FF FF           (Trailer, when applicable)
```

### Checksum Formula (`VA 0xCF48`)

```text
CHECKSUM = (0x5C + LEN + OPCODE + 0x35 + payload[LEN - 1]) & 0xFF
```

Only the **last byte of the payload** (`payload[LEN - 1]`, read via `0xCF6C: lb a0, 96(a0)` = `buf[0x60 + LEN]`) is added, not the sum of the array.

**Special Branches:**
* **Unwrapped `IN` packets (`OP < 0x80`):** `CK = 0x00`.
* **Keep-alive / LED stream (`OP = 0x30`):** `CK = (0x04 + pack[63]) & 0xFF` (fixed `0x43`-byte parameter slot).
* **Multi-report frames (`LEN > 60`):** The addend falls outside the first 64-byte report: `0x00` for `LEN = 0x80`, `0xFF` for `LEN = 0x82` (subcmd `0x03` of `OUT 0x12` appends `FF FF`).
* **Async Flash notification (`OP = 0xFF`):** Firmware emits `5C 04 FF <ck> | 0A FF <hi> <lo>` (`VA 0x09AF0`) after completing a deferred Flash sector erase/write (~500–670 ms after a config write).

### USB HID Transport
* **Report Size:** **65 bytes** (`mov r8d, 0x41` in `XSYD_UPDATE_LZ.exe`). Byte 0 is the Report ID (always `0x00`), followed by 64 bytes of data (`stride = 0x40`).
* **Verified Sample Packets:**

| Purpose | Frame (Hex) |
| :--- | :--- |
| Handshake / Ping | `5C 02 0A 9C FF FF` |
| Get Device Info | `5C 03 00 92 26 FF FF` |
| Set Echo | `5C 06 01 9F 01 02 03 04 FF FF` |
| Query Config / Hall (`sub 7`) | `5C 02 12 A6 07 01` |
| Query Pressed State (`sub 3`) | `5C 02 12 A5 03 00` |

---

## 3. HID Opcode Dispatch Table

The main dispatcher resides at `VA 0x9B58..0x9B74`:
1. Verifies `pack[0] == 0x5C`.
2. Reads `opcode = pack[2]`.
3. If `opcode > 0x2D`, jumps to out-of-range router `0xC312` (`andi a1, a1, 0xff; j 0x9BC0`), which routes to the system multi-purpose handler (`0x01`).
4. Otherwise indexes the 48-entry pointer table at **`VA 0x1C5F0`** (`0x00..0x2F`).

| Opcode | Handler VA | Function / Description |
| :--- | :--- | :--- |
| `0x00` | `0x9BEE` | Device Info, Profile Selector (`70`), Polling Rate (`50`), WinLock (`20`), OS Mode (`21/22/30/31`) |
| `0x01` | `0xA314` | System command (3-level nested jump tables: `0x1C6A8` → `0x1C6C0` → `0x1C6D8`; `sub 0x01` replies `0x0109`) |
| `0x02..0x07` | `0xC312` | Routed to `0x9BC0` (`0x01` dispatcher) |
| `0x08` | `0xA412` | Macro: builds 3×16-element arrays from `0x1C3F0` |
| `0x09` | `0xA5C4` | Macro handler (shares `0x1C3F0`) |
| `0x0A` | `0xA624` | Ping / Macro flush (with magic `0x72`, calls `0x1791A`, pokes flash `0xBEEF0`) |
| `0x0B..0x0D` | `0xC312` | Routed to `0x9BC0` (Bootloader opcodes are not in app table; do not send) |
| `0x0E` | `0xA6B6` | Macro: writes macro records to `0x1C3F0` via `0xD000` / `0xD04A` |
| `0x0F..0x11` | `0xC312` | Routed to `0x9BC0` |
| `0x12` | `0xA758` | `GET_CONFIG` & Hall Stream (`sub 2` Travel, `sub 3` Pressed, `sub 2..9` config tables) |
| `0x13` | `0xC312` | Routed to `0x9BC0` |
| `0x14` | `0xA874` | System / Config helper |
| `0x15` | `0xA89E` | System / Config helper |
| `0x16` | `0xA8FA` | System / Config helper |
| `0x17` | `0xA924` | System / Config helper |
| `0x18` | `0xA930` | `SET_CONFIG` (writes config struct at `0x20003198`) |
| `0x19..0x1F` | `0xC312` | Routed to `0x9BC0` (`0x19` carries a static 43-byte payload in captures) |
| `0x20` | `0xAAAE` | Config / State handler |
| `0x21` | `0xAB94` | Config / State handler |
| `0x22` | `0x9EB8` | Inside `0x01` dispatcher region |
| `0x23` | `0xACE0` | **Per-Key Field Table Write** (26 fields via `0x1C744`: remap, actuation, RT, switch type) |
| `0x24` | `0xB4BC` | **MT (Mod-Tap)** configuration |
| `0x25` | `0xB602` | **TGL (Toggle Key)** configuration |
| `0x26` | `0xB718` | **DKS (Dynamic Keystroke)** configuration & matrix scan |
| `0x27` | `0xB9FE` | **MPT (Multi-Point Trigger)** configuration & matrix scan |
| `0x28` | `0xBBFE` | **END (Release Keystroke)** configuration |
| `0x29` | `0xC092` | **Poll Rate / Timer Read** (15-byte `0x00` req → `0xA9` reply with u16 LE `2000` or `500`) |
| `0x2A` | `0xC12E` | **Per-Key RGB Write & Flash Flush** (single-key or 5-batch full table) |
| `0x2B` | `0xC2D2` | **Batch Selector / Reader** (`0x2B` selects batch `(lo, hi)`, `0xAB` returns 14 records) |
| `0x2C` | `0xBD20` | **SOCD (Simultaneous Opposite Cardinal Directions)** pair configuration |
| `0x2D` | `0xBF90` | **RS / Linked Pair** configuration & 30-channel analog bank reply (29 B via `0xCD72`) |
| `0x2E` | `0xA564` | Sets `a5 = 0x16`, calls `0x981C(a2 = 2)` |
| `0x2F` | `0xA572` | Sets `a5 = 0x50`, calls `0x981C(a2 = 3)` |

---

## 4. Keymap & Matrix Layout (68 Keys)

### Primary `pos → HID Usage` Table (`VA 0x4A20`)
* **Format:** `u16[256]`, indexed directly by the 1-byte `pos` value.
* **Contents:** 198 non-zero entries:
  * **68 physical keys** mapped to standard HID usages (except `pos 0x73` = **Fn** = `0xF001`).
  * **Fn bitmasks:** `pos 0x7E..0x92` have value `0x0001` (`(1 << ...) | 0xF001` at `0xAD94..0xAD9E`).
  * **Extended actions:** 14 entries in the `0xF0xx` / `0xF1xx` / `0xF3xx` namespace:
    * `0x73`: `0xF001` (Fn), `0xF2`: `0xF002`
    * `0xED`: `0xF100`, `0xBE`: `0xF101`, `0xBF`: `0xF102`
    * `0xE8`: `0xF309`, `0xCB`: `0xF310`, `0xB6`: `0xF311`, `0xDF`: `0xF312`, `0xF4`: `0xF313`, `0xF5`: `0xF314`, `0xF3`: `0xF315`, `0xA1`: `0xF317`, `0xBD`: `0xF344`
* **Lookup helper:** Firmware resolves `usage ↔ pos` via `0x175B8(0x4A20, 0, usage)`.

| `pos` | Key | `pos` | Key | `pos` | Key |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `0x15` | Esc | `0x2A` | Tab | `0x54` | LShift |
| `0x16..0x1F` | 1..9, 0 | `0x2B..0x34` | Q W E R T Y U I O P | `0x56..0x5A` | Z X C V B |
| `0x20..0x23` | `-` `=` Bksp Insert | `0x35..0x38` | `[` `]` `\` Delete | `0x5B..0x5F` | N M `,` `.` `/` |
| `0x3F` | CapsLock | `0x4C` | Enter | `0x60` | RShift |
| `0x40..0x4A` | A S D F G H J K L `;` `'` | `0x4D` | Home | `0x61` / `0x62` | Up / PgDn |
| `0x69..0x6B` | LCtrl LWin LAlt | `0x6F` | Space | `0x72..0x77` | RAlt Fn RCtrl Left Down Right |
| `0x93..0x9F` | PgUp, F1..F12 | | | | |

### Secondary `row × 21 → pos` Table (`VA 0x5E44`)
Contains 71 valid bytes covering rows 0..3 (stops at byte offset 66; bytes `0x5E44 + 67` onward are executable code, so rows 4..5 are not in this table). Always use `VA 0x4A20` for full 68-key `pos → usage` resolution.

---

## 5. ROM Data Tables & RGB Engine State

### ROM Tables

| Table | VA | Size | Description |
| :--- | :--- | :--- | :--- |
| **NVRAM Descriptors** | `0x43C0` | 38 × 16 B | Main NVRAM descriptor table (terminator at `0x462C`; descriptor `25` = `0x200031CB` OS mode) |
| **macOS Default Keymap** | `0x4630` | 4 × 252 B | 4-layer default keymap for macOS mode (`0x4630..0x4A1F`; swaps `LWin` `0xE3` ↔ `LAlt` `0xE2` at word 53) |
| **Windows Default Keymap**| `0x4A20` | 4 × 252 B | 4-layer default keymap for Windows mode (`0x4A20..0x4E0F`) |
| **Ticks / `gdBi`** | `0x4E10` | 32 B | Timing descriptor (terminator at `0x4E30`) |
| **Macro Record Bank** | `0x1C3F0` | 230 × u16 | Macro records (`0000, F001, F002, F003, 0004...`), accessed by `0x08/0x09/0x0A/0x0E` |
| **RGB Mode Table** | `0x1C994` | 28 × 8 B | 28 `(init_ptr u32, tick_ptr u32)` pairs (mode 0 has `tick = 0`) |
| **Ramp Table** | `0x1CB72` | 7 B | Contains `FE FE FE FE` ramp sequence |
| **SIN_LUT** | `0x1CAC8` | 182 B | Sine LUT, **0.5° step** (`index i ↔ i/2°`), peak at index 180 = `0xFF` |
| **ATAN2_LUT** | `0x1CB80` | 42 × 42 B | 1,764-byte 2D angle LUT (`0x1CB80..0x1D263`, scaled 0..180) used at `0x11368` |
| **Field Name Strings**| `0x1D2CC` | 356 B | ASCII field names (`0x1D2CC..0x1D430`) |
| **DKS Phase Masks** | `0x1D524` | 11 B | `[0x01, 0x02, 0x02, 0x02, 0x04, 0x18, 0x20, 0x40, 0x40, 0x40, 0x80]` |

### RGB Engine State & PRNG
* **State Buffer (`0x20001CC0`):** `0xED5E` zeroes 1,080 bytes (`0x438`) from `0x20001CC0` to `0x200020F7` on every mode change.
  * `user_rgb` sits at `0x20001EF8` (`0x20001CC0 + 0x238`, size `0x100`) + `0x20001FF8` (size `0xFC`) and **is wiped** by `0xED5E` unless persisted to Flash via `0x2A`.
  * `rgb_fb` (framebuffer) starts immediately after at `0x200020F8` (`0x20001CC0 + 0x438`).
* **64-bit PRNG (`0x1B28E..0x1B2CE`):** Knuth MMIX LCG (`state = state * M + A`) with `M = 0x5851F42D4C957F2D` and `A = 1`.

---

## 6. Global Configuration (`0x12` GET / `0x18` SET)

### `0x12` — `GET_CONFIG` & Hall Stream (`VA 0xA758`)
Branches on `pack[4]` (`subcmd` / `table_id`) via `0x1C6C0`:
* **`subcmd 2..9` (Config Read):** Selects an SRAM base pointer and record count, packing fields from config struct `0x20003198` via 3 accessors:
  * `0xD0CE`: packs 4 bytes from offsets `{0x80, 0xA0, 0xC0, 0xE0}` → `u32`
  * `0xD104`: packs 2 bytes from `{0x80, 0xA0}` → `u16`
  * `0xD11C`: reads 1 byte from `{0x80}` → `u8`

| `table_id` | SRAM Pointer | Records | `table_id` | SRAM Pointer | Records |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **2** | `0x200041EC` | 2 | **6** | `0x200042E8` | 6 |
| **3** | `0x2000426A` | 3 | **7** | `0x20004366` | 6 |
| **4** | `0x200043E4` | 5 | **8** | `0x20007AC6` | 7 |
| **5** | `0x20004462` | 5 | **9** | `0x20007A02` | 7 |

* **Hall Stream (`0x12` → `0x92`):**
  * `0x12 0x02` (`buildXsydHallTravelFrame`) and `0x12 0x03` (`buildXsydHallPressedFrame`) return 3-report (`192 B` raw / `132 B` payload) `0x92` frames containing real-time key travel and pressed state across the two matrix halves (`Table 1` & `Table 2`).

### `0x18` — `SET_CONFIG` (`VA 0xA930`)
Writes configuration fields into struct `0x20003198`:
* Struct offsets `+0x04..+0x24` populated from payload indices `0x01..0x21` (step 4).
* RGB parameters mapped from `pack[0x25..0x2B]` (mode at `pack[0x27]`, read at `0x12566`; stored at `+0x2A/+0x2C`).
* White balance / RGB gain at `0x20003198 + 0x54..0x56` (`0x200031EC`): written from `pack[5] → +0x54`, `pack[6] → +0x55`, `pack[7] → +0x56` (`0xA256`); read by encoder in order `+0x55, +0x54, +0x56` (`0x10EF2`).

---

## 7. Matrix Scanning, Hall ADC & Flash NVRAM

### Main Hall ADC Scan Loop (`VA 0x12FE8..0x13420`)
Scans `6 groups × 21 lanes = 126 ADC channels` (`0x1335A: addi a5, zero, 0x7e`; group stride `0x13358: c.addi s3, 0x15`).

* **ADC Raw Buffer:** `0x200055F4 + (group × 21 + lane) × 2` (`126 × u16 = 252 B`, `0x200055F4..0x200056EF`).
* **5 Parallel Per-Key State Arrays (Base `0x20004AFE` = `0x200055F4 - 0xAF6`):**

| Offset | Absolute SRAM Address | Type | Purpose |
| :--- | :--- | :--- | :--- |
| `+0x430` | `0x20004F2E` | `u16` | Raw / range (or SOCD `(pos1 << 8) \| pos2`) |
| `+0x4A8` | `0x20004FA6` | `u16` | Calibrated min (or SOCD `act1`) |
| `+0x528` | `0x20005026` | `u16` | **Travel value** (or SOCD `act2`) |
| `+0x5A8` | `0x200050A6` | `u16` | Dead zone (or SOCD `(type << 8) \| mode`) |
| `+0x5E8` | `0x200050E6` | `u8` | Flags (low nibble = `key_mode`, e.g., `7` = SOCD, `9` = Linked/RS) |
| `+0x628` | `0x20005126` | `u16` | Extra parameter (used by `0x2C`) |

* **Travel Calculation (`0x13148..0x13176`):** Computed arithmetically from `raw + offset`, clamped to ceiling `0x7FF` (11-bit), then subtracted from baseline and stored via `sh t5, 0(a3)`.

### Flash Profile Sector Table (`VA 0x4340`)
24 descending 32-bit Flash addresses (1 KiB sector-aligned within `0x08000000..0x08040000`):

```text
0x08038000  0x08037000  0x08035000  0x08034000  0x08033000  0x08032000
0x08031000  0x0802F000  0x0802E000  0x0802D000  0x0802C000  0x0802B000
0x08029000  0x08028000  0x08027000  0x08026000  0x08025000  0x08023000
0x08022000  0x08021000  0x08020000  0x08003F00  0x08003E00  0x08000000
```

The switch function at `VA 0x11B5E` branches on `a0 ∈ {0, 1, 2, 3}` with overlapping fallthrough blocks (`0x11B74..0x11C36`), populating global pointer slots relative to `gp`:

| `a0` | Entry VA | `gp - 0x7d8` | `gp - 0x7ec` | `gp - 0x7e8` (RGB Base) | `gp - 0x7e4` | `gp - 0x7dc` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **0** | `0x11B74` | `0x08026000` | `0x08027000` | `0x08028000` | `0x08023000` | `0x08025000` |
| **1** | `0x11BA8` | `0x0802C000` | `0x0802D000` | `0x0802E000` | `0x08029000` | *(untouched)* |
| **2** | `0x11BD8` | `0x08032000` | `0x08033000` | `0x08034000` | `0x08035000` | *(untouched)* |
| **3** | `0x11C08` | `0x08032000` | `0x08033000` | `0x08034000` | `0x08035000` | *(untouched)* |

* `0x11DE8` uses `gp - 0x7e8` as the sector base to copy 4 × `0x100`-byte slots (`+0x000`, `+0x100`, `+0x200`, `+0x300`) between RAM and Flash.
* Opcode `0x2A` (`0xC20E` → `0x11D70` → `0x11DE8`) persists `user_rgb` (`0x20001EF8` size `0x100` and `0x20001FF8` size `0xFC`) into the active Flash sector.

---

## 8. Feature Protocols (Verified via Captures & Disassembly)

### 8.1 Profile Selection, Polling Rate, WinLock & OS Mode (`0x00`, Handler `VA 0x09BEE`)

| Subcmd | Request (`5C 04 00 94 \| ...`) | Reply (`5C 04 80 14 \| ...`) | Firmware Handler & Hardware Behavior |
| :--- | :--- | :--- | :--- |
| `0x20` (Read) | `20 FF FF FF` | `00 20 <00\|01> FF` | `VA 0x09F38..0x09F4E` → `VA 0x12FAE()`: reads WinLock bit (`(lbu(-1757(gp)) >> 3) & 1`) |
| `0x20` (Toggle)| `20 <01\|00> FF FF` | `20 <01\|00> FF FF` | `VA 0x09F50..0x09FA6`: toggles `Left Win` (`0xE3`) disable bit in `0x20006120` and updates `VA 0x12F6A(0\|1)` whenever `payload[1] != 0xFF` |
| `0x21` (Read) | `21 FF FF FF` | `00 21 <01=Win\|00=Mac> FF` | `VA 0x09CC4..0x09CDA` → `VA 0x12960()`: returns `1` if `lbu(0x200031CB) == 0` (Windows mode) |
| `0x22` (Read) | `22 FF FF FF` | `00 22 <01=Mac\|00=Win> FF` | `VA 0x0A128..0x0A13A` → `VA 0x12960()`: returns `1` if `lbu(0x200031CB) == 1` (macOS mode) |
| `0x30` (Write) | `30 00 FF FF` | `00 30 01 FF` | `VA 0x0A13C..0x0A162` → `VA 0x128E8(0)`: saves keymap (`0x11DE8`), sets `0x200031CB = 0` (Windows), sets `-1684(gp) \|= 0x10000` (`VA 0x07CAC` → `0x11EA6(0)`) |
| `0x31` (Write) | `31 00 FF FF` | `00 31 01 FF` | `VA 0x0A164..0x0A18A` → `VA 0x128E8(1)`: saves keymap (`0x11DE8`), sets `0x200031CB = 1` (macOS), clears WinLock, sets `-1684(gp) \|= 0x10000` (`VA 0x07CAC` → `0x11EA6(4)`) |
| `0x50` (Write) | `50 <00..06> FF FF` | `00 50 <00..06> FF` | `VA 0x09DCA`: sets polling rate (`0=8k, 1=4k, 2=2k, 3=1k, 4=500, 5=250, 6=125 Hz`) and re-enumerates USB |
| `0x50` (Read) | `50 07 FF FF` | `00 50 <00..06> FF` | `VA 0x09DE0`: reads active polling rate code (`0x00..0x06`) |
| `0x70` (Write) | `70 <00..03> FF FF` | `00 70 <00..03> FF` | `VA 0x09E0C` → `0x16342`: selects onboard Profile 0..3 |
| `0x70` (Read) | `70 04 FF FF` | `00 70 <00..03> FF` | `VA 0x09E1C`: reads active onboard Profile 0..3 |

### 8.2 Per-Key RGB (`0x2A` → Reply `0xAA`, Handler `VA 0xC12E`)

**Single-Key Write (`LEN = 0x05`, `payload[0] = 0x01`):**
```text
5C 05 2A CK | 01 <usage> <R> <G> <B>
```
* `usage`: Standard HID usage of the target key (e.g., `0x14` = Q, `0x08` = E, `0x1D` = Z, `0x13` = P).
* Firmware packs `s0 = (R << 16) | (G << 8) | B` and `reg64[usage] = (s0 << 25) | (G << 17) | (B << 9)` (`0xC26E..0xC2BE`).
* Reply `0xAA` (`LEN = 57`) echoes the request and returns 13 × 4-byte status records.

**Full 68-Key Table Write (5 Batches, `LEN = 0x39`, `payload[0] = 0x00`):**
* Sends 5 batches of 14 key slots (`5 × 14 = 70` slots; batch 4 repeats `0x38 0xE5` in the last 2 slots).
* Note: **Fn is encoded as `0x01`** in the RGB batch table.

| Batch | Keys | HID Usages (Hex) |
| :--- | :--- | :--- |
| **0** | Esc, 1..0, `-`, `=`, Bksp | `29 1E 1F 20 21 22 23 24 25 26 27 2D 2E 2A` |
| **1** | Insert, Tab, Q..P, `[`, `]` | `49 2B 14 1A 08 15 17 1C 18 0C 12 13 2F 30` |
| **2** | `\`, Delete, Caps, A..L, `;`, `'` | `31 4C 39 04 16 07 09 0A 0B 0D 0E 0F 33 34` |
| **3** | Enter, PgUp, LShift, Z..M, `,`, `.`, `/`, RShift | `28 4B E1 1D 1B 06 19 05 11 10 36 37 38 E5` |
| **4** | Up, PgDn, LCtrl, Win, Alt, Space, RAlt, Fn(`01`), RCtrl, Left, Down, Right (+`38 E5`) | `52 4E E0 E3 E2 2C E6 01 E4 50 51 4F 38 E5` |

### 8.3 Per-Key Field Table (`0x23` → Reply `0xA3`, Handler `VA 0xACE0`)

Unified endpoint for per-key Remap, Actuation Point, Rapid Trigger (RT), Deadzone, and Switch Type.

```text
5C 39 23 CK | <flag> <14 × [pos, field, val_lo, val_hi]>
```
* `flag` (`body[0]`): `0x00` processes only slots where `pos != 0xFF`; `0x01` scans all 14 slots. Unused slots are padded with `FF FF 00 00`.
* `pos` (`body[1 + 4k]`): Key identifier (converted via `0x175B8(0x4A20, 0, pos)`).
* `field` (`body[2 + 4k]`): Field ID (`0..25`), dispatched via jump table **`VA 0x1C744`** (values `> 25` jump to `0xB4AE` to clear the slot).
* `value` (`body[3..4 + 4k]`): `u16` little-endian value.
* **Dynamic SRAM Addressing:** `linear_idx = (pos >> 5) * 21 + (pos & 0x1F)`, `addr = base + (K + linear_idx) * S` (where `Base A = 0x20004BE4`, `Base B = 0x20003220`).

| Field ID | Handler VA | Target SRAM Window | Meaning & Units |
| :--- | :--- | :--- | :--- |
| `0x00` (0) | `0xB1F8` | `0x20003410` (u8) | **Key Remap** (target HID usage / action code) |
| `0x01` (1) | `0xB216` | `0x20003510` | Reserved (Shift / AltGr sync) |
| `0x02` (2) | `0xB234` | `0x20003610` | Reserved |
| `0x03` (3) | `0xB252` | `0x20003700` | Reserved |
| `0x04` (4) | `0xB34A` | `0x20003410` (u16) | **Actuation Travel (µm)** (e.g., `1000` = 1.0 mm, `200` = 0.2 mm) |
| `0x05` (5) | `0xB372` | `0x20003510` | Reserved |
| `0x06..0x07` | `0xB39A/C2` | `0x20003660` | Reserved |
| `0x08` (8) | `0xB270` | `flags & 0x3F` | **Key Header / Mode Flag** (always written as `0x0020` alongside travel updates) |
| `0x09` (9) | `0xB294` | Hall `+0x430` | ADC raw |
| `0x0A` (10) | `0xB2AC` | Hall `+0x4A8` | Calibrated min |
| `0x0B` (11) | `0xB2C4` | Hall `+0x528` | Travel value |
| `0x0C` (12) | `0xB2DC` | Hall `+0x5A8` | Dead zone |
| `0x0D` (13) | `0xB2DC` | `0x20003A80` | Raw read |
| `0x0E..0x10` | `0xB2F6..32E`| `0x20004510` | Byte reads (`0x7E`, `0xFC`, `0x17A`) |
| `0x12`, `0x18`| `0xB4AE` | — | Clear slot |
| `0x13` (19) | `0xB3EA` | Hall `+0x528` | Travel alias (`= 0x0B`) |
| `0x14..0x15` | `0xB402/1C` | `0x20003800/3900` | Reserved |
| `0x16` (22) | `0xB436` | `0x20003660` (u16) | **Rapid Trigger (RT) Sensitivity (µm)** (e.g., `100` = 0.1 mm) |
| `0x17` (23) | `0xB45E` | `0x20003660` (u16) | **RT Release / Deadzone Window (µm)** (e.g., `100` = 0.1 mm) |
| `0x19` (25) | `0xB486` | `0x20003660` (u8) | **Switch Type:** `0` = Default (Yongchun), `1` = Jade Pro, `2` = Black Emperor, `3` = TTC King |
| `0x30` (48) | `0xAD7C` | — | Loop control: scan all 14 slots (`body[0] = 1`) |

### 8.4 Batch Reader (`0x2B` → Reply `0xAB`, Handler `VA 0xC2D2`)
* **Request:** `5C 03 2B CK | 00 <lo> <hi>`
* **Reply:** `0xAB` (`LEN = 45`): echoes `00 <lo> <hi>` followed by 14 × 3-byte records (`42 B`).
* Reading all 68 keys requires 5 batch pairs: `(00, 01)`, `(02, 03)`, `(04, 05)`, `(06, 07)`, `(08, 09)`.

### 8.5 SOCD & Linked Key Pairs (`0x2C` & `0x2D`)

**`0x2C` — SOCD Pair (`LEN = 0x0B`, Handler `VA 0xBD20`, Evaluator `VA 0x14CA0..0x153FC` & `0x1622E..0x162FA`):**
```text
5C 0B 2C CK | <flag> <pos1> <pos2> <act1_lo> <act1_hi> <act2_lo> <act2_hi> <type> <mode> <extra_lo> <extra_hi>
```
* Writes to the 5 Hall SRAM banks indexed by `(pos >> 5) * 21 + (pos & 0x1F)`:
  * `+0x430` ← `(pos1 << 8) | pos2`
  * `+0x4A8` ← `act1` (`u16`)
  * `+0x528` ← `act2` (`u16`)
  * `+0x5A8` ← `(type << 8) | mode`
  * `+0x628` ← `extra` (`u16`)
  * `+0x5E8` (`flags`) low nibble set to `key_mode = 7` (`0xBF28`).
* **Verified SOCD Modes (`payload[8] = mode`, e.g., A+D pair `01 04 07 00 00 00 00 00 <mode> 00 00`):**
  * `0x00`: **Last Input Priority** (Last Wins)
  * `0x01`: **Key 1 Priority** (`pos1` / red box takes precedence)
  * `0x02`: **Key 2 Priority** (`pos2` / blue box takes precedence)
  * `0x03`: **Neutral** (both keys suppressed when pressed simultaneously)

**`0x2D` — RS / Linked Pair (`VA 0xBF90`):**
* Loops 29 steps (`0xBFF0`), sets `key_mode = 9` (`0xC066`), and returns a 29-byte analog bank subset (`6 groups × 5 lanes = 30 channels`) via `0xCD72`.

### 8.6 Advanced Key Actions (`0x24..0x28`, Protocol v1.0.9)

> **Important:** The official web bundle (`magnet.aulastar.com`) `ProtocolCMD` enum names are misaligned with actual wire opcodes. Always use the byte-verified wire opcodes below:

| Feature | Wire Opcode | Handler VA | Payload Layout (`5C <LEN> <OP> <CK> \| ...`) |
| :--- | :--- | :--- | :--- |
| **MT (Mod-Tap)** | `0x24` | `0xB4BC` | `LEN = 0x07`: `01 <key> <hold_usage> 00 <tap_usage> 00 <delay_ms / 10>` |
| **TGL (Toggle)** | `0x25` | `0xB602` | `LEN = 0x05`: `01 <key> <toggle_usage> 00 <delay_ms / 10>` |
| **DKS (Dynamic Keystroke)**| `0x26` | `0xB718` | `LEN = 0x10`: `01 <key> <act0 u16> <act1 u16> <act2 u16> <act3 u16> <mask0..3> <actuationUm u16>` |
| **MPT (Multi-Point)** | `0x27` | `0xB9FE` | `LEN = 0x0E`: `01 <count = steps+1> <code0 00> <code1 00> <code2 00> <depth0..2 u16_le>` |
| **END (Release Key)** | `0x28` | `0xBBFE` | `LEN = 0x04`: `01 <key> <action_usage> 00` (Reply `0xA8`, `LEN = 0x38`) |

**DKS (`0x26`) 4-Phase Bitmask Encoding (Evaluator `VA 0x14A8E..0x14BD0`, LUT `VA 0x1D524`):**
* **Single Tap:** Phase 0 = `0x01`, Phase 1 = `0x04`, Phase 2 = `0x20`, Phase 3 = `0xC0`.
* **Hold Spanning Phases:** `0→1` = `0x03`, `1→2` = `0x1C`, `2→3` = `0x60`, `0→2` = `0x1F`, `1→3` = `0x7C`, `0→3` = `0x7F`.
* *Example (Key W = `0x1A`, actions A/B/C/D = `04/05/06/07`, masks `03 1C 60 C0`, first point `1400 µm` = `0x0578`):*
  `5C 10 26 CC | 01 1A 04 00 05 00 06 00 07 00 03 1C 60 C0 78 05` → Reply `0xA6` (`LEN = 0x2E`).

---

## 9. Host Updater (`XSYD_UPDATE_LZ.exe`)

* **PE ImageBase:** `0x400000` (Import table stripped via Enigma Virtual Box).
* **HID Report Length:** Single `mov r8d, 0x41` (`65` bytes); zeroes Report ID byte 0 before `hid_write`.
* **TEA Firmware Encryption Keys:**
  * `KEY1` (File offset `0x17330`): `0123456789ABCDEFFEDCBA9876543210`
  * `KEY2` (File offset `0x17320`): `0174236556421073CD89ABEFFEDC98BA`

---

## 10. Disassembler Gotchas (Capstone RV32C)

1. **`0x1221` Misdecoding:** Capstone 5.0.9 misdecodes compressed instruction `0x1221` as `c.fldsp`. On RV32IMC (no FPU), this is `c.lwsp a0, 0x104(sp)`.
2. **`jal` Target Printing:** Capstone prints the raw immediate offset for `jal` rather than `PC + imm` (e.g., at `0xA8A2`, raw bytes `ef 20 d0 02` print `0x282c`, whereas the actual target is `0xA8A2 + 0x282C = 0xD0CE`). Use `jal_target()` in `tools/fw_va.py`.

---

## 11. OpenAula Implementation & Runtime Optimizations

### Repository Status (`OpenAula-main`)
* **Typecheck & Tests:** `tsc --noEmit` PASS · `typecheck:service` PASS · **659/659 tests PASS**.
* **Key Modules:**
  * `src/protocol/xsyd/codec.ts`: Frame builder, checksum calculator, self-healing multi-report `XsydFrameAssembler`.
  * `src/protocol/xsyd/keymap.ts`: Auto-generated 68-key map from firmware ROM.
  * `src/protocol/xsyd/features.ts`: `0x23` per-key field builder/decoder & `wirePosForCode`.
  * `src/protocol/xsyd/advanced.ts`: Builders for MT (`0x24`), TGL (`0x25`), DKS (`0x26`), MPT (`0x27`), END (`0x28`), SOCD (`0x2C`).
  * `src/protocol/hero68/hallStream.ts` & `service/native/hid_bridge.cpp`: 200 Hz Hall sensor streaming.

### 200 Hz Hall Stream Optimization (`0x12` → `0x92`)
* **Bottleneck Resolved:** Polling both `0x12 0x03` (Pressed) and `0x12 0x02` (Travel) every cycle required 6 `IN` reports (~6 ms) plus an ~8.5 ms `setTimeout` clamp (~14.5 ms/cycle ≈ 68 Hz).
* **200 Hz (5.0 ms/cycle) Architecture:**
  1. Queries `0x12 0x03` (`buildXsydHallPressedFrame`) **once** at stream initialization to establish the baseline `pressedByMatrixIndex`.
  2. Subsequent cycles poll only `0x12 0x02` (`buildXsydHallTravelFrame`, 1 `OUT` + 3 `IN` ≈ 2.0 ms), deriving pressed state via hysteresis (`<= 80 µm` release, `>= 150 µm` press) with a 3:1 polling priority on the matrix half (`Table 1` or `Table 2`) with active key travel (`> 80 µm`).
  3. Replaces `setTimeout(..., 8)` with a `MessageChannel`-backed 5.0 ms deadline scheduler and 200 Hz SSE publishing in `hid_bridge.cpp` / `hallController.ts`.

### `0x23` Read/Write Timeout Prevention
1. **Stale `0x92` Buffer Self-Healing:** When transitioning from the 3-report `0x92` Hall stream (`192 B`) to single-report `0x23` (`0xA3`, `64 B`), an incomplete `0x92` frame in `XsydFrameAssembler` previously swallowed the `0xA3` reply as chunk #2/#3. Fixed by resetting the assembler before each request and adding header-aware self-healing in `XsydFrameAssembler.push()`.
2. **Deferred Flash Erase Contention:** ~500–670 ms after any configuration write (`0x23`, `0x24..0x2C`), the MCU halts USB servicing to erase/write Flash (`VA 0x0AD9E` → `0x11914`) and emits `5C 04 FF <ck> | 0A FF <hi> <lo>` (`VA 0x09AF0`). `OpenAula` now pauses `hero68HallStream` around `0x23` batches, recognizes `0xFF` (`0A FF`) completion packets, and automatically retries `0x23` up to 3 times with short backoff.

---

## 12. Remaining Unknowns

1. **Physical PCB Mapping of the 30-Channel Subset (`0x2D`):** How the `6 groups × 5 lanes` subset in `0x2D` maps to physical switch coordinates on the PCB, and the wire payload format for Rappy Snappy (RS) over `0x2D`.
2. **SOCD (`0x2C`) `type` and `extra` Fields:** All 4 SOCD resolution modes (`payload[8] = 0x00..0x03`) are verified, but `type` (`payload[7]`) and `extra` (`payload[9..10]`) remain `0x00` in all captures.
3. **MPT (`0x27`) Edge Cases:** Why the official web editor injects pseudo-key `0x11` into the 3rd action slot, and whether `count` (`payload[1]`) is always `steps + 1` when fewer than 3 trigger points are configured.

---

## Appendix: Verification Scripts (`E:\hero68_he_max-re\tools\`)

| Script | Checks | Coverage |
| :--- | :--- | :--- |
| `fw_verify_5c.py` | 45 | `0x5C` framing, checksum formula, HID descriptors |
| `fw_verify_keymap.py` | 9 | `0x4A20` 68-key map & `0x5E44` row layout |
| `fw_verify_host.py` | 6 | Host PE framing (`0x41`) & TEA keys |
| `fw_verify_hall.py` | 11 | `0x12`/`0x18` config accessors & 30-channel bank |
| `fw_verify_opcodes.py` | 106 | 48-slot dispatch table (`0x1C5F0`) & `0xC312` router |
| `fw_verify_rgb_math.py` | 31 | Knuth MMIX LCG, `SIN_LUT` (0.5°), `ATAN2_LUT` (42×42) |
| `fw_verify_8_1.py` | 66 | Dynamic SRAM addressing in `0x23` (`0xACE0`) |
| `fw_verify_7_4c.py` | 15 | White balance gain at `0x20003198 + 0x54..0x56` |
| `fw_verify_evb.py` | 22 | EVB unpacked binaries & descriptors |
| `fw_verify_modes.py` | 101 | 28 RGB mode pairs (`0x1C994`), speed & brightness LUTs |
| `fw_verify_state.py` | 32 | `rgb_engine_state` (`0x20001CC0`) & 1,080-byte zero loop (`0xED5E`) |
| `fw_verify_nvram.py` | 29 | Flash sector table (`0x4340`), switch (`0x11B5E`), `gp - 0x7e8` |
| `fw_verify_socd.py` | 10 | `0x2C` (SOCD pair) & `0x2D` (linked pair) handlers |
| `fw_verify_advanced.py` | 9 | Macro opcodes (`0x08/0x09/0x0A/0x0E`) & field table `0x1C744` |
| `fw_verify_hall_flow.py`| 27 | Hall `0x92` flow, ADC bounds & thresholds |
| `verify_field_table.py` | 11 | Capture verification for 26 fields, remap, actuation, switch map |
| `verify_rgb_capture.py` | 4 | Single-key RGB write (`0x2A`) |
| `verify_rgb_batches.py` | 5 | 5-batch 68-key RGB table write (`0x2A`) |
| `verify_actuation_capture.py` | — | `0x23` Field 4 actuation travel in µm |
| `verify_hall_reply.py` | 1029 | `0x92` 132-byte replies, 12-bit ADC bounds |
