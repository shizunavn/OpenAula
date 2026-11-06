# XSYD `0x5C` protocol — AULA WIN 68 HE MAX

The WIN 68 HE MAX (board `XSYD` / `SI2828C`, firmware `v1.1.4`) does **not** use
the HERO68 `0x09` protocol documented in [`hub-aulacn-protocol.md`](./hub-aulacn-protocol.md).
It speaks a different framing on a different interface:

| | WIN 68 HE MAX (XSYD) | HERO 68/84 HE |
|---|---|---|
| `vendorId` / `productId` | `0x1CA2` / `0x1901` | `0x38A6` / … |
| `usagePage` | `0xFFA0` | `0xFFA8` |
| report id | `0` | `11` |
| magic byte | `0x5C` | none |
| depth unit | **micrometres** | hundredths of a millimetre |

> Anything in [`ADVANCED_KEYS_UI.md`](./ADVANCED_KEYS_UI.md) that mentions
> `fw0320`, mask `10`/`14` or "hundredths of a millimetre" describes the HERO68
> board. It does **not** apply here.

Every byte layout below was checked against a USB capture of the real device.
Anything without a capture is marked **unverified** and is not built by the code.

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

**Checksum:**

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

## 2. Device handshake, profile slot & polling rate (`0x00`)

| query | reply | meaning |
|---|---|---|
| `00 01` (subcmd `0x01`) | `00 01 09 01` | ProtocolVersion **1.0.9** |
| `00 25` (subcmd `0x25`) | `00 25 0a 0a 00 48 0d` | precision 10 µm, min 100 µm, max `0x0D48` = 3400 µm |
| `00 26` (subcmd `0x26`) | ASCII | keyboard name, `WIN 68 HE MAX` |
| `70 <00..03> ff ff` (subcmd `0x70`) | `00 70 <00..03> ff` | select onboard profile 1..4 (`profile_1_2_3_4.pcapng`) |
| `70 04 ff ff` (subcmd `0x70`) | `00 70 <00..03> ff` | read active onboard profile (`4k_to_2k_to_1k.pcapng` #10 → #11) |
| `50 <00..06> ff ff` (subcmd `0x50`) | `00 50 <00..06> ff` | write polling rate (`4k_to_2k_to_1k.pcapng` #0, #636, #996); triggers USB re-enumeration |
| `50 07 ff ff` (subcmd `0x50`) | `00 50 <00..06> ff` | read current polling rate (`4k_to_2k_to_1k.pcapng` #14, #650, #1010) |

### 2.1 Polling rate (`0x00` subcmd `0x50`, LEN 4)

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

> **Note on `0x29`:** In `4k_to_2k_to_1k.pcapng`, `0x29` (`5c 0f 29 c9 | 00…` →
> `5c 0f a9 49 | 00 00 00 d0 07 00…`) returns `d0 07` identically across all three
> polling rates (4000 Hz, 2000 Hz, and 1000 Hz). `0x29` is therefore **not** the
> polling rate command.

### 2.2 ProtocolVersion feature gates

ProtocolVersion gates which advanced-key branch the official app uses:

| branch | range | on 1.0.9 |
|---|---|---|
| `advancedKeyV2` | ≥ 1.0.3 | **on** |
| `socdV3` | 1.0.5 – 1.0.6 | off |
| `SOCDDynamicDelay` | ≥ 1.0.7 | **on** |

---

## 3. Keymap

68 physical keys laid out as a 6 × 21 grid. `pos` (wire key id) is the slot
index. Generated from the firmware table into `src/protocol/xsyd/keymap.ts`;
`wirePosForCode(code)` maps an HID code back to a `pos`.

---

## 4. Per-key field table — `0x23`

`0x23` is **not** a remap opcode. It writes rows of a field table whose 26 slots
each dispatch to a firmware routine:

```
payload[0]           flag: 0 = only slots with pos != 0xFF, 1 = all 14 slots
payload[1 + 4k]      pos    (wire key id)
payload[2 + 4k]      field  (slot index 0x00..0x19)
payload[3 + 4k]      value low
payload[4 + 4k]      value high
```

`LEN` is 0x39 (57 bytes) for a full row of 14 slots. Every accepted field stores
one `u16` per key — which is why DKS, MT, TGL and MPT **cannot** go through this
opcode: they need several values per key.

The field table is documented in `src/protocol/xsyd/features.ts` and verified on
9 captures.

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
| DDKS | **unverified** | `KB2_CMD_DDKS` | **no** (`0x29` is a static config read returning `d0 07` in captures) |
| RS | **unverified** | `KB2_CMD_RS` | **no** |

### 5.1 MT — `0x24`, LEN 7

```
01 | key | hold | 00 | tap | 00 | delay/10
```

| capture | frame |
|---|---|
| `W_MT_holdZ_ClickE_longpresstrigger200ms` | `5c 07 24 d0 \| 01 1a 1d 00 08 00 14` |
| `set_MT_at_W-holdZ-clickE-setMPT_A-…` | `5c 07 24 da \| 01 1a 1d 00 08 00 1e` |

App state for W: `keyValue` 26 (`0x1a`), `MTInfo{DKS:[29,8], Delay:200}` →
hold Z (`0x1d`), tap E (`0x08`). The two `00` never moved; the last byte is
`Delay / 10`, so the unit is **10 ms** and the field is **one byte**.

### 5.2 TGL — `0x25`, LEN 5

```
01 | key | toggle | 00 | delay/10
```

Capture `TGL_V_setZ_logpresstriggerdelay200ms`:
`5c 05 25 cf | 01 19 1d 00 14`. App state for V: `keyValue` 25 (`0x19`),
`TGLInfo{DKS:29, Delay:200}`.

### 5.3 MPT — `0x27`, LEN 14 for 3 steps

```
01 | count(=steps+1) | (code,00) × steps | depth_u16_LE × steps
```

Capture `set_MT_at_W-holdZ-clickE-setMPT_A-0.5mmA,1mmM,1.5mmN`:
`5c 0e 27 cb | 01 04 04 00 10 00 11 00 f4 01 e8 03 dc 05`.

App state for A: `MPTInfo{DKS:[4,0,16], DB:[0.5,1,1.5]}`. Codes sent are
`04, 10, 11` (`DKS[1..]` plus a `0x11` pseudo-key the editor appends); the
key being configured is **not** repeated on the wire. Depths are
**micrometres**: `f4 01` = 500 µm = 0.5 mm.

### 5.4 END — `0x28`, LEN 4

```
01 | key | action | 00
```

Capture `S_END_P`: `5c 04 28 bd | 01 16 13 00`. The editor had **S** selected
(`0x16` = 22) with END action **P** (`0x13` = 19). Reply `0xA8`, LEN `0x38`.

### 5.5 Turning advanced keys off

Write `0x23` with field `0x08` and value `0x0000` for the key. Verified by the
`S_D_F_to-B_C_D_and_revert` capture.

---

## 6. SOCD — `0x2C`, LEN 11

```
flag(01=write) | key1 | key2 | action1(u16) | action2(u16) | type | mode | delay(u16)
```

Capture `socd_AD_on`: `5c 0b 2c c8 | 01 04 07 00 00 00 00 00 00 00 00`, reply
`0xAC`. **Every byte after `key1`/`key2` is zero in the only capture**, so the
meaning of `type`, `mode` and the trailing `u16` is **unverified here**. The
bundled app state calls the two fields `SOCDInfo.type` and `SOCDInfo.mode`;
their value ranges are not proven by any capture. The firmware build in this
repo was also not confirmed to expose a mode switch at those offsets.

Reported (not verified) mode semantics from the upstream app: `0` = last input
wins, `1` = key 1 priority, `2` = key 2 priority, `3` = neutral.

Wire SOCD only with `type = mode = 0`, which is what the capture proves works.

---

## 7. Hall travel & pressed-state stream (`0x12` → `0x92`)

Verified on `travel_test_press_randomkey.pcapng` and firmware disassembly (`VA 0xA758`, `0xA77C`, `0xA7A8`, `0xA802`, `0xC6D8`, `0x12FE8`):

| request (`0x12`, LEN 4) | reply (`0x92`) | payload layout | capture evidence (`travel_test_press_randomkey.pcapng`) |
|---|---|---|---|
| `5C 04 12 A6 \| 03 01 FF FF` | `5C 82 92 A4` (`LEN = 0x82 = 130` B across 3 HID reports) | `00 03 \| u8[126] \| FF FF` — per-key pressed/actuated state at `0x20006A48 + matrixIndex` (`0x00` = released, `0x02` = actuated) | `payload[2 + 92] = 0x02` while `KeyM` (HID `0x10`, `matrixIndex = 92`) is held; `payload[2 + 65] = 0x02` while `KeyS` (HID `0x16`, `matrixIndex = 65`) is held |
| `5C 04 12 A6 \| 02 01 FF FF` | `5C 80 92 A3` (`LEN = 0x80 = 128` B across 3 HID reports) | `00 02 \| u16_le[63]` — travel in micrometres (`0..3400` µm) at `0x200041EC` for `matrixIndex = 0..62` (rows 0–2: `Escape`..`Delete`) | 175 upper-half polls |
| `5C 04 12 A6 \| 02 02 FF FF` | `5C 80 92 A3` (`LEN = 0x80 = 128` B across 3 HID reports) | `00 02 \| u16_le[63]` — travel in micrometres (`0..3400` µm) at `0x2000426A` for `matrixIndex = 63..125` (rows 3–5: `CapsLock`..`ArrowRight`) | `KeyM` (`matrixIndex = 92 = 63 + 29`) ramps `u16_le[29]` from `0` → `3400` µm (`3.400 mm`); `KeyS` (`matrixIndex = 65 = 63 + 2`) ramps `u16_le[2]` from `0` → `1783` µm (`1.783 mm`) |
| `5C 04 12 A6 \| 06 <01\|02> FF FF` | `5C 80 92 A3` (`LEN = 0x80 = 128` B across 3 HID reports) | `00 06 \| u16_le[63]` — filtered 12-bit Hall ADC (`0..4095`) at `0x200042E8` / `0x20004366` | `calibrate_all_keyboard.pcapng` |

Every key's `matrixIndex` (`0..125`, i.e. `row * 21 + col`) is the exact `index` field in `src/protocol/xsyd/keymap.ts` (`XSYD_KEYS`). See `src/protocol/xsyd/hall.ts`.

---

## 8. Global RGB (`0x18` → `0x98`) & Per-key RGB (`0x2A` → `0xAA`)

Verified on `tideflux_softripple_snippingstorm_brightness0-4-3-1-2-0_speed1-2-3-4-0_reverseon-off_colorchangetosmoothflow(multicolor-red-blue).pcapng`, `Q(green)-E(red)_-Z(yellow)-P(Pink).txt`, and firmware disassembly (`VA 0x0AA10`, `0x10DE4`, `0x1D2A0`).

### 8.1 Global RGB (`0x18` → `0x98`)

- **Read request (`LEN = 0x2B = 43`):** `5C 2B 18 D4 | 00 00 00 00 00 <28B palette or FF> 00×10`
- **Write request (`LEN = 0x2C = 44`):** `5C 2C 18 <CK> | 01 00 00 00 00 <28B BGR palette> 00 00 00 00 <flags> <brightness> <mode> <speed> 02 00 <colorIndex>`
- **Reply (`LEN = 0x2D = 45`):** `5C 2D 98 <CK> | 00 00 00 00 00 <28B BGR palette> 00 00 00 00 <flags> <brightness> <mode> <speed> 02 00 <colorIndex> 00`

| Payload offset | Field | Values |
|---|---|---|
| `payload[0]` | Read/Write flag | `0x00` = Read, `0x01` = Write |
| `payload[5..32]` | 7-slot preset palette | `7 × [B, G, R, 0xFF]` (`Red, Green, Yellow, Blue, Purple, Cyan, White`) |
| `payload[37]` | Direction flags | `0x01` = Reverse OFF, `0x03` = Reverse ON (`bit 1`) |
| `payload[38]` | Brightness | `0x00..0x04` (`0%, 25%, 50%, 75%, 100%`) |
| `payload[39]` | External Mode ID | `0x00..0x1A` (`0..26`, mapped via `EXT_TO_INT_ROM` at `VA 0x1D2A0` to internal modes `1..27`) |
| `payload[40]` | Speed | `0x00..0x04` (`SPEED_ROM_TABLE = [0, 37, 53, 79, 143]` at `VA 0x1DA34`) |
| `payload[43]` | Color slot index | `0x00` = Multicolor, `0x01..0x07` = Palette slots 1..7 |

### 8.2 Per-Key RGB (`0x2A` → `0xAA`)

- **Single-key write (`LEN = 0x05`):** `5C 05 2A <CK> | 01 <keyValue> <R> <G> <B>`
  - `Q` (`0x14`, Green `#07FF00`): `5C 05 2A C0 | 01 14 07 FF 00`
  - `E` (`0x08`, Red `#FF0000`): `5C 05 2A C0 | 01 08 FF 00 00`
  - `Z` (`0x1D`, Yellow `#E8FF00`): `5C 05 2A C0 | 01 1D E8 FF 00`
  - `P` (`0x13`, Pink `#FF00CE`): `5C 05 2A 8E | 01 13 FF 00 CE`
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
| DDKS (`0x29`) | `0x29` carries a static config read (`d0 07`) across all captures (including `4k_to_2k_to_1k.pcapng`), while polling rate is `0x00` subcmd `0x50` |

Record-only evidence for every row lives in the external research notes
(`E:\hero68_he_max-re\docs\KNOWN_STATE.md`); this file is limited to what the
code in this repository relies on.
