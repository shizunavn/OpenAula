# Giao thức WebHID `hub.aulacn.com` cho AULA HERO 68 HE & HERO 84 HE

Tài liệu này tổng hợp kết quả dịch ngược tĩnh (static reverse-engineering) từ gói bundle chính thức của hãng AULA tại `https://hub.aulacn.com` (lưu trong `hub-aulacn/assets/`) và đối chiếu trực tiếp với bản chụp driver cũ `public/vendor-tap/vendor/app-CPb3bToC.js` (`https://hero.aulastar.com`).

---

## 0. Cấu trúc tổng thể của `hub-aulacn/assets/` (Phân biệt SDK Bàn phím & Chuột)

`hub.aulacn.com` là trình điều khiển hợp nhất (Unified Hub) cho nhiều dòng thiết bị OEM khác nhau của AULA. File `hub-aulacn/assets/TglCKVxb.js` (dài ~3.88 MB, 161 dòng) đóng gói **nhiều SDK độc lập**:

1. **ByteTech Keyboard SDK v3 (`sdkModuleName = "bytech"`, `y2e.protocolVersion = "v3"`) — `hub-aulacn/assets/TglCKVxb.js:135:1` đến `135:381107`**:
   - Đây là **driver thực sự** điều khiển `HERO 68 HE`, `HERO 84 HE`, `HERO 68 MINI`, `WIN68HE Ultra`, `HERO 99 HE`, `HERO 87 HE`, `AULA HERO 75 HE` và `8K Wireless Receiver` (`PID 0x106c`).
   - Được nạp từ `hub-aulacn/assets/index-C8V0TbLC.js:1:811159` (bảng thiết bị `Qd`) và khởi tạo tại `hub-aulacn/assets/lOOnMSaF.js:1:40928` (`new r.default(device, { connectType })`).
2. **Mouse SDK (`t1t = nu(UFe)`) — `hub-aulacn/assets/TglCKVxb.js:138:1` đến `138:176750`**:
   - Điều khiển các dòng **chuột AULA** (`V3 Ultra B`, `AULA-L9 Mouse`, `AULA-SC800 Max`, `X5 Ultra` trong bảng `Td` tại `index-C8V0TbLC.js:1:883992` và hộp thoại cập nhật firmware chuột `L9Update` tại `hub-aulacn/assets/BxtVQQqU.js:1:23890`).
   - Dùng `vendorId: 0x38a6`, `productId: 0x28fc / 0x28fe / 0x2f09`, `usagePage: 0xffa8` (`65448`), `usage: 0x02`, và gửi report với `reportId = 11` (`TglCKVxb.js:138:82236`: `this.device.sendReport(11, new Uint8Array(S))`).
   - Các chuỗi `queryMouseBtnCfgCmd` (`TglCKVxb.js:138:4738`) và `rateIdToCfg` (`TglCKVxb.js:138:4704`) thuộc về **Mouse SDK này**, **không phải** lệnh của bàn phím `HERO 68 HE` / `HERO 84 HE`.
3. **OEM Keyboard SDK khác (`0x1ca5` / `usagePage 0xffa0`) — `hub-aulacn/assets/TglCKVxb.js:152:1` đến `152:859000`**:
   - Dùng cho dòng `HERO 68 HE ULTRA` (`VID 0x1ca5`, `PID 0x0407`) và `HERO 68 HE PRO` (`VID 0x1ca5`, `PID 0x0409`) trong bảng `qd` (`index-C8V0TbLC.js:1:854600`), giao tiếp qua `sendFeatureReport` / `receiveFeatureReport` với `reportId = 3` (`0x03`) và hàm `_combinePackets` / `pendingCommands` (`TglCKVxb.js:152:78876`, `152:79941`).

Phần dưới đây đi sâu vào **ByteTech Keyboard SDK v3 (`TglCKVxb.js:135`)** dành cho `HERO 68 HE` và `HERO 84 HE` (`VID 0x372e`).

---

## 1. Chốt giao thức ByteTech v3 (`TglCKVxb.js:135`)

### 1.1. Chọn thiết bị (`navigator.hid.requestDevice` & `getDevices`)

- **Bảng cấu hình thiết bị (`Qd`) trong `hub-aulacn/assets/index-C8V0TbLC.js:1:811159` – `1:814950`**:
  - **Cáp USB (Wired)**:
    - `name`: `"HERO 68 HE"`, `"HERO 84 HE"`, `"HERO 68 MINI"`, `"WIN68HE Ultra"`, `"HERO 99 HE"`, `"HERO 68 Air"`, `"HERO 68 XS"`, `"AULA HERO 75 HE"`, `"HERO68 MINI Air"`, `"HERO 87 HE"`, `"HERO 108"`
    - `vId` (`vendorId`): `14126` (`0x372e`)
    - `pId` (`productId`): `4158` (`0x103e`)
    - `usagePage`: `65376` (`0xff60`)
    - `usage`: `97` (`0x61`)
    - `deviceType`: `1` (Keyboard)
  - **Đầu thu không dây 8K (`8K Wireless Receiver`)**:
    - `name`: `"8K Wireless Receiver"` (`index-C8V0TbLC.js:1:811920`)
    - `vId` (`vendorId`): `14126` (`0x372e`)
    - `pId` (`productId`): `4204` (`0x106c`)
    - `usagePage`: `65376` (`0xff60`)
    - `usage`: `97` (`0x61`)
    - `wireless`: `1`
- **Bộ lọc mặc định trong SDK (`rD` và `kAt` / `SAt`)**:
  - `TglCKVxb.js:135:275737`:
    ```js
    rD = { vendorId: 14126, usage: 97, usagePage: 65376, productId: 0 }
    ```
  - `TglCKVxb.js:135:276840`:
    ```js
    bFe = new Set([4204]) // 0x106c = Wireless 8K Receiver
    ```
  - `TglCKVxb.js:135:277701` (`kAt` / `class cs`): Kiểm tra `device.vendorId === filter.vendorId`, `(filter.productId === 0 || device.productId === filter.productId)` và `device.collections.some(c => c.usage === 97 && c.usagePage === 65376)`.
  - `index-C8V0TbLC.js:1:953850`: Gọi `navigator.hid.requestDevice({ filters })` với danh sách `{ vendorId, productId, usage, usagePage }` lấy từ các bảng thiết bị (`O1`).

### 1.2. Mở thiết bị & Phát hiện `reportId`

- **Mở thiết bị (`open`)**:
  - Trong `SAt.detect` (`TglCKVxb.js:135:278240`) và `y2e.open` (`TglCKVxb.js:135:239412`):
    ```js
    if (!device.opened) await device.open();
    ```
  - Ngay khi detect, SDK gọi `y2e.readDeviceUUID(device, { connectType })` (`TglCKVxb.js:135:275126`) gửi lệnh `0x82` (sub `0x01`) để đọc 6 byte UUID big-endian (`u48be`) định danh model bàn phím.
- **Tự động phát hiện `reportId` (`a2e` tại `TglCKVxb.js:135:23425`)**:
  - Thay vì gán cứng `reportId = 9` ở tầng transport, hàm `a2e(device)` duyệt `device.collections`:
    ```js
    const col = device.collections.find(
      c => c.inputReports && c.inputReports.length > 0 && c.outputReports && c.outputReports.length > 0
    );
    const reportId = col?.outputReports?.[0]?.reportId;
    ```
  - Trên `HERO 68 HE` và `HERO 84 HE` (`usagePage: 0xff60, usage: 0x61`), descriptor trả về `reportId = 9` (`0x09`).

### 1.3. Xây dựng Report có dây (Wired Framing, Header, Checksum/CRC)

Cấu hình khung truyền có dây được định nghĩa tại `MPe` (`TglCKVxb.js:135:38789`) và lớp codec `TPe` (`TglCKVxb.js:135:40873`):

- **Kích thước gói (`MPe` tại `TglCKVxb.js:135:38789`)**:
  - `totalPacketSize`: `63` byte (chưa tính 1 byte `reportId = 0x09` do WebHID `sendReport(reportId, payload)` gắn ở đầu; tổng trên đường truyền USB là **64 byte**).
  - `headerLength`: `6` byte (index `0..5` của payload 63 byte).
  - `tailLength`: `1` byte (index `62` của payload 63 byte).
  - `validDataLength`: `63 - 6 - 1 = 56` byte dữ liệu mỗi gói (`TglCKVxb.js:135:41016`).
- **Cấu trúc Header 6 byte (trên payload 63 byte gửi vào `sendReport(9, payload)`)**:

| Offset (Payload 63B) | Offset (Frame 64B có ReportID) | Tên trường trong `MPe` / `TPe` | Ý nghĩa |
|---|---|---|---|
| — | `0` | `reportId` | `0x09` (tự động lấy từ `outputReports[0].reportId`) |
| `0` | `1` | `commandIdIndex` (`0`) | Mã lệnh (`cmd`). Lệnh ghi: `0x03..0x29`; lệnh đọc: `cmd | 0x80` (`0x82..0xa9`) |
| `1` | `2` | `commandParamIndex` (`1`) | Tham số lệnh (`zone` / `sub` hoặc giá trị `encodeLayerAndSystem(layer, system)`) |
| `2` | `3` | `header[2]` | Mặc định `0`. Được ghi đè trong: (a) `buildMacroCommands` (`135:85458`): byte cao của offset địa chỉ `((packetIdx * 56) >> 8) & 0xff`; (b) `buildAdvancedKeyCommands` (`135:86665`): mã `type` của Advanced Key (`0..7`); (c) `iFe` RecordedLighting (`135:180379`): 4 bit cao của tổng số gói và chỉ số gói 12-bit |
| `3` | `4` | `totalPacketLengthIndex` (`3`) | Tổng số gói của lần truyền (`totalPackets >= 1`) |
| `4` | `5` | `currentPacketIndex` (`4`) | Chỉ số gói hiện tại (`0 .. totalPackets - 1`) |
| `5` | `6` | `lengthIndex` (`5`) | Độ dài dữ liệu thực tế trong gói (`0 .. 56`) |
| `6..61` | `7..62` | `data` | Vùng dữ liệu (tối đa `56` byte, phần dư điền `0x00`) |
| `62` | `63` | `checksumIndex` (`62`) | Byte kiểm tra tổng (`calculateCrc`) |

- **Mã hóa Layer & Hệ điều hành vào `commandParam` (`encodeLayerAndSystem` tại `TglCKVxb.js:135:84339`)**:
  ```js
  encodeLayerAndSystem(layer = 0, system = 0) {
    return (layer & 3) | ((system & 7) << 2);
  }
  ```
  - `layer`: `0..3` (`Fn0..Fn3`, chiếm bit `0..1`).
  - `system`: `0 = All`, `1 = Win`, `2 = Mac` (`UX` enum tại `TglCKVxb.js:135:38541`, chiếm bit `2..4`).
  - Được dùng trong `readKeyFunctions` (`0x83`), `writeKeyFunctions` (`0x03`), `readAdvancedKeys` (`0x92`), `buildAdvancedKeyCommands` (`0x12`), `resetKeyLayer` (`0x11`).
- **Thuật toán Checksum/CRC (`TPe.calculateCrc` tại `TglCKVxb.js:135:43308`)**:
  ```js
  calculateCrc(packet63) {
    packet63[62] = 0;
    const sum = packet63.reduce((acc, b) => acc + b, this.reportId);
    return 255 - (sum % 256); // tương đương (0xff - (sum & 0xff)) & 0xff
  }
  ```

### 1.4. Chia gói & Ghép gói nhiều mảnh (Multi-Packet Splitting & Reassembly)

Trong `TglCKVxb.js:135`, có **3 cơ chế chia/ghép gói** ở các tầng khác nhau:

1. **Tầng Lệnh Chuẩn (`TPe.encode` / `TPe.decode` / `calculateAlignedDataSize`)**:
   - **Căn chỉnh kích thước record (`calculateAlignedDataSize` tại `TglCKVxb.js:135:41103`)**:
     - Khi truyền danh sách bản ghi có độ dài cố định `unitSize` (ví dụ: 5 byte/phím cho Actuation/RGB, 8 byte/phím cho RT/Deadzone, 3 byte/phím cho Switch, 6 byte/phím cho Remap), mỗi gói chỉ chứa tối đa:
       ```js
       chunkSize = Math.floor(56 / unitSize) * unitSize;
       ```
     - Tránh việc một bản ghi phím bị cắt đôi giữa 2 gói HID.
   - **Chia gói (`TPe.encode` tại `TglCKVxb.js:135:41195`)**:
     - Chia `data` thành `u = Math.max(Math.ceil(data.length / chunkSize), 1)` gói 63 byte, điền `totalPackets = u`, `currentPacket = 0..u-1`, `dataLength = slice.length`, và tính `calculateCrc` cho từng gói.
   - **Ghép gói phản hồi (`TPe.decode` tại `TglCKVxb.js:135:42555` & `l2e.send` tại `135:57054`)**:
     - Khi gửi mảng gói `Uint8Array[]`, `l2e.send` đẩy tuần tự từng gói vào `this.queue`, chờ thiết bị trả về gói phản hồi khớp `(commandId, commandParam, totalPackets, currentPacket)` (`isValidResponse` tại `135:42320`), sau đó gọi `TPe.decode(responses)` để cắt `slice(6, 6 + dataLength)` của từng `DataView` và nối (`concat`) lại thành một `DataView` duy nhất.

2. **Tầng Giao vận Không dây 8K (`vFe` / `KBWirelessTransportV3` tại `TglCKVxb.js:135:223199` & `yFe` tại `135:237624`)**:
   - Áp dụng khi kết nối qua **8K Wireless Receiver** (`PID 0x106c`, `connectType = VZ.Wireless8K = 1`).
   - Cấu hình `mFe = { timeout: 100, retries: 10, maxByteSize: 20, maxPayloadLength: 64, debug: false }` (`135:223120`).
   - **Đóng gói phát (`yFe.doSend` tại `135:237941` & `vFe.send` tại `135:224056`)**:
     1. Ghép `reportId` (`0x09`) vào đầu gói 63 byte của `TPe` để tạo mảng **64 byte** (`[0x09, ...packet63]`).
     2. Hàm `splitFrame` (`135:229972`) cắt 64 byte thành **5 khung (frames)**, mỗi khung chứa tối đa `validDataSize = 20 - 1 - 4 - 1 = 14` byte dữ liệu (`14 + 14 + 14 + 14 + 8 = 64` byte).
     3. Với mỗi khung `o = 0..i-1`, tăng bộ đếm đồng bộ 3-bit `this.syncFlag = (this.syncFlag + 1) & 7` (`syncFlagIncrease` tại `135:223991`).
     4. Hàm `buildFrame(total, current, chunk)` (`135:229659`, với `current = 1..total`) đóng khung **19 byte** (`maxPayloadSizePerPacket = 19`, điền `0x00` ở cuối qua `fillPayload` tại `135:230392`):
        - `byte[0]`: `0x66` (`102` — magic header `cFe`)
        - `byte[1]`: `(total & 0x7f) | ((syncFlag & 4) << 5)` (bit 7 mang bit 2 của `syncFlag`)
        - `byte[2]`: `(current & 0x7f) | ((syncFlag & 2) << 6)` (bit 7 mang bit 1 của `syncFlag`)
        - `byte[3]`: `(chunk.length & 0x7f) | ((syncFlag & 1) << 7)` (bit 7 mang bit 0 của `syncFlag`)
        - `byte[4 .. 4 + chunk.length - 1]`: dữ liệu `chunk` (`<= 14` byte)
        - `byte[4 + chunk.length]`: `checksum = sum(byte[0 .. 4 + chunk.length - 1]) & 0xff` (`calculateChecksum` tại `135:231637`)
        - `byte[4 + chunk.length + 1 .. 18]`: `0x00` (padding đủ 19 byte)
     5. Hàm `sendAndWaitAck` (`135:228661`) lưu khóa giao dịch `${syncFlag}-${total}-${current}` vào `this.pendingTransmissions` (`Map`), gọi `this.device.sendReport(this.reportId, frame19)` (`135:229591`), và đợi khung ACK từ dongle (`timeout = 100ms`, tối đa `10` lần thử).
   - **Nhận khung, trả lời ACK & Ghép gói (`vFe.handleInputReport` tại `135:225107` & `combinePackets` tại `135:227848`)**:
     - Khi nhận `inputreport` có `byte[0] === 0x66`:
       - Nếu `length === 0` và `byte[4] === sum(byte[0..3]) & 0xff` (`isAckFrame` tại `135:231390`): gọi `handleAckFrame` (`135:228099`) giải phóng promise trong `this.pendingTransmissions`.
       - Nếu là khung dữ liệu hợp lệ (`isValidReceivedFrame` tại `135:230738`):
         1. Gửi trả khung ACK 19 byte (`buildAckFrame` tại `135:231750`: giữ nguyên `byte[0..2]`, đặt `byte[3] = (byte[3] & 0x80) | 0`, `byte[4] = sum(byte[0..3]) & 0xff`, pad `0x00` đủ 19 byte).
         2. Kiểm tra chống trùng lặp qua `this.receiveSyncFlag === syncFlag` và kiểm tra thứ tự `current === this.receivedPackets.length + 1` (nếu `current === 1` thì xóa buffer cũ).
         3. Khi nhận đủ `current === total`, gọi `this.combinePackets(this.receivedPackets)` (`135:227848`) để trích `slice(4, 4 + length)` của từng khung, nối lại thành một `DataView` hoàn chỉnh và chuyển lên `l2e.handleInputReport` qua `notifyBusinessLayer`.

3. **Tầng Đèn ghi âm / Màn hình GIF 12-bit (`iFe` tại `TglCKVxb.js:135:180379` & `oFe` tại `135:199449`)**:
   - Với dữ liệu có số gói `> 255` (như frame ảnh GIF/màn hình `0x28`/`0x29` hoặc Recorded Lighting `0x07`/`0x87`), `iFe.encode` mở rộng `totalPackets` và `currentPacket` lên **12 bit**:
     - `byte[2]`: `((totalPackets >> 8) & 0x0f) << 4 | ((currentPacket >> 8) & 0x0f)`
     - `byte[3]`: `totalPackets & 0xff`
     - `byte[4]`: `currentPacket & 0xff`

### 1.5. Gửi dữ liệu (`sendReport` / `sendFeatureReport`) & Nhận dữ liệu (`inputreport` / Bubble Events)

- **Gửi dữ liệu**:
  - ByteTech v3 SDK (`TglCKVxb.js:135`) **chỉ dùng `device.sendReport(this.reportId, payload)`**, **không dùng** `sendFeatureReport`:
    - Có dây (`l2e.doSend` tại `TglCKVxb.js:135:58943`): `await this.device.sendReport(this.reportId, e)` với `e` là `Uint8Array(63)`.
    - Không dây 8K (`vFe.sendReport` tại `TglCKVxb.js:135:229591`): `this.device.sendReport(this.reportId, this.fillPayload(this.ensureUint8Array(e)))` với payload đã pad thành `Uint8Array(19)`.
- **Nhận dữ liệu (`inputreport`)**:
  - Đăng ký bằng `this.device.addEventListener("inputreport", this.onInputReport)` (trong `l2e` tại `TglCKVxb.js:135:56787` và `vFe` tại `135:227739`).
  - Phân loại gói nhận trong `TPe.isBubbleResponse` (`TglCKVxb.js:135:41775`) và `l2e.handleInputReport` (`135:59272`):
    1. **Báo cáo trạng thái kết nối Dongle (19 byte)**:
       - `byteLength === 19 && byte[0] === 0x0a && byte[4] === 0x02` (`135:41838`, `135:45258`): phát sự kiện `device-dongle-connect-change` với `{ connected: byte[5] === 1 }`.
    2. **Sự kiện Bubble chung (`byte[0] === 0xfe` / `254`, `onCommonBubbleResponse` tại `135:45258`)**:
       - `byte[1] === 2`: Thay đổi kết nối dongle (`connected: byte[5] === 1`).
       - `byte[1] === 5`: Trạng thái pin (`level = byte[2]`, `charging = ((byte[3] & 0xf0) >> 4) !== 0`, `full = (byte[3] & 0x0f) !== 0`).
       - `byte[1] === 7`: Đổi chế độ hệ điều hành trên phím (`system-change`, `system = byte[2]`: `1 = Win`, `2 = Mac`).
       - `byte[1] === 9`: Đổi profile trên phím (`profile-change`, `profile = byte[2]`).
       - `byte[1] === 11` (`0x0b`): Đổi hiệu ứng đèn bằng phím tắt (`lighting-effect-change`, `zone = byte[2]`).
       - `byte[1] === 14` (`0x0e`): Đổi trạng thái chức năng (`function-status-change`, `type = byte[2]`, `value = byte[3] !== 0`: `1 = winKeyLocked`, `2 = wasdArrowKeysSwapped`, `3 = allKeysLocked`, `4 = sideLightSync`).
    3. **Stream hành trình phím thời gian thực (`byte[0] === 0x98 && byte[1] === 1`, `onKeyTravelChange` tại `135:46529`)**:
       - Cắt `byte[6 .. 6 + byte[5]]` thành các bản ghi **6 byte**:
         - `id = u16be(rec[0..1])`
         - `distance = u16be(rec[2..3])`
         - `rawAd = u16be(rec[4..5])`, trong đó `press = (rawAd & 0x8000) !== 0` và `ad = rawAd & 0x7fff`.
    4. **Stream hiệu chuẩn (Calibration) thời gian thực (`byte[0] === 0x94 && byte[1] === 2`, `onKeyCalibrationResponse` tại `135:47066`)**:
       - Cắt `byte[6 .. 6 + byte[5]]` thành các bản ghi **6 byte**:
         - `id = u16be(rec[0..1])`
         - `rawAd = u16be(rec[2..3])`, trong đó `press = (rawAd & 0x8000) !== 0`, `finished = !press`, `ad = rawAd & 0x7fff`
         - `min = u16be(rec[4..5])`.

---

## 2. So sánh với Driver cũ (`public/vendor-tap/vendor/app-CPb3bToC.js` — `hero.aulastar.com`)

Driver cũ trong `public/vendor-tap/vendor/app-CPb3bToC.js:29:1187166` – `29:1246000` (class `Lt`, `type_protocol: "kb_by_v3_wired"` và class `Iwt` / `KBWirelessTransportV3`) là thế hệ đầu của giao thức ByteTech v3. Khi chuyển sang `hub-aulacn/assets/TglCKVxb.js:135` (`y2e`, `protocolVersion = "v3"`), hãng AULA đã nâng cấp và mở rộng đáng kể:

| Tiêu chí | Driver cũ (`app-CPb3bToC.js` — `hero.aulastar.com`) | Driver mới (`TglCKVxb.js:135` — `hub.aulacn.com`) |
|---|---|---|
| **Vị trí mã nguồn** | `public/vendor-tap/vendor/app-CPb3bToC.js:29:1187166` (`class Iwt`, `class Lt`) | `hub-aulacn/assets/TglCKVxb.js:135:1` (`TPe`, `l2e`, `vFe`, `yFe`, `y2e`) |
| **Xác định `reportId`** | Gán cứng `report_id_tx: 9, report_id_rx: 9` trong bảng thiết bị (`29:1329641`) | Tự động tìm `outputReports[0].reportId` từ `device.collections` (`a2e` tại `135:23425`, trả về `9`) |
| **Kích thước Payload & Checksum** | Có dây: 63B (+1B reportId = 64B), CRC tại `payload[62] = 255 - (sum % 256)`. Không dây 8K (`Iwt`): khung 19B (+1B reportId = 20B), header `0x66`, 14B data/khung | Giữ nguyên cấu trúc 63B (Wired) và 19B (Wireless 8K `0x66`), nhưng tách rõ `l2e` (Wired) và `yFe` (Wireless8K kế thừa `l2e`) |
| **Mã hóa Layer & OS (`byte[1]`)** | Chỉ truyền `layer` (`0..3`) vào `payload[1]` (`this.payload[1] = i` tại `29:1197848`) | Dùng `encodeLayerAndSystem(layer, system)` (`(layer & 3) | ((system & 7) << 2)` tại `135:84339`) để phân tách bảng phím theo hệ điều hành (`All=0, Win=1, Mac=2`) |
| **Batching & Căn chỉnh gói** | Cắt mảng thủ công ở từng hàm (`O1(s, 55)`, `O1(s, 48)`, `O1(o, 22)`, `O1(o, 12)`), nhiều hàm chỉ lấy gói đầu (`total=1, idx=0`) | Dùng chung `calculateAlignedDataSize(unitSize)` (`Math.floor(56 / unitSize) * unitSize` tại `135:41103`) và tự động đánh số `totalPackets` / `currentPacket` trong `TPe.encode` |
| **Hiệu ứng đèn (`0x04`/`0x84`)** | Chỉ hỗ trợ `zone 1` (Main, 7 byte) và `zone 6` (Edge/Side, 7 byte); byte màu hỗn hợp cố định `0` hoặc `7` | Hỗ trợ **5 vùng đèn**: `zone 1` (Main), `zone 6` (Side), `zone 7` (Logo), `zone 9` (Screen frame), `zone 0x0f` (15, All-Sync), đọc đa vùng (`0x84` sub `0x10`) và hỗ trợ hướng đèn (`direction` ở nibble cao của byte màu: `colorIndex | (direction << 4)`) |
| **Tắt đèn khi ngủ (`0x04`/`0x84` sub `0x13`)** | Ghi nhầm lệnh `0x04` (Write) trong cả `fetch_sleep_level` (`29:1204049`) | Sửa lỗi: dùng `0x84` sub `0x13` để đọc (`readLightsOffTime` tại `135:159609`) và `0x04` sub `0x13` để ghi (`writeLightsOffTime` tại `135:160004`) |
| **Lệnh cấu hình mới (`0x04`/`0x84`)** | Chỉ có `0x11` (OS), `0x13` (Sleep), `0x15` (WinLock), `0x17` (Polling), `0x18` (Combo), `0x19` (AutoCalib), `0x1d` (DebounceMode), `0x1e` (DebounceTime) | Thêm: `0x0e` (System Time sync), `0x10` (Multi-zone lighting), `0x14` (Fn Layer切换), `0x20` (`LowPowerMode` — tiết kiệm pin), `0x21` (`WasdAndArrowKeysExchange` — đổi WASD/Mũi tên), `0x22` (`SideLightSync` — đồng bộ đèn viền) |
| **Lệnh đọc thông tin thiết bị (`0x82`)** | Chỉ đọc `0x01` (UUID), `0x02` (FW version), `0x03` (Switch bitmap), `0x04` (AdvKey bitmap), `0x06` (RT precision), `0x08` (Actuation precision) | Thêm: `0x09` (Sub-device info / Dongle), `0x0a` (Zone LED counts), `0x0b` (Chip ID — 16B), `0x0c` (Build Date YYYYMMDD), `0x0d` (Supported Features flags), `0x0e` (Supported Key Precision), `0x0f` (Supported Polling Rates bitmask + Wireless flag) |
| **Advanced Keys (`0x12`/`0x92`)** | Hỗ trợ 6 loại: `1=TGL`, `2=MT`, `3=DKS`, `4=SOCD`, `5=MPT`, `6=END` | Thêm loại thứ 7: **`7=RS` (Rappy Snappy)** (`135:111191`) và chế độ kích hoạt SOCD theo hành trình (`triggerMode`, `distance1`, `distance2` tại `135:110051`) |
| **Macro (`0x05`/`0x85`, `0x27`/`0xa7`)** | Chỉ có `0x05` (ghi macro) và không dùng byte 2 làm high-byte offset (giới hạn 256 gói) | Thêm `0x85` (`readMacros`), mở rộng địa chỉ offset 16-bit qua `byte[2] = (offset >> 8) & 0xff` (`135:85458`), và thêm `0x27`/`0xa7` (`writeTextMacros`/`readTextMacros`) |
| **Tính năng hoàn toàn mới** | Không có | - `0xa5`: Đọc tọa độ ma trận phím vật lý (`readKeyMatrixPositions`)<br>- `0x22`/`0xa2`: Đọc/ghi phím đặc biệt Fn (`SpecialKeys`)<br>- `0x07`/`0x87`: Đèn ghi âm (`RecordedLighting`)<br>- `0x08`: Stream RGB thời gian thực (`sendLightingData`, có nhánh riêng cho Wireless 8K)<br>- `0x28`/`0x29`/`0xa8`: Màn hình GIF/ảnh RGB565 (`Display`)<br>- `0x7f`: Nhảy vào Bootloader (`enterBootloader`)<br>- Bubble `0xfe` sub `7, 9, 11, 14` (tự động đồng bộ UI khi bấm tổ hợp phím Fn trên bàn phím) |

---

## 3. Bảng Map Lệnh từ `TglCKVxb.js:135` & `index-C8V0TbLC.js` sang OpenAula

Toàn bộ mã lệnh dưới đây được trích trực tiếp từ enum `g2` (`TglCKVxb.js:135:37218`), `b0` (`135:37835`), và lớp `y2e` (`135:238735` – `135:275600`). Không có tham số nào được suy đoán; những mục không tồn tại trong code được ghi rõ là **`chưa xác định`**.

### 3.1. Nhóm Thông tin thiết bị, Hệ thống & Profile (`0x02`/`0x82`, `0x04`/`0x84`, `0x10`/`0x90`, `0x11`, `0x1a`/`0x9a`, `0x87`)

| Tính năng OpenAula | Lệnh (Write / Read) | `byte[1]` (`param` / `zone`) | Cấu trúc Payload (`byte[6..]`) & Giải mã | Vị trí trong `TglCKVxb.js` |
|---|---|---|---|---|
| **Đọc UUID thiết bị** | `—` / `0x82` (`130`) | `0x01` (`1`) | Req: `[0,0,0,0,0,0]` (6B). Resp: 6 byte `u48be` (`UUID` định danh thiết bị) | `readDeviceUUID` (`135:239897`) |
| **Đọc phiên bản Firmware** | `—` / `0x82` (`130`) | `0x02` (`2`) | Req: `[0]`. Resp: `u16le` tại `data[0..1]` (`major = val >> 8`, `minor = val & 0xff`, format `"vMajor.Minor"`) | `readFirmwareVersion` (`135:240499`) |
| **Đọc danh sách Switch hỗ trợ** | `—` / `0x82` (`130`) | `0x03` (`3`) | Req: `[]`. Resp: bitmap các bit từ byte `0..25` cho biết ID switch từ được hỗ trợ | `readSupportedSwitches` (`135:244720`) |
| **Đọc tính năng Advanced Key hỗ trợ** | `—` / `0x82` (`130`) | `0x04` (`4`) | Req: `[]`. Resp: `data[0]` = `maxAdvancedKeyCount`, `data[1..]` = bitmap các loại Advanced Key hỗ trợ | `readSupportedAdvancedKey` (`135:245053`) |
| **Đọc độ chia (Precision) RT & Actuation** | `—` / `0x82` (`130`) | `0x06` (RT), `0x08` (Actuation) | Req: `[]`. Resp: `data[0]` (ví dụ `10` = `0.1mm`, `100` = `0.01mm`, `200` = `0.005mm`) | `readKeyPrecision` (`135:243957`) |
| **Đọc thông tin Sub-device (Dongle)** | `—` / `0x82` (`130`) | `0x09` (`9`) | Req: `[]`. Resp: 8 byte/thiết bị con (`uuid` 6B BE, `type` 1B, `connected` 1B) | `readSubDeviceInfo` (`135:241539`) |
| **Đọc số lượng đèn theo vùng** | `—` / `0x82` (`130`) | `0x0a` (`10`) | Req: `[]`. Resp: `[main, side, logo, status, indicator]` (5 byte) | `readZoneLightingCounts` (`135:242297`) |
| **Đọc Chip ID & Ngày Build** | `—` / `0x82` (`130`) | `0x0b` (`11`), `0x0c` (`12`) | `0x0b`: 16 byte hex Chip ID. `0x0c`: 8 byte ASCII `YYYYMMDD` | `readChipId` (`135:242764`), `readBuildDate` (`135:243238`) |
| **Đọc cờ tính năng thiết bị (`DeviceFeatures`)** | `—` / `0x82` (`130`) | `0x0d` (`13`) | Resp: `data[0]` bit0=`calibration`, bit1=`travelMonitor`, bit2=`deadZone`, bit3=`keySwitch`, bit4=`wasdArrowExchange`; `data[1]`=`maxMacroCount`; `data[2..3]`=`macroBufferSize` (`u16le`); `data[4]`=`sleepTimeOption` | `readSupportedFeatures` (`135:245658`), `jPe` (`135:161598`) |
| **Đọc Polling Rate hỗ trợ & cờ Wireless** | `—` / `0x82` (`130`) | `0x0f` (`15`) | Resp: `u16be` tại `data[0..1]`. Bit 15 (`0x8000`) = `wireless`; bit `0..6` = `[8000, 4000, 2000, 1000, 500, 250, 125]` Hz | `readSupportedReportRates` (`135:246460`), `WPe` (`135:163274`) |
| **Đọc thông tin Pin** | `—` / `0x87` (`135`) | `0x00` (`0`) | Req: `[0]`. Resp: `level = data[0]`, `charging = ((data[1] & 0xf0) >> 4) !== 0`, `full = (data[1] & 0x0f) !== 0` | `readBatteryInfo` (`135:240982`) |
| **Đọc / Ghi Profile hiện hành** | `0x10` (`16`) / `0x90` (`144`) | `0x00` (`0`) | 1 byte: `profileIndex` (`0..2`) | `readCurrentProfile` (`135:255377`), `writeCurrentProfile` (`135:255686`) |
| **Đọc / Ghi tên Profile** | `0x1a` (`26`) / `0x9a` (`154`) | `profileIdx` (`0..2`) | Byte `0`: độ dài chuỗi UTF-8 `len`, Byte `1..len`: tên UTF-8 (nếu `byte[0] === 0xff` là tên mặc định) | `readProfileNames` (`135:256006`), `writeProfileName` (`135:256414`) |
| **Khôi phục cài đặt gốc (Factory Reset)** | `0x06` (`6`) / `—` | `0x00` (`0`) | Ghi 63 byte (`cmd = 0x06`, `totalPackets = 0`), chờ tối đa 5000ms | `factoryReset` (`135:273923`), `buildFactoryResetCommand` (`135:160973`) |
| **Vào chế độ Bootloader (IAP)** | `0x7f` (`127`) / `—` | `0xaa` (`170`) | `byte[0]=0x7f, byte[1]=0xaa, byte[2]=0x55`, CRC tại `byte[62]` | `enterBootloader` (`135:274704`) |

### 3.2. Nhóm Lighting (Đèn nền, Đèn viền, Custom Per-Key RGB, Stream RGB)

| Tính năng OpenAula | Lệnh (Write / Read) | `byte[1]` (`param` / `zone`) | Cấu trúc Payload (`byte[6..]`) & Giải mã | Vị trí trong `TglCKVxb.js` |
|---|---|---|---|---|
| **Đọc / Ghi chế độ đèn theo vùng** | `0x04` (`4`) / `0x84` (`132`) | `zone`: `1`=Main, `6`=Side, `7`=Logo, `9`=Screen, `15`=AllSync | **7 byte**: `[effect, (colorIndex & 0x0f) \| ((direction & 0x0f) << 4), R, G, B, brightness, speed]` (`effect`: `0`=Off, `1..18`=Preset, `19`=Custom; `colorIndex`: `7`=Multicolor, `0`=Single color; `brightness`: `0..20`; `speed`: `0..4`) | `readLighting` (`135:266191`), `writeLighting` (`135:266586`), `FPe` (`135:153629`) |
| **Đọc / Ghi nhiều vùng đèn cùng lúc** | `0x04` (`4`) / `0x84` (`132`) | `0x10` (`16`) | Mỗi vùng **8 byte**: `[zone, effect, colorDirByte, R, G, B, brightness, speed]` | `readMultiZoneLighting` (`135:266996`), `writeMultiZoneLighting` (`135:267415`) |
| **Đọc / Ghi đèn Custom từng phím (Per-key RGB)** | `0x06` (`6`) / `0x86` (`134`) | `0x00` (`0`) | Read (`0x86`): gửi danh sách `keyId` (`u16be`, 2B/phím, tối đa 56B/gói).<br>Write (`0x06`) & Resp (`0x86`): mỗi phím **5 byte** `[keyId_hi, keyId_lo, R, G, B]` (căn chỉnh `11` phím = `55` byte/gói) | `readCustomLighting` (`135:267855`), `writeCustomLighting` (`135:268356`), `NPe` (`135:154572`) |
| **Đồng bộ đèn viền (`SideLightSync`)** | `0x04` (`4`) / `0x84` (`132`) | `0x22` (`34`) | 1 byte: `1` = bật, `0` = tắt | `readSideLightSync` (`135:264301`), `writeSideLightSync` (`135:264618`) |
| **Stream RGB thời gian thực (Music Rhythm / Screen Sync)** | `0x08` (`8`) / `—` | `zone` (`1` = Main) | - **Wired**: chia mảng RGB (`3 * numKeys` byte) qua `TPe.encode(0x08, zone, rgbBytes)` (56B/gói, gửi không đợi phản hồi `sendWithoutResponse`).<br>- **Wireless 8K**: đóng gói khung 20 byte `[0x09, 0x08, zone, 0x00, total, idx, len, ...rgbChunk(12B), crc]` và gửi qua `sendReport` | `sendLightingData` (`135:270987`), `buildSendLightingDataCommands` (`135:156367`) |
| **Đèn ghi âm (`RecordedLighting`)** | `0x07` (`7`) / `0x87` (`135`) | `index` (`0..N`) | Header 12-bit packet (`iFe`), chứa lưới màu các frame ghi sẵn | `readRecordedLighting` (`135:268903`), `writeRecordedLighting` (`135:270277`) |

### 3.3. Nhóm Actuation, Rapid Trigger, Deadzone, Switch & Hiệu chuẩn (Calibration)

| Tính năng OpenAula | Lệnh (Write / Read) | `byte[1]` (`param`) | Cấu trúc Payload (`byte[6..]`) & Giải mã | Vị trí trong `TglCKVxb.js` |
|---|---|---|---|---|
| **Đọc / Ghi điểm nhận phím (Actuation Distance)** | `0x13` (`19`) / `0x93` (`147`) | Write: `layer` (`0`)<br>Read: `0x00` | Read (`0x93`): gửi `u16be` `keyId` (2B/phím).<br>Write (`0x13`) & Resp (`0x93`): mỗi phím **5 byte** `[keyId_hi, keyId_lo, dist_hi, dist_lo, isGlobal]` (căn chỉnh `11` phím = `55` byte/gói). Giá trị thực `mm = rawDist / distancePrecision` | `readTriggers` (`135:250211`), `writeTriggers` (`135:251329`), `buildWriteKeyDistanceCommand` (`135:139543`) |
| **Đọc / Ghi Rapid Trigger (RT)** | `0x19` (`25`) / `0x99` (`153`) | Write: `layer` (`0`)<br>Read: `0x00` | Read (`0x99`): gửi `u16be` `keyId` (2B/phím).<br>Write (`0x19`) & Resp (`0x99`): mỗi phím **8 byte** `[keyId_hi, keyId_lo, rtMode, up_hi, up_lo, down_hi, down_lo, isGlobal]` (căn chỉnh `7` phím = `56` byte/gói). `rtMode`: `0`=Off, `1`=Normal RT, `2`=Continuous RT (`fullRt`) | `readTriggers` (`135:250211`), `writeTriggers` (`135:251329`), `buildWriteRtCommand` (`135:140219`) |
| **Đọc / Ghi Vùng chết (Deadzone / Safe Area)** | `0x16` (`22`) / `0x96` (`150`) | Write: `layer` (`0`)<br>Read: `0x00` | Read (`0x96`): gửi `u16be` `keyId` (2B/phím).<br>Write (`0x16`) & Resp (`0x96`): mỗi phím **8 byte** `[keyId_hi, keyId_lo, top_hi, top_lo, bottom_hi, bottom_lo, isGlobal, enabled]` (căn chỉnh `7` phím = `56` byte/gói) | `readDeadZones` (`135:252645`), `writeDeadZones` (`135:253139`), `PPe` (`135:142843`) |
| **Đọc / Ghi Loại Switch từ (`KeySwitches`)** | `0x15` (`21`) / `0x95` (`149`) | `0x00` (`0`) | Read (`0x95`): gửi `u16be` `keyId` (2B/phím).<br>Write (`0x15`) & Resp (`0x95`): mỗi phím **3 byte** `[keyId_hi, keyId_lo, switchId]` (căn chỉnh `18` phím = `54` byte/gói) | `readKeySwitches` (`135:253657`), `writeKeySwitches` (`135:254151`), `xPe` (`135:141747`) |
| **Bắt đầu / Dừng / Đọc Calibration (`0x94`)** | `—` / `0x94` (`148`) | `0x00` = Start<br>`0x04` = Stop<br>`0x05` = Read AD | `0x05` (Read AD Range): gửi `u16be` `keyId` (2B/phím); trả về **6 byte/phím** `[keyId_hi, keyId_lo, max_hi, max_lo, min_hi, min_lo]` | `startKeyCalibration` (`135:254646`), `stopKeyCalibration` (`135:254897`), `readKeyCalibrations` (`135:255068`) |
| **Bắt đầu / Đọc / Dừng Travel Monitor (`0x98`)** | `—` / `0x98` (`152`) | `0x00` = Start<br>`0x01` = Poll<br>`0x02` = Stop | `0x01`: gửi danh sách `u16be` `keyId`, thiết bị đẩy về các gói bubble `0x98` sub `0x01` (6 byte/phím: `[id, distance, ad_with_press_bit15]`) | `startKeyTravelMonitor` (`135:273196`), `readKeyTravels` (`135:273452`), `stopKeyTravelMonitor` (`135:273688`) |

### 3.4. Nhóm Key Remap, Special Keys, Ma trận phím & Macro (`0x03`/`0x83`, `0x11`, `0x22`/`0xa2`, `0xa5`, `0x05`/`0x85`, `0x27`/`0xa7`)

| Tính năng OpenAula | Lệnh (Write / Read) | `byte[1]` (`param`) | Cấu trúc Payload (`byte[6..]`) & Giải mã | Vị trí trong `TglCKVxb.js` |
|---|---|---|---|---|
| **Đọc tọa độ ma trận phím vật lý (`KeyMatrixPositions`)** | `—` / `0xa5` (`165`) | `0x00` (`0`) | Req: `[0]`. Resp: mảng byte, mỗi byte cho biết vị trí `[row = b >> 4, col = b & 0x0f]` của phím thứ `i + 1` (nếu `b === 0xff` là phím trống) | `readKeyMatrixPositions` (`135:246941`), `parseKeyMatrixResponse` (`135:90665`) |
| **Đọc / Ghi Key Remap (`KeyFunctions`)** | `0x03` (`3`) / `0x83` (`131`) | `encodeLayerAndSystem(layer, system)` | Read (`0x83`): gửi `u16be` `keyId` (2B/phím).<br>Write (`0x03`) & Resp (`0x83`): mỗi phím **6 byte** `[keyId_hi, keyId_lo, code_b3, code_b2, code_b1, code_b0]` (căn chỉnh `9` phím = `54` byte/gói).<br>Nếu gán Macro: `code_b3 = 0x03`, `code_b2 = triggerMode` (`2`=Hold/Button, `1`=Toggle/Circle, `4`=Repeat N lần), `code_b1 = repeatCount`, `code_b0 = macroIndex` | `readKeyFunctions` (`135:247272`), `writeKeyFunctions` (`135:247829`), `buildKeyUpdateCommands` (`135:84505`) |
| **Reset một Layer phím về mặc định** | `0x11` (`17`) / `—` | `encodeLayerAndSystem(layer, system)` | Payload 1 byte: `[0x01]` | `resetKeyLayer` (`135:248440`), `buildResetLayerCommand` (`135:85042`) |
| **Đọc / Ghi Phím đặc biệt (`SpecialKeys`)** | `0x22` (`34`) / `0xa2` (`162`) | `0x00` (`0`) | Mỗi bản ghi **3 byte**: `[fnType, keyId_hi, keyId_lo]` (`fnType`: chức năng tổ hợp Fn đặc biệt) | `readSpecialKeys` (`135:248778`), `writeSpecialKeys` (`135:249065`), `vPe` (`135:89660`) |
| **Đọc / Ghi Macro hành động (`Macros`)** | `0x05` (`5`) / `0x85` (`133`) | Write: `0x00`<br>Read: `macroIdx` | **Bảng Macro tổng hợp (`0x05`)**: Đầu bảng là `N` mục lục 4 byte `[offset_lo, offset_hi, len_lo, len_hi]`, theo sau là từng khối macro `[nameLen, ...utf8Name, ...events]`. Mỗi sự kiện macro dài **4 byte**: `[(keyType & 0xf0) \| ((delay >> 16) & 0x0f), (delay >> 8) & 0xff, delay & 0xff, hidUsage]`, trong đó `keyType`: bit7=`down(0x80)/up(0x00)`, bit6=`modifier(0x40)`, bit5=`mouseWheel(0x20)`, bit4=`mouseBtn(0x10)`.<br>**Lưu ý quan trọng**: `buildMacroCommands` (`135:85458`) ghi byte cao của offset địa chỉ vào `header[2] = ((packetIdx * 56) >> 8) & 0xff`! | `readMacros` (`135:249368`), `writeMacros` (`135:249913`), `buildMacroCommands` (`135:85458`), `SPe` (`135:114842`) |
| **Đọc / Ghi Macro văn bản (`TextMacros`)** | `0x27` (`39`) / `0xa7` (`167`) | `0x00` (`0`) | Bảng offset 4 byte (`offset u16le`, `len u16le`) + chuỗi ASCII/UTF-8 tối đa 120 ký tự/macro | `readTextMacros` (`135:272624`), `writeTextMacros` (`135:272909`), `wPe` (`135:124455`) |

### 3.5. Nhóm Tính năng phím nâng cao (`AdvancedKeys`: `0x12` / `0x92`)

Trong `buildAdvancedKeyCommands` (`TglCKVxb.js:135:86665`) và `bPe` (`135:105825`), `byte[1]` là `encodeLayerAndSystem(layer, system)`, còn **`byte[2]` (header byte 2) chứa mã loại `AdvancedKeyType`**:

| Loại Advanced Key | Mã `byte[2]` (`type`) | Cấu trúc Payload (`byte[6..]`) khi Ghi (`0x12`) & Đọc (`0x92`) | Vị trí trong `TglCKVxb.js` |
|---|---|---|---|
| **Xóa Advanced Key (`Delete`)** | `0` | 3 byte: `[keyId_hi, keyId_lo, 0x00]` (`dataLength = 2` hoặc `3`) | `encodeDeleteData` (`135:111457`) |
| **TGL (Toggle Key)** | `1` | **8 byte**: `[keyId_hi, keyId_lo, code_b3, code_b2, code_b1, code_b0, delay_hi, delay_lo]` | `encodeTglData` (`135:106684`), `parseTglData` (`135:106954`) |
| **MT (Mod-Tap)** | `2` | **12 byte**: `[keyId_hi, keyId_lo, holdCode(4B BE), tapCode(4B BE), delay_hi, delay_lo]` | `encodeMtData` (`135:107381`), `parseMtData` (`135:107740`) |
| **DKS (Dynamic Keystroke)** | `3` | **42 byte**: `[keyId_hi, keyId_lo, dist1(2B BE), dist2(2B BE), dist3(2B BE), dist4(2B BE), slot0(4B code BE + 4B action mask), slot1(8B), slot2(8B), slot3(8B)]` | `encodeDksData` (`135:108294`), `parseDksData` (`135:108914`) |
| **SOCD (Snap Tap)** | `4` | **7..11 byte**: `[keyCount(2), key1_hi, key1_lo, key2_hi, key2_lo, socdMode, triggerMode?, dist1_hi?, dist1_lo?, dist2_hi?, dist2_lo?]` (`socdMode`: `0`=LastWin, `1`=Key1Priority, `2`=Key2Priority, `3`=Neutral) | `encodeSocdData` (`135:110051`), `parseSocdData` (`135:110620`) |
| **MPT (Multi-Point Trigger)** | `5` | **21 byte** (với 3 tầng): `[keyId_hi, keyId_lo, count(3), code1(4B BE), dist1(2B BE), code2(4B BE), dist2(2B BE), code3(4B BE), dist3(2B BE)]` | `encodeMptData` (`135:109509`), `parseMptData` (`135:109815`) |
| **END (End Keystroke / Send on Release)** | `6` | **6..7 byte**: `[keyId_hi, keyId_lo, code(4B BE), triggerOnRelease?]` | `encodeEndData` (`135:106150`), `parseEndData` (`135:106444`) |
| **RS (Rappy Snappy — Mới trên `hub.aulacn.com`)** | `7` | **5 byte**: `[keyCount(2), key1_hi, key1_lo, key2_hi, key2_lo]` | `encodeRsData` (`135:111191`), `parseRsData` (`135:111319`) |

> **Lưu ý khi đọc toàn bộ Advanced Keys (`readAdvancedKeys` tại `135:256903`)**:
> 1. Gửi `0x92` với `param = encodeLayerAndSystem(layer, system)` và `dataLength = 0` (`buildQueryAllKeysCommand` tại `135:85898`) để nhận danh sách các `keyId` (`u16be`) đang gắn Advanced Key.
> 2. Với mỗi `keyId`, gửi `0x92` với `data = [keyId_hi, keyId_lo]` (`dataLength = 2`) để đọc chi tiết cấu hình (loại Advanced Key nằm ở `response[2]`).

### 3.6. Nhóm Performance / TCP (Polling Rate, OS Mode, Win Lock, Debounce, Auto Calibration, Sleep, Low Power)

Tất cả các thiết lập Performance dùng cặp lệnh **`0x04` (Write) / `0x84` (Read)** với mã `param` (`byte[1]`) trong enum `b0` (`TglCKVxb.js:135:37835`):

| Tính năng OpenAula | Lệnh (Write / Read) | `byte[1]` (`param`) | Cấu trúc Payload (`byte[6..]`) & Giải mã | Vị trí trong `TglCKVxb.js` |
|---|---|---|---|---|
| **Đồng bộ thời gian hệ thống (`SystemTime`)** | `0x04` / `—` | `0x0e` (`14`) | **7 byte**: `[year_hi, year_lo, month, day, hour, minute, second]` | `syncSystemTime` (`135:265645`), `buildSyncTimeCommand` (`135:160475`) |
| **Chế độ Hệ điều hành (`SystemType` — Win/Mac)** | `0x04` / `0x84` | `0x11` (`17`) | 1 byte: `0` = Windows, `1` = macOS | `readSystemType` (`135:258525`), `writeSystemType` (`135:258827`) |
| **Thời gian tắt đèn / Ngủ (`LightsOffTime` / `Sleep`)** | `0x04` / `0x84` | `0x13` (`19`) | 1 byte: `0..7` (tương ứng các mức thời gian tắt đèn/ngủ) | `readLightsOffTime` (`135:263110`), `writeLightsOffTime` (`135:263418`) |
| **Chuyển tầng Fn (`FnLayer`)** | `0x04` / `0x84` | `0x14` (`20`) | 1 byte: `layer` (`0..3`) | `readFnLayer` (`135:257921`), `writeFnLayer` (`135:258221`) |
| **Khóa phím Windows (`WinKeyLock`)** | `0x04` / `0x84` | `0x15` (`21`) | 1 byte: `1` = khóa, `0` = mở | `readWinKeyLock` (`135:259133`), `writeWinKeyLock` (`135:259439`) |
| **Tần số phản hồi (`ReportRate` / Polling Rate)** | `0x04` / `0x84` | `0x17` (`23`) | 1 byte: `0` = 8000Hz, `1` = 4000Hz, `2` = 2000Hz, `3` = 1000Hz, `4` = 500Hz, `5` = 250Hz, `6` = 125Hz (`VPe` tại `135:162545`) | `readReportRate` (`135:259749`), `writeReportRate` (`135:260055`) |
| **Tối ưu tổ hợp phím (`ComboKeyOptimization`)** | `0x04` / `0x84` | `0x18` (`24`) | 1 byte: `1` = bật, `0` = tắt | `readComboKeyOptimization` (`135:260369`), `writeComboKeyOptimization` (`135:260695`) |
| **Hiệu chuẩn tự động (`AdaptiveCalibration`)** | `0x04` / `0x84` | `0x19` (`25`) | 1 byte: `1` = bật, `0` = tắt | `readAdaptiveCalibration` (`135:261025`), `writeAdaptiveCalibration` (`135:261347`) |
| **Chế độ chống dội phím cơ (`KeyDebounceMode`)** | `0x04` / `0x84` | `0x1d` (`29`) | 1 byte: `debounceMode` | `readKeyDebounceMode` (`135:261673`), `writeKeyDebounceMode` (`135:261987`) |
| **Thời gian chống dội phím (`KeyDebounceTime` us)** | `0x04` / `0x84` | `0x1e` (`30`) | **2 byte** `u16be`: `[us_hi, us_lo]` | `readKeyDebounceTime` (`135:262305`), `writeKeyDebounceTime` (`135:262619`) |
| **Chế độ tiết kiệm pin (`LowPowerMode` — Mới)** | `0x04` / `0x84` | `0x20` (`32`) | 1 byte: `1` = bật, `0` = tắt | `readLowPowerMode` (`135:263730`), `writeLowPowerMode` (`135:264015`) |
| **Đổi phím WASD & Mũi tên (`WasdAndArrowKeysExchange` — Mới)** | `0x04` / `0x84` | `0x21` (`33`) | 1 byte: `1` = bật, `0` = tắt | `readWasdAndArrowKeysExchange` (`135:264939`), `writeWasdAndArrowKeysExchange` (`135:265290`) |

### 3.7. Giải đáp về `queryMouseBtnCfgCmd` và `rateIdToCfg`

- Trong `README-HANDOFF.md` mục 2.3 có nhắc đến `queryMouseBtnCfgCmd` và `rateIdToCfg`:
  - Kết quả kiểm tra toàn bộ AST của `hub-aulacn/assets/TglCKVxb.js` xác nhận hai định danh này nằm tại **`TglCKVxb.js:138:4738` (`queryMouseBtnCfgCmd`)** và **`TglCKVxb.js:138:4704` (`rateIdToCfg`)**, thuộc module `t1t = nu(UFe)` (`TglCKVxb.js:138:176740`).
  - Module ở dòng 138 là **Mouse SDK** (dùng `reportId = 11` tại `TglCKVxb.js:138:82236`, điều khiển chuột AULA `SC800 Max`, `L9 Ultra`, `V3 Ultra B` với `VID 0x38a6`, `usagePage 0xffa8`), **không được gọi** khi kết nối bàn phím từ `HERO 68 HE` hay `HERO 84 HE`.
  - Tương đương của hai hàm này bên bàn phím `HERO 68 HE` / `HERO 84 HE` (ByteTech v3 SDK tại dòng 135) là:
    - Truy vấn cấu hình phím: `readKeyFunctions` (`0x83`, `TglCKVxb.js:135:247272`).
    - Bảng quy đổi ID Polling Rate (`0..6` <-> `8000..125 Hz`): `VPe` (`TglCKVxb.js:135:162545`) dùng cho lệnh `0x04`/`0x84` sub `0x17`.

---

## 4. Phân loại mức độ kiểm chứng (Proven vs. Inferred)

1. **Đã chứng minh trực tiếp từ mã nguồn hãng (Proven 100%)**:
   - Bộ lọc WebHID (`VID 0x372e`, `PID 0x103e` Wired & `PID 0x106c` Wireless 8K, `usagePage 0xff60`, `usage 0x61`).
   - Cơ chế tìm `reportId` động (`a2e` tại `TglCKVxb.js:135:23425`) và cấu trúc khung 63 byte (`MPe` / `TPe` tại `135:38789` – `43308`).
   - Cơ chế đóng/mở khung không dây 8K 19 byte (+1 byte `reportId` = 20 byte), header `0x66`, `syncFlag` 3-bit, khung ACK và `combinePackets` (`vFe` tại `135:223199` – `232000`).
   - Mã hóa `encodeLayerAndSystem(layer, system) = (layer & 3) | ((system & 7) << 2)` (`135:84339`).
   - Toàn bộ mã lệnh đọc/ghi, kích thước bản ghi (`unitSize`), thuật toán căn chỉnh gói (`calculateAlignedDataSize`), và định dạng sự kiện Bubble (`0xfe`, `0x98`, `0x94`).
2. **Chưa xác định / Phụ thuộc phần cứng thực tế (`chưa xác định` khi không cắm phím thật)**:
   - Giá trị trả về cụ thể của `0x82` sub `0x0d` (`DeviceFeatures`), `0x0f` (`SupportedReportRates`), và `0xa5` (`KeyMatrixPositions`) trên từng bản revision PCB cụ thể của `HERO 68 HE` so với `HERO 84 HE` (cần đọc từ phần cứng thật khi cắm USB/Dongle).
   - Giao thức chi tiết bên trong Bootloader sau khi gửi lệnh `0x7f` (`enterBootloader` tại `135:274704`) — trong gói `hub-aulacn/` không chứa luồng flash firmware tiếp theo cho `VID 0x372e` (file `BxtVQQqU.js` chỉ chứa bộ nạp firmware cho chuột `VID 0x38a6`).
