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
| 429 | Spectrum Bars | Audio Visualizer | 16 dải chia theo **log**, chia đều 5 hàng phím (kể cả hàng phím số trên cùng) |
| 432 | Audio Marquee | Hành vi marquee/cuộn | Các hàng chạy ngang đan xen trái/phải trực tiếp theo `level`, dải tần số từng hàng và `history_` |
| 434 | Radial Chase | Audio Sync `RollMode::RADIAL` | Sóng vòng tròn đồng tâm bùng ra từ giữa bàn phím theo nhịp `level`, phổ tần số và lịch sử nhịp |

### 429 — Spectrum Bars

- `logBands()` (`service/native/rhythm_core.h`): FFT 256 mẫu kiểu
  real→hai biến đổi 128 điểm nửa độ dài, ghép lại đúng 64 bin đã dùng, rồi gộp
  thành 16 dải theo biên `pow(64, band/16)`. Mỗi dải lấy **RMS** các bin
  (`sqrt(Σ mag²)`) thay vì cộng thô.
- Cửa sổ và gain dùng chung `windowFunction()` với FFT cũ, chuẩn hoá theo tổng
  trọng số cửa sổ để Hann/Hamming/Blackman có cùng mức, đồng thời nhân hệ số
  `sensitivity / 4.0` để thanh trượt Sensitivity trong UI tác động đồng nhất.
- Đường cong độ lớn dùng `(0.9m + 0.5·log10(1.1m)) / fullScale` (chuẩn hoá theo
  giá trị tại `m = 1.0`, `fullScale ≈ 0.920696`) để các dải năng lượng cao đạt
  đủ `1.0` thay vì bị kẹt ở ngưỡng `0.9207`.
- Cổng im lặng: RMS dưới `1/32768` thì đặt toàn bộ dải về 0. Lý do: đường cong
  log khuếch đại bin nhiễu rất nhỏ thành cột sáng nhìn thấy được — plugin OpenRGB
  cũng phi tuyến như vậy.
- Decay từng dải theo `releaseMs`, keyed trên `a.sequence` riêng
  (`spectrumSequence_`) để không ăn mất packet của chế độ 428.
- Render: chia bàn phím thành 16 cột (`nx·16`) và chia đều chiều cao `[0, 1]` cho
  cả 5 hàng phím (`rowFloor = (4 - k.y) / 5`, từ hàng dưới cùng `0.0` đến hàng
  phím số trên cùng `0.8`); mép trên của mỗi hàng làm mượt theo
  `0.35 + 0.65 · clamp((bands_[band] - rowFloor) · 5, 0, 1)`.

### 432 — Audio Marquee

- Mỗi hàng phím (`y = 0..4`) là một thanh marquee chạy ngang đan xen chiều
  (hàng chẵn `0, 2, 4` phóng từ trái sang phải `pos = nx`; hàng lẻ `1, 3` phóng
  từ phải sang trái `pos = 1 - nx`).
- Độ vươn `rowEnergy` của từng hàng bám trực tiếp theo `level_` kết hợp năng
  lượng dải tần số tương ứng của hàng đó (`bands_`: hàng dưới theo âm trầm/bass,
  hàng giữa theo mid, hàng phím số theo treble) và gợn sóng lịch sử nhịp
  `history_`. Đầu thanh marquee (`headDist < 0.14`) sáng rực ở mức `1.0`, thân
  thanh giảm nhẹ về phía gốc và tắt hoàn toàn (`#000000`) khi `level_ == 0`.

### 434 — Radial Chase

- Khoảng cách bán kính chuẩn hoá từ tâm bàn phím `distNorm = clamp(hypot((nx-0.5)·2, (y/4-0.5)·1.35) / 1.15, 0, 1)`.
- Thay vì chạy theo bộ đếm thời gian cố định gây sáng đặc cả bàn phím, mặt sóng
  vòng tròn (`drive`) bung ra trực tiếp theo nhịp nhạc `level_` và năng lượng
  dải tần `bands_[band]`, kết hợp vòng sóng âm vang thứ cấp ở tâm khi nhịp mạnh
  (`drive > 0.5`) và lan truyền lịch sử nhịp `history_`.

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

## 6. Kiểm chứng

- `tests/native-rhythm.test.cpp`: chế độ 429/432/434 phát packet hợp lệ,
  checksum khớp, tắt hoàn toàn khi im lặng, đổi `generation` xoá sạch; `429`
  sáng đủ hàng phím số trên cùng (`keys 0..14`) khi năng lượng cao; `432` và
  `434` tăng số phím sáng tỷ lệ thuận với mức nhạc; `logBands` đặt đúng dải cho
  tần số 3/17/40, im lặng cho toàn 0; side 504/505/506 có hành vi đúng và encode
  thành report `14/1`.
- `tests/rhythm.test.mjs`: catalogue 10 chế độ, side 504–506 được chặn ở service,
  `validateRhythm` từ chối `sideMode: 507`, `429` sáng hàng phím số trên cùng và
  `432`/`434` phản hồi theo mức năng lượng nhạc.
- Chạy: `g++ -std=c++17 -O2 -static tests/native-rhythm.test.cpp` (bắt buộc
  `-static` với MinGW 15.1.0 trên Windows), `npm test`, `npm run typecheck:service`.
