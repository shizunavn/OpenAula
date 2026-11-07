# AULA WIN 68 HE MAX — Trạng thái nghiên cứu & Đính chính Firmware v1.1.4 (KNOWN_STATE)

> Tài liệu này tổng hợp **toàn bộ kết quả kiểm chứng bằng byte** từ firmware
> `XS105_SI2828C_WIN 68 HE MAX_App_v1.1.4_20260204a.bin` (`VA = file_offset + 0x4000`)
> và các file capture USBPcap thực tế (`profile_1_2_3_4.pcapng`,
> `actutation2.0global_wasd1.0RT_space1.5RT,MN0.2RT(misclickset2times)deadzone0.1.pcapng`,
> `wasd_deadzone.pcapng`, `rhythm_capture.pcapng`,
> `change_A_Zjadepro_Q_toblackemperor_WtoTTCKING_E-to_yongchun_switch.pcapng`,
> `travel_test_press_randomkey.pcapng`, `4k_to_2k_to_1k.pcapng`).
>
> **Cập nhật 2026-11-07**: Đính chính toàn bộ các lỗi suy đoán của bản AI trước đó và bổ sung kiểm chứng `wasd_deadzone.pcapng` + `rhythm_capture.pcapng`:
>
> 1. Bảng field `0x23` (`VA 0x1C6DC` Write vs `VA 0x1C744` Read): **`0x14` = RT Press**, **`0x15` = RT Release**, **`0x16` = Top Deadzone** (`VA 0x0B184` / `0x0B436`), **`0x17` = Bottom Deadzone** (`VA 0x0B19E` / `0x0B450`), **`0x08` = Key Mode / RT Enable (`0x20`)**, **`0x19` = Switch Type (`0..3`)**.
>
> 2. Opcode **`0x29` (`VA 0x0C092`) = Global Actuation Read/Write (µm)** (không phải poll rate/timer).
>
> 3. Cơ chế chuyển profile **`0x00` subcmd `0x70` (`VA 0x16342` → `0x11B5E` + `0x12AF4`)** và **500 ms deferred Flash flush (`VA 0x07E28` → `0x11914`)** — nguyên nhân gốc rễ khiến Profile 0 bị mất cấu hình Actuation/RT khi lưu cùng LED.
>
> 4. Bảng **4 loại Switch (`0..3`) & 2 đường cong LUT Hall ADC → Travel (`VA 0x1D48C`, `0x04E44`, `0x05644`)** cùng bộ lọc `max_travel` (`3400 µm` vs `3300 µm` tại `VA 0x12CEA..0x12D14`).
>
> 5. **Rhythm Sync (`0x18` mode `0x15` + 5 × 14-slot `0x2A`, `VA 0x0C12E..0x0C2D0`)**: Đính chính 2 lỗi phân tích trong `aula_win68_rgb_sync_capture.md` cũ (nhầm chiều `OUT 0x2A` là gói rỗng và đọc thiếu slot thứ 14 khiến mất 4 phím `42, 48, 52, 229`).

## 1. Nhận dạng thiết bị

| Thuộc tính | Giá trị | Nguồn | 
| ----- | ----- | ----- | 
| Sản phẩm | AULA WIN 68 HE **MAX** | `config.ini` / `0x00` subcmd `0x26` | 
| MCU / SoC | XS105 / SI2828C (RISC-V RV32IMAC + WCH QingKe custom compressed ops) | tên file firmware | 
| Firmware | `App v1.1.4_20260204a` | chuỗi trong image | 
| Kích thước image | 105 048 byte | file thực tế | 
| Link base | `VA = file_offset + 0x4000` | verify qua descriptor + vector | 
| VID / PID | `0x1CA2` / `0x1901` (hoặc `0x1C4F` / `0xEE88`) | USB descriptor & `config.ini` | 
| `usage_page` / `usage` | `0xFFA0` (`65440`) / `0x01` | `VA 0x1C2EC` (`06 A0 FF 09 01 A1 01`) | 
| `boardID` | `100800769` (`0x06021901`) | `config.ini` | 
| Reset vector | `j 0x49E6` | byte đầu image | 

## 2. Khung truyền (Framing `0x5C`)

```
byte 0        : 0x5C            (magic)
byte 1        : LEN             (độ dài payload)
byte 2        : OPCODE          (request 0x00..0x37, reply = request | 0x80)
byte 3        : CHECKSUM        ((0x5C + LEN + OPCODE + 0x35 + payload[LEN-1]) & 0xFF)
byte 4 ..     : payload         (LEN byte)
```

* Checksum (`VA 0x0CF48..0x0CF7A`) chỉ cộng **byte cuối cùng của payload** (`payload[LEN - 1]`).

* Report HID có độ dài cố định **64 byte** (`reportId = 0`). Các phản hồi dài hơn 60 byte payload (như `0x92` Hall `LEN = 0x80` hoặc `0x82`) được ghép từ 3 gói 64 byte liên tiếp.

## 3. Bảng Dispatch HID (`VA 0x09B58..0x09B72`, bảng `VA 0x1C5F0`)

| Opcode | Handler VA | Chức năng thực tế (đã kiểm chứng disasm + capture) | 
| ----- | ----- | ----- | 
| `0x00` | `0x09BEE` | Handshake (`0x01` version, `0x25` travel range, `0x26` name), Polling Rate (`0x50`), Profile Select/Query (`0x70`) | 
| `0x01` | `0x0A314` | System subcommands | 
| `0x08` | `0x0A412` | Macro table read/setup | 
| `0x09` | `0x0A5C4` | Macro table | 
| `0x0A` | `0x0A624` | Macro flash flush | 
| `0x0E` | `0x0A6B6` | Macro record write | 
| `0x12` | `0x0A758` | Live Hall & Config table read (`subcmd 0x02` = travel µm, `0x03` = pressed flags, `0x06` = filtered ADC) | 
| `0x18` | `0x0A930` | Global RGB lighting read (`payload[0]=0x00`, `LEN=0x2B`) / write (`payload[0]=0x01`, `LEN=0x2C`) | 
| `0x23` | `0x0ACE0` | **Per-key field table Read (`payload[0]=0x00`, bảng `0x1C744`) / Write (`payload[0]=0x01`, bảng `0x1C6DC`)** | 
| `0x24` | `0x0B4BC` | **MT (Mod-Tap)** read/write (`LEN = 7` khi write: `01 key hold 00 tap 00 delay/10`) | 
| `0x25` | `0x0B602` | **TGL (Toggle)** read/write (`LEN = 5` khi write: `01 key toggle 00 delay/10`) | 
| `0x26` | `0x0B718` | Matrix / DKS bank scan A | 
| `0x27` | `0x0B9FE` | **MPT (Multi-Point Trigger)** write (`01 count (code,00)×3 depth_u16×3`) & matrix scan B | 
| `0x28` | `0x0BBFE` | **END (Release Key)** read/write (`LEN = 4` khi write: `01 key action 00`) | 
| `0x29` | `0x0C092` | **Global Actuation Read (`payload[0]=0x00`) / Write (`payload[0]=0x01`)** đơn vị µm (`u16_le` tại `payload[3..4]`) | 
| `0x2A` | `0x0C12E` | **Per-key Custom RGB & Rhythm Sync** single-key write (`LEN = 5`) & 14-slot batch read/write (`LEN = 0x39`) | 
| `0x2B` | `0x0C2D2` | Remap batch read selector | 
| `0x2C` | `0x0BD20` | **SOCD** pair read/write (`LEN = 11`: `flag key1 key2 act1_u16 act2_u16 type mode delay_u16`) | 
| `0x2D` | `0x0BF90` | Linked pair / RS bank (`key_mode = 9`) | 

## 4. Đính chính quan trọng #1: Bảng Field `0x23` (`VA 0x0ACE0..0x0B4B8`) & Kiểm chứng `wasd_deadzone.pcapng`

> 🔴 **ĐÍNH CHÍNH BẢN AI CŨ (§7.5 & §7.6):**
> Bản `KNOWN_STATE.md` cũ mắc 3 lỗi nghiêm trọng ở opcode `0x23`:
>
> 1. Ghi nhầm `payload[0] = 0x00` là *"chỉ ghi các slot có `pos != 0xFF`"* — thực tế tại `VA 0x0AD02`, `beqz s7, 0x0ADEC` rẽ nhánh sang **vòng lặp READ (`0x0ADEC..0x0AEAC`)** tra bảng **`VA 0x1C744`** (49 entry), còn `payload[0] = 0x01` chạy **vòng lặp WRITE (`0x0AD08..0x0ADCE`)** tra bảng **`VA 0x1C6DC`** (26 entry) rồi gọi `VA 0x07E28` để hẹn giờ ghi Flash sau 500 ms!
>
> 2. Ghi nhầm `field 20 (0x14)` và `field 21 (0x15)` là *"dự phòng (`0`)"*, còn `field 22 (0x16)` và `field 23 (0x17)` là *"Rapid Trigger / misclick window"*!
>
> 3. Chính vì nhầm lẫn này mà code OpenAula cũ đã ghi `rtUm` vào `field 0x16` (**Top Deadzone** trên phần cứng) và **không bao giờ ghi `field 0x14` / `0x15`**, đồng thời chỉ ghi `topDeadzoneMm` vào `field 0x17` (**Bottom Deadzone**) rồi đọc `0x17` gán cho cả Top lẫn Bottom Deadzone!

### Bảng Field `0x23` chính xác 100% (từ `VA 0x1C6DC`, `VA 0x1C744`, `wasd_deadzone.pcapng` và `VA 0x12FE8..0x13636`)

Trong đó `cell = (pos_0 >> 5) * 21 + (pos_0 & 0x1F)` (`0..125`), với `pos_0 = lookup_0x4A20(keyValue) - 1` (`VA 0x0D0A8`):

| Field ID | Write Handler (`0x1C6DC`) | Read Handler (`0x1C744`) | Địa chỉ SRAM | Ý nghĩa thực tế & Bằng chứng Disassembly / Capture | 
| ----- | ----- | ----- | ----- | ----- | 
| `0x00` (0) | `0x0B01A` | `0x0B2B2` | `0x20003220 + 2*cell` | **Remap (Layer 0)**: mã phím `u16` (`Fn = 0xF001`, các phím chuẩn = HID usage byte). | 
| `0x01` (1) | `0x0B04E` | `0x0B2FC` | `0x2000331E + 2*cell` | **Fn Layer (Layer 1)** action code. | 
| `0x02` (2) | `0x0B06E` | `0x0B31C` | `0x20004FD6 + 2*cell` | Tham số phụ A. | 
| `0x03` (3) | `0x0B08C` | `0x0B33A` | `0x200050D2 + 2*cell` | Tham số phụ B. | 
| **`0x04` (4)** | **`0x0B0AA`** | **`0x0B358`** | **`0x2000341A + 2*cell`** | **Actuation Point / Travel (µm)**: Điểm nhận phím (`100..3400 µm` cho switch `0,1`; `100..3300 µm` cho switch `2,3`). Đọc tại `VA 0x13206`. | 
| `0x05` (5) | `0x0B0CE` | `0x0B376` | `0x20003516 + 2*cell` | **MPT Depth 1 (µm)** (cùng địa chỉ ghi bởi opcode `0x27` tại `VA 0x0BB68`). | 
| `0x06` (6) | `0x0B0EA` | `0x0B390` | `0x20003612 + 2*cell` | **MPT Depth 2 (µm)**. | 
| `0x07` (7) | `0x0B106` | `0x0B3AA` | `0x2000370E + 2*cell` | **MPT Depth 3 (µm)**. | 
| **`0x08` (8)** | **`0x0B122`** | **`0x0B3C4`** | **`0x200051CC + cell` (u8)** | **Key Mode / Header (`u8`)**: `bit 5 (0x20)` = **Bật Rapid Trigger** (`VA 0x13504`) và khóa `Travel` không bị `0x29` ghi đè (`VA 0x0C0DC`); `0x00` = **Tắt Rapid Trigger**; `bits 0..3` = loại Advanced Key (`1=DKS, 2=MPT, 3=MT, 4=TGL, 5=END, 7=SOCD`). | 
| `0x09..0x13` | `0x0B14C` (noop) | `0x0B3DC..0x0B3EA` | Hall runtime arrays | Chỉ đọc: raw ADC, calibrated min, live travel, flags. | 
| **`0x14` (20)** | **`0x0B150`** | **`0x0B402`** | **`0x2000380A + 2*cell`** | **Rapid Trigger Press Sensitivity (µm)**: Độ nhạy nhấn RT (`10..3400 µm`). Đọc tại `VA 0x1352E`. Sanitizer tại `VA 0x12D6A`: nếu `<= 9` sẽ tự reset về `300 µm` (`0.30 mm`). | 
| **`0x15` (21)** | **`0x0B16A`** | **`0x0B41C`** | **`0x20003906 + 2*cell`** | **Rapid Trigger Release Sensitivity (µm)**: Độ nhạy nhả RT (`10..3400 µm`). Đọc tại `VA 0x13538`. Sanitizer tại `VA 0x12D80`: nếu `<= 9` sẽ tự reset về `300 µm` (`0.30 mm`). | 
| **`0x16` (22)** | **`0x0B184`** | **`0x0B436`** | **`0x20003FEC + 2*cell`** | **Top Deadzone (µm)**: Vùng chết trên (`0..1000 µm`). Kiểm chứng 100% trong `wasd_deadzone.pcapng` (`#03`: W/A/S/D `150 µm = 0.15 mm`; `#11`: W/A/S/D `1000 µm = 1.00 mm`). Đọc tại `VA 0x13202` (`effective_actuation = max(TopDeadzone, Travel)`) và `VA 0x13572`. Sanitizer tại `VA 0x12C72`: nếu `> 1000 µm`, reset về `200 µm` (`0.20 mm`). | 
| **`0x17` (23)** | **`0x0B19E`** | **`0x0B450`** | **`0x200040E8 + 2*cell`** | **Bottom Deadzone (µm)**: Vùng chết dưới (`0..1000 µm`). Kiểm chứng 100% trong `wasd_deadzone.pcapng` (`#06`: W/A/S/D `200 µm = 0.20 mm`; `#13`: W/A/S/D `1000 µm = 1.00 mm`). Đọc tại `VA 0x1357C` (`effective_bottom = max_travel - BottomDeadzone`). Sanitizer tại `VA 0x12C90`: nếu `> 1000 µm`, reset về `200 µm` (`0.20 mm`). | 
| `0x18` (24) | `0x0B14C` (noop) | `0x0B436` | `0x20003A02 + 2*cell` | Reserved (`0`). | 
| **`0x19` (25)** | **`0x0B1CE`** | **`0x0B482`** | **`0x200045F4 + 2*cell`** | **Switch Type ID (`0..3`)**: Chọn đường cong LUT Hall ADC → Travel (`VA 0x1D48C`, đọc tại `VA 0x130C6`) và giới hạn hành trình tối đa (`3400 µm` cho `0,1`; `3300 µm` cho `2,3` tại `VA 0x12CEA`). | 

### Kiểm chứng thực tế từ `wasd_deadzone.pcapng`

Toàn bộ 15 gói tin trong `wasd_deadzone.pcapng` ghi và phản hồi `0x23` (`LEN = 0x39`) cho 4 phím **W (`0x1a`)**, **A (`0x04`)**, **S (`0x16`)**, **D (`0x07`)**:
- **`#03 OUT`**: `5C 39 23 EE | 01 | 1a 16 96 00 | 04 16 96 00 | 16 16 96 00 | 07 16 96 00 | 00...` → Ghi **Top Deadzone (`0x16`) = `0x0096` (`150 µm = 0.15 mm`)**.
- **`#06 OUT`**: `5C 39 23 EE | 01 | 1a 17 c8 00 | 04 17 c8 00 | 16 17 c8 00 | 07 17 c8 00 | 00...` → Ghi **Bottom Deadzone (`0x17`) = `0x00C8` (`200 µm = 0.20 mm`)**.
- **`#11 OUT`**: `5C 39 23 EE | 01 | 1a 16 e8 03 | 04 16 e8 03 | 16 16 e8 03 | 07 16 e8 03 | 00...` → Ghi **Top Deadzone (`0x16`) = `0x03E8` (`1000 µm = 1.00 mm`)**.
- **`#13 OUT`**: `5C 39 23 EE | 01 | 1a 17 e8 03 | 04 17 e8 03 | 16 17 e8 03 | 07 17 e8 03 | 00...` → Ghi **Bottom Deadzone (`0x17`) = `0x03E8` (`1000 µm = 1.00 mm`)**.
- Lưu ý: Web chính hãng đệm các slot trống bằng `00 00 00 00` trên gói `OUT` và bàn phím phản hồi `ff ff ff 00` trên gói `IN` (`0xA3`). Hàm `decodeFieldWritePayload` trong `src/protocol/xsyd/features.ts` đã hỗ trợ bỏ qua cả hai kiểu đệm `0xFF` và `0x00`.

## 5. Đính chính quan trọng #2: Opcode `0x29` là Global Actuation (`VA 0x0C092..0x0C12E`)

* Khi `payload[0] == 0x01` (**Write**): Đọc `u16_le` tại `payload[3..4]`, kiểm tra `100 <= val <= 4000`, lưu vào `0x200031E8`, và cập nhật `Travel (0x04)` cho mọi phím có `(Header[cell] & 0x30) == 0`.
* Khi `payload[0] == 0x00` (**Read**): Trả về `0xA9` với `payload[3..4] = *(u16*)0x200031E8`.

## 6. Đính chính quan trọng #3: Bảng Sector Flash 4 Profile (`VA 0x11B5E`), Lệnh `0x00 0x70` (`VA 0x16342`) & Lỗi Profile 0

| Profile (`slot`) | Sector 0 | Sector 1 | Sector 2 (`0x23`/`0x29` Fields) | Sector 3 (`0x2A` Per-Key RGB) | Sector 4 (`0x18` Global RGB) | 
| ----- | ----- | ----- | ----- | ----- | ----- | 
| **Profile 0 (`0`)** | `0x08021000` | `0x08020000` | **`0x08022000`** | `0x08025000` | `0x08023000` | 
| **Profile 1 (`1`)** | `0x08027000` | `0x08026000` | **`0x08028000`** | `0x0802B000` | `0x08029000` | 
| **Profile 2 (`2`)** | `0x0802D000` | `0x0802C000` | **`0x0802E000`** | `0x08031000` | `0x0802F000` | 
| **Profile 3 (`3`)** | `0x08033000` | `0x08032000` | **`0x08034000`** | `0x08037000` | `0x08035000` | 

* Khi ghi `0x23`, firmware chỉ cập nhật SRAM và đặt bộ đếm trễ **500 ms** (`VA 0x07E28` → `0x11914`) trước khi ghi xuống Flash.
* Lệnh `0x00 0x70 <slot>` (`VA 0x16342`) gọi ngay `VA 0x12AF4` đọc lại Flash đè lên SRAM. `XsydDeviceManager.request()` đã chặn các lệnh `0x00 0x70` lặp lại trên cùng profile đang mở trong cửa sổ chờ flush Flash.

## 7. Đính chính quan trọng #4: Bảng 4 Switch (`field 0x19`) & Đường cong LUT Hall ADC → Travel (`VA 0x1D48C`, `0x04E44`, `0x05644`)

| `field 0x19` (`switch_id`) | Tên Switch | Con trỏ LUT Flash (`681 × u16`) | Hành trình tối đa (`VA 0x12CEA`) | ID trong OpenAula | 
| ----- | ----- | ----- | ----- | ----- | 
| **`0`** | **Leobog Wing Chun / Graywood** (`yongchun`) | `VA 0x04E44` (Curve 0) | **`3400 µm` (`3.40 mm`)** | `'switch-4'` (`'wing-chun'`) | 
| **`1`** | **Gateron / AULA Magnetic Jade Pro** (`jadepro`) | `VA 0x04E44` (Curve 0) | **`3400 µm` (`3.40 mm`)** | `'switch-1'` (`'jade-pro'`) | 
| **`2`** | **AULA Black King / Black Emperor / Uranus** (`blackemperor`) | `VA 0x05644` (Curve 1) | **`3300 µm` (`3.30 mm`)** | `'black'` (`'switch-3'`) | 
| **`3`** | **TTC King / Meteor Magnetic** (`TTCKING`) | `VA 0x05644` (Curve 1) | **`3300 µm` (`3.30 mm`)** | `'white'` | 

## 8. Đính chính quan trọng #5: Giao thức Rhythm Sync (`0x18` mode `0x15` + 5 × 14-slot `0x2A`) từ `rhythm_capture.pcapng` & `VA 0x0C12E..0x0C2D0`

> 🔴 **ĐÍNH CHÍNH `aula_win68_rgb_sync_capture.md` CŨ:**
> 1. **Nhầm chiều gói tin (`0x2A` vs `0xAA`):** File MD cũ tưởng `OUT 5C 39 2A F4` là gói rỗng do host hỏi và `IN 5C 39 AA 74` là bàn phím tự sinh màu theo nhạc. Thực tế tại `VA 0x0C1A6..0x0C2CC`, **host tính màu theo nhạc và gửi xuống bàn phím qua `OUT 5C 39 2A <CK> | 01 + 14 × [keyValue, R, G, B]`**, còn bàn phím ghi vào mảng SRAM `user_rgb` (`0x20001EF8 + 3*cell`), đổi `payload[0] = 0x00` và **echo nguyên vẹn 14 slot đó về host trong `IN 5C 39 AA <CK>`**!
> 2. **Đọc thiếu slot thứ 14 (64 phím thay vì 68 phím):** File MD cũ chỉ lặp `13` slot mỗi gói (`52` byte) thay vì **14 slot** (`LEN = 0x39 = 57` byte = `1 + 14 × 4`), nên làm rơi mất slot thứ 14 (`frame[57..60]`) của Batch 0–3 chính là 4 phím **`Backspace (42)`**, **`BracketRight (48)`**, **`Quote (52)`** và **`ShiftRight (229)`**! Đủ **68 phím** (`4 × 14 + 12 = 68`) đều có LED và đều được cập nhật trong mỗi chu kỳ 5 gói.
> 3. **Không gây hao mòn Flash (`VA 0x0C27C..0x0C28C`):** Firmware chỉ gọi hàm ghi Flash `VA 0x11D70` nếu gặp slot đặc biệt `FE FE FE FE`. Các gói `0x2A` stream Rhythm chỉ ghi trực tiếp vào SRAM `0x20001EF8`.

## 9. Trạng thái `OpenAula-main` sau khi sửa

| Thành phần | File | Trạng thái | 
| ----- | ----- | ----- | 
| Per-key Fields, Deadzone & `0x29` | `src/protocol/xsyd/features.ts` | Đã kiểm chứng byte-for-byte với `wasd_deadzone.pcapng`; hỗ trợ đầy đủ `0x14` (`RapidTriggerPress`), `0x15` (`RapidTriggerRelease`), `0x16` (`TopDeadzone`), `0x17` (`BottomDeadzone`), `0x08` (`Header`), `0x19` (`SwitchType`), `0x29` Global Actuation và lọc cả padding `0xFF` lẫn `0x00` | 
| Encoder / Hydrator / Guard | `src/protocol/xsyd/device.ts` | Ghi/đọc tách biệt Press/Release RT (`0x14`/`0x15`) và Top/Bottom Deadzone (`0x16`/`0x17`, kẹp `0..1000 µm` khớp `VA 0x12C72`); kẹp `maxTravelUm` theo switch (`3400` vs `3300 µm`); chặn `0x00 0x70` lặp lại trong cửa sổ 500 ms Flash flush | 
| Rhythm Sync (`0x2A` 5 × 14-slot) | `src/protocol/xsyd/rgb.ts`, `src/protocol/serviceLighting.ts`, `src/components/RhythmSyncEditor.tsx`, `src/keyboard/rhythm.ts`, `service/native/rhythm_core.h` | Hỗ trợ Rhythm Sync cho WIN 68 HE MAX cả qua WebHID trực tiếp trên trình duyệt (Web Audio System/Tab, Mic, hoặc Built-in Synth) lẫn qua Windows background service (`Hero68RgbService.exe`), khớp byte-for-byte với `rhythm_capture.pcapng` (`#0014` mode `0x15` init + 5 gói `0x2A` `LEN=0x39`, `CK=0xF4`) | 
| Switch Profiles & UI | `src/protocol/hero68/switchProfiles.ts`, `src/app/switchAssets.ts`, `src/pages/SwitchSelectorPage.tsx` | Hỗ trợ đầy đủ 4 switch phần cứng WIN 68 HE MAX (`0: Wing Chun 3.4mm`, `1: Jade Pro 3.4mm`, `2: Black King 3.3mm`, `3: Meteor / TTC King 3.3mm`) | 
| Đồng bộ Profile 0 & Deadzone UI | `src/app/hooks/useDeviceSyncController.ts` | Loại bỏ lỗi trộn `draft.rgb` của HERO68 vào Profile 0, giữ nguyên trạng thái bật/tắt Deadzone khi đọc lại `0.00 mm`, và xác nhận lại `hydrateFromXsydDevice` sau khi lưu | 
