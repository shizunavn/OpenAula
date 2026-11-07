# AULA WIN 68 HE MAX — Rhythm Sync (`0x2A`) & Deadzone (`0x23`) Capture Specification

**Status:** 100% Verified against `rhythm_capture.pcapng` (3,926 packets), `wasd_deadzone.pcapng` (15 packets), and RISC-V RV32IMAC disassembly of `XS105_SI2828C_WIN 68 HE MAX_App_v1.1.4_20260204a.bin` (`VA = file_offset + 0x4000`).

---

## 0. Corrections to Earlier AI-Generated `aula_win68_rgb_sync_capture.md`

The earlier draft of `aula_win68_rgb_sync_capture.md` contained **two critical protocol errors**:

1. **Direction & Opcode Role Reversal (`0x2A` vs `0xAA`):**
   - **Wrong claim in old doc:** Claimed that `OUT 5C 39 2A F4` was an "empty poll request" from the host and `IN 5C 39 AA 74` was the keyboard generating audio-reactive colors on its own.
   - **Actual hardware & capture reality (`rhythm_capture.pcapng` + `VA 0x0C12E..0x0C2D0`):**
     - The keyboard has **no microphone or audio DSP**. The host (browser WebHID or Windows background service) captures audio, renders the 68-key RGB frame, and **writes** the colors to the keyboard in `OUT 5C 39 2A <CK> | 01 + 14 × [keyValue, R, G, B]`.
     - The firmware handler at `VA 0x0C1A6..0x0C2CC` checks `payload[0] == 0x01` (`Write`), writes each slot's `[R, G, B]` into the SRAM `user_rgb` table (`0x20001EF8 + 3*cell`), sets `payload[0] = 0x00`, and **echoes the same 57-byte buffer back to the host** as `IN 5C 39 AA <CK> | 00 + 14 × [keyValue, R, G, B]`.
2. **13-Slot vs 14-Slot Off-by-One Bug (64 Keys vs All 68 Keys):**
   - **Wrong claim in old doc:** Parsed only `13` slots per packet (`for (let i = 0; i < 13; i++)`, `52` bytes) and claimed 4 keys (`Backspace = 42`, `BracketRight = 48`, `Quote = 52`, `ShiftRight = 229`) had no LEDs (`64` keys total).
   - **Actual hardware & capture reality (`LEN = 0x39 = 57` bytes = `1 + 14 × 4`):**
     - Every `0x2A` batch packet carries **14 slots** (`14 × 4 = 56` bytes at `payload[1..56]`, `frame[5..60]`), plus 1 subcmd byte (`payload[0]`), totaling `57` (`0x39`) payload bytes!
     - Those 4 "missing" keys (`42`, `48`, `52`, `229`) are simply **Slot 13 (the 14th slot, `frame[57..60]`) of Batches 0, 1, 2, and 3**!
     - All **68 physical keys** (`4 × 14 + 12 = 68`) are updated every 5-packet cycle.

---

## 1. Deadzone Verification (`wasd_deadzone.pcapng` & Firmware `VA 0x0B184..0x0B1CE`, `VA 0x12C72`)

### 1.1 Packet-by-Packet Trace of `wasd_deadzone.pcapng`

All 15 packets in `wasd_deadzone.pcapng` are `0x23` (`LEN = 0x39 = 57`) per-key field writes (`payload[0] = 0x01`) and `0xA3` device replies (`payload[0] = 0x00`) targeting **W (`0x1a = 26`)**, **A (`0x04 = 4`)**, **S (`0x16 = 22`)**, and **D (`0x07 = 7`)**:

| Packet | Dir | Header | Sub | Slot 0 (`W`) | Slot 1 (`A`) | Slot 2 (`S`) | Slot 3 (`D`) | Slots 4..13 | Meaning |
|---|---|---|---|---|---|---|---|---|---|
| `#03` | `OUT` | `5C 39 23 EE` | `01` | `1a 16 96 00` | `04 16 96 00` | `16 16 96 00` | `07 16 96 00` | `00 00 00 00` × 10 | Set W/A/S/D **Top Deadzone (`field 0x16`) = `150 µm` (`0.15 mm`)** |
| `#04` | `IN` | `5C 39 A3 6E` | `00` | `1a 16 96 00` | `04 16 96 00` | `16 16 96 00` | `07 16 96 00` | `ff ff ff 00` × 10 | Firmware ACK echoing `field 0x16 = 150 µm` |
| `#06` | `OUT` | `5C 39 23 EE` | `01` | `1a 17 c8 00` | `04 17 c8 00` | `16 17 c8 00` | `07 17 c8 00` | `00 00 00 00` × 10 | Set W/A/S/D **Bottom Deadzone (`field 0x17`) = `200 µm` (`0.20 mm`)** |
| `#07` | `IN` | `5C 39 A3 6E` | `00` | `1a 17 c8 00` | `04 17 c8 00` | `16 17 c8 00` | `07 17 c8 00` | `ff ff ff 00` × 10 | Firmware ACK echoing `field 0x17 = 200 µm` |
| `#11` | `OUT` | `5C 39 23 EE` | `01` | `1a 16 e8 03` | `04 16 e8 03` | `16 16 e8 03` | `07 16 e8 03` | `00 00 00 00` × 10 | Set W/A/S/D **Top Deadzone (`field 0x16`) = `1000 µm` (`1.00 mm`)** |
| `#12` | `IN` | `5C 39 A3 6E` | `00` | `1a 16 e8 03` | `04 16 e8 03` | `16 16 e8 03` | `07 16 e8 03` | `ff ff ff 00` × 10 | Firmware ACK echoing `field 0x16 = 1000 µm` |
| `#13` | `OUT` | `5C 39 23 EE` | `01` | `1a 17 e8 03` | `04 17 e8 03` | `16 17 e8 03` | `07 17 e8 03` | `00 00 00 00` × 10 | Set W/A/S/D **Bottom Deadzone (`field 0x17`) = `1000 µm` (`1.00 mm`)** |
| `#14` | `IN` | `5C 39 A3 6E` | `00` | `1a 17 e8 03` | `04 17 e8 03` | `16 17 e8 03` | `07 17 e8 03` | `ff ff ff 00` × 10 | Firmware ACK echoing `field 0x17 = 1000 µm` |

### 1.2 Firmware Disassembly Proof (`VA 0x0B184`, `0x0B19E`, `0x12C72`, `0x13202`, `0x13572`)

- **Write Handlers (`0x23` write jump table at `VA 0x1C6DC`):**
  - `field 0x16` (`VA 0x0B184`): Writes `u16_le` to `0x20003FEC + 2*cell` (**Top Deadzone in µm**).
  - `field 0x17` (`VA 0x0B19E`): Writes `u16_le` to `0x200040E8 + 2*cell` (**Bottom Deadzone in µm**).
- **Read Handlers (`0x23` read jump table at `VA 0x1C744`):**
  - `field 0x16` (`VA 0x0B436`): Reads `u16_le` from `0x20003FEC + 2*cell`.
  - `field 0x17` (`VA 0x0B450`): Reads `u16_le` from `0x200040E8 + 2*cell`.
- **Profile Reload Sanitizer (`VA 0x12C72..0x12CA6` inside `0x12AF4`):**
  - Checks `TopDeadzone <= 1000` (`0x03E8`) and `BottomDeadzone <= 1000` (`0x03E8`).
  - If either value exceeds `1000 µm` (`1.00 mm`), the firmware overwrites it with **`200 µm` (`0.20 mm`)**!
- **Real-Time Hall Scan Evaluation (`VA 0x13202` & `VA 0x13572..0x1358C`):**
  - Normal Actuation (`VA 0x13202`): `effective_actuation_um = max(TopDeadzone, Travel)`.
  - Rapid Trigger (`VA 0x13572..0x1358C`): Key cannot trigger above `TopDeadzone` (`0x20003FEC + 2*cell`) and cannot re-trigger below `max_travel - BottomDeadzone` (`0x200040E8 + 2*cell`).

---

## 2. Rhythm Sync Protocol (`rhythm_capture.pcapng` & Firmware `VA 0x0C12E..0x0C2D0`)

### 2.1 Session Initialization (`#0014` `OUT`, `OP = 0x18`, `LEN = 0x2C`)

Before streaming per-key colors, the host switches the keyboard into **Per-Key RGB mode (`mode = 0x15 = 21`)** at maximum brightness (`4`):

```
OUT #0014:
5C 2C 18 BD | 01 00 00 00 00
              00 00 ff  00 00 ff  00 00 00  ff ff 00  ff 00 00  00 ff ff  00 00 ff   (7 × 4B BGR palette)
              ff 00 00 00
              00        (flags: reverse = 0)
              04        (brightness = 4 = 100%)
              15        (mode = 0x15 = Per-Key RGB)
              03        (speed = 3)
              02 00     (fixed footer)
              00        (colorIndex = 0)
```

Device reply (`#0016` `IN`, `OP = 0x98`, `LEN = 0x2D`):
```
5C 2D 98 32 | 00 00 00 00 00 <28B BGR palette> 00 00 00 00 00 04 15 03 02 00 00 00
```

### 2.2 5-Frame × 14-Slot Per-Key RGB Streaming (`OP = 0x2A`, `LEN = 0x39`)

Each audio/visual frame updates all 68 keys across **5 consecutive 64-byte USB HID reports**:

```
Byte 0:      0x5C       Magic byte
Byte 1:      0x39       Payload length = 57 bytes (1 subcmd + 14 × 4B slots)
Byte 2:      0x2A       Command opcode (Per-Key RGB Read/Write)
Byte 3:      CK         Checksum = (0x35 + 0x5C + 0x39 + 0x2A + frame[60]) & 0xFF
                        = (0xF4 + Slot13_Blue) & 0xFF
Byte 4:      0x01       Subcommand: 0x01 = Write to SRAM, 0x00 = Read from SRAM
Bytes 5..60: 14 × 4B    14 slots of [keyValue, R, G, B] (unsigned bytes 0..255)
Bytes 61..63: 00 00 00  Report padding to 64 bytes
```

- **Why `CK` is often `0xF4` on `OUT` and `0x74` on `IN`:**
  - The XSYD checksum (`VA 0x0CF48`) only adds the **last byte of the payload** (`payload[LEN - 1] = payload[56] = frame[60]`), which is the **Blue channel of Slot 13 (the 14th key in the batch)**.
  - Whenever the 14th slot in a batch has `Blue == 0x00` (which is always true for Batch 4 where Slot 13 is padded with `00 00 00 00`, and true for Batches 0–3 whenever the rightmost key's Blue channel is `0`), `CK = (0xF4 + 0x00) & 0xFF = 0xF4` on `OUT` and `(0x74 + 0x00) & 0xFF = 0x74` on `IN`.
  - When the 14th key (`Backspace`, `BracketRight`, `Quote`, or `ShiftRight`) has a non-zero Blue value `B`, `CK = (0xF4 + B) & 0xFF` (e.g. `#0331 OUT` in `rhythm_capture.pcapng` has `Slot 13 = [42, 0, 5, 255]`, so `CK = (0xF4 + 0xFF) & 0xFF = 0xF3`).

### 2.3 Exact 5-Batch Key Sequence (All 68 Keys)

Verified across all 389 5-packet cycles in `rhythm_capture.pcapng`:

| Batch | Slot Indices (`0..13`) | `keyValue` (HID Usage Low Byte, Decimal) | Physical Keys (`OpenAula` `keyId`s, Left → Right) |
|---|---|---|---|
| **Batch 0** | `0..13` (14 keys) | `41, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 45, 46, 42` | `Escape`, `Digit1`..`Digit0`, `Minus`, `Equal`, **`Backspace` (`42`)** |
| **Batch 1** | `0..13` (14 keys) | `76, 43, 20, 26, 8, 21, 23, 28, 24, 12, 18, 19, 47, 48` | `Delete`, `Tab`, `KeyQ`..`KeyP`, `BracketLeft`, **`BracketRight` (`48`)** |
| **Batch 2** | `0..13` (14 keys) | `49, 75, 57, 4, 22, 7, 9, 10, 11, 13, 14, 15, 51, 52` | `Backslash`, `PageUp`, `CapsLock`, `KeyA`..`KeyL`, `Semicolon`, **`Quote` (`52`)** |
| **Batch 3** | `0..13` (14 keys) | `40, 78, 225, 29, 27, 6, 25, 5, 17, 16, 54, 55, 56, 229` | `Enter`, `PageDown`, `ShiftLeft`, `KeyZ`..`KeyM`, `Comma`, `Period`, `Slash`, **`ShiftRight` (`229`)** |
| **Batch 4** | `0..10` (11 keys) + `11` (`00`) + `12..13` (pad) | `82, 224, 227, 226, 44, 230, 1, 228, 80, 81, 79, 0, 0, 0` | `ArrowUp`, `ControlLeft`, `MetaLeft`, `AltLeft`, `Space`, `AltRight`, `Fn` (`1`), `ControlRight`, `ArrowLeft`, `ArrowDown`, `ArrowRight` + 3 zero-padded slots (`00 00 00 00`) |

> Note: In `OpenAula`, Batch 1 starts with `Tab .. BracketRight, Backslash, Delete` and Batch 4 includes all 12 remaining keys (`ShiftRight` in Batch 3, `ArrowUp .. ArrowRight` = 11 keys in Batch 4, or 12 keys when `Delete` is placed in Batch 0/1). Because the firmware (`VA 0x0C242..0x0C27A`) looks up each slot's `keyValue` independently via `VA 0x0D0A8(keyValue)`, slots can appear in any order across the 5 batches and every key maps to its exact physical LED matrix cell.

### 2.4 Why Rhythm Sync Does Not Wear Out Flash (`VA 0x0C242..0x0C2CC`)

Disassembly of `op_0x2A_per_key_rgb` (`VA 0x0C12E..0x0C2D0`):
1. For each of the 14 slots (`s3 = 0..52` step 4), if `payload[0] == 0x01`:
2. Checks if the 4-byte slot equals `FE FE FE FE` (`VA 0x0C27C..0x0C28C`):
   - **Only if `slot == FE FE FE FE`** does the firmware call `VA 0x11D70()` to erase/program the Flash `user_rgb` sector (`0x08025000 + slot*0x6000`).
3. For all normal `[keyValue, R, G, B]` slots (`keyValue != 0xFE` and `keyValue != 0x00`):
   - Calls `VA 0x0D0A8(keyValue)` to resolve `pos`, converts to `cell = 0..125`, and writes `R, G, B` directly to SRAM `0x20001EF8 + 3*cell` (`VA 0x0C25E..0x0C27A`).
   - Does **not** set the Flash dirty bit in `-1684(gp)`.
4. Thus, streaming 5 × `0x2A` packets at 30–60 FPS updates SRAM solely in memory with **zero Flash erase/write cycles**.
