# AULA WIN 68 HE MAX — Trạng thái nghiên cứu (tổng hợp)

> Tài liệu này gom **toàn bộ những gì đã kiểm chứng bằng byte** từ firmware
> `XS105_SI2828C_WIN 68 HE MAX_App_v1.1.4_20260204a.bin` và vendor updater
> `XSYD_UPDATE_LZ.exe`.
>
> Nguyên tắc: mỗi khẳng định gắn với **địa chỉ VA** và **script verify** kiểm lại được.
> Không có mục nào ở đây là suy đoán mà ghi là "đã biết" — suy đoán nằm riêng ở mục 9.

* Cập nhật: 2026-11-07

* Trạng thái: **static analysis hoàn tất**; phần còn lại chờ capture phần cứng

* Regression: `fw_verify_5c.py` (45) · `fw_verify_keymap.py` (9) · `fw_verify_host.py` (6) · `fw_verify_hall.py` (11) — **tất cả PASS**

## 1. Nhận dạng thiết bị

| Thuộc tính | Giá trị | Nguồn | 
| ----- | ----- | ----- | 
| Sản phẩm | AULA WIN 68 HE **MAX** | `config.ini` | 
| MCU / SoC | XS105 / SI2828C (RISC-V RV32) | tên file firmware | 
| Firmware | `App v1.1.4_20260204a` | chuỗi trong image | 
| Kích thước image | 105 048 byte | file thực tế | 
| Link base | `VA = file_offset + 0x4000` | đã verify qua descriptor + string | 
| VID / PID | `7247` / `61064` (`0x1C4F` / `0xEE88`) | `config.ini` | 
| usage_page | `65440` = **`0xFFA0`** | `config.ini` + descriptor | 
| usage | `1` | `config.ini` | 
| boardID | `100800769` (`0x06021901` — ⚠️ đính chính: bản ghi cũ `0x06021A01` SAI; `hex(100800769) == 0x6021901`) | `config.ini` | 
| Reset vector | `j 0x49E6` | byte đầu image | 

### Điểm vào descriptor HID

VA `0x1C2EC`, chuỗi byte mở đầu `06 A0 FF 09 01 A1 01` — tức
`Usage Page (0xFFA0)`, `Usage (0x01)`, `Collection (Application)`.

> ⚠️ Con số `0x182EC` từng được dùng là **file offset**, không phải VA.
> Đây là nguồn gốc lỗi lặp lại nhiều lần trong các tài liệu trước.

### Board không phải HERO68

MAX **không** dùng giao thức HERO68 (`0x09` / usage_page `0xFF00`).
Mọi opcode HERO68 (`0x98`, `0x2A`, …) không được tái sử dụng — xem mục 10.

## 2. Khung truyền (framing)

MAX dùng framing **XSYD `0x5C`**:

```
byte 0        : 0x5C            (magic)
byte 1        : LEN             (độ dài payload sau checksum)
byte 2        : OPCODE
byte 3        : CHECKSUM
byte 4 ..     : payload         (LEN byte)
byte 4+LEN    : FF FF           (kết thúc)

```

Tổng kích thước khung = `4 + LEN` byte (+2 nếu tính `FF FF`).

### Checksum

```
CHECKSUM = (0x5C + LEN + OPCODE + 0x35 + payload[LEN-1]) & 0xFF

```

Quan trọng: **chỉ cộng byte cuối payload**, không cộng cả mảng.

Bằng chứng: firmware `0xCF6C lb a0, 96(a0)` = `buf[0x60 + LEN]` = `body[LEN-1]`; và 9 phiên capture
khớp **4316/4316** frame (`tools/_verify_gemini3.py`). Ba nhánh đặc biệt:

* `in` và `OP < 0x80` -> `CK = 0x00` (không qua bộ đóng gói `OP |= 0x80`).

* `OP = 0x30` -> `CK = (0x04 + pack[63]) & 0xFF` (slot tham số cố định `0x43` byte).

* `LEN > 60` -> addend nằm ngoài report 64 B: `0x00` với `LEN=0x80`, `0xFF` với `LEN=0x82`
  (subcmd `0x03` của `out 0x12` gắn thêm đuôi `FF FF`).

> ⚠️ Tài liệu cũ ghi checksum là `0x9C`. Đúng phải là **`0x5C`**.

### Reply

`OPCODE_REPLY = OPCODE_REQUEST | 0x80`.

### Truyền qua USB

* Report size: **65 byte**, trong đó byte đầu = report ID, **luôn `0`**
  (host zero hoá byte này trước `hid_write`).

* Stride: `0x40` (64) — khung 65 byte cắt thành report 64 byte dữ liệu.

* Host dùng `mov r8d, 0x41` (65) — có **đúng một** chỗ trong exe.

### Gói mẫu đã kiểm chứng

| Mục đích | Bytes | 
| ----- | ----- | 
| Handshake / ping | `5C 02 0A 9C FF FF` | 
| Get device info | `5C 03 00 92 26 FF FF` | 
| Set echo | `5C 06 01 9F 01 02 03 04 FF FF` | 
| Query (sub 7) | `5C 02 12 A6 07 01` | 
| Query (sub 3) | `5C 02 12 A5 03 00` | 

## 3. Bảng dispatch HID

Bộ phân phối nằm ở `0x9B74`:

1. Kiểm tra `pack[0] == 0x5C`

2. `index = opcode = pack[2]`

3. Nếu `index > 0x2D` → nhảy tới `0xC312` (xem *nhánh out-of-range* bên dưới)

4. Tra bảng tại **`0x1C5F0`** (48 con trỏ, slot `0x00..0x2F`)

5. `c.jr` tại `0x9B72` để nhảy

```
0x9B58  addi a5, zero, 0x2d
0x9B5C  bgeu a5, a1, +8          ; a1 <= 0x2D -> tra bảng
0x9B60  j    +0x27b2 -> 0xC312   ; a1 >  0x2D -> nhánh out-of-range
0x9B64  lui  a4, 0x1c
0x9B66  slli a5, a1, 2
0x9B6A  addi a4, a4, 0x5f0
0x9B6E  add  a5, a4
0x9B70  lw   a5, 0(a5)
0x9B72  c.jr a5

```

> ✅ **Verify `tools/fw_verify_opcodes.py` — 106/106 PASS.**

### `0xC312` — nhánh out-of-range, **không phải stub**

```
0xC312  andi a1, a1, 0xff        ; giữ subcmd
0xC316  j    -0x2756 -> 0x9BC0   ; trả về dispatcher

```

Đây là code thật. Chỉ có **đúng một** lệnh nhảy trực tiếp tới `0xC312` là `0x9B60` (điều kiện `opcode > 0x2D`). Các slot `0x02..0x07`, `0x0B..0x0D`, `0x0F..0x11`, `0x13`, `0x19..0x1F` trỏ tới cùng địa chỉ này, nghĩa là opcode đó **được định tuyến về handler `0x01`** (lệnh hệ thống đa năng) chứ không phải "không tồn tại".

### Bảng handler đầy đủ

| Op | Handler VA | Ghi chú | 
| ----- | ----- | ----- | 
| `0x00` | `0x9BEE` |  | 
| `0x01` | `0xA314` | có bảng sub-command lồng | 
| `0x02`..`0x07` | `0xC312` | → out-of-range path về `0x9BC0` | 
| `0x08` | `0xA412` |  | 
| `0x09` | `0xA5C4` |  | 
| `0x0A` | `0xA624` |  | 
| `0x0B`..`0x0D` | `0xC312` | → out-of-range path | 
| `0x0E` | `0xA6B6` |  | 
| `0x0F`..`0x11` | `0xC312` | → out-of-range path | 
| `0x12` | `0xA758` | GET_CONFIG (xem mục 6) | 
| `0x13` | `0xC312` | → out-of-range path | 
| `0x14` | `0xA874` |  | 
| `0x15` | `0xA89E` |  | 
| `0x16` | `0xA8FA` |  | 
| `0x17` | `0xA924` |  | 
| `0x18` | `0xA930` | SET_CONFIG (xem mục 6) | 
| `0x19`..`0x1F` | `0xC312` | → out-of-range path | 
| `0x20` | `0xAAAE` |  | 
| `0x21` | `0xAB94` |  | 
| `0x22` | `0x9EB8` | nằm trong vùng dispatcher `0x01` | 
| `0x23` | `0xACE0` | tra keymap + `0x1C3F0` | 
| `0x24` | `0xB4BC` |  | 
| `0x25` | `0xB602` |  | 
| `0x26` | `0xB718` | quét matrix (xem mục 7) | 
| `0x27` | `0xB9FE` | quét matrix (twin của `0x26`) | 
| `0x28` | `0xBBFE` |  | 
| `0x29` | `0xC092` |  | 
| `0x2A` | `0xC12E` | flash flush | 
| `0x2B` | `0xC2D2` |  | 
| `0x2C` | `0xBD20` | bank analog 30 kênh | 
| `0x2D` | `0xBF90` | bank analog 30 kênh + reply 29 B | 
| `0x2E` | `0xA564` | `a5=0x16`, gọi `0x981C(a2=2)` | 
| `0x2F` | `0xA572` | `a5=0x50`, gọi `0x981C(a2=3)` | 

### Bảng sub-command của `0x01`

Ba tầng bảng lồng nhau: `0x1C6A8` → `0x1C6C0` → `0x1C6D8`.

* `subcmd 0x01` phản hồi `0x0109`

> ⚠️ Bootloader opcode `0x0C` / `0x0D` / `0x0F` **không có** trong bảng app —
> các slot trỏ `0xC312`, tức là rơi vào nhánh out-of-range. Chúng thuộc
> **bootloader riêng**. Không bao giờ gửi.

## 4. Keymap (68 phím)

### Vị trí

**VA `0x4A20`**, mảng `u16`, **256 entry**, index **là chính byte `pos`** (không nhân 21).

Được tham chiếu từ 5 chỗ, quan trọng nhất:

* `0xB76A` — vòng quét `0x26` (gọi `0x175B8(table, 0, usage)` để lấy `pos`)

* `0xBA52` — vòng quét `0x27`

Cả hai dùng `lui a5, 5` + `addi a5, a5, -0x5e0` = `0x4A20`.

> ⚠️ Bản cũ của mục này ghi "index `21..119`, `row × 21 + col`" — **sai**.
> Phép `× 0x15` chỉ dùng cho bản sao SRAM tại `0x5E8` (xem `0xAC82`, `0xACE0`),
> không dùng cho bảng flash `0x4A20`. Kiểm chứng: `tools/pos_map.py` in 198 entry
> có mặt; 4 key RGB trong capture nằm ở `0x14/0x08/0x13/0x1D` mà theo cách đọc
> cũ đều ra `0x0000`.

### Số phím thực

Bảng có **198 entry khác 0**, trong đó **68** là phím vật lý, phần còn lại là
mask/action code (`0x0001` = bit dự trữ, `0xF1xx`/`0xF3xx` = app/media/macro).

### Nội dung (pos → HID usage)

| pos | Phím | pos | Phím | pos | Phím | 
| ----- | ----- | ----- | ----- | ----- | ----- | 
| `0x15` | Esc | `0x2A` | Tab | `0x54` | LShift | 
| `0x16..0x1F` | 1..9, 0 | `0x2B..0x34` | Q W E R T Y U I O P | `0x56..0x5A` | Z X C V B | 
| `0x20..0x23` | `-` `=` Bksp Insert | `0x35..0x38` | `[` `]` `\` Delete | `0x5B..0x5F` | N M `,` `.` `/` | 
| `0x3F` | CapsLock | `0x4C` | Enter | `0x60` | RShift | 
| `0x40..0x4A` | A S D F G H J K L `;` `'` | `0x4D` | Home | `0x61` / `0x62` | Up / PgDn | 
| `0x69..0x6B` | LCtrl LWin LAlt | `0x6F` | Space | `0x72..0x77` | RAlt Fn RCtrl Left Down Right | 
| `0x93..0x9F` | PgUp, F1..F12 |  |  |  |  | 

Giá trị = **HID usage** (`0x29` Esc, `0x04` A, `0xE0..0xE6` modifiers),
**trừ `0xF001`** ở pos `0x73` (thực tế là phím **Fn**) — action code riêng của firmware.

### Bảng `row × 21 → pos` (`VA 0x5E44`)

Nguồn thứ hai xác nhận `pos`: 6 hàng × 21 cột, mỗi khe là 1 byte `pos`, khe trống = `0xFF`.
**Byte offset = `row*21 + col`** (không phải `pos`), tức `pos` nằm ở đây, không phải index bảng.

```
row0: 20 21 22 23 24 25 26 27 28 29 2a 2b 2c 2d 2e ff 40 41 42 43 44   (5x5 mac, Home PgUp Del End PgDn)
row1: 45 46 47 48 49 4a 4b 4c 4d 4e ff 60 61 62 63 64 65 66 67 68 69   (Tab Q..O, FF, [ ] \ Delete F1..F6)
row2: 6a 6b 6d 6e ff ff 80 82 83 84 85 86 87 88 89 8a 8b 8c 8d 8e ff   (Caps A S D, FF FF, H J..F12)
row3: ff a0 a1 a2 a6 a9 aa ab ac ad ae ff ff ff ff ff ff ff ff ff ff   (LShift Z X C V B N M , . /)

```

Bảng có **71 byte có nghĩa** (row 0..3, dừng ở index 66); `0x5E44+67` trở đi
(`row3[12]`, `row4`, `row5`) là **code**, không phải bảng.

> ⚠️ Đừng dùng `0x5E44` làm bảng tra `pos → phím`: các `pos` của hàng 4/5
> (`0x69..0x77` Ctrl/Win/Alt/Space/Fn/RCtrl/Arrow) **không có trong bảng**.
> Dùng `0x4A20` (mục trên) để tra `pos → usage`.

### Sinh code tự động

`tools/fw_gen_keymap.py` đọc thẳng byte firmware → sinh
`OpenAula-main/src/protocol/xsyd/keymap.ts` (68 entry), kèm test 6/6.

> ⚠️ Chỉ 67 giá trị distinct (F1 = `0xF001` nằm ngoài dải HID, và index 98
> PageDown từng bị bỏ sót khi đánh tay). Luôn đối chiếu bằng script, không copy tay.

## 5. Bảng dữ liệu ROM

| Bảng | VA | Kích thước | Ý nghĩa | 
| ----- | ----- | ----- | ----- | 
| EXT_TO_INT | — | — | chuyển usage ngoài → trong | 
| SPEED | — | — | tốc độ hiệu ứng | 
| BRIGHT | — | u16\[\] | độ sáng | 
| SIN_LUT | `0x1CAC8` | 182 B | sin, bước 0.5° | 
| ATAN2 | — | 42×42 | dùng cho LED RGB 2D | 
| Mode table | `0x1C994` | 28 × 8 B | 28 cặp `(init u32, tick u32)`; tick `0` ở mode 0 | 
| Usage→action | `0x1C3F0` | 230 × u16 | xem bên dưới | 
| Flash flush magic | `0xC18E` | `FE FE FE FE` | dùng bởi `0x2A` | 

### Bảng `0x1C3F0` — HID usage → action

**Không phải** bảng vị trí phím. Index là **HID usage**, giá trị là action:

* 168 hàng identity (`usage → same usage`)

* `0xF001..0xF003` tại slot 1..3 (F1/F2/F3)

* media `0x5081`, `0x5082` tại slot `0xA5`, `0xA6`

* macro `0x10CD..0x122A` từ slot `0xAD`

### Bảng Descriptor NVRAM

| Vùng | VA | Ghi chú | 
| ----- | ----- | ----- | 
| Descriptor chính | `0x43C0` | 38 record × 16 B | 
| Terminator | `0x462C` |  | 
| `Ticks` / `gdBi` | `0x4E10` | \+ terminator `0x4E30` | 
| Tên trường (string) | `0x1D2CC..0x1D430` |  | 

> ⚠️ `0x192CC` **không phải** string — đó là code. Vùng đúng là `0x1D2CC`.

## 6. Opcode cấu hình: `0x12` (GET) / `0x18` (SET)

### `0x12` — GET_CONFIG, **không phải** GET_HALL

Handler `0xA758`, chia nhánh theo `pack[4]` (`table_id` = **2..9**) qua bảng `0x1C6C0`.

Mỗi nhánh chọn một con trỏ SRAM + số record:

| table_id | Con trỏ SRAM | Records | 
| ----- | ----- | ----- | 
| 2 | `0x200041EC` | 2 | 
| 3 | `0x2000426A` | 3 | 
| 4 | `0x200043E4` | 5 | 
| 5 | `0x20004462` | 5 | 
| 6 | `0x200042E8` | 6 | 
| 7 | `0x20004366` | 6 | 
| 8 | `0x20007AC6` | 7 | 
| 9 | `0x20007A02` | 7 | 

Cả 8 nhánh đều đổ vào 3 **field accessor**:

* `0xD0CE` — ghép 4 byte từ struct offset `{0x80, 0xA0, 0xC0, 0xE0}` → u32

* `0xD104` — ghép 2 byte từ `{0x80, 0xA0}`

* `0xD11C` — đọc 1 byte từ `0x80`

Index là **byte offset**, base là struct config tại `0x20003198`.
→ `0x12` trả **trường cấu hình**, không trả dữ liệu Hall.

Byte thật tại `0xD0CE`: `dc 31` (0xA0), `dc 21` (0x80), `e8 21` (0xC0), `e8 31` (0xE0).

### `0x18` — SET_CONFIG

Handler `0xA930`. Ghi từng trường vào struct `0x20003198`:

```
offset +0x04 ← get(1)     offset +0x18 ← get(0x15)
offset +0x08 ← get(5)     offset +0x1C ← get(0x19)
offset +0x0C ← get(9)     offset +0x20 ← get(0x1D)
offset +0x10 ← get(0x0D)  offset +0x24 ← get(0x21)
offset +0x14 ← get(0x11)  offset +0x2A/0x2C ← get(0x26/0x27)

```

Mỗi lần đọc dùng accessor ở mục trên.

## 7. Quét matrix và dữ liệu Hall

### Hai vòng quét

| Handler | Vòng lặp | Stride | Số kênh | 
| ----- | ----- | ----- | ----- | 
| `0x26` (`0xB720`) | `s0 = 1, 0x12, 0x23, …` | `0x11` (17) | 4 lane/kênh | 
| `0x27` (`0xBA06`) | `s1 = 1, 0x0E, 0x1B, …` | `0x0D` (13) | 4 lane/kênh | 

Cả hai gọi `lbu` từ SRAM rồi `& 7` để chọn lane, và index keymap `0x4A20`.

> 🔧 Lưu ý công cụ: capstone 5.0.9 **decode sai `0x1221`** thành `c.fldsp`.
> Byte đúng là `c.lwsp a0, 0x104(sp)`. Luôn đối chiếu raw byte.
>
> 🔧 Và capstone in target `jal` là **imm thô**, không phải `PC + imm`.
> Ví dụ `0xA8A2` byte `ef20d002` → tool in `0x282c`, thật ra là `0xD0CE`.
> `tools/fw_va.py` đã sửa bằng `jal_target()`.

### Bộ đệm ADC và dòng dữ liệu travel (verify `0x12FE8..0x13420`)

Vòng quét **chính** là `0x12FE8` (không phải `0x26`/`0x27` — hai handler đó chỉ *đọc* kết quả đã nằm trong SRAM).

| Thành phần | Địa chỉ / địa chỉ SRAM | Ghi chú | 
| ----- | ----- | ----- | 
| **ADC raw buffer** | `0x200055F4 + group×21 + lane` | 6×21 = **126 u16** = 252 B, `0x200055F4..0x200056EF` | 
| Đọc raw | `0x130D2` `lhu s11, 0(a6)` | `a6 = 0x20004AFE + 0xAF6 + s3×21 + s2` | 
| Đếm ô | `0x1335A` `addi a5, zero, 0x7e` | **126 kênh ADC**, không phải payload | 
| Bước group | `0x13358` `c.addi s3, 0x15` | `s3 += 21` | 
| Base 5 mảng kết quả | `0x20004AFE` | = `0x200055F4 − 0xAF6` | 

Năm mảng song song (offset trong spec ghi **dạng ×2** là nhầm — đây là offset byte thật):

| Offset | Địa chỉ tuyệt đối | Kiểu | Ý nghĩa (suy ra từ dùng) | 
| ----- | ----- | ----- | ----- | 
| `+0x430` | `0x20004F2E` | u16 | raw / range | 
| `+0x4A8` | `0x20004FA6` | u16 | calibrated min | 
| `+0x528` | `0x20005026` | u16 | **travel value** | 
| `+0x5A8` | `0x200050A6` | u16 | dead zone | 
| `+0x5E8` | `0x200050E6` | u8 | flags (nibble thấp = `key_mode`) | 

**Không có "bảng tra travel → 0.00..4.00 mm" hay "LUT tuyến tính hoá" nào trong image.** Travel là phép tính số học từ raw + min:

* `0x1314C`: `a3 = a0 + a2` (raw + offset), kẹp trần `0x7FF`

* `0x13148`: nếu vượt ngưỡng thì `a4 = 0x7FF`

* `0x13176`: `t5 = a4 − t5`, `sh t5, 0(a3)` — ghi travel

### Bảng `0x1CB80` — atan2 42×42, **không** phải bảng travel

`0x11368`: `a5 = 0x1D000 − 0x480 = 0x1CB80`, `mul a4, dx, 42`, `a5 + a4 + dy`. Toàn bộ `0x1CB80..0x1D263` (1764 B).
Kiểm chéo: `row0 = [0, 179×41]`, `diag[0..40:4] = 89` (≈45° trong thang 180). ✔ khớp spec.

### Reply của `0x2D`

Quét `s9 = 1, 3, 5, …, 0x3B` (30 bước 2) rồi đóng gói qua **`0xCD72`**:

```
0xCD72:  byte 0     ← 0x5C
         byte 1     ← LEN
         byte 2     ← OPCODE
         byte 3     ← 0 (sẽ tính checksum)
         payload    ← 1 mảng lbu + 1 mảng sh

```

Payload dài **29 byte** (`0x1D`). Số **30** này là 6 group × 5 lane — **một tập con** của 126 kênh ADC, không phải toàn bộ.

### Bảng sector flash theo profile — `0x4340` (verify `tools/fw_verify_nvram.py`, 29/29 PASS)

Đây là thông tin **quan trọng nhất** cho OpenAula: mỗi profile lưu ở một sector flash riêng, **không** phải SRAM.

```
0x4340..0x439C  24 word, giảm dần (mỗi word = 1 sector 1 KiB):
    0x08038000  0x08037000  0x08035000  0x08034000  0x08033000  0x08032000
    0x08031000  0x0802F000 0x0802E000  0x0802D000  0x0802C000  0x0802B000
    0x08029000  0x08028000 0x08027000  0x08026000  0x08025000  0x08023000
    0x08022000  0x08021000 0x08020000
    0x08003F00  0x08003E00 0x08000000

```

* Tất cả căn sector 1 KiB (`& 0xFF == 0`), nằm trong cửa sổ flash `0x08000000..0x08040000`.

* `0x0802B000` → `0x08025000`: **`0x0802A000` và `0x08024000` bị bỏ** (không suy đoán mục đích).

* Toàn bộ 24 chữ được quét hết: **chỉ `0x11B74..0x11C36` và `0xD236` / `0xD4DC`** đọc bảng này. Không có chỗ nào khác.

Cách bảng được dùng — `0x11B5E` là **switch** trên `a0` (đã hiệu chỉnh target = PC + imm thô):

```
0x11B5E  c.li   a5, 1
0x11B60  beq    a0, a5, 0x48   -> 0x11BA8
0x11B64  c.beqz a0, 0x10       -> 0x11B74
0x11B66  c.li   a5, 2
0x11B68  beq    a0, a5, 0x70   -> 0x11BD8
0x11B6C  c.li   a5, 3
0x11B6E  beq    a0, a5, 0x9a   -> 0x11C08
0x11B72  c.jr   ra             ; default: không nạp gì

```

Mỗi khối nạp theo dạng:

```
c.lui  a4, 4                 ; a4 = 0x4000
lw     a4, OFF(a4)           ; OFF = 0x390, 0x38C, 0x388, 0x384, 0x380  (khối 0)
sw     a4, TARGET(gp)        ; TARGET ∈ {-0x7e8, -0x7ec, -0x7e4, -0x7d8, -0x7dc}

```

Các khối **chồng lên nhau** và **rơi xuống khối kế tiếp** (`c.j 0x18`, `c.j 0x0`), nên giá trị cuối cùng của mỗi ô `gp` là giá trị ghi sau cùng. Đọc đúng theo byte:

| `a0` | Vào từ | `gp-0x7d8` | `gp-0x7ec` | `gp-0x7e8` | `gp-0x7e4` | `gp-0x7dc` | 
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | 
| 0 | `0x11B74` | `0x08026000` | `0x08027000` | `0x08028000` | `0x08023000` | `0x08025000` | 
| 1 | `0x11BA8` | `0x0802C000` | `0x0802D000` | `0x0802E000` | `0x08029000` | *(không ghi)* | 
| 2 | `0x11BD8` | `0x08032000` | `0x08033000` | `0x08034000` | `0x08035000` | *(không ghi)* | 
| 3 | `0x11C08` | `0x08032000` | `0x08033000` | `0x08034000` | `0x08035000` | *(không ghi)* | 

→ **`gp-0x7e8` chỉ nhận 3 giá trị: `0x08028000` / `0x0802E000` / `0x08034000`**. Đây là const trên `a0 ∈ {0,1,2,3}` (case 2 và 3 trùng nhau).

> ⚠️ **Đính chính.** Ba bản trước của mục này đều sai:
>
> 1. "`gp-0x7e8 = 0x08020000`" — sai, `0x08020000` không bao giờ được `sw` vào slot nào.
>
> 2. "4 khối × 5 sector = 20 profile, mỗi khối 5 sector cố định" — sai. Các khối chồng nhau và rơi xuống nhau, nên giá trị cuối của `gp-0x7e8` cho case 0 là `0x08028000` (ghi ở `0x11BC2`), không phải `0x08022000`.
>
> 3. "`0x0802B000`/`0x08031000`/`0x08037000` thuộc khối 1/2/3" — sai, chúng **không bao giờ** được `sw` (khối 1 nhảy `c.j -0x34` về `0x11B8E`; khối 2/3 nhảy `c.j -0x64` / `c.j -0x94` về `0x11BA2` / `0x11BB2`). Chúng chỉ tồn tại trong bảng tại `0x4370` / `0x4380` / `0x4340`.

**Chưa xác minh được (byte không nói):**

* `a0` được truyền từ đâu — 4 khối **không có call site `jal`**, chúng chỉ là đích của một bảng con trỏ chưa tìm thấy.

* Do đó **không có bằng chứng "sector nào thuộc profile số mấy"**. Chỉ chắc: `gp-0x7e8 ∈ {0x08028000, 0x0802E000, 0x08034000}` theo `a0`. Thứ tự profile do app/WebHID quyết định → phải capture mới chốt được.

* `0x08003F00` (`0x4394`), `0x08003E00` (`0x4398`), `0x08000000` (`0x439C`), `0x08038000` (`0x4340`) chỉ được `0xD4DC`/`0xD236` đọc; không khối nạp nào `sw` vào `gp`.

`gp-0x7e8` sau đó là **base** cho `0x11DE8` — hàm sao chép 4 khe `0x100` byte giữa RAM và flash:

| Khe | Offset trong sector | Độ dài | 
| ----- | ----- | ----- | 
| 0 | `+0x000` | `0x100` | 
| 1 | `+0x100` | `0x100` | 
| 2 | `+0x200` | `0x100` | 
| 3 | `+0x300` | `0x100` | 

Đường `user_rgb` (opcode `0x2A`, per-key RGB): `0xC20E` → `0x11D70` → `0x11DE8`, sao chép:

* `0x20001EF8` (size `0x100`) ↔ khe

* `0x20001FF8` (size `0xFC`) ↔ nửa sau

**Hệ quả cho OpenAula:** màu per-key tồn tại ở hai tầng — RAM (`user_rgb`, bị `0xED5E` xoá mỗi lần đổi mode) và flash (sector đang chọn, bền qua reboot). Ghi màu phải đi qua đường `0x2A` của firmware để cả hai cùng cập nhật; không được ghi thẳng SRAM.

> **Đã chốt bằng capture** (`Q(green)-E(red) -Z(yellow)-P(Pink).pcapng`) — xem §7.5.

## 7.5. Giao thức ghi màu & remap (đã giải từ capture)

### `0x2A` — ghi màu 1 phím

Handler `0xC12E`. Frame `out`:

```
5C 05 2A CK | 01 <usage> R G B

```

| Byte | Ý nghĩa | Bằng chứng | 
| ----- | ----- | ----- | 
| `body[0]` | `src` — luôn `0x01` trong capture (`s1` ở `0xC14E`) | 4/4 frame | 
| `body[1]` | **HID usage của phím** (không phải `pos`) | `0x14`→Q, `0x08`→E, `0x1D`→Z, `0x13`→P | 
| `body[2..4]` | `R`, `G`, `B` thô | `#07FF00` `#FF0000` `#E8FF00` `#FF00CE` | 

Firmware dựng `u32` tại `0xC26E..0xC2BE`:

```
s0 =  (R << 16) | (G << 8) | B      ; 0xC276..0xC2AE
reg64[k] = (s0 << 25) | (G << 17) | (B << 9)   ; 0xC2B0..0xC2BE

```

`k` = `body[1]`. Reply `0xAA` (`len 57`) là **echo 13 record × 4 B**, `body[0..4]` lặp lại request.
Report `0xAA` còn chứa cả bảng 68 khoá → đọc được trạng thái màu hiện tại.
(Prompt đã dùng để đối chiếu chéo: `docs/aula_win68_he_max_led_protocol.md`, kết quả trùng khớp.)

Kết quả kiểm (`tools/verify_rgb_capture.py`, 4/4 OK):

| Phím | usage | RGB | Màu | 
| ----- | ----- | ----- | ----- | 
| Q | `0x14` | `#07FF00` | green | 
| E | `0x08` | `#FF0000` | red | 
| Z | `0x1D` | `#E8FF00` | yellow | 
| P | `0x13` | `#FF00CE` | pink | 

> Không cần bật mode trước: cả 4 lệnh đều gửi thẳng trong lúc mode hiện hành giữ nguyên (`0x30` chỉ là keep-alive).
> Không có frame `0x2B` chọn batch, nên `0x2A` ghi 1 phím độc lập.

### `0x2A` — bảng phím 5 batch (`payload[0] = 0x00`)

Ngoài ghi lẻ 1 phím, `0x2A` còn gửi **cả bảng 68 khoá** với `LEN = 0x39` (57 B),
`payload[0] = 0x00`. Capture `profile_1_2_3_4.pcapng` ghi đủ 5 batch
(`tools/verify_rgb_batches.py`, 5/5 OK):

| Batch | Nội dung | Usage | 
| ----- | ----- | ----- | 
| 0 | Esc 1..0 `-` `=` Backspace | `29 1e..27 2d 2e 2a` | 
| 1 | Insert Tab Q..P `[` `]` | `49 2b 14 1a 08 15 17 1c 18 0c 12 13 2f 30` | 
| 2 | `\` Delete CapsLock A..L `;` `'` | `31 4c 39 04 16 07 09 0a 0b 0d 0e 0f 33 34` | 
| 3 | Enter PgUp LShift Z..M `,` `.` `/` RShift | `28 4b e1 1d 1b 06 19 05 11 10 36 37 38 e5` | 
| 4 | Up PgDn LCtrl Win Alt Space RAlt **Fn(`0x01`)** RCtrl Left Down Right | `52 4e e0 e3 e2 2c e6 01 e4 50 51 4f` (+`38 e5` lặp batch 3) | 

> Batch 4 lặp `0x38 0xE5` trong 2 slot cuối, nên 5×14 = 70 slot cho **68 phím**.
> **Fn = `0x01`** trong bảng này (không phải `0xF001` như bảng action firmware).

### `0x00` — chọn profile 1..4

```
5C 04 00 CK | 70 <index> FF FF

```

`index` = `0x00..0x03` (profile 1..4). Bằng chứng: `profile_1_2_3_4.pcapng` chạy
đúng 4 lượt ghi bảng phím, và **chỉ có đúng 4** request `0x00` khác nhau, theo
đúng thứ tự `70 00`, `70 01`, `70 02`, `70 03` (`tools/verify_profile_selector.py`).

`0x18` / `0x19` / `0x29` **giống hệt nhau** trong cả 4 lượt, nên **không** phải selector.

### `0x2C` — cặp phím (SOCD / linked pair)

```
5C 0B 2C CK | <flag> <pos1> <pos2> <act1 lo hi> <act2 lo hi> <type> <mode> <extra lo hi>

```

> 🔴 **Đính chính 2026-11-05** (trước đó ghi "`0x2C` chỉ gán 1 phím, không có mode").
> Handler `0xBD20` đọc **8 trường** của body — `pos1`=`pl[1]`, `pos2`=`pl[2]`,
> `act1`=u16 `pl[3..4]`, `act2`=u16 `pl[5..6]`, `type`=`pl[7]`, `mode`=`pl[8]`,
> `extra`=u16 `pl[9..10]` — tổng **11 byte**, đúng độ dài `socd_AD_on.pcapng`.
> Script `tools/fw_verify_socd.py` kiểm 10/10 điểm.

Ghi vào 4 bank SRAM dùng chung với bảng field (§7.6), index
`(pos >> 5) * 0x15 + (pos & 0x1f)`:

| bank | nội dung | lệnh chứng minh | 
| ----- | ----- | ----- | 
| `+0x430` | `(pos1 << 8) | pos2` (16-bit) | `c.slli s0,8` @`0xBDBC`, `c.slli s0,16`/`c.srli s0,16` @`0xBDCE`/`0xBDD4` | 
| `+0x4A8` (+12) | `act1` (u16) | `addi a2, a1, 0x4a8` @`0xBDE8` | 
| `+0x528` (+8) | `act2` (u16) | `addi a2, a1, 0x528` @`0xBDF2` | 
| `+0x5A8` (+4) | `(type << 8) | mode` | `addi a2, a1, 0x5a8` @`0xBE06` | 
| `+0x628` | `extra` (u16) | `addi a5, a1, 0x628` @`0xBE6E` | 

và set `key_mode = 7` (`c.andi a6,-16` + `ori a6,a6,7` @`0xBF28`, store
`sb a6, 0x5e8(a4)`).

> ✅ **Đã chốt toàn bộ 4 mode SOCD (`payload[8] = mode`) từ `socd_ad_keyinredboxAtakeprecedence_keyinblueboxDtakeprecedence_neutral(changes3modein1capture).pcapng` và disasm `VA 0x14CA0..0x153FC` + `VA 0x1622E..0x162FA`:**
> - `mode = 0x00`: **Last input priority** (`socd_AD_on.pcapng`: `5C 0B 2C C8 | 01 04 07 00 00 00 00 00 00 00 00`)
> - `mode = 0x01`: **Key 1 priority** (phím ô đỏ ưu tiên, `#29461`: `5C 0B 2C C8 | 01 04 07 00 00 00 00 00 01 00 00`)
> - `mode = 0x02`: **Key 2 priority** (phím ô xanh ưu tiên, `#59268`: `5C 0B 2C C8 | 01 04 07 00 00 00 00 00 02 00 00`)
> - `mode = 0x03`: **Neutral** (triệt tiêu cả hai khi nhấn đồng thời, `#86416`: `5C 0B 2C C8 | 01 04 07 00 00 00 00 00 03 00 00`)

`0x2D` là nhánh "linked pair" đi kèm: loop 29 bước (`addi ..., 59` @`0xBFF0`), bắt
đầu từ `pl[1]`, `c.andi a5,-16` + `ori a5,a5,9` @`0xC066`/`0xC068` → `key_mode = 9`
(`tools/fw_verify_socd.py` PASS).

> ⚠️ **`socd_AD_on.pcapng` KHÔNG có frame nào khác** (`tools/summary_ops.py`):
> cả capture chỉ có **1** `0x2C` (`01 04 07 00 …`) và 1 `0x30` (bảng LED),
> không có `0x23`, không có `0x2D`. Vậy "bật SOCD A/D trên app" **không tạo**
> thêm byte `type/mode/extra` nào đáng kể và không có lệnh Apply riêng —
> firmware lưu ngay frame đó. Kết luận: **app ghi SOCD đúng bằng `0x2C` với
> `type=mode=extra=0`**, và câu "chỉ là remap A→D" của tài liệu ngoài vẫn chưa
> được chứng minh lẫn chưa bị bác; hai cách đọc cùng khớp 1 mẫu.
> Cần **thêm** capture: bật A/D, rồi đổi sang mode khác (ví dụ "last wins" →
> "neutral"), rồi tắt SOCD — khi đó byte thứ 7..10 mới lộ nghĩa.
> Nếu người dùng khẳng định app đã "save luôn" mà byte lại giống hệt remap,
> thì khả năng cao nhất là bàn phím đọc `type/mode` từ ngân hàng khác
> (query lại bằng `0x2C` reply hoặc `0x12`), cần capture lúc **reconnect**
> để thấy app có đọc lại hay không.

### `0x19` — 43 byte, chỉ có 1 giá trị trong mọi capture

`00 00 00 00 00` rồi 28 byte `FF`, rồi 10 byte `00`. Không đổi giữa các capture
(cả `connect_keyboard_to_webhidofficial` lẫn `profile_1_2_3_4`), nên **không phải**
chỗ chứa SOCD/actuation.

### `0x29` — đọc cấu hình, không ghi

Request 15 byte toàn `0x00`, reply `0xA9` trả `00 00 00 <u16> …` với `<u16>` là
`d0 07` (2000) hoặc `f4 01` (500) little-endian. Chỉ xuất hiện 2 giá trị trên mọi
capture → là **poll rate / timer**, không phải profile hay actuation.

> ✅ **Đính chính 2026-11-05.** Câu "SOCD và actuation không có endpoint ghi" đã
> **sai**. Actuation đi qua `0x23` field 4; SOCD là `0x2C`/`0x2D` (mục trên).
> Xem `tools/fw_verify_socd.py` (10/10) và §7.6.

### `0x23` — ghi **bảng field per-key** (remap, actuation, deadzone, switch…)

```
5C 39 23 CK | <flag> <14 × [pos, field, lo, hi]>

```

> 🔴 **Đính chính 2026-11-05.** `0x23` **không** phải lệnh remap. Handler `0xACE0`
> đọc `body[2]` làm **field id**, tra jump table `0x1C744`, và mỗi field ghi vào
> một mảng SRAM riêng, index `(pos >> 5) * 0x15 + (pos & 0x1f)` (§7.6).
> Remap chỉ là **field 0**. Actuation là **field 4**, header `0x20` là **field 8**.

`flag` = `body[0]`: `0x00` → chỉ ghi các slot có `pos != 0xFF`; `0x01` → quét cả 14 slot.
Slot không dùng đánh dấu `ff ff 00 00`.

### Bảng field `0x1C744` — 26 field, chốt từ firmware + capture

| field | cell SRAM (u16) | Ý nghĩa | Giá trị quan sát | 
| ----- | ----- | ----- | ----- | 
| 0 | `0x20003410` (byte) | **remap** — action code của phím | `0x16→0x05` (S→B), `0x07→0x06` (D→C), `0x09→0x07` (F→D) | 
| 1 | `0x20003510` | dự phòng (đồng bộ shift/AltGr) | `0` | 
| 2 | `0x20003610` | dự phòng | `0` | 
| 3 | `0x20003700` | dự phòng | `0` | 
| 4 | `0x20003410` | **actuation travel** (µm) | WASD `1000`, Space `1510`, M/N `200` | 
| 5 | `0x20003510` | dự phòng | `0` | 
| 6 | `0x20003660` | dự phòng | `0` | 
| 7 | `0x20003660` | dự phòng | `0` | 
| **8** | `flags & 0x3f` | **header / mã phím (đọc)** | luôn `0x20` khi ghi các field khác | 
| 9 | `0x20003A80` (Hall `0x430`) | ADC raw | `0` | 
| 10 | `0x20003B70` (Hall `0x4A8`) | calibrated min | `0` | 
| 11, 19 | `0x20003C70` (Hall `0x528`) | travel value | `0` | 
| 12 | `0x20003D70` (Hall `0x5A8`) | dead zone | `0` | 
| 13..16 | `0x7e / 0xfc / 0x17a` | dự phòng (byte) | `0` | 
| 20 | `0x20003800` | dự phòng | `0` | 
| 21 | `0x20003900` | dự phòng | `0` | 
| **22** | `0x20003660` | **rapid trigger (RT)** (µm) | `100` | 
| **23** | `0x20003660` | **RT thứ hai / misclick window** (µm) | `100` | 
| 24 | `0x20003660` | (bị capture `connect_*` ghi `0`) | `0` | 
| **25** | `0x20003660` (byte) | **loại switch** | `0` từ, `1` magnetic, `2`, `3` | 
| 48 | loop | quét cả 14 slot | — | 

Bằng chứng:

* `tools/probe_key_fields.py` — in cell SRAM của từng field từ disasm handler.

* `tools/verify_field_table.py` — 11 check PASS: hình dạng frame, 26 field đều
  có trong capture, remap S/D/F, actuation map, switch map.

**Field 25 = switch type**, chứng cứ trực tiếp: capture
`change_A_Zjadepro_Q_toblackemperor_WtoTTCKING_E-to_yongchun_switch.pcapng` ghi
lần lượt `A→1, Z→1, Q→2, W→3, E→0` — đúng tên file "yongchun switch" (E quay về
switch gốc). Vì vậy **A = từ (magnetic switch)**, `0` = mặc định.

**Field 22/23**: capture actuation tên `…MN0.2RT(misclickset2times)deadzone0.1`
ghi `100` (= 0.1 mm) cho cả hai → một là RT, một là deadzone/misclick. Chưa đủ
byte để tách rời chắc chắn cái nào là cái nào, **nên không gán bừa trong code**.

### Actuation: công thức và đơn vị

Record `pos, 04, LO, HI` → `travel = LO | HI << 8`, đơn vị **µm (1/1000 mm)**:

| Phím | Giá trị | mm | Khớp tên file | 
| ----- | ----- | ----- | ----- | 
| W A S D (`0x1a 0x04 0x16 0x07`) | `1000` | 1.000 | `wasd1.0` ✔ | 
| Space (`0x2c`) | `1510` | 1.510 | `space1.5` ✔ | 
| N M (`0x11 0x10`) | `200` | 0.200 | `MN0.2` ✔ | 

`tools/verify_actuation_capture.py` → 0 failure.

> ⚠️ **Đính chính câu cũ "SOCD và actuation không có endpoint ghi".** Actuation
> **có**: 6 frame `0x23` field 4. SOCD **cũng có**: `0x2C` (cặp phím, 11 byte) và
> `0x2D` (linked pair) — xem §7.5 và `tools/fw_verify_socd.py`.

### `0x23` — ghi remap (field 0), dạng cũ vẫn đúng để tham khảo

Kiểm bằng `S_D_F_to-B_C_D_and_revert.pcapng` (`tools/verify_remap_capture.py`, 3/3 OK):

| Frame | Nội dung | Kết quả | 
| ----- | ----- | ----- | 
| 0 | `pos 0x16 -> 0x05` | **S → B** | 
| 1 | `pos 0x07 -> 0x06` | **D → C** | 
| 2 | `pos 0x09 -> 0x07` | **F → D** | 
| 3..7 | 68 record `pos == usage` | gửi lại bảng mặc định (revert) | 

> Khớp tên file: S,D,F → B,C,D.

### `0x2B` / `0xAB` — đọc batch

`out 0x2B len=3 body=[00, lo, hi]` chọn batch, `in 0xAB len=45` trả `[00, lo, hi]` + 14 record.
Capture dùng `(00,01)`, `(02,03)`, `(04,05)` để đọc 3 batch = 42 record.
Bảng remap đầy đủ 68 khoá gồm 5 batch `(00,01) (02,03) (04,05) (06,07) (08,09)`.

## 7.6. Bảng field per-key — toàn bộ tính năng nâng cao (`0x23`)

Handler `0xACE0`. Đây là **lệnh duy nhất** mà app dùng để ghi mọi thuộc tính
theo từng phím. `body[2]` = field id, tra jump table `0x1C744`.

### Cơ chế

```
0xACE0  pl[0] → s7            ; 0 nếu không phải "batch"
0xAD12  pos   = D11C(1+4k)    ; body[1+4k]
0xAD24  field = D11C(2+4k)
0xAD38  value = D104(3+4k)    ; u16 LE, 2 byte
0xAD54  pos   = 175B8(0x4A20, 0, pos)   ; pos ↔ usage
0xADB8  bltu 0x19, field      ; field > 25 → rơi vào 0xB4AE (clear slot)
0xADC8  jr    [0x1C744 + field*4]

```

Cell SRAM = `0x20003220 + 2 * ((pos>>5)*0x15 + (pos&0x1f) + WINDOW)`,
tức **mỗi field là một mảng u16 6×21** — cùng layout với mảng Hall.

### Bảng field (26 slot, 23 handler thật)

| field | handler | cell window | Ý nghĩa (chốt) | 
| ----- | ----- | ----- | ----- | 
| `0x00` | `0xB1F8` | `0x20003410` | **remap** — action code (byte), tra `0x4A20` | 
| `0x01`, `0x05` | `0xB216`, `0xB372` | `0x20003510` | dự phòng (nhóm shift/AltGr) | 
| `0x02` | `0xB234` | `0x20003610` | dự phòng | 
| `0x03` | `0xB252` | `0x20003700` | dự phòng | 
| `0x04` | `0xB34A` | `0x20003410` | **actuation travel (µm)** | 
| `0x06`, `0x07` | `0xB39A`, `0xB3C2` | `0x20003660` | dự phòng | 
| `0x08` | `0xB270` | `flags & 0x3f` | **mã phím, đọc** — ghi thì luôn `0x20` | 
| `0x09..0x0C` | `0xB294/2AC/C4/DC` | Hall `0x430/4A8/528/5A8` | raw / min / travel / dead | 
| `0x0D` | `0xB2DC` | `0x20003A80` | đọc raw | 
| `0x0E` | `0xB2F6` | `0x20004510` | đọc byte `0x7e` | 
| `0x0F` | `0xB312` | `0x20004510` | đọc byte `0xfc` | 
| `0x10` | `0xB32E` | `0x20004510` | đọc byte `0x17a` | 
| `0x13` | `0xB3EA` | Hall `0x528` | (= `0x0B`) | 
| `0x14` | `0xB402` | `0x20003800` | dự phòng | 
| `0x15` | `0xB41C` | `0x20003900` | dự phòng | 
| `0x16` | `0xB436` | `0x20003660` | **RT / window (µm)** | 
| `0x17` | `0xB45E` | `0x20003660` | **RT / deadzone (µm)** | 
| `0x19` | `0xB486` | `0x20003660` | **loại switch** | 
| `0x30` | `0xAD7C` | — | vòng quét cả 14 slot (`body[0]=1`) | 

`0x12(=18)`, `0x18`, `0x13`(=19) → `0xB4AE` = clear slot.

**Field 25 = switch type** (bằng chứng capture `…yongchun_switch.pcapng`:
A→1, Z→1, Q→2, W→3, E→0 — đúng tên file "E về switch gốc").

**Field 4 = actuation**, **field 8 = header `0x20`** — xem §7.5.

> 🔎 Điều này giải thích vì sao capture actuation trông "lạ": nó ghi xen kẽ
> `pos,08,20,00` (header) và `pos,04,e8,03` (travel) vào **cùng một frame** —
> field id nằm ở `body[2]`, không phải `body[1]`.

### Nếu muốn thêm field mới vào OpenAula

Chỉ cần gửi thêm một record `pos, field, lo, hi` trong frame `0x23` là có.
Không có opcode riêng cho từng tính năng.

## 7.7. DKS / MT / rapid trigger — firmware có gì, thiếu gì

### Có: rapid trigger ở tầng field

Field `0x16`, `0x17` chính là RT / window (xem trên). Capture
`…MN0.2RT(misclickset2times)deadzone0.1` ghi `100` (= 0.1 mm) cho cả hai.
Firmware chỉ lưu **một cặp ngưỡng cho mỗi phím** — không có timeline.

### Có: namespace action mở rộng `0xF1xx` / `0xF3xx`

Bảng `0x4A20` (pos → action, u16) chứa 14 mã nâng cao:

| pos | action | Ghi chú | 
| ----- | ----- | ----- | 
| `0x73` | `0xF001` | Fn | 
| `0xA1` | `0xF317` |  | 
| `0xB6` | `0xF311` |  | 
| `0xBD` | `0xF344` |  | 
| `0xBE` | `0xF101` |  | 
| `0xBF` | `0xF102` |  | 
| `0xCB` | `0xF310` |  | 
| `0xDF` | `0xF312` |  | 
| `0xE8` | `0xF309` |  | 
| `0xED` | `0xF100` |  | 
| `0xF2` | `0xF002` |  | 
| `0xF3` | `0xF315` |  | 
| `0xF4` | `0xF313` |  | 
| `0xF5` | `0xF314` |  | 

Các entry còn lại đều là HID usage `<= 0x4D` hoặc **giá trị `1`** (mask bit của
Fn, xem §10). Chưa có byte nào nói `0xF3xx` nghĩa là DKS hay MT → **không đoán**.

### Không có: opcode riêng cho DKS / MT / macro

> 🔴 **ĐÍNH CHÍNH 2026-11-05 — mục này SAI.** Bundle web driver
> (`magnet.aulastar.com`, lưu ở `E:\hero68_he_max-re\magnet_bundle\`) khai báo
> **opcode riêng** cho toàn bộ tính năng nâng cao:
>
> | opcode | web `ProtocolCMD` | đích trong bảng dispatch `0x1C994` | 
> | ----- | ----- | ----- | 
> | `0x24` | `KB2_CMD_MACRO` | `0xDBE0` (init stub) | 
> | `0x25` | `KB2_CMD_MACROMODE` | `0xE7EC` | 
> | `0x26` | `KB2_CMD_MT` (36) | `0xDBE0` (init stub) | 
> | `0x27` | `KB2_CMD_TGL` (37) | `0xE07A` | 
> | `0x28` | `KB2_CMD_TDKS` (38) | `0xF2CA` (**RGB effect**, không phải END) | 
> | `0x29` | `KB2_CMD_DDKS` (39) | `0xF340` | 
> | `0x2B` | `KB2_CMD_END` (40) | `0xF608` | 
> | `0x2C` | `KB2_CMD_SOCD` (44) | `0xDDF2` | 
> | `0x2D` | `KB2_CMD_RS` (45) | `0xE240` | 
>
> ⚠️ **Ba cảnh báo, đọc trước khi dùng bảng:**
>
> 1. **Tên trong bundle không khớp opcode trên dây.** Capture MT thấy `0x24`,
>    TGL thấy `0x25`, MPT thấy `0x27` (tên bundle là `TGL`), END thấy `0x28`
>    (tên bundle là `TDKS`).
>
> 2. **Đích dispatch KHÔNG phải thân handler.** `0xDA`-`0xDBE0` chỉ là init stub
>    (`addi a5, zero, 0x3e8` → `sw a5, 0xc(a0)`, `sw zero, 8(a0)`, `ret`);
>    `0xF2CA` thì `memset(a0+0x40, 0, 0x1f8)` rồi ghi field 8-bit đóng gói —
>    hình dạng của **RGB effect**, không phải END. Bảng này chỉ nói "opcode X
>    vào vùng Y", **không** nói Y làm gì.
>
> 3. **Layout thật chỉ lấy từ capture**, không từ bundle, không từ disasm.
>
> Kết luận cũ "DKS/MT không thể cấu hình qua giao thức này" là **sai** — nó
> đúng khi chỉ soi bảng field `0x1C744` (26 field, không có DKS/MT), nhưng
> DKS/MT đi qua **opcode riêng**, không qua bảng field.

Luồng dữ liệu của web driver (`advanceKeyType`):

| type | tính năng | pack | ghi chú | 
| ----- | ----- | ----- | ----- | 
| 1 | DKS | `DKSPack` → `0x28` | 11 byte/key (có `advancedKeyV2`) | 
| 2 | MPT | `MPTPack` → `0x29` |  | 
| 3 | MT | `MTPack` → `0x26` |  | 
| 4 | TGL | `TGLPack` → `0x27` |  | 
| 5 | END | `ENDPack` → `0x2B` |  | 
| 8 | SOCD | `SOCDPack`/`V2`/`V3`/`V4` → `0x2C` | chọn theo protocol version | 
| 9 | RS | `RSPack` → `0x2D` |  | 

Cổng phiên bản (từ bundle): `advancedKeyV2` từ **1.0.3**, `socdV3` **1.0.5–1.0.6**,
`SOCDDynamicDelay` từ **1.0.7**.

**Thiết bị báo `ProtocolVersion` = `1.0.9`** (`5c 05 80 15 | 00 01 09 01`,
app log `协议版本：1.0.9`), nên nhánh dùng là `advancedKeyV2` + `SOCDV4Pack`.

### Opcode thật trên dây khác tên trong bundle ⚠️

Capture cho thấy opcode gửi đi **không khớp** tên `ProtocolCMD`:

| thao tác trong app | frame capture | tên fragment gọi opcode đó | 
| ----- | ----- | ----- | 
| đặt MT cho phím W | `0x24` | `KB2_CMD_MACRO` | 
| đặt TGL cho phím V | `0x25` | `KB2_CMD_MACROMODE` | 
| đặt MPT cho phím A | `0x27` | `KB2_CMD_TGL` | 
| đặt END: S → P | `0x28` | `KB2_CMD_TDKS` | 

→ **Không dùng tên opcode trong bundle làm chân lý**, chỉ dùng capture. OpenAula
hiện wire `0x24` (MT), `0x25` (TGL), `0x27` (MPT), `0x28` (END) — bốn cái đã có
capture. DKS / DDKS / RS **chưa có capture** → chưa wire.

### `0x24` — MT, layout đã chốt từ 2 capture

```
5C 07 24 CK | 01 | keyValue | hold | 00 | tap | 00 | delay/10

```

`set_MT_at_W…pcapng@18` = `5c 07 24 da | 01 1a 1d 00 08 00 1e`
`W_MT_holdZ_ClickE_longpresstrigger200ms.pcapng@18` = `5c 07 24 d0 | 01 1a 1d 00 08 00 14`

| byte | giá trị | nguồn | 
| ----- | ----- | ----- | 
| `01` | subcmd MT | hằng | 
| `1a` (26) | `keyValue` của phím W | state app | 
| `1d` (29) | `MTInfo.DKS[0]` = **hold** | state app | 
| `00` | hằng | cả 2 capture | 
| `08` | `MTInfo.DKS[1]` = **tap** | state app | 
| `00` | hằng | cả 2 capture | 
| `1e` / `14` | `MTInfo.Delay` / **10** | 300 ms / 200 ms | 

Đơn vị delay = **10 ms**, trường là **1 byte** (không phải u16).

### `0x25` — TGL, layout đã chốt từ 1 capture

```
5C 05 25 CK | 01 | keyValue | toggle | 00 | delay/10

```

`TGL_V_setZ_logpresstriggerdelay200ms.pcapng@18` = `5c 05 25 cf | 01 19 1d 00 14`

| byte | giá trị | nguồn | 
| ----- | ----- | ----- | 
| `01` | subcmd TGL | hằng | 
| `19` (25) | `keyValue` của phím V | state app | 
| `1d` (29) | `TGLInfo.DKS` = action khi bật | state app | 
| `00` | hằng | capture | 
| `14` | `TGLInfo.Delay` / 10 | 200 ms | 

Cùng đơn vị delay với MT. Chỉ 1 capture → chưa biết byte `00` có đổi ở chế độ
TGL khác hay không.

### `0x28` — END, layout đã chốt từ 1 capture

```
5C 04 28 CK | 01 | keyValue | action | 00

```

`S_END_P.pcapng@18` = `5c 04 28 bd | 01 16 13 00`

Người dùng xác nhận: editor đang chọn phím **S** và đặt END = **P**.

| byte | giá trị | nguồn | 
| ----- | ----- | ----- | 
| `01` | write flag | hằng | 
| `16` (22) | `keyValue` của S | phím đang cấu hình | 
| `13` (19) | `ENDInfo.DKS` = P | action khi nhấn | 
| `00` | hằng | capture | 

Reply `0xA8`, LEN `0x38` = 56: `00 16 13 00` + 10 slot `(00, ff ff, ff)`.

### `0x27` — MPT, layout đã chốt từ 1 capture

`set_MT_at_W…pcapng@22`:
`5c 0e 27 cb | 01 | 04 | 04 00 10 00 11 00 | f4 01 e8 03 dc 05`

```
01 | count(=steps+1) | (code,00) × steps | depth_u16_LE × steps

```

State app cho phím A: `MPTInfo{DKS:[4,0,16], DB:[0.5,1,1.5]}` → 3 depth
500/1000/1500 µm khớp `f4 01 e8 03 dc 05`. Code gửi đi là `04,10,11` = `DKS[1..]`
cộng pseudo-key `0x11` mà editor tự chèn; **phím đang cấu hình không lặp lại
trên dây**.

Chỉ có 1 capture nên: chưa biết `0x11` nghĩa gì, chưa biết `count` có phải luôn
`steps+1` hay mang nghĩa khác với 1/2 step.

### Code

`src/protocol/xsyd/advanced.ts` — `buildMtFrame`, `buildTglFrame`, `buildMptFrame`,
`buildEndFrame`, kiểm byte-for-byte bằng `tests/xsyd-advanced.test.mjs` (7/7).
Tài liệu trong repo: `OpenAula-main/docs/xsyd-protocol.md`.

| opcode | handler | Thực tế | 
| ----- | ----- | ----- | 
| `0x08` | `0xA412` | **macro**: dựng 3 mảng 16 phần tử từ `0x1C3F0` | 
| `0x09` | `0xA5C4` | macro, cùng bảng | 
| `0x0A` | `0xA624` | **flush macro** — cần magic `0x72`, gọi `0x1791A`, poke flash `0xbeef0` | 
| `0x0E` | `0xA6B6` | ghi record macro vào `0x1C3F0` bằng `0xD000/D04A` | 

`0x1C3F0` mở đầu `0000 F001 F002 F003 0004 0005 …` = **danh sách record
macro**, không phải bảng action (ghi chú cũ trong §3 sai, đã sửa).

Tất cả đều **chưa** xuất hiện trong 9 capture.

### Kết luận có bằng chứng

1. Firmware hỗ trợ: remap, RGB, actuation, RT (1 cặp ngưỡng/phím), deadzone,
   loại switch, chọn profile 1..4, macro, SOCD (qua `0x2C`/field).

2. Firmware **không có cấu trúc dữ liệu cho timeline nhiều bước** — mỗi field
   chỉ là 1 u16/phím (`6×21` cell), không đủ chỗ cho 4 bước × 4 tham số.

3. Máy trạng thái `0xFE38`/`0xED24` chỉ xử lý RGB (đọc float `0x1D000`).

4. ⇒ **DKS và MT (mod-tap) không thể cấu hình qua giao thức này** trên
   `v1.1.4`. → **SAI**, xem đính chính phía trên: DKS/MT/TGL/END/RS/SOCD
   đều có opcode riêng (`0x26`..`0x2D`) với handler thật trong `v1.1.4`.

Verify: `tools/fw_verify_advanced.py` → 0 failure.

## 8. Ứng dụng vendor & host

### `XSYD_UPDATE_LZ.exe`

* PE ImageBase: **`0x400000`**

* Import table đã bị strip bởi EVB

* Có **đúng một** `mov r8d, 0x41` (65) → report 65 byte

* Zero byte report-id trước `hid_write`

### TEA keys

| Khoá | Địa chỉ (file) | Giá trị | 
| ----- | ----- | ----- | 
| KEY1 | `0x17330` | `0123456789ABCDEFFEDCBA9876543210` | 
| KEY2 | `0x17320` | `0174236556421073CD89ABEFFEDC98BA` | 

> ⚠️ Khoá dùng cho chữ ký firmware. Không in ra log, không commit.

## 9. Những gì **chưa** biết được từ firmware

Điểm mù thật sự — không suy ra được từ byte:

1. **Ánh xạ 30 kênh Hall → phím vật lý.**
   Firmware chỉ index `(group×21 + lane)`. Group nào là hàng phím nào phụ thuộc
   bảng PCB, không nằm trong flash.

2. **Công thức actuation đầy đủ.**
   Có đủ 4 mảng (raw/min/value/dead) nhưng chưa có hằng số chứng minh phép biến đổi
   sang `travel`.

3. **Ánh xạ field mới nếu firmware khác dùng.**
   Mọi tính năng đi qua `0x23` + `0x1C744`. Firmware `v1.1.4` chỉ có 26 field
   (§7.6). Muốn DKS/MT thì phải có field mới ở firmware mới hơn — không thể
   gửi từ host.

4. Byte mode của SOCD. → **Có**: `type`/`mode`/`extra` là `pl[7]`, `pl[8]`,
   u16 `pl[9..10]`. Đã chốt vị trí và bank đích (`tools/fw_verify_socd.py`), còn
   **ngữ nghĩa** từng giá trị `type`/`mode`/`extra` thì chưa có capture nào khác 0
   để đối chiếu — xem mục 5.

5. **Ngữ nghĩa `type`/`mode`/`extra` của `0x2C`**, và **thứ tự byte trên dây**
   (`pos` hiện là byte `key - 1`, chưa chốt vì `socd_AD_on` chỉ có đúng 1 frame).
   Cần capture app thao tác màn hình SOCD (chọn mode + bấm Apply).

**Đã giải xong (trước đây nằm trong danh sách này):**

* Index bảng RGB `0x98` ↔ zone → `0x2A` ghi theo **HID usage**, không theo zone. §7.5.

* `row × 21 + col` cho bảng flash `0x4A20` → bảng là **`pos → usage`** 256 entry. §4.

* Actuation không có lệnh ghi → **field 4** của `0x23`, đơn vị µm. §7.5, §7.6.

* Không rõ `0x1C3F0` là gì → **bank record macro**, không phải bảng action. §7.7.

* Byte chọn profile → `0x00 payload[1] = 0..3`. §7.5.

* SOCD không có byte mode → `0x2C` có `type`/`mode`/`extra`. §7.5.

→ Các mục 1..3 và 5 **chỉ** capture phần cứng hoặc test thật mới trả lời được.

## 10. Những khẳng định **đã bị bác**

Ghi lại để không lặp lại:

| Khẳng định | Thực tế | Bằng chứng | 
| ----- | ----- | ----- | 
| "Hall report = **126 byte**" | **Sai**. Không có hằng 126 trong image; payload `0x2D` là 29 B | `0x7E` xuất hiện đúng 1 lần ở `0x1335A`, xa mọi reply builder | 
| "Layout 126 = 9 bảng × 14 kênh" | Sai. 6 group × 5 lane = 30 kênh | index `(g×0x15+l)×2` tại `0xBDB4` | 
| "`0x12` = GET_HALL" | Sai. GET_CONFIG | `0xA758` → accessor `0xD0CE/0xD104/0xD11C` | 
| "`0x18` = layout 44 byte" | Sai. SET_CONFIG | `0xA930` ghi struct `0x20003198` | 
| "keymap ở `0x192CC`" | Sai, đó là code. String ở `0x1D2CC` | dump byte | 
| "checksum `0x9C`" | Sai. `0x9C` là checksum của **gói mẫu**, không phải hằng công thức | công thức `0xCF48` | 
| "ImageBase `0x2D000`" | Sai. `0x400000` | PE header | 
| "`0x2A`/`0x23` dùng linear index" | Sai. Dùng byte `pos` **một byte** lấy từ `pack` (`a1 = 1,2,3…`), rồi `pos<<1` tra bảng `0x1C3F0`. Đây là `pos` cũng không phải `linear_idx` | disasm `0xC162..0xC170`, `0xBD34` | 
| "Spec webhid: cột `key_id` trong bảng 68 phím" | Sai nhãn. Giá trị là **HID usage/action** đọc từ `0x4A20` (trùng `keycode`). Firmware không có bảng `key_id` | `0x4A20` u16 × 68 | 
| "Spec webhid: `user_rgb` ở `0x20002EF8`" | Sai lệch `0x1000`. Đúng: `0x20001EF8` | `0x10D4A`: `lui 0x20002` + `addi -0x340` = `0x20001CC0`, `+0x238` | 
| "Spec webhid: magic flush `FE FE FE FE` tại `0xC18E`" | Sai. `0xC18E` là code `addi a4, zero, 0xfe`. Chuỗi byte `FE FE FE FE` chỉ có ở `0x1CB72..0x1CB78` (bảng ramp) | dump byte | 
| "Spec webhid: `0x18` dùng `pack[41..47]` cho mode/speed/brightness" | Sai. Mapping thật ở `pack[0x25..0x2B]`, mode = `pack[0x27]` (`0x12566`) | `0xA9CC..0xAA3E` | 
| "Spec webhid: opcode `0x02` = handler `0x0A314`; `0x0B` = Reboot; `0x0F` = Flash Verify" | **Đúng là không phải handler riêng**, nhưng cách giải thích "stub" là **sai**. `0xC312` là nhánh **out-of-range** (`0x9B60 j → 0xC312` khi `opcode > 0x2D`), thân hàm là `andi a1,a1,0xff` + `j 0x9BC0` → quay về dispatcher. Opcode rơi vào nhánh này được định tuyến về handler `0x01`, **không phải "không tồn tại"** | `0x9B58..0x9B72`, `0xC312..0xC316`; `fw_verify_opcodes.py` 106/106 | 
| "Spec RGB: LCG là Knuth MMIX (`+1`)" | **Đây là BẢN ĐÍNH CHÍNH SAI của tôi.** Spec gốc ghi Knuth MMIX `+1` là **ĐÚNG**. Hằng số: `M = 0x5851F42D4C957F2D`, `A = 1`. Giá trị `0xE66D12340005DEEC` là do tôi đọc nhầm 2 nửa (`0x4C958F2D` thay vì `0x4C957F2D`) | `0x1B28E..0x1B2CE`; `fw_verify_rgb_math.py` 31/31, mô phỏng từng word khớp `state*M+1` | 
| "Spec webhid §8.1: `param_id` có địa chỉ cứng `0x20004DF0`/`0x20003718`…" | Sai toàn bộ. Handler `0xACE0` tính **động**: `linear_idx = (pos>>5)*21 + (pos&0x1F)`, `addr = base + (K + linear_idx)*S`. Base A = `0x20004BE4`, base B = `0x20003220`. 12/12 địa chỉ trong spec đều lệch | `0xACE0..0xB1E4`; `fw_verify_8_1.py` 66/66 | 
| "Spec webhid §7.4-C: gain ở khối riêng `0x200031EC`" | Địa chỉ cuối đúng nhưng **base sai**: đó là `0x20003198 + 0x54/0x55/0x56` (struct config). Thứ tự gán là `pack[5]→+0x54`, `[6]→+0x55`, `[7]→+0x56`; encoder đọc `0x55,0x54,0x56` | `0xA256`, `0x10EF2`; `fw_verify_7_4c.py` 15/15 | 
| "Spec webhid §8.2: 46 slot opcode, giới hạn `0x2D`" | Sai số slot. Bảng có **48 slot** (`0x00..0x2F`). `0x22→0x9EB8`, `0x2E→0xA564`, `0x2F→0xA572` bị bỏ sót | `0x1C5F0`; `fw_verify_opcodes.py` | 
| "Spec RGB §3.2: `SIN_ROM_181` đỉnh ở index 90" | Sai. Đỉnh ở **index 180** = `0xFF`. Bước góc là **0.5°** (`index i ↔ i/2`), không phải 1° | `0x1CAC8`; `fw_verify_rgb_math.py` | 
| "Spec RGB §1.2: hàm khởi tạo `0xED5E` xoá 1080 B nhưng *giữ nguyên* `user_rgb`" | **Sai.** Vòng lặp `sb zero` không có ngoại lệ: `0x20001CC0..0x200020F7`, và `user_rgb` (`+0x238`) nằm trong đó. `0x20001CC0 + 0x438 = 0x200020F8` = đúng `rgb_fb` | `0xED6C..0xED84`; `fw_verify_state.py` 32/32 | 
| "Spec RGB §2: bảng `0x1C994` gồm 63 con trỏ init/tick" | Sai số lượng. Là **28 cặp `(init, tick)` = 56 con trỏ**, stride 8 | `0x1C994`; `fw_verify_modes.py` 101/101 | 
| "boardID `0x06021A01`" (ghi chú của tôi, không phải spec) | Sai. `hex(100800769) = 0x06021901` — spec gốc đúng | `hex()` | 
| "`led_bitmap[6] = [0,0x7FFF,…]`" | Không tồn tại trong image | quét toàn bộ | 
| "`0x55555555` trong image" | Không tồn tại | quét toàn bộ | 
| "`0x1C3F0` là bảng HID usage → action" | **Sai.** Đó là **bank record macro** (`0000, F001, F002, F003, 0004, 0005 …`), được `0x08/0x09/0x0A/0x0E` đọc/ghi. Bảng `pos → usage` thật là `0x4A20` | `0xA412`, `0xA6B6`, dump `0x1C3F0` | 
| "`0x23` là lệnh remap" | **Sai/thiếu.** `0x23` là lệnh ghi **bảng field per-key** (26 field: remap, actuation, RT, deadzone, switch…). Remap chỉ là **field 0**, actuation là **field 4** | `0xACE0`, `0x1C744`; `tools/verify_field_table.py` 11/11 | 
| "`pos,A,B,C` là 1 record với `A` = field" | Đúng hình dạng nhưng sai cách đọc: `body[1+4k]=pos`, `body[2+4k]=field`, `body[3..4+4k]=u16 LE value` | `0xAD12`, `0xAD24`, `0xAD38` | 
| "`0x4A20[pos] == 1` nghĩa là phím ảo / không dùng" | Sai. `1` = bit mask `0xF001` (Fn) cắt bit thấp ⇒ mọi pos `0x7E..0x92` là **bit của Fn**, không phải phím | `0xAD94..0xAD9E` (`sw (1<<...) | 0xF001`) | 
| "SOCD / actuation không có lệnh ghi" | **Sai.** Actuation = `0x23` field 4 (verify 0 fail). SOCD: `0x2C` chỉ là remap 1 phím, chưa có bằng chứng mode SOCD | `tools/verify_actuation_capture.py`, `tools/probe_key_fields.py` | 
| "HERO68 dùng `0x98`" | Đúng cho HERO68, **không dùng được cho MAX** | MAX framing `0x5C` | 

### Bộ suite verify (chạy lại bất cứ lúc nào)

```
cd E:\hero68_he_max-re
foreach($s in @('fw_verify_5c','fw_verify_keymap','fw_verify_host','fw_verify_hall',
                'fw_verify_opcodes','fw_verify_rgb_math','fw_verify_8_1',
                'fw_verify_7_4c','fw_verify_evb','fw_verify_modes','fw_verify_state','fw_verify_nvram')){ py "tools\$s.py" }

```

| Suite | Số check | Phủ mục | 
| ----- | ----- | ----- | 
| `fw_verify_5c` | 45 | §3, §4.1, §4.2 — framing + checksum | 
| `fw_verify_keymap` | 9 | §5.1, §5.2 — keymap 68 phím | 
| `fw_verify_host` | 6 | §2.2 — TEA keys, host framing | 
| `fw_verify_hall` | 11 | §6.1–6.4 — config + Hall | 
| `fw_verify_opcodes` | 106 | §8.2 — 48 slot opcode + `0xC312` | 
| `fw_verify_rgb_math` | 31 | RGB §3.1, §3.2 — LCG, sin/atan2 | 
| `fw_verify_8_1` | 66 | §8.1 — `param_id` của `0x23` | 
| `fw_verify_7_4c` | 15 | §7.4-C — white balance | 
| `fw_verify_evb` | 22 | §1.1–1.3, §2.2 — EVB + descriptors | 
| `fw_verify_modes` | 101 | RGB §2 — 28 cặp mode, ext→int, speed, brightness | 
| `fw_verify_state` | 32 | RGB §1.1–1.2 — layout `rgb_engine_state`, vòng xoá 1080 B | 
| `fw_verify_nvram` | 29 | §7 — bảng sector `0x4340`, switch `0x11B5E`, `gp-0x7e8` | 

Tổng **473 check, 0 fail.** Bảng nhãn từng dòng spec: `docs/SPEC_STATUS.md`
(sinh bởi `tools/spec_label.py`).

### Về tài liệu tham chiếu `keyboard-docs`

Repo `sparklinkplayjoy/keyboard-docs` (lưu ở `refs/keyboard-docs/`):

* **Không** chứa framing byte nào — chỉ API tầng trên

* **Không phải** AULA (vendorId `7331`/`6241`, không phải `7247`/`7330`)

* Nhưng **xác nhận độc lập**: `getADCSample({row})` → `data` **30 phần tử**,
  `0` = không có phím, tra keymap cho `getPerformance({row, col})`

## 11. Trạng thái `OpenAula-main`

| Thành phần | File | Trạng thái | 
| ----- | ----- | ----- | 
| Codec | `src/protocol/xsyd/codec.ts` | frame/checksum/assembler | 
| Keymap | `src/protocol/xsyd/keymap.ts` | 68 entry, sinh tự động | 
| Identity | `src/keyboard/maxHe.ts` | `0xFFA0`, boardID | 
| Detection | `src/keyboard/devices.ts` | dùng `MAX_HE_USAGE_PAGE` | 
| Guard | `src/protocol/hero68/webhid.ts` | từ chối mở MAX, `send()` chặn | 
| Field table | `src/protocol/xsyd/features.ts` | `0x23` builder/decoder, 6 field, `wirePosForCode` | 
| Advanced key | `src/protocol/xsyd/advanced.ts` | MT (`0x24`), TGL (`0x25`), MPT (`0x27`), END (`0x28`), `ProtocolVersion 1.0.9` | 

**Test**: `tsc --noEmit` OK · `typecheck:service` OK · **659/659 test**

### Nguyên tắc đang giữ

* MAX path **chỉ đọc** cho tới khi layout Hall được chứng minh

* Không wire opcode ghi nào cho tới khi zone map được xác nhận

* Không dùng lại opcode HERO68



### Cập nhật 2026-11-07: DKS (`0x26`), 4 mode SOCD (`0x2C`), Hall Stream 200 Hz (`0x12`) & Fix Timeout `0x23`

1. **`0x26` — DKS (Dynamic Keystroke, `LEN = 0x10 = 16`, Handler `VA 0x0B718..0x0B9FE`, Evaluator `VA 0x14A8E..0x14BD0`):**
   - Khung truyền (`dks_keyW_down1.4-3.4_up3.4-1.4_A-hold1_B-hold2_C-hold3_D-end.pcapng` `#40752`):
     `5C 10 26 CC | 01 <key> <act0 u16_le> <act1 u16_le> <act2 u16_le> <act3 u16_le> <mask0> <mask1> <mask2> <mask3> <actuationUm u16_le>`
   - Ví dụ phím W (`0x1A`), 4 action A/B/C/D (`0x04, 0x05, 0x06, 0x07`), mask `0x03, 0x1C, 0x60, 0xC0`, ngưỡng đầu `1400 µm` (`0x0578`):
     `5C 10 26 CC | 01 1A 04 00 05 00 06 00 07 00 03 1C 60 C0 78 05` -> Reply `0xA6` (`LEN = 0x2E`).
   - Bảng bitmask 4 pha (đối chiếu ROM `VA 0x1D524` `[0x01, 0x02, 0x02, 0x02, 0x04, 0x18, 0x20, 0x40, 0x40, 0x40, 0x80]`):
     - Tap đơn: Phase 0 = `0x01`, Phase 1 = `0x04`, Phase 2 = `0x20`, Phase 3 = `0xC0`.
     - Hold nối pha: `0->1` = `0x03`, `1->2` = `0x1C`, `2->3` = `0x60`, `0->2` = `0x1F`, `1->3` = `0x7C`, `0->3` = `0x7F`.

2. **Tối ưu Hall Stream `0x12` -> `0x92` từ ~68 Hz lên 200 Hz (`src/protocol/hero68/hallStream.ts` & `service/native/hid_bridge.cpp`):**
   - Nguyên nhân trước đây chỉ đạt 60–80 Hz: mỗi vòng lặp gửi 2 lệnh 3-report liên tiếp (`0x12 0x03` Pressed + `0x12 0x02` Travel = 6 IN reports ≈ `6 ms`) cộng với `setTimeout(..., 8)` (`~8.5 ms`) = `~14.5 ms/vòng` (`~68 Hz`).
   - Giải pháp đạt **200 Hz (`5.0 ms/vòng`)**:
     - Chỉ đọc `0x12 0x03` (`buildXsydHallPressedFrame`) **1 lần duy nhất** khi khởi tạo stream để lấy baseline `pressedByMatrixIndex`.
     - Các chu kỳ tiếp theo chỉ gửi **1 lệnh** `0x12 0x02` (`buildXsydHallTravelFrame`, `1 OUT + 3 IN` ≈ `2.0 ms`), cập nhật trạng thái `pressed` theo trễ hysteresis (`<= 80 µm` nhả, `>= 150 µm` nhấn) và ưu tiên 3:1 cho nửa ma trận (`Table 1` hoặc `Table 2`) đang có phím nhấn (`travelUm > 80`).
     - Thay `setTimeout(..., 8)` bằng bộ điều nhịp deadline `5.0 ms` dùng `MessageChannel` (vượt qua giới hạn clamp 4 ms của Chromium) và nâng tốc độ publish SSE trong `hid_bridge.cpp` / `hallController.ts` lên `200 Hz`.

3. **Khắc phục triệt để lỗi `WIN 68 HE MAX read timed out (opcode=0x23)` (`src/protocol/xsyd/codec.ts`, `src/protocol/xsyd/device.ts`, `src/app/hooks/useDeviceSyncController.ts`):**
   - **Nguyên nhân 1 (Stale `0x92` buffer nuốt gói `0xA3`)**: Khi dừng hoặc chuyển từ Hall stream (`0x92`, 3 report = 192 B) sang đọc/ghi `0x23` (`0xA3`, 1 report = 64 B), nếu 1 report của `0x92` còn sót trong `XsydFrameAssembler` (`#expected = 192`), gói `0xA3` kế tiếp bị ghép nhầm làm chunk #2/#3 của `0x92` khiến `0x23` bị timeout. Đã thêm cơ chế tự phục hồi (self-healing) trong `XsydFrameAssembler.push()` và reset assembler trước mỗi request.
   - **Nguyên nhân 2 (Firmware dừng xử lý USB khi xoá sector Flash sau 500–670 ms)**: Sau lệnh ghi (`0x23`, `0x24..0x2C`), firmware đếm ngược ~500–670 ms (`VA 0x0AD9E` -> `0x11914`) rồi xoá/ghi Flash và bắn gói thông báo `5C 04 FF <ck> | 0A FF <hi> <lo>` (`VA 0x09AF0`). Nếu chuỗi 34–68 gói `0x23` rơi đúng vào lúc MCU đang xoá Flash, 1 gói `0x23` sẽ bị rớt. Đã thêm cơ chế tự động retry `0x23` (tối đa 3 lần kèm backoff ngắn), nhận diện gói `0xFF` (`0A FF`), và tạm dừng/khôi phục `hero68HallStream` quanh các đợt đọc/ghi `0x23`.

## 12. Bước tiếp theo

### Cần làm: capture USBPcap

1. Cài Wireshark **kèm USBPcap**, restart máy

2. Mở Chrome → trang WebHID chính thức của AULA → Connect

3. Mở Wireshark → `USBPcap1` → Start

4. Thao tác **chậm, cách nhau 3–5 giây**:

   * Đổi RGB **một phím** → đỏ → xanh → tắt

   * Brightness min → max

   * Remap một phím rồi revert

   * Nhấn giữ phím A 2 giây → thả (thấy analog)

5. Stop → save `.pcapng`

6. Ghi lại **thứ tự thao tác** kèm file

### Sau khi có pcap

Viết decoder `pyshark` **trên dữ liệu thật**, in ra:

```
op 0x2C  out  30 channels: [512, 509, 511, ...]
op 0x2D  in   29 B  {raw[], min[], value[], dead[], flags[]}
op 0x98  out  RGB key Esc = #FF0000

```

Từ đó mới chốt được 30 kênh ↔ phím và mới dám wire read-only vào OpenAula.

## Phụ lục: công cụ

| Script | Chức năng | Check | 
| ----- | ----- | ----- | 
| `tools/fw_va.py` | disassembler VA-aware, có `xref`, sửa `jal_target` | — | 
| `tools/fw_disasm.py` | sweep vùng code | — | 
| `tools/fw_xref.py` | tìm tham chiếu | — | 
| `tools/fw_verify_5c.py` | protocol + bảng + descriptor | 45 | 
| `tools/fw_verify_keymap.py` | keymap `0x4A20` + layout hàng | 9 | 
| `tools/fw_verify_host.py` | framing exe + TEA keys | 6 | 
| `tools/fw_verify_hall.py` | bác 126 B, xác nhận bank 30 kênh | 11 | 
| `tools/fw_verify_advanced.py` | macro ops, field table `0x1C744`, kết luận DKS/MT | 9 | 
| `tools/fw_verify_hall_flow.py` | audit bài viết ngoài về luồng Hall (`0x92`, LUT, ngưỡng) | 27 | 
| `tools/fw_verify_socd.py` | `0x2C` (cặp phím) + `0x2D` (linked pair) | 10 | 
| `tools/fw_gen_keymap.py` | sinh `keymap.ts` từ firmware | — | 

Capture verify:

| Script | Kiểm gì | 
| ----- | ----- | 
| `tools/verify_remap_capture.py` | remap `0x23` field 0 (3/3) | 
| `tools/verify_rgb_capture.py` | `0x2A` ghi 1 phím (4/4) | 
| `tools/verify_rgb_batches.py` | `0x2A` bảng 68 phím (5/5) | 
| `tools/verify_profile_selector.py` | `0x00` chọn profile | 
| `tools/verify_actuation_capture.py` | `0x23` field 4 = travel, đơn vị µm | 
| `tools/verify_field_table.py` | hình dạng frame + 26 field + switch map | 
| `tools/verify_hall_reply.py` | `0x92` reply 132 B, travel ∈ LUT, ADC ≤ 12 bit (1029 reply) | 
| `tools/capture_actuation.py` | dump travel/RT theo phím | 
| `tools/capture_23_pos.py` | liệt kê byte `pos` thật trong mọi frame `0x23` | 
| `tools/probe_key_fields.py` | dựng lại bảng cell SRAM 0x1C744 | 

Chạy toàn bộ:

```
cd E:\hero68_he_max-re
py tools\fw_verify_5c.py
py tools\fw_verify_keymap.py
py tools\fw_verify_host.py
py tools\fw_verify_hall.py
py tools\fw_verify_advanced.py
py tools\fw_verify_hall_flow.py
py tools\fw_verify_socd.py
py tools\verify_field_table.py
py tools\verify_actuation_capture.py
py tools\verify_hall_reply.py

```

## Tham chiếu

* `docs/aula_win68_he_max_webhid_rgb_gamepad_spec.md` — spec Gemini (verified + chưa verify lẫn lộn)

* `docs/aula_win68_he_max_rgb_engine_spec.md` — spec RGB engine (Gemini)

* `refs/keyboard-docs/` — SDK docs bên thứ ba (xác nhận cấu trúc ADC 30 phần tử)

* `out/evb/unpacked/XS105_SI2828C_WIN 68 HE MAX_App_v1.1.4_20260204a.bin`

* `out/evb/unpacked/XSYD_UPDATE_LZ.exe`

* `out/evb/unpacked/config.ini`