# XSYD `0x5C` protocol — AULA WIN 68 HE MAX

The WIN 68 HE MAX (board `XSYD` / `SI2828C`, firmware `XS105_SI2828C_WIN 68 HE MAX_App_v1.1.4_20260204a.bin`) does **not** use
the HERO68 `0x09` protocol documented in [`hub-aulacn-protocol.md`](./hub-aulacn-protocol.md).
It speaks a different framing on a different interface:

| | WIN 68 HE MAX (XSYD) | HERO 68/84 HE |
|---|---|---|
| `vendorId` / `productId` | `0x1CA2` / `0x1901` (or `0x1C4F` / `0xEE88`) | `0x38A6` / … |
| `usagePage` | `0xFFA0` | `0xFFA8` |
| report id | `0` | `11` |
| magic byte | `0x5C` | none |
| depth unit | **micrometres (`µm`)** | hundredths of a millimetre |

> Anything in [`ADVANCED_KEYS_UI.md`](./ADVANCED_KEYS_UI.md) that mentions
> `fw0320`, mask `10`/`14` or "hundredths of a millimetre" describes the HERO68
> board. It does **not** apply here.

Every byte layout below was verified against both USBPcap captures of the real device
and RISC-V RV32IMAC disassembly of `XS105_SI2828C_WIN 68 HE MAX_App_v1.1.4_20260204a.bin` (`VA = file_offset + 0x4000`).

---

## 1. Framing

A frame is a 4-byte header followed by `LEN` payload bytes, padded to whole
64-byte HID reports with `0x00`.

```
frame[0] = 0x5C            magic, checked before anything else
frame[1] = LEN             payload length, 0..252
frame[2] = OP              request 0x00..0x37, reply = request | 0x80
frame[3] = CK              checksum
frame[4..]                 payload
```

**Checksum (`VA 0x0CF48..0x0CF7A`):**

```js
CK = (0x35 + 0x5C + LEN + OP + payload[LEN - 1]) & 0xFF
```

Only the **last payload byte** is summed, never the whole body. Two families
deviate, both explained by how the frame was assembled:

- `OP < 0x80` sent by the host with a truncated payload keeps `CK = 0x00`
  because it never passes through the reply packer.
- `OP = 0x30` uses a fixed 0x43-byte slot, so the addend is `frame[63]`.

Verified on 4316 frames across 9 captures (`tests/xsyd-codec.test.mjs`).

Replies set bit 7 on the opcode (`0x2C` → `0xAC`). A reply larger than 60
payload bytes arrives as several `inputreport` events.

See `src/protocol/xsyd/codec.ts`.

---

## 2. Device handshake, profile slot & polling rate (`0x00`, `VA 0x09BEE`)

| query | reply | meaning |
|---|---|---|
| `00 01` (subcmd `0x01`) | `00 01 09 01` | ProtocolVersion **1.0.9** (`VA 0x09C10`) |
| `00 25` (subcmd `0x25`) | `00 25 0a 0a 00 48 0d` | precision 10 µm, min 100 µm, max `0x0D48` = 3400 µm (`VA 0x09D30`) |
| `00 26` (subcmd `0x26`) | ASCII | keyboard name, `WIN 68 HE MAX` (`VA 0x09D60`) |
| `70 <00..03> ff ff` (subcmd `0x70`) | `00 70 <00..03> ff` | select onboard profile 0..3 (`profile_1_2_3_4.pcapng`, `VA 0x09E0C` → `0x16342`) |
| `70 04 ff ff` (subcmd `0x70`) | `00 70 <00..03> ff` | read active onboard profile (`4k_to_2k_to_1k.pcapng` #10 → #11, `VA 0x09E1C`) |
| `50 <00..06> ff ff` (subcmd `0x50`) | `00 50 <00..06> ff` | write polling rate (`4k_to_2k_to_1k.pcapng` #0, #636, #996, `VA 0x09DCA`); triggers USB re-enumeration |
| `50 07 ff ff` (subcmd `0x50`) | `00 50 <00..06> ff` | read current polling rate (`4k_to_2k_to_1k.pcapng` #14, #650, #1010) |

### 2.1 Profile switching (`0x00` subcmd `0x70`) vs. 500 ms deferred Flash flush (`VA 0x07E28`)

- **5 Flash sectors per profile (`VA 0x11B5E..0x11CE8`, table at `VA 0x4340..0x439C`)**:
  - **Profile 0 (`slot = 0`)**: `0x08021000`, `0x08020000`, `0x08022000` (per-key fields `0x23`/`0x29`), `0x08025000` (`user_rgb` `0x2A`), `0x08023000` (global RGB `0x18`)
  - **Profile 1 (`slot = 1`)**: `0x08027000`, `0x08026000`, `0x08028000`, `0x0802B000`, `0x08029000`
  - **Profile 2 (`slot = 2`)**: `0x0802D000`, `0x0802C000`, `0x0802E000`, `0x08031000`, `0x0802F000`
  - **Profile 3 (`slot = 3`)**: `0x08033000`, `0x08032000`, `0x08034000`, `0x08037000`, `0x08035000`
- **Deferred Flash write (`VA 0x07E28` → `0x11914`)**:
  - Writing to `0x23`, `0x29`, `0x18`, or `0x2A` only updates SRAM and sets a dirty flag in `-1684(gp)` with a **500 ms countdown** (`*(u16*)0x20000A76 = 500`).
  - Only after 500 ms of main-loop ticks does `VA 0x07E30` call `VA 0x11914` to erase/write the profile's Flash sectors.
- **Critical hardware constraint on `0x00 0x70 <slot>` (`VA 0x16342` → `0x12AF4`)**:
  - Sending `5C 04 00 94 | 70 <slot> FF FF` unconditionally invokes `VA 0x11B5E(slot)` and `VA 0x12AF4()`, which **reloads the profile's Flash sectors back into SRAM**.
  - If `0x00 0x70 <slot>` is sent again within 500 ms after a `0x23` write (for example, inside `saveXsydRemapChanges`, `saveXsydAdvancedBindings`, `saveXsydRgbProfile`, or `hydrateFromXsydDevice`), `VA 0x12AF4` overwrites SRAM with the old Flash contents before the 500 ms flush fires, **wiping out the uncommitted `0x23` Actuation/RT/Deadzone changes**!
  - `XsydDeviceManager.request()` guards against this by suppressing redundant `0x00 0x70 <slot>` commands when the keyboard is already on `<slot>` after a recent SRAM write, and waiting 600 ms before switching to a different slot.

### 2.2 Polling rate (`0x00` subcmd `0x50`, LEN 4)

Verified on `4k_to_2k_to_1k.pcapng` (switching 8000 Hz → 4000 Hz → 2000 Hz → 1000 Hz):

```
write:  5C 04 00 94 | 50 <code> FF FF
read:   5C 04 00 94 | 50 07    FF FF
reply:  5C 04 80 14 | 00 50 <code> FF
```

| `code` | polling rate | USB `bInterval` | capture evidence (`4k_to_2k_to_1k.pcapng`) |
|---|---|---|---|
| `0x00` | 8000 Hz | `1` | initial descriptor on `dev=3` (#9) |
| `0x01` | 4000 Hz | `2` | write `50 01 ff ff` (#0) → reply `00 50 01 ff` (#1), reconnects as `dev=6`, read `50 07 ff ff` (#14) → `00 50 01 ff` (#15) |
| `0x02` | 2000 Hz | `3` | write `50 02 ff ff` (#636) → reply `00 50 02 ff` (#637), reconnects as `dev=7`, read `50 07 ff ff` (#650) → `00 50 02 ff` (#651) |
| `0x03` | 1000 Hz | `4` | write `50 03 ff ff` (#996) → reply `00 50 03 ff` (#997), reconnects as `dev=8`, read `50 07 ff ff` (#1010) → `00 50 03 ff` (#1011) |
| `0x04` | 500 Hz | — | `8000 >> 4` |
| `0x05` | 250 Hz | — | `8000 >> 5` |
| `0x06` | 125 Hz | — | `8000 >> 6` |
| `0x07` | read query | — | `50 07 ff ff` queries the active rate code `0x00..0x06` |

---

## 3. Keymap (`VA 0x4A20` & `VA 0x0D0A8`)

68 physical keys laid out in a 6 × 21 grid (`cell = 0..125`).
- On the wire (`0x23`, `0x24`, `0x25`, `0x27`, `0x28`, `0x2A`, `0x2C`), each key is identified by its 1-byte `keyValue` (HID usage low byte, with `Fn = 0x01` because `0xF001 & 0xFF = 0x01`).
- Firmware `VA 0x0D0A8` scans the 256-entry flash table at `VA 0x4A20` to find `pos` (`1..255`), then converts `pos_0 = pos - 1` into `cell = (pos_0 >> 5) * 21 + (pos_0 & 0x1F)`.

---

## 4. Per-key field table (`0x23` → `0xA3`, `VA 0x0ACE0..0x0B4B8`) & Global Actuation (`0x29` → `0xA9`, `VA 0x0C092`)

### 4.1 `0x23` Per-key field table

```
payload[0]           mode: 0x00 = Read from SRAM (jump table VA 0x1C744), 0x01 = Write to SRAM (jump table VA 0x1C6DC)
payload[1 + 4k]      pos    (1-byte keyValue / HID usage, 0xFF = unused padding slot)
payload[2 + 4k]      field  (field ID 0x00..0x19 for write, 0x00..0x30 for read)
payload[3 + 4k]      value low byte
payload[4 + 4k]      value high byte
```

`LEN` is `0x39` (57 bytes) for 14 slots.

| `field` | Write VA (`0x1C6DC`) | Read VA (`0x1C744`) | SRAM Address (`cell = 0..125`) | Meaning & Hardware Behavior |
|---|---|---|---|---|
| `0x00` (0) | `0x0B01A` | `0x0B2B2` | `0x20003220 + 2*cell` | **Layer 0 Remap** action code (`u16`, `Fn = 0xF001`) |
| `0x01` (1) | `0x0B04E` | `0x0B2FC` | `0x2000331E + 2*cell` | Layer 1 (Fn layer) action code |
| `0x02` (2) | `0x0B06E` | `0x0B31C` | `0x20004FD6 + 2*cell` | Secondary key param A |
| `0x03` (3) | `0x0B08C` | `0x0B33A` | `0x200050D2 + 2*cell` | Secondary key param B |
| **`0x04` (4)** | **`0x0B0AA`** | **`0x0B358`** | **`0x2000341A + 2*cell`** | **Per-key Actuation Point (µm)** (`100..3400 µm` for switch `0,1`; `100..3300 µm` for switch `2,3`). Evaluated at `VA 0x13206` where `effective_actuation = max(TopDeadzone (0x16), Travel (0x04))`. |
| `0x05` (5) | `0x0B0CE` | `0x0B376` | `0x20003516 + 2*cell` | **MPT Depth 1 (µm)** |
| `0x06` (6) | `0x0B0EA` | `0x0B390` | `0x20003612 + 2*cell` | **MPT Depth 2 (µm)** |
| `0x07` (7) | `0x0B106` | `0x0B3AA` | `0x2000370E + 2*cell` | **MPT Depth 3 (µm)** |
| **`0x08` (8)** | **`0x0B122`** | **`0x0B3C4`** | **`0x200051CC + cell` (u8)** | **Key Mode / Header byte**: `bit 5 (0x20)` = **Rapid Trigger ON** (`VA 0x13504..0x13510`) & locks per-key Travel against `0x29` global writes (`VA 0x0C0DC`); `0x00` = **Rapid Trigger OFF**; `bits 0..3` = Advanced Key type (`1=DKS, 2=MPT, 3=MT, 4=TGL, 5=END, 7=SOCD`). |
| **`0x14` (20)** | **`0x0B150`** | **`0x0B402`** | **`0x2000380A + 2*cell`** | **Rapid Trigger Press Sensitivity (µm)** (`10..3400 µm`). Evaluated at `VA 0x1352E`. Sanitized at `VA 0x12D6A`: if `<= 9`, reset to `300 µm` (`0.30 mm`). |
| **`0x15` (21)** | **`0x0B16A`** | **`0x0B41C`** | **`0x20003906 + 2*cell`** | **Rapid Trigger Release Sensitivity (µm)** (`10..3400 µm`). Evaluated at `VA 0x13538`. Sanitized at `VA 0x12D80`: if `<= 9`, reset to `300 µm` (`0.30 mm`). |
| **`0x16` (22)** | **`0x0B19C`** | **`0x0B44E`** | **`0x20003FEC + 2*cell`** | **Top Deadzone (µm)** (`0..1000 µm`). Evaluated at `VA 0x13202` (`effective_actuation = max(TopDeadzone, Travel)`) and `VA 0x13572`. |
| **`0x17` (23)** | **`0x0B1B6`** | **`0x0B468`** | **`0x200040E8 + 2*cell`** | **Bottom Deadzone (µm)** (`0..1000 µm`). Evaluated at `VA 0x1357C` (`effective_bottom = max_travel - BottomDeadzone`). |
| **`0x19` (25)** | **`0x0B1CE`** | **`0x0B482`** | **`0x200045F4 + 2*cell`** | **Switch Type ID (`0..3`)**. Selects Hall ADC-to-travel LUT (`VA 0x1D48C`) and max travel (`3400 µm` vs `3300 µm` at `VA 0x12CEA`). |

> **Why earlier docs/code had the `0.15 mm -> 0.02 mm` ("limit breaker") and Deadzone bugs:**
> Earlier notes misidentified `0x16` as `RapidTrigger` and `0x17` as `Deadzone`, leaving `0x14` and `0x15` unwritten.
> - Writing `0.15 mm` (`150 µm`) RT in the old code actually wrote `150 µm` to `field 0x16` (**Top Deadzone**) and set `field 0x08 = 0x20` (enabling RT), while leaving `field 0x14` and `0x15` untouched at the keyboard's NVRAM value (`20 µm = 0.02 mm` in Profiles 1–3 of `profile_1_2_3_4.pcapng`), causing the official web driver to display `0.02 mm`!
> - Writing Top/Bottom Deadzone in the old code ignored `bottomDeadzoneMm` and wrote `topDeadzoneMm` only to `field 0x17`, then read `field 0x17` back into both `topDeadzoneMm` and `bottomDeadzoneMm`.

### 4.2 Switch Type IDs (`field 0x19`, `VA 0x1D48C` & `VA 0x12CEA..0x12D14`)

Verified in firmware (`VA 0x130C6..0x13112`, `VA 0x12CEA..0x12D14`, `VA 0x1D48C`) and `change_A_Zjadepro_Q_toblackemperor_WtoTTCKING_E-to_yongchun_switch.pcapng`:

| `field 0x19` | Switch Name | Flash LUT (`681 × u16`) | Max Travel (`VA 0x12CEA`) | OpenAula `SwitchProfileId` |
|---|---|---|---|---|
| `0` | **Wing Chun / Graywood** (`yongchun`) | Curve 0 (`VA 0x04E44`) | **`3400 µm` (`3.40 mm`)** | `'switch-4'` (`'wing-chun'`) |
| `1` | **Jade Pro / Magnetic Jade** (`jadepro`) | Curve 0 (`VA 0x04E44`) | **`3400 µm` (`3.40 mm`)** | `'switch-1'` (`'jade-pro'`) |
| `2` | **Black King / Black Emperor / Uranus** | Curve 1 (`VA 0x05644`) | **`3300 µm` (`3.30 mm`)** | `'black'` (`'switch-3'`) |
| `3` | **Meteor Magnetic / TTC King** | Curve 1 (`VA 0x05644`) | **`3300 µm` (`3.30 mm`)** | `'white'` |

> **Firmware travel sanitizer (`VA 0x12D02..0x12D14`)**: When a profile loads (`VA 0x12AF4`), if a key has `SwitchType` `2` or `3` (`max_travel = 3300 µm`) and its `Travel (0x04)` exceeds `3300 µm` (e.g. `3350` or `3400 µm`), the firmware rejects `Travel` and resets it to `Global Actuation (0x29)` (`500 µm = 0.50 mm` in Profile 0)! `xsydProtocolEncoder` therefore clamps `Travel` and `RT` to `xsydSwitchMaxTravelUm(swId)`.

### 4.3 `0x29` Global Actuation Read/Write (`VA 0x0C092..0x0C12E`)

- **Read (`LEN = 0x0F`)**: `5C 0F 29 C9 | 00 00 00 ...` → Reply `5C 0F A9 49 | 00 00 00 <u16_le global_travel_um> 00 ...`
  - Returns `0x01F4` (`500 µm = 0.50 mm`) in Profile 0 and `0x05DC` (`1500 µm = 1.50 mm`) in Profiles 1–3 of `profile_1_2_3_4.pcapng`.
- **Write (`LEN = 0x0F`)**: `5C 0F 29 <CK> | 01 00 00 <u16_le global_travel_um> 00 ...`
  - Verified in `actutation2.0global_...pcapng` frame 0 (`01 00 00 d0 07 ...` = `2000 µm = 2.00 mm`).
  - Stores `global_travel_um` at `0x200031E8`, copies it into `field 0x04` (`Travel`) for every key whose `Header (0x08)` has `(Header & 0x30) == 0`, and arms the 500 ms Flash flush (`VA 0x07E28`).

---

## 5. Advanced keys

The official driver has separate opcodes for these. Its own names for the
opcodes are **wrong**; the table below lists what the device actually received.

| feature | opcode on the wire | bundle name (misleading) | capture |
|---|---|---|---|
| MT (mod tap) | `0x24` | `KB2_CMD_MACRO` | yes |
| TGL | `0x25` | `KB2_CMD_MACROMODE` | yes |
| MPT (multi-point travel) | `0x27` | `KB2_CMD_TGL` | yes |
| END | `0x28` | `KB2_CMD_TDKS` | yes |
| DKS | **unverified** | `KB2_CMD_TDKS` | **no** |
| DDKS | **unverified** | `KB2_CMD_DDKS` | **no** (`0x29` is Global Actuation read/write at `VA 0x0C092`) |
| RS | **unverified** | `KB2_CMD_RS` | **no** |

### 5.1 MT — `0x24`, LEN 7

```
01 | key | hold | 00 | tap | 00 | delay/10
```

| capture | frame |
|---|---|
| `W_MT_holdZ_ClickE_longpresstrigger200ms` | `5c 07 24 d0 \| 01 1a 1d 00 08 00 14` |
| `set_MT_at_W-holdZ-clickE-setMPT_A-…` | `5c 07 24 da \| 01 1a 1d 00 08 00 1e` |

### 5.2 TGL — `0x25`, LEN 5

```
01 | key | toggle | 00 | delay/10
```

Capture `TGL_V_setZ_logpresstriggerdelay200ms`:
`5c 05 25 cf | 01 19 1d 00 14`.

### 5.3 MPT — `0x27`, LEN 14 for 3 steps

```
01 | count(=steps+1) | (code,00) × steps | depth_u16_LE × steps
```

Capture `set_MT_at_W-holdZ-clickE-setMPT_A-0.5mmA,1mmM,1.5mmN`:
`5c 0e 27 cb | 01 04 04 00 10 00 11 00 f4 01 e8 03 dc 05`.

### 5.4 END — `0x28`, LEN 4

```
01 | key | action | 00
```

Capture `S_END_P`: `5c 04 28 bd | 01 16 13 00`.

### 5.5 Turning advanced keys off

Write `0x23` with field `0x08` and value `0x0000` for the key. Verified by the
`S_D_F_to-B_C_D_and_revert` capture.

---

## 6. SOCD — `0x2C`, LEN 11

```
flag(01=write) | key1 | key2 | action1(u16) | action2(u16) | type | mode | delay(u16)
```

Capture `socd_AD_on`: `5c 0b 2c c8 | 01 04 07 00 00 00 00 00 00 00 00`, reply
`0xAC`. Wire SOCD only with `type = mode = 0`, which is what the capture proves works.

---

## 7. Hall travel & pressed-state stream (`0x12` → `0x92`)

Verified on `travel_test_press_randomkey.pcapng` and firmware disassembly (`VA 0xA758`, `0xA77C`, `0xA7A8`, `0xA802`, `0xC6D8`, `0x12FE8`):

| request (`0x12`, LEN 4) | reply (`0x92`) | payload layout | capture evidence (`travel_test_press_randomkey.pcapng`) |
|---|---|---|---|
| `5C 04 12 A6 \| 03 01 FF FF` | `5C 82 92 A4` (`LEN = 0x82 = 130` B across 3 HID reports) | `00 03 \| u8[126] \| FF FF` — per-key pressed/actuated state at `0x20006A48 + matrixIndex` (`0x00` = released, `0x02` = actuated) | `payload[2 + 92] = 0x02` while `KeyM` (HID `0x10`, `matrixIndex = 92`) is held; `payload[2 + 65] = 0x02` while `KeyS` (HID `0x16`, `matrixIndex = 65`) is held |
| `5C 04 12 A6 \| 02 01 FF FF` | `5C 80 92 A3` (`LEN = 0x80 = 128` B across 3 HID reports) | `00 02 \| u16_le[63]` — travel in micrometres (`0..3400` µm) at `0x200041EC` for `matrixIndex = 0..62` (rows 0–2: `Escape`..`Delete`) | 175 upper-half polls |
| `5C 04 12 A6 \| 02 02 FF FF` | `5C 80 92 A3` (`LEN = 0x80 = 128` B across 3 HID reports) | `00 02 \| u16_le[63]` — travel in micrometres (`0..3400` µm) at `0x2000426A` for `matrixIndex = 63..125` (rows 3–5: `CapsLock`..`ArrowRight`) | `KeyM` (`matrixIndex = 92 = 63 + 29`) ramps `u16_le[29]` from `0` → `3400` µm (`3.400 mm`); `KeyS` (`matrixIndex = 65 = 63 + 2`) ramps `u16_le[2]` from `0` → `1783` µm (`1.783 mm`) |
| `5C 04 12 A6 \| 06 <01\|02> FF FF` | `5C 80 92 A3` (`LEN = 0x80 = 128` B across 3 HID reports) | `00 06 \| u16_le[63]` — filtered 12-bit Hall ADC (`0..4095`) at `0x200042E8` / `0x20004366` | `calibrate_all_keyboard.pcapng` |

---

## 8. Global RGB (`0x18` → `0x98`) & Per-key RGB (`0x2A` → `0xAA`)

Verified on `tideflux_softripple_snippingstorm_brightness0-4-3-1-2-0_speed1-2-3-4-0_reverseon-off_colorchangetosmoothflow(multicolor-red-blue).pcapng`, `Q(green)-E(red)_-Z(yellow)-P(Pink).txt`, and firmware disassembly (`VA 0x0AA10`, `0x10DE4`, `0x1D2A0`).

### 8.1 Global RGB (`0x18` → `0x98`)

- **Read request (`LEN = 0x2B = 43`):** `5C 2B 18 D4 | 00 00 00 00 00 <28B palette or FF> 00×10`
- **Write request (`LEN = 0x2C = 44`):** `5C 2C 18 <CK> | 01 00 00 00 00 <28B BGR palette> 00 00 00 00 <flags> <brightness> <mode> <speed> 02 00 <colorIndex>`
- **Reply (`LEN = 0x2D = 45`):** `5C 2D 98 <CK> | 00 00 00 00 00 <28B BGR palette> 00 00 00 00 <flags> <brightness> <mode> <speed> 02 00 <colorIndex> 00`

### 8.2 Per-Key RGB (`0x2A` → `0xAA`)

- **Single-key write (`LEN = 0x05`):** `5C 05 2A <CK> | 01 <keyValue> <R> <G> <B>`
- **Batch read/write (`LEN = 0x39 = 57`):** `5C 39 2A <CK> | <00=read | 01=write> + 14 × [keyValue, R, G, B]` (unused slots padded with `FF 00 00 00`).

See `src/protocol/xsyd/rgb.ts` and `src/keyboard/xsydRgbPreview.ts`.

---

## 9. What is still unknown
| item | why it is unknown |
|---|---|
| DKS layout | no capture; the only related frame (`0x28`, LEN 4) turned out to be END |
| END with several keys | one capture, one key |
| MPT with 1 or 2 steps | one capture, 3 steps |
| SOCD mode/type/delay | all zero in the single capture |
| RS | no capture |
