#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <complex>
#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>
#include "rhythm_profile.h"

namespace rhythm {

constexpr double pi = 3.14159265358979323846;
using Color = std::array<uint8_t, 3>;
using Report = std::array<uint8_t, 64>;

// clang-format off
constexpr std::array<uint8_t, 68> positions = {
  1,15,16,17,18,19,20,21,22,23,24,25,26,27,98,
  28,29,30,31,32,33,34,35,36,37,38,39,40,41,99,
  42,43,44,45,46,47,48,49,50,51,52,53,54,102,
  55,56,57,58,59,60,61,62,63,64,65,66,74,103,
  67,68,69,70,71,72,73,76,75,77
};
// clang-format on

struct Key {
  double x;
  double y;
};

inline std::array<Key, 68> geometry() {
  std::array<Key, 68> keys{};
  size_t k = 0;
  const std::vector<std::vector<double>> widths = {
      {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1},
      {1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, 1},
      {1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25, 1},
      {2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.75, 1, 1},
      {1.25, 1.25, 1.25, 6.25, 1, 1, 1, 1, 1, 1},
  };
  for (size_t row = 0; row < widths.size(); ++row) {
    double x = 0;
    for (double w : widths[row]) {
      keys[k++] = {x + w * .5, double(row)};
      x += w;
    }
  }
  return keys;
}

struct Config {
  int keyMode = 428;
  int sideMode = 500;
  int palette = 1;
  int window = 0;
  int spatialRadius = 8;
  double brightness = 80;
  double sensitivity = 4;
  double releaseMs = 80;
  double db = 35;
  Color color{246, 17, 165};
  std::string endpoint = "default";
};

inline bool valid(const Config& c) {
  const auto has = [](int n, std::initializer_list<int> list) {
    return std::find(list.begin(), list.end(), n) != list.end();
  };
  return has(c.keyMode, {169, 170, 171, 172, 173, 180, 428, 429, 432, 434}) &&
         has(c.sideMode, {500, 501, 502, 503, 504, 505, 506}) &&
         c.palette >= 0 && c.palette <= 3 &&
         c.window >= 0 && c.window <= 2 &&
         c.spatialRadius >= 0 && c.spatialRadius <= 16 &&
         std::isfinite(c.brightness) && c.brightness >= 0 && c.brightness <= 100 &&
         std::isfinite(c.sensitivity) && c.sensitivity >= .1 && c.sensitivity <= 10 &&
         std::isfinite(c.releaseMs) && c.releaseMs >= 0 && c.releaseMs <= 200 &&
         std::isfinite(c.db) && c.db >= 0 && c.db <= 100 &&
         !c.endpoint.empty() && c.endpoint.size() <= 512;
}

inline Color scale(Color c, double value) {
  for (auto& n : c) {
    n = uint8_t(std::clamp(std::lround(n * value), 0L, 255L));
  }
  return c;
}

inline Color hsv(double hue, double value = 1) {
  hue = std::fmod(hue + 3600, 360) / 60;
  double x = 1 - std::abs(std::fmod(hue, 2) - 1);
  std::array<double, 3> c =
      hue < 1 ? std::array<double, 3>{1, x, 0}
      : hue < 2 ? std::array<double, 3>{x, 1, 0}
      : hue < 3 ? std::array<double, 3>{0, 1, x}
      : hue < 4 ? std::array<double, 3>{0, x, 1}
      : hue < 5 ? std::array<double, 3>{x, 0, 1}
                : std::array<double, 3>{1, 0, x};
  return {
      uint8_t(std::clamp(c[0] * value * 255, 0., 255.)),
      uint8_t(std::clamp(c[1] * value * 255, 0., 255.)),
      uint8_t(std::clamp(c[2] * value * 255, 0., 255.)),
  };
}

struct Audio {
  std::array<float, 256> samples{};
  double envelope = 0;
  double sampleQpcMs = 0;
  double receivedMs = 0;
  uint64_t generation = 0;
  uint64_t sequence = 0;
};

inline double monoSample(
    const uint8_t* frame,
    unsigned channels,
    unsigned bytes,
    bool floating) {
  if (!channels) {
    return 0;
  }
  double mono = 0;
  for (unsigned channel = 0; channel < channels; ++channel) {
    const auto* p = frame + channel * bytes;
    double value = 0;
    if (floating) {
      float f = 0;
      std::memcpy(&f, p, 4);
      value = std::isfinite(f) ? f : 0;
    } else if (bytes == 2) {
      int16_t n = 0;
      std::memcpy(&n, p, 2);
      value = n / 32768.;
    } else if (bytes == 3) {
      int32_t n = p[0] | (p[1] << 8) | (p[2] << 16);
      if (n & 0x800000) {
        n |= ~0xffffff;
      }
      value = n / 8388608.;
    } else {
      int32_t n = 0;
      std::memcpy(&n, p, 4);
      value = n / 2147483648.;
    }
    mono += value / channels;
  }
  return mono;
}

struct Frame {
  std::array<Color, 68> keys{};
  std::array<Color, 18> side{};
  Color global{};
  bool direct = false;
  double level = 0;
};

inline double envelope(const float* samples, size_t count) {
  if (!count) {
    return 0;
  }
  double peak = 0;
  double sum = 0;
  for (size_t i = 0; i < count; ++i) {
    const double x = std::isfinite(samples[i]) ? samples[i] : 0;
    peak = std::max(peak, x);
    sum += x;
  }
  return peak == 0 ? 0 : std::max(0., peak - sum / count);
}

// Shared so FFT and log band mapping use one window definition (0 Hann, 1 Hamming, 2 Blackman).
inline double windowFunction(int window, int i, int count) {
  const double angle = 2 * pi * i / double(count);
  return window == 1 ? .54 - .46 * std::cos(angle)
         : window == 2 ? .42 - .5 * std::cos(angle) + .08 * std::cos(2 * angle)
                       : .5 - .5 * std::cos(angle);
}

inline std::array<double, 64> fft(
    const std::array<float, 256>& input,
    int window,
    double gain) {
  std::array<std::complex<double>, 256> a{};
  for (int i = 0; i < 256; ++i) {
    a[i] = {std::isfinite(input[i]) ? input[i] * windowFunction(window, i, 256) * gain : 0, 0};
  }
  for (unsigned i = 1, j = 0; i < 256; ++i) {
    unsigned bit = 128;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      std::swap(a[i], a[j]);
    }
  }
  for (int len = 2; len <= 256; len *= 2) {
    const auto root = std::polar(1., -2 * pi / len);
    for (int i = 0; i < 256; i += len) {
      std::complex<double> w{1, 0};
      for (int j = 0; j < len / 2; ++j) {
        auto u = a[i + j];
        auto v = a[i + j + len / 2] * w;
        a[i + j] = u + v;
        a[i + j + len / 2] = u - v;
        w *= root;
      }
    }
  }
  std::array<double, 64> result{};
  for (int i = 0; i < 64; ++i) {
    double mag = std::abs(a[i]) / 128;
    result[i] = mag > 0 ? std::clamp(.9 * mag + .5 * std::log(1.1 * mag), 0., 1.) : 0;
  }
  return result;
}

// Log-spaced bands over the 64 FFT bins at 48 kHz / FFT256 (~187.5 Hz per bin, to
// ~11.8 kHz). OpenRGB's Audio Visualizer spreads the whole spectrum linearly, which
// puts speech and most music entirely in the first columns on a 68-key row.
inline std::array<double, 16> logBands(const std::array<float, 256>& input, int window, double gain) {
  // Iterative radix-2 FFT over a 256-real window. With the imaginary part zero the result
  // splits into two 128-point half-length transforms; only the 64 bins the bands use are
  // combined here, which keeps the engine cost at the existing FFT's order.
  constexpr size_t half = 128;
  std::array<double, half * 2> even{};
  std::array<double, half * 2> odd{};
  // Normalise by the window's mean weight so Hann/Hamming/Blackman cost the same level as
  // OpenRGB's raw buffer, where the window is applied after the gain.
  double windowSum = 0;
  for (size_t n = 0; n < 256; ++n) {
    windowSum += windowFunction(window, int(n), 256);
  }
  const double level = gain * 256. / std::max(1e-9, windowSum);
  for (size_t n = 0; n < half; ++n) {
    const double a = std::isfinite(input[2 * n]) ? double(input[2 * n]) * windowFunction(window, int(2 * n), 256) * level : 0;
    const double b = std::isfinite(input[2 * n + 1]) ? double(input[2 * n + 1]) * windowFunction(window, int(2 * n + 1), 256) * level : 0;
    even[2 * n] = a;
    odd[2 * n] = b;
  }
  auto transform = [](std::array<double, half * 2>& a) {
    constexpr size_t half = 128;
    for (size_t i = 1, j = 0; i < half; ++i) {
      size_t bit = half / 2;
      while (bit && (j & bit)) {
        j ^= bit;
        bit >>= 1;
      }
      j |= bit;
      // `bit` is 0 only when every lower bit was set, i.e. j reached its final value.
      if (i < j && j < half) {
        std::swap(a[2 * i], a[2 * j]);
        std::swap(a[2 * i + 1], a[2 * j + 1]);
      }
    }
    for (int len = 2; len <= int(half); len *= 2) {
      const auto root = std::polar(1., -2 * pi / len);
      for (int i = 0; i < int(half); i += len) {
        std::complex<double> w{1, 0};
        for (int j = 0; j < len / 2; ++j) {
          const size_t x = size_t(i + j) * 2;
          const size_t y = size_t(i + j + len / 2) * 2;
          const std::complex<double> u{a[x], a[x + 1]};
          const std::complex<double> v{a[y], a[y + 1]};
          const auto t = v * w;
          a[x] = u.real() + t.real();
          a[x + 1] = u.imag() + t.imag();
          a[y] = u.real() - t.real();
          a[y + 1] = u.imag() - t.imag();
          w *= root;
        }
      }
    }
  };
  transform(even);
  transform(odd);
  std::array<double, 64> spectrum{};
  for (size_t k = 0; k < spectrum.size(); ++k) {
    const std::complex<double> x{even[2 * k], even[2 * k + 1]};
    const std::complex<double> y{odd[2 * k], odd[2 * k + 1]};
    // X[k] = (x + y) / 2 - j/2 * (x - y) * W^k, W = e^(-2πj/256).
    const auto rotated = y * std::polar(1., -2 * pi * double(k) / 256);
    spectrum[k] = std::abs((x + rotated) * .5) / 128;
  }
  std::array<int, 17> edges{};
  for (int band = 0; band <= 16; ++band) {
    edges[band] = std::clamp(int(std::lround(std::pow(64, band / 16.))), 0, 64);
  }
  std::array<double, 16> result{};
  for (int band = 0; band < 16; ++band) {
    const int low = std::min(63, edges[band]);
    const int high = std::min(64, std::max(low + 1, edges[band + 1]));
    double mag = 0;
    for (int j = low; j < high; ++j) {
      mag += spectrum[size_t(j)] * spectrum[size_t(j)];
    }
    mag = std::sqrt(mag);
    // OpenRGB / KeyboardVisualizer magnitude curve, normalized by full-scale value at m=1.0
    // (.9 + .5 * log10(1.1) ≈ 0.920696) so full-energy bands reach 1.0 and light Row 0 (number row).
    const double m = std::min(1., mag);
    constexpr double fullScale = .9 + .5 * 0.04139268515822504;
    result[band] = m > 0 ? std::clamp((.9 * m + .5 * std::log10(1.1 * m)) / fullScale, 0., 1.) : 0;
  }
  return result;
}

class Engine {
  Config config_{};
  const std::array<Key, 68> keys_ = geometry();
  double level_ = 0;
  double lastMs_ = 0;
  double phase_ = 0;
  double lastLevel_ = 0;
  double historyAt_ = 0;
  double spectrumAt_ = 0;
  double effectOrigin_ = 0;
  uint64_t generation_ = 0;
  uint64_t sequence_ = 0;
  std::array<double, 22> history_{};
  std::array<double, 64> peaks_{};
  std::array<double, 16> bands_{};
  uint64_t spectrumSequence_ = 0;
  double meter_{};
  std::array<double, 256> display_{};
  std::array<std::array<Color, 256 * 64>, 2> fields_{};
  size_t fieldIndex_ = 0;

  static int groupOf(uint8_t pos, const std::vector<std::vector<uint8_t>>& groups) {
    for (size_t i = 0; i < groups.size(); ++i) {
      if (std::find(groups[i].begin(), groups[i].end(), pos) != groups[i].end()) {
        return int(i);
      }
    }
    return -1;
  }

  Color palette(double x, double now, double cadence = 90) const {
    if (config_.palette == 0) {
      return config_.color;
    }
    double hue = config_.palette == 2 ? 160 + x * 120 : config_.palette == 3 ? x * 45 : x * 300;
    return hsv(hue + std::floor(now / cadence) * 12);
  }

public:
  void reset() {
    level_ = 0;
    lastMs_ = 0;
    phase_ = 0;
    lastLevel_ = 0;
    historyAt_ = 0;
    spectrumAt_ = 0;
    effectOrigin_ = 0;
    history_.fill(0);
    peaks_.fill(0);
    bands_.fill(0);
    meter_ = 0;
    spectrumSequence_ = 0;
    display_.fill(0);
    // Stale spectrum/2A fields would otherwise resurface on the first frame after a stream
    // restart, when a spectrum mode has not re-filled them yet.
    for (auto& field : fields_) {
      field.fill(Color{});
    }
    generation_ = 0;
    sequence_ = 0;
  }

  void configure(const Config& c) {
    if (!valid(c)) {
      throw std::runtime_error("Invalid rhythm configuration");
    }
    if (c.keyMode != config_.keyMode || c.endpoint != config_.endpoint) {
      reset();
    }
    config_ = c;
  }

  const Config& config() const { return config_; }

  Frame render(const Audio& a, double now) {
    if (a.generation != generation_) {
      reset();
      generation_ = a.generation;
    }
    if (!effectOrigin_) {
      effectOrigin_ = now;
    }
    const double elapsed = now - effectOrigin_;
    double dt = lastMs_ ? std::clamp(now - lastMs_, 0., 100.) : 1000. / 60;
    lastMs_ = now;

    bool active = a.sequence && now - a.receivedMs < 100;
    double target = active ? std::clamp(a.envelope * config_.sensitivity, 0., 1.) : 0;
    // Side 503 only needs to know whether the level is rising, so a literal copy is enough.
    const double previous = level_;
    level_ = target >= level_ ? target : level_ + (target - level_) * std::exp(-dt / std::max(1., config_.releaseMs));
    if (level_ < .001) {
      level_ = 0;
    }
    if (now - historyAt_ >= 30) {
      std::move_backward(history_.begin(), history_.end() - 1, history_.end());
      history_[0] = level_;
      historyAt_ = now;
    }

    // OpenRGB Audio VU Meter peak-hold: jump straight up, decay at 0.1/speed per frame.
    meter_ = level_ >= meter_ ? level_ : std::max(level_, meter_ - .1 * dt * 60 / 1000);

    if (config_.keyMode == 429 || config_.keyMode == 432 || config_.keyMode == 434) {
      // Keyed on its own sequence: sharing `sequence_` with the 428 field meant a packet
      // consumed by 428 never refreshed these bands, leaving them frozen while live.
      // Gate on freshness, not on the shared envelope: with `envelope = 0` but fresh samples
      // the bands must still decay from the per-packet computation below.
      if (a.sequence && now - a.receivedMs < 100 && a.sequence != spectrumSequence_) {
        auto bands = logBands(a.samples, config_.window, config_.db * 30 * (config_.sensitivity / 4.));
        // Digital silence still yields tiny non-zero FFT bins which the magnitude curve lifts
        // into visible bars. OpenRGB has the same non-linearity, so gate quiet windows to zero.
        double rms = 0;
        for (float x : a.samples) {
          rms += std::isfinite(x) ? double(x) * x : 0;
        }
        if (std::sqrt(rms / a.samples.size()) < 1. / 32768) {
          bands.fill(0);
        }
        double decay = config_.releaseMs == 0 ? 0 : std::exp(-std::max(0., now - spectrumAt_) / config_.releaseMs);
        for (int i = 0; i < 16; ++i) {
          bands_[i] = std::max(bands[i], bands_[i] * decay);
        }
        spectrumAt_ = now;
        spectrumSequence_ = a.sequence;
      } else if (!active) {
        for (auto& b : bands_) {
          b *= config_.releaseMs == 0 ? 0 : std::exp(-dt / config_.releaseMs);
        }
      }
    }

    if (config_.keyMode == 428) {
      if (active && a.sequence != sequence_) {
        auto bins = fft(a.samples, config_.window, config_.db * 30);
        double decay = config_.releaseMs == 0
                           ? 0
                           : std::exp(-std::max(0., now - spectrumAt_) / config_.releaseMs);
        for (int i = 0; i < 64; ++i) {
          peaks_[i] = std::max(bins[i], peaks_[i] * decay);
        }
        spectrumAt_ = now;
        sequence_ = a.sequence;
      } else if (!active) {
        for (auto& p : peaks_) {
          p *= config_.releaseMs == 0 ? 0 : std::exp(-dt / config_.releaseMs);
        }
      }
      for (int x = 0; x < 256; ++x) {
        double sum = 0;
        int lo = std::max(0, x - config_.spatialRadius);
        int hi = std::min(255, x + config_.spatialRadius);
        for (int j = lo; j <= hi; ++j) {
          sum += peaks_[j / 4];
        }
        display_[x] = sum / (hi - lo + 1);
      }
      auto& field = fields_[1 - fieldIndex_];
      for (int x = 0; x < 256; ++x) {
        auto c = scale(palette(double(x) / 255, elapsed, 120), config_.brightness / 100);
        for (int y = 0; y < 64; ++y) {
          field[y * 256 + x] = display_[x] > (64 - y) / 64. ? c : Color{};
        }
      }
      fieldIndex_ = 1 - fieldIndex_;
    }

    Frame out;
    out.level = level_;
    double brightness = config_.brightness / 100;

    if (config_.keyMode == 171) {
      const bool rising = level_ > lastLevel_;
      if (a.sequence != sequence_) {
        phase_ = rising ? phase_ + 10 : std::trunc(phase_ * .6);
        lastLevel_ = level_;
        sequence_ = a.sequence;
      }
      auto byte = [](double n) { return uint8_t(int64_t(n) & 255); };
      auto base = palette(0, elapsed);
      out.global = scale(
          {byte(base[0] + phase_), rising ? base[1] : byte(base[2] + phase_), byte(base[2] + phase_)},
          brightness * std::min(1., level_ * 4));
      out.direct = true;
      out.keys.fill(out.global);
    } else {
      for (size_t i = 0; i < keys_.size(); ++i) {
        const auto k = keys_[i];
        double nx = k.x / 16;
        double value = 0;
        auto color = palette(nx, elapsed);
        if (config_.keyMode == 169) {
          int ring = groupOf(positions[i], dazzlingRings);
          int count = int(level_ * dazzlingRings.size());
          value = ring >= 0 && ring < count ? 1 : 0;
          if (value && ring == count - 1) {
            color = count > 1 ? Color{255, 255, 255} : scale(color, .3);
          }
        } else if (config_.keyMode == 170) {
          double span = level_ * 16;
          double idx = std::fmod(k.x + elapsed / 120, 16.);
          if (idx < span) {
            value = 1 - idx / std::max(1., span * 2);
            if (span - idx < 1) {
              for (auto& c : color) {
                c = uint8_t(std::max(0, int(c) - 80));
              }
            }
          }
        } else if (config_.keyMode == 172) {
          color = config_.palette ? palette(nx, elapsed, 600) : color;
          int column = groupOf(positions[i], gurglingColumns);
          if (column >= 0) {
            const auto& ids = gurglingColumns[column];
            auto index = std::find(ids.begin(), ids.end(), positions[i]) - ids.begin();
            int h = int(history_[column] * ids.size());
            value = index < h ? 1 : 0;
            if (value && index == h - 1) {
              color = scale(color, 1.3);
            }
          }
        } else if (config_.keyMode == 173) {
          const auto& pattern = bloomPatterns[size_t(elapsed / 330) % 8];
          int shell = groupOf(positions[i], pattern);
          double edge = shell < 0 ? 0 : level_ * pattern.size() - shell;
          value = std::clamp(edge, 0., 1.);
          color = palette(nx, elapsed, 30);
          if (value > 0 && value < 1) {
            for (auto& c : color) {
              c = uint8_t(std::clamp(int(c * value + 90), 0, 255));
            }
          }
          if (value > 0) {
            value = 1;
          }
        } else if (config_.keyMode == 428) {
          int x = 11 * std::clamp(int(nx * 21), 0, 21);
          int y = 17 + 10 * int(k.y);
          out.keys[i] = fields_[fieldIndex_][y * 256 + x];
          continue;
        } else if (config_.keyMode == 429) {
          const int band = std::clamp(int(nx * 16), 0, 15);
          const double rowFloor = (4. - k.y) / 5.;
          // Divide [0, 1] evenly into 5 rows (bottom k.y=4 at 0.0 up to top number row k.y=0 at 0.8).
          if (bands_[band] > .001 && bands_[band] >= rowFloor) {
            const double edge = std::clamp((bands_[band] - rowFloor) * 5., 0., 1.);
            value = .35 + .65 * edge;
          }
        } else if (config_.keyMode == 432) {
          // Audio Marquee: alternating-direction horizontal rhythm bars across rows
          // driven by live music level, per-row frequency bands, and beat history.
          if (level_ > 0) {
            const int row = int(k.y);
            const double pos = (row & 1) ? (1. - nx) : nx;
            const int band = std::clamp((4 - row) * 3 + int(pos * 3.99), 0, 15);
            const double bandEnergy = bands_[band];
            const double rowEnergy = std::clamp(
                bandEnergy > .001 ? level_ * .45 + bandEnergy * .75
                                  : level_ * (1. - .1 * std::abs(row - 2)),
                0.,
                1.);
            const int histIdx = std::clamp(int(pos * 12), 0, 21);
            const double ripple = .75 + .25 * std::min(1., history_[histIdx] / std::max(.05, level_));
            if (rowEnergy > .01 && pos <= rowEnergy) {
              const double headDist = rowEnergy - pos;
              if (headDist < .14) {
                value = 1.;
                if (config_.palette != 0) {
                  color = scale(color, 1.25);
                }
              } else {
                value = std::clamp((1. - headDist * .65) * ripple, .25, .95);
              }
            }
            if (config_.palette != 0) {
              color = palette(std::fmod(pos + k.y * .12, 1.), elapsed);
            }
          }
        } else if (config_.keyMode == 434) {
          // Radial Chase: beat-driven concentric shockwave rings chasing outward from the centre.
          if (level_ > 0) {
            const double dx = (nx - .5) * 2.;
            const double dy = (k.y / 4. - .5) * 1.35;
            const double distNorm = std::clamp(std::hypot(dx, dy) / 1.15, 0., 1.);
            const int band = std::clamp(int(nx * 16), 0, 15);
            const double drive = std::clamp(
                bands_[band] > .001 ? level_ * .55 + bands_[band] * .65 : level_, 0., 1.);
            const int histIdx = std::clamp(int(distNorm * 12), 0, 21);
            const double histWave = history_[histIdx];
            const double ringWidth = .28;
            const double ringDist = std::abs(distNorm - drive);
            double ringVal = ringDist < ringWidth ? 1. - ringDist / ringWidth : 0.;
            if (drive > .5 && distNorm < drive - .25) {
              const double echoFront = std::fmod(drive * 1.75, 1.) * .65;
              const double echoDist = std::abs(distNorm - echoFront);
              if (echoDist < .22) {
                ringVal = std::max(ringVal, (1. - echoDist / .22) * .85);
              }
            }
            if (distNorm <= std::max(drive + ringWidth * .5, histWave)) {
              value = std::clamp(std::max(ringVal, histWave * (1. - distNorm * .35)), 0., 1.);
            }
            if (config_.palette != 0) {
              color = palette(std::fmod(distNorm + level_ * .25, 1.), elapsed);
            }
          }
        }
        out.keys[i] = scale(color, value * brightness);
      }
    }

    for (int i = 0; i < 18; ++i) {
      const bool lit =
          config_.sideMode == 501 ? i < int(level_ * 18)
          : config_.sideMode == 505 ? i < int(meter_ * 18)
          : config_.sideMode == 502 ? std::abs(i - 8) < int(level_ * 9)
          : config_.sideMode == 506 ? i >= 18 - int(level_ * 18)
                                    : config_.sideMode == 504;
      if (lit) {
        // 504 is the palette loop: it shows the rotating palette at full brightness, so silence
        // must not blank it (it is a background effect, not a meter).
        double value = config_.sideMode == 504 ? 1 : std::min(1., level_);
        out.side[i] = scale(palette(double(i) / 18, elapsed), value * brightness);
      }
    }
    if (config_.sideMode == 503) {
      Color c{};
      int l = int(level_ * 18);
      int s = 18;
      if (level_ > previous) {
        for (int i = 0; i < 3; ++i) {
          c[i] = uint8_t(std::max(0, int(config_.color[i]) - (int(config_.color[i]) / s) * l));
        }
      } else if (level_ < previous) {
        c = {
            uint8_t(std::max(0, int(config_.color[1]) - (int(config_.color[1]) / s) * l)),
            uint8_t(std::max(0, 100 + int(config_.color[2]) - (int(config_.color[2]) + 100 / s) * l) & 255),
            uint8_t(std::max(0, int(config_.color[0]) - (int(config_.color[0]) / s) * l)),
        };
      }
      out.side.fill(scale(c, brightness));
    }
    return out;
  }
};

inline Report report(
    uint8_t command,
    uint8_t zone,
    uint8_t total,
    uint8_t sequence,
    const std::vector<uint8_t>& data) {
  if (data.size() > 56) {
    throw std::runtime_error("Report too long");
  }
  Report p{};
  p[0] = 9;
  p[1] = command;
  p[2] = zone;
  p[4] = total;
  p[5] = sequence;
  p[6] = uint8_t(data.size());
  std::copy(data.begin(), data.end(), p.begin() + 7);
  unsigned sum = 0;
  for (size_t i = 0; i < 63; ++i) {
    sum += p[i];
  }
  p[63] = uint8_t(255 - sum);
  return p;
}

// clang-format off
constexpr std::array<std::array<uint8_t, 2>, 16> hero84Extras = {{
  {14,1},{2,15},{3,16},{4,17},{5,18},{6,19},{7,20},{8,21},{9,22},{10,23},{11,24},{12,25},{13,26},{95,27},{100,98},{101,99}
}};
// clang-format on

struct Encoded {
  std::array<Color, 68> keys{};
  std::vector<Report> packets;
};

inline Encoded encode(const Frame& f, bool hero84 = false) {
  Encoded out;
  out.keys = f.keys;
  if (f.direct) {
    out.packets.push_back(report(8, 2, 1, 0, {f.global[0], f.global[1], f.global[2]}));
    return out;
  }

  struct Group {
    Color color;
    std::vector<size_t> members;
  };
  std::vector<Group> groups;
  groups.reserve(68);
  for (size_t i = 0; i < 68; ++i) {
    auto it = std::find_if(
        groups.begin(), groups.end(), [&](const Group& g) { return g.color == f.keys[i]; });
    if (it == groups.end()) {
      groups.push_back({f.keys[i], {i}});
    } else {
      it->members.push_back(i);
    }
  }

  const size_t count = groups.size();
  std::array<bool, 68> active{};
  active.fill(true);
  std::array<double, 68 * 68> costs{};
  auto cost = [&](size_t i, size_t j) {
    if (groups[i].color == Color{} || groups[j].color == Color{}) {
      return 1e30;
    }
    double value = 0;
    for (int c = 0; c < 3; ++c) {
      double d = double(groups[i].color[c]) - groups[j].color[c];
      value += d * d;
    }
    return value * double(groups[i].members.size()) * groups[j].members.size() /
           (groups[i].members.size() + groups[j].members.size());
  };

  if (count > 32) {
    for (size_t i = 0; i < count; ++i) {
      for (size_t j = i + 1; j < count; ++j) {
        costs[i * 68 + j] = cost(i, j);
      }
    }
  }

  size_t remaining = count;
  while (remaining > 32) {
    size_t a = 0;
    size_t b = 1;
    double best = 1e30;
    for (size_t i = 0; i < count; ++i) {
      if (active[i]) {
        for (size_t j = i + 1; j < count; ++j) {
          if (active[j]) {
            double value = costs[i * 68 + j];
            if (value < best) {
              best = value;
              a = i;
              b = j;
            }
          }
        }
      }
    }
    auto& left = groups[a];
    auto& right = groups[b];
    double n = double(left.members.size() + right.members.size());
    for (int c = 0; c < 3; ++c) {
      left.color[c] = uint8_t(std::lround(
          (left.color[c] * left.members.size() + right.color[c] * right.members.size()) / n));
    }
    left.members.insert(left.members.end(), right.members.begin(), right.members.end());
    active[b] = false;
    --remaining;
    for (size_t i = 0; i < count; ++i) {
      if (active[i] && i != a) {
        size_t lo = std::min(i, a);
        size_t hi = std::max(i, a);
        costs[lo * 68 + hi] = cost(lo, hi);
      }
    }
  }

  std::vector<uint8_t> body;
  for (size_t index = 0; index < count; ++index) {
    if (active[index]) {
      const auto& g = groups[index];
      std::vector<uint8_t> ids;
      for (auto i : g.members) {
        ids.push_back(positions[i]);
        out.keys[i] = g.color;
      }
      if (hero84) {
        for (const auto& extra : hero84Extras) {
          const size_t source = size_t(
              std::find(positions.begin(), positions.end(), extra[1]) - positions.begin());
          if (std::find(g.members.begin(), g.members.end(), source) != g.members.end()) {
            ids.push_back(extra[0]);
          }
        }
      }
      body.insert(body.end(), g.color.begin(), g.color.end());
      body.push_back(uint8_t(ids.size()));
      body.insert(body.end(), ids.begin(), ids.end());
    }
  }

  const size_t total = (body.size() + 55) / 56;
  for (size_t i = 0; i < total; ++i) {
    out.packets.push_back(report(
        8,
        1,
        uint8_t(total),
        uint8_t(i),
        std::vector<uint8_t>(
            body.begin() + i * 56, body.begin() + std::min(body.size(), (i + 1) * 56))));
  }
  return out;
}

// --- WIN 68 HE MAX (XSYD 0x5C) -------------------------------------------------
// Verified against `rhythm_capture.pcapng` (#0014 `0x18` mode `0x15` init +
// 2,045 `OUT op=0x2A len=0x39` batch frames across 409 5-frame cycles) and
// firmware v1.1.4 (`VA 0x0C12E..0x0C2D0`).
constexpr uint8_t xsydMagic = 0x5c;
constexpr uint8_t xsydRgbOpcode = 0x18;
constexpr uint8_t xsydPerKeyOpcode = 0x2a;
constexpr uint8_t xsydPerKeyMode = 0x15;
constexpr size_t xsydPerKeySlots = 14;

// UI key ids of the 68-key WIN 68 HE MAX layout in drawing order. Mirrors
// HERO68_LAYOUT in src/keyboard/hero68Layout.ts and XSYD_KEYS in src/protocol/xsyd/keymap.ts.
// clang-format off
constexpr std::array<const char*, 68> xsydLayoutIds = {{
  "Escape","Digit1","Digit2","Digit3","Digit4","Digit5","Digit6","Digit7","Digit8","Digit9","Digit0","Minus","Equal","Backspace","Insert",
  "Tab","KeyQ","KeyW","KeyE","KeyR","KeyT","KeyY","KeyU","KeyI","KeyO","KeyP","BracketLeft","BracketRight","Backslash","Delete",
  "CapsLock","KeyA","KeyS","KeyD","KeyF","KeyG","KeyH","KeyJ","KeyK","KeyL","Semicolon","Quote","Enter","PageUp",
  "ShiftLeft","KeyZ","KeyX","KeyC","KeyV","KeyB","KeyN","KeyM","Comma","Period","Slash","ShiftRight","ArrowUp","PageDown",
  "ControlLeft","MetaLeft","AltLeft","Space","AltRight","Fn","ControlRight","ArrowLeft","ArrowDown","ArrowRight"
}};
// Same order as `xsydLayoutIds`; `usage & 0xff` from src/protocol/xsyd/keymap.ts.
// Verified byte-for-byte against `rhythm_capture.pcapng` (#0017..#0021, #0036..#0040).
constexpr std::array<uint8_t, 68> xsydLayoutUsage = {{
  41,30,31,32,33,34,35,36,37,38,39,45,46,42,73,
  43,20,26,8,21,23,28,24,12,18,19,47,48,49,76,
  57,4,22,7,9,10,11,13,14,15,51,52,40,75,
  225,29,27,6,25,5,17,16,54,55,56,229,82,78,
  224,227,226,44,230,1,228,80,81,79
}};
// clang-format on

inline Report xsydReport(uint8_t opcode, const std::vector<uint8_t>& payload) {
  if (payload.empty() || payload.size() > 60) {
    throw std::runtime_error("XSYD payload must be 1..60 bytes");
  }
  Report p{};
  p[0] = xsydMagic;
  p[1] = uint8_t(payload.size());
  p[2] = opcode;
  std::copy(payload.begin(), payload.end(), p.begin() + 4);
  p[3] = uint8_t(xsydMagic + payload.size() + opcode + 0x35 + payload.back());
  return p;
}

// `0x18` write: switch to Per-key Color (mode 0x15) at full brightness (`4`).
// Palette matches `rhythm_capture.pcapng` #0014 and `tideflux_...pcapng`.
inline Report xsydPerKeyModeReport(uint8_t brightness = 4) {
  std::vector<uint8_t> payload(0x2c, 0);
  payload[0] = 0x01;
  const std::array<std::array<uint8_t, 4>, 7> palette = {{{0x00, 0x00, 0xff, 0xff},
                                                          {0x00, 0xff, 0x00, 0xff},
                                                          {0x00, 0x7f, 0x7f, 0xff},
                                                          {0xff, 0x00, 0x00, 0xff},
                                                          {0x7f, 0x00, 0x7f, 0xff},
                                                          {0x7f, 0x7f, 0x00, 0xff},
                                                          {0x7f, 0x7f, 0x7f, 0xff}}};
  for (size_t i = 0; i < palette.size(); ++i) {
    std::copy(palette[i].begin(), palette[i].end(), payload.begin() + 5 + i * 4);
  }
  payload[37] = 0x01; // Reverse off
  payload[38] = uint8_t(std::min<int>(4, std::max<int>(0, brightness)));
  payload[39] = xsydPerKeyMode;
  payload[40] = 0x03;
  payload[41] = 0x02;
  payload[43] = 0x00;
  return xsydReport(xsydRgbOpcode, payload);
}

// `0x2A` batch write, 14 slots of `01 <keyValue> <R> <G> <B>`, padded with
// `00 00 00 00` for unused slots (`rhythm_capture.pcapng` #0021, #0030, #0040).
inline Report xsydPerKeyBatchReport(uint8_t first, const std::array<Color, 68>& keys) {
  std::vector<uint8_t> payload(1 + 4 * xsydPerKeySlots, 0);
  payload[0] = 0x01;
  for (size_t slot = 0; slot < xsydPerKeySlots; ++slot) {
    const size_t index = first + slot;
    uint8_t* p = payload.data() + 1 + slot * 4;
    if (index >= xsydLayoutUsage.size()) {
      p[0] = 0x00;
      continue;
    }
    p[0] = xsydLayoutUsage[index];
    p[1] = keys[index][0];
    p[2] = keys[index][1];
    p[3] = keys[index][2];
  }
  return xsydReport(xsydPerKeyOpcode, payload);
}

// Frames whose colours did not change are skipped entirely; a frame that did
// change sends all five `0x2A` batches (`5C 39 2A F4 | 01 ...`).
inline Report xsydOnboardRestoreReport(uint8_t mode = 0x00, uint8_t brightness = 4) {
  std::vector<uint8_t> onboard(0x2c, 0);
  onboard[0] = 0x01;
  const std::array<std::array<uint8_t, 4>, 7> palette = {{{0x00, 0x00, 0xff, 0xff},
                                                          {0x00, 0xff, 0x00, 0xff},
                                                          {0x00, 0x7f, 0x7f, 0xff},
                                                          {0xff, 0x00, 0x00, 0xff},
                                                          {0x7f, 0x00, 0x7f, 0xff},
                                                          {0x7f, 0x7f, 0x00, 0xff},
                                                          {0x7f, 0x7f, 0x7f, 0xff}}};
  for (size_t i = 0; i < palette.size(); ++i) {
    std::copy(palette[i].begin(), palette[i].end(), onboard.begin() + 5 + i * 4);
  }
  onboard[37] = 0x01;
  onboard[38] = uint8_t(std::min<int>(4, std::max<int>(0, brightness)));
  onboard[39] = mode;
  onboard[40] = 0x03;
  onboard[41] = 0x02;
  onboard[43] = 0x00;
  return xsydReport(xsydRgbOpcode, onboard);
}

// Decode a queued Custom RGB batch (cmd = 8, zone = 1 palette-grouped reports
// from service/frame.ts) back into a 68-key Frame so encodeXsyd can stream
// Custom RGB to a WIN 68 HE MAX over native Windows HID (0x18 + 5 x 0x2A).
inline Frame decodeCustomBatch(const std::vector<Report>& batch) {
  Frame frame{};
  std::vector<uint8_t> body;
  body.reserve(256);
  for (const auto& p : batch) {
    if (p[0] != 9 || p[1] != 8 || p[2] != 1) {
      continue;
    }
    const size_t n = std::min<size_t>(56, p[6]);
    body.insert(body.end(), p.begin() + 7, p.begin() + 7 + n);
  }
  bool useXsydUsage = false;
  for (size_t i = 0; i + 4 <= body.size();) {
    const size_t count = body[i + 3];
    i += 4;
    for (size_t j = 0; j < count && i < body.size(); ++j, ++i) {
      if (body[i] >= 224) {
        useXsydUsage = true;
      }
    }
  }
  for (size_t i = 0; i + 4 <= body.size();) {
    const Color color{body[i], body[i + 1], body[i + 2]};
    const size_t count = body[i + 3];
    i += 4;
    for (size_t j = 0; j < count && i < body.size(); ++j, ++i) {
      const uint8_t pos = body[i];
      for (size_t k = 0; k < 68; ++k) {
        const uint8_t expected = useXsydUsage ? xsydLayoutUsage[k] : positions[k];
        if (expected == pos) {
          frame.keys[k] = color;
          break;
        }
      }
    }
  }
  return frame;
}

inline Encoded encodeXsyd(const Frame& f, std::array<Color, 68>& previous, bool& primed) {
  Encoded out;
  out.keys = f.keys;
  const bool changed = !primed || f.keys != previous;
  if (!changed) {
    return out;
  }
  if (!primed) {
    out.packets.push_back(xsydPerKeyModeReport());
    primed = true;
  }
  for (uint8_t first = 0; first < 68; first += uint8_t(xsydPerKeySlots)) {
    out.packets.push_back(xsydPerKeyBatchReport(first, f.keys));
  }
  previous = f.keys;
  return out;
}

inline std::vector<Report> encodeSide(const Frame& f, int mode) {
  if (mode == 500) {
    return {};
  }
  if (mode == 503) {
    return {report(14, 2, 1, 0, {f.side[0][0], f.side[0][1], f.side[0][2]})};
  }
  std::vector<uint8_t> body;
  for (size_t i = 0; i < f.side.size(); ++i) {
    body.insert(body.end(), {f.side[i][0], f.side[i][1], f.side[i][2], 1, uint8_t(i)});
  }
  std::vector<Report> packets;
  size_t total = (body.size() + 55) / 56;
  for (size_t i = 0; i < total; ++i) {
    packets.push_back(report(
        14,
        1,
        uint8_t(total),
        uint8_t(i),
        std::vector<uint8_t>(
            body.begin() + i * 56, body.begin() + std::min(body.size(), (i + 1) * 56))));
  }
  return packets;
}

} // namespace rhythm
