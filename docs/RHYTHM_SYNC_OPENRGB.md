# Rhythm Sync — thuật toán lấy từ OpenRGB

Tài liệu ghi lại việc rà soát `E:\OpenRGB-master` để tìm thuật toán nhịp/đồng bộ
nhạc có thể đưa sang OpenAula, những gì đã áp dụng (kèm mã chế độ), những gì
cố ý không áp dụng, và giấy phép.

## 1. Xác minh: OpenRGB core không có xử lý âm thanh

`E:\OpenRGB-master` là OpenRGB **core 1.1** (2109 file `.cpp`/`.h`, không có
thư mục `.git`). Grep toàn bộ cây nguồn các mẫu:

```
IAudioCaptureClient|IMMDeviceEnumerator|kiss_fft|fftw|pulseaudio|snd_pcm|SoundSync|beat.?detect
```

→ **không có kết quả nào**. Core chỉ có các enum hiệu ứng phần cứng mang chữ
"music"/"rhythm" (hiệu ứng nhịp chạy trong firmware thiết bị), không thu mẫu,
không FFT, không phát hiện nhịp.

Thuật toán thật nằm ở plugin tách rời **OpenRGB Effects Plugin**
(`OpenRGBDevelopers/OpenRGBEffectsPlugin`, GPL-2.0-or-later). Nguồn đã đọc (lấy
qua raw URL của GitLab, project ID `OpenRGBDevelopers%2FOpenRGBEffectsPlugin`):

- `Audio/AudioSignalProcessor.cpp`, `Audio/AudioManager.cpp`, `Audio/AudioSettingsStruct.h`
- `Effects/AudioSync/AudioSync.cpp`
- `Effects/AudioVUMeter/`, `Effects/AudioBubbles/`, `Effects/AudioSine/`,
  `Effects/AudioStar/`, `Effects/AudioParty/`, `Effects/AudioVisualizer/`

URL mẫu: `https://gitlab.com/OpenRGBDevelopers/OpenRGBEffectsPlugin/-/raw/master/<path>`

## 2. Chuỗi tín hiệu của OpenRGB

Thứ tự xử lý mỗi frame (`AudioSignalProcessor`), dùng chung cho mọi hiệu ứng
audio của plugin:

1. Giảm dần `fft[i] *= decay/100 / (60/FPS)` (mặc định `decay 80`).
2. Thu mẫu; cửa sổ `window_mode 0` (Hann).
3. rFFT, `fft[0] = fft[2]` (bỏ DC).
4. Chuẩn hoá: `nrml_ofst 0.04`, `nrml_scl 0.5`.
5. Biên độ `mag = sqrt(re² + im²)`.
6. Đường cong độ lớn `0.9m + 0.5·log10(1.1m)`, chặn trên `1.0`.
7. Giữ đỉnh (max-hold) rồi trung bình/gộp bin (`avg_size 8`).
8. Equalizer: `fltr[i] = equalizer[i/16] * (fltr + c·(fft - fltr))`.

Lưu ý đã kiểm chứng: đường dẫn mic/OpenAL của `AudioSignalProcessor.cpp` trừ
`128` (định dạng mono8), đường dẫn Windows **không** trừ. OpenAula xử lý mẫu
theo float chuẩn hoá (`monoSample`), nên giữ nguyên cách xử lý float, không
bê đoạn trừ `128`.

## 3. Đã đưa sang OpenAula

Mã chế độ dùng chính các ID nguyên có trong catalogue `RHYTHM_MODES`
(`src/keyboard/rhythm.ts`) để service, engine C++ và UI cùng hiểu mà không cần
thêm bảng ánh xạ mới.

| ID | Tên | Gốc OpenRGB | Đã điều chỉnh cho 68 phím |
| --- | --- | --- | --- |
| 429 | Spectrum Bars | Audio Visualizer | 16 dải chia theo **log**, không chia tuyến tính |
| 432 | Audio Marquee | Hành vi marquee/cuộn | Thêm số hạng cuộn theo `level` (OpenAula trước đây không có) |
| 434 | Radial Chase | Audio Sync `RollMode::RADIAL` | Trường khoảng cách từ tâm, mặt sáng tiến theo `level` |

### 429 — Spectrum Bars

- `logBands()` (`service/native/rhythm_core.h`): FFT 256 mẫu kiểu
  real→hai biến đổi 128 điểm nửa độ dài, ghép lại đúng 64 bin đã dùng, rồi gộp
  thành 16 dải theo biên `pow(64, band/16)`. Mỗi dải lấy **RMS** các bin
  (`sqrt(Σ mag²)`) thay vì cộng thô.
- Cửa sổ và gain dùng chung `windowFunction()` với FFT cũ, chuẩn hoá theo tổng
  trọng số cửa sổ để Hann/Hamming/Blackman có cùng mức.
- Đường cong độ lớn dùng `0.9m + 0.5·log10(1.1m)` như plugin, nhưng **giữ giá
  trị dưới 1 thay vì bão hoà** (`m = min(1, mag)`) để các dải lân cận còn đọc
  được.
- Cổng im lặng: RMS dưới `1/32768` thì đặt toàn bộ dải về 0. Lý do: đường cong
  log khuếch đại bin nhiễu rất nhỏ thành cột sáng nhìn thấy được — plugin OpenRGB
  cũng phi tuyến như vậy.
- Decay từng dải theo `releaseMs`, keyed trên `a.sequence` riêng
  (`spectrumSequence_`) để không ăn mất packet của chế độ 428.
- Render: chia bàn phím thành 16 cột (`nx·16`), cột có năng lượng luôn chạm hàng
  dưới; mép trên làm mờ dần theo năng lượng dải.

### 432 — Audio Marquee

- `cell = fmod(ny + elapsed/speed, 1)`, sáng khi `level_ > 0` và `cell < level_`.
- `speed` là độ dài **một vòng cuộn đầy đủ (ms)**, mặc định 1300; engine và trình duyệt
  cùng đơn vị ms (`elapsed` từ engine, `timeMs` từ Web Audio).
- Điều kiện `level_ > 0` là bắt buộc: ở pha 0 hàng dưới có `cell == 0`, nếu thiếu
  điều kiện thì im lặng vẫn sáng một hàng.
- Marquee là hiệu ứng **theo vị trí**, không dùng release: thanh release bị ẩn trong UI
  và cả hai renderer bỏ qua `releaseMs` cho chế độ này.

### 434 — Radial Chase

- `distance = hypot((column-0.5)·16, (k.y-2)·2)` — trường khoảng cách lấy tâm giữa
  bàn phím; `column` là vị trí chuẩn hoá trong từng hàng.
- `travel = fmod(elapsed/speed·16, 16)`; `phase = distance - travel` (cộng 16 nếu âm).
- Mặt sáng có bề rộng `level_·16`; trong mặt sáng giá trị bão hoà 1, mép giảm
  dần trong 2 đơn vị cuối.
- Cùng `speed` (mặc định 1300 ms cho một vòng từ tâm ra), không dùng release.

### Cột phổ và hình học phím

Engine tính cột bằng `Key.nx` — vị trí chuẩn hoá trong **từng hàng**, không phải
`k.x/16`. `k.x` là vị trí theo bề rộng phím trong hàng có độ rộng phím khác nhau,
nên hàng phím số (hàng trên cùng) bị dồn lệch phải và các cột phổ không rơi vào
phím nào. `nx` cho mỗi hàng trải đủ 16 dải (Spectrum Bars) và đủ bề ngang (Marquee).

### Side LED (chưa xác minh phần cứng)

Thêm vào động cơ nhưng **service vẫn chặn** (`RHYTHM_SIDE_VERIFIED = false`,
danh sách `RHYTHM_SIDE_UNVERIFIED` trong `service/rhythm.ts`) vì số đèn cạnh,
thứ tự và kênh chưa được kiểm trên thiết bị thật:

| ID | Nguồn OpenRGB | Hành vi |
| --- | --- | --- |
| 504 | Palette loop | Bảng màu quay toàn bộ 18 ô ở độ sáng đầy đủ, không tắt khi im lặng |
| 505 | Audio VU Meter (peak-hold) | `meter_` nhảy lên tức thì, giảm `0.1·speed/FPS` mỗi frame |
| 506 | Meter đầu xa | Ảnh gương của 501, sáng từ ô 17 về 0 |

## 4. Cố ý không áp dụng

| Hạng mục | Lý do |
| --- | --- |
| Chia dải tuyến tính của Audio Visualizer | Với 68 phím, giọng nói và phần lớn nhạc dồn hết vào vài cột đầu |
| Đường dẫn đỉnh vô hướng (một `peak` chung) | Mất chi tiết theo tần số; OpenAula đã có mảng `peaks_[64]` |
| Nhánh `else` co giãn (stretch) của AudioSync | Hành vi phụ thuộc FPS và làm phẳng hình; thay bằng trường khoảng cách |
| Trừ `128` của đường mic/OpenAL | Chỉ đúng cho PCM mono8; engine OpenAula xử lý float |
| Đọc thiết bị âm thanh bằng OpenAL/WASAPI của plugin | OpenAula đã có `rhythm_audio.h` (WASAPI loopback) và Web Audio |

## 5. Giấy phép

| Thành phần | Giấy phép | Ghi chú |
| --- | --- | --- |
| OpenRGB core `E:\OpenRGB-master` | GPL-2.0 (theo `LICENSE` của repo) | Không dùng mã nào, chỉ rà soát |
| OpenRGB Effects Plugin | GPL-2.0-or-later | **Không copy mã nguồn**; chỉ tái hiện công thức toán (cửa sổ, đường cong log, gộp dải, decay) và cấu trúc hiệu ứng |
| OpenAula | Xem `LICENSE` của repo | Công thức toán không mang bản quyền; nếu dự án OpenAula không tương thích GPL thì không được dán nguyên văn mã plugin |

## 6. Cấu hình

`RhythmConfiguration` đã lên **version 2**: thêm `speed` (ms cho một vòng cuộn,
250–4000, mặc định 1300). Bản lưu version 1 được `restoreRhythm()` điền `speed`
mặc định khi đọc; lệnh native `rhythm:...` giờ có **15** trường (`speed` ở vị trí 5,
các trường sau dồn một bậc).

## 7. Kiểm chứng

- `tests/native-rhythm.test.cpp`: chế độ 429/432/434 phát packet hợp lệ,
  checksum khớp, tắt hoàn toàn khi im lặng, đổi `generation` xoá sạch; `logBands`
  đặt đúng dải cho tần số 3/17/40, im lặng cho toàn 0; Marquee quay lại đúng chu
  kỳ sau `speed` ms và lệch ở giữa chu kỳ; Spectrum Bars vẽ được cột ở tần số giữa;
  side 504/505/506 có hành vi đúng và encode thành report `14/1`.
- `tests/rhythm.test.mjs`: catalogue 10 chế độ, side 504–506 được chặn ở service,
  `validateRhythm` từ chối `version: 1` và `speed` ngoài khoảng, migrate v1 → v2.
- Chạy: `g++ -std=c++17 -O2 -static tests/native-rhythm.test.cpp` (bắt buộc
  `-static` với MinGW 15.1.0 trên Windows), `npm test`, `npm run typecheck:service`.
