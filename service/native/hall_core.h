#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <vector>

namespace hall {

constexpr size_t Capacity = 256;
constexpr size_t MaxBoardKeys = 84;
constexpr uint8_t ReportHeaderByte = 0x09;
constexpr uint8_t HallStreamCommand = 0x98;
constexpr uint8_t HallStreamZone = 0x01;
constexpr size_t ReportByteLength = 64;
constexpr size_t MaxKeysPerBatch = 9;
constexpr size_t BytesPerKeyRecord = 6;
constexpr size_t PacketPayloadOffset = 7;
// 0..1024 ms at 0.25 ms resolution (4096 * 0.25 ms = 1024 ms).
constexpr size_t QuarterMsBucketCount = 4097;
constexpr size_t MaxRecentGaps = 512;

inline bool heroPosition(unsigned pos) {
  return (pos >= 1 && pos <= 77) || pos == 95 || (pos >= 98 && pos <= 103);
}

// AULA WIN 68 HE MAX (XSYD 0x5C protocol, op 0x12 / reply 0x92):
// - subcmd 0x02 (travel in um, 63 x u16_le per table, LEN=0x80 across 3 x 64B reports)
// - subcmd 0x03 (pressed flags, 126 x u8 in table 1, LEN=0x82 across 3 x 64B reports)
constexpr uint8_t XsydMagic = 0x5c;
constexpr uint8_t XsydHallOpcode = 0x12;
constexpr uint8_t XsydHallReplyOpcode = 0x92;
constexpr uint8_t XsydHallSubcmdTravel = 0x02;
constexpr uint8_t XsydHallSubcmdPressed = 0x03;
constexpr size_t XsydHallHalfMatrixCount = 63;
constexpr size_t XsydHallTotalMatrixCount = 126;
// Budgets for one XSYD Hall round trip (`0x12` write + three 64-byte reports).
// A reply usually takes a couple of milliseconds; these only bound a silent
// device. `io()` waits at least 1 ms, so the write timeout must stay above the
// usual USB write latency or every cycle would fail.
constexpr DWORD XsydWriteTimeoutMs = 10;
constexpr int XsydReplyBudgetMs = 15;
constexpr uint8_t XsydReadOk = 0;
constexpr uint8_t XsydReadFailed = 1;
// The write failed, so the handle is suspect and the request count is unknown.
constexpr uint8_t XsydWriteFailed = 2;

constexpr std::array<uint8_t, XsydHallTotalMatrixCount> XsydMatrixToHeroPos{{
     0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
     1, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 98,  0,  0,  0,  0,  0,  0,
    28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 99,  0,  0,  0,  0,  0,  0,
    42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53,  0, 54, 102,  0,  0,  0,  0,  0,  0,
    55,  0, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 74, 103,  0,  0,  0,  0,  0,  0,
    67, 68, 69,  0,  0,  0, 70,  0,  0, 71, 72, 73, 76, 75, 77,  0,  0,  0,  0,  0,  0,
}};

inline std::array<uint8_t, ReportByteLength> buildXsydHallRequest(uint8_t subcmd, uint8_t tableId) {
  std::array<uint8_t, ReportByteLength> out{};
  out[0] = XsydMagic;
  out[1] = 0x04;
  out[2] = XsydHallOpcode;
  out[4] = subcmd;
  out[5] = tableId;
  out[6] = 0xff;
  out[7] = 0xff;
  out[3] = uint8_t((XsydMagic + 0x04 + XsydHallOpcode + 0x35 + 0xff) & 0xff);
  return out;
}

inline bool matchesXsydTravelReply(const uint8_t* frame, size_t length) {
  if (length < ReportByteLength * 3 ||
      frame[0] != XsydMagic ||
      frame[1] != 0x80 ||
      frame[2] != XsydHallReplyOpcode ||
      frame[4] != 0x00 ||
      frame[5] != XsydHallSubcmdTravel) {
    return false;
  }
  const uint8_t expectedCk = uint8_t((XsydMagic + 0x80 + XsydHallReplyOpcode + 0x35 + 0x00) & 0xff);
  return frame[3] == expectedCk;
}

inline bool matchesXsydPressedReply(const uint8_t* frame, size_t length) {
  if (length < ReportByteLength * 3 ||
      frame[0] != XsydMagic ||
      frame[1] != 0x82 ||
      frame[2] != XsydHallReplyOpcode ||
      frame[4] != 0x00 ||
      frame[5] != XsydHallSubcmdPressed) {
    return false;
  }
  const uint8_t expectedCk = uint8_t((XsydMagic + 0x82 + XsydHallReplyOpcode + 0x35 + 0xff) & 0xff);
  return frame[3] == expectedCk;
}

struct Sample {
  uint16_t distance = 0;
  uint16_t adc = 0;
  bool pressed = false;
  double at = -1;
  uint64_t sequence = 0;
};

inline bool matchesReply(
    const uint8_t* packet,
    size_t length,
    const std::vector<uint16_t>& ids) {
  if (length < ReportByteLength ||
      ids.empty() ||
      ids.size() > MaxKeysPerBatch ||
      packet[0] != ReportHeaderByte ||
      packet[1] != HallStreamCommand ||
      packet[2] != HallStreamZone ||
      packet[6] != ids.size() * BytesPerKeyRecord) {
    return false;
  }

  unsigned checksum = 0;
  for (size_t i = 0; i < ReportByteLength; i++) {
    checksum += packet[i];
  }
  if ((checksum & 0xff) != 0xff) {
    return false;
  }

  for (size_t i = 0; i < ids.size(); i++) {
    const size_t offset = PacketPayloadOffset + i * BytesPerKeyRecord;
    const uint16_t pos = uint16_t(packet[offset] * 256 + packet[offset + 1]);
    if (pos != ids[i]) {
      return false;
    }
  }
  return true;
}

struct Scheduler {
  std::array<double, Capacity> hz{};
  std::array<double, Capacity> due{};
  std::array<Sample, Capacity> samples{};
  std::array<uint64_t, Capacity> counts{};
  std::array<double, Capacity> first{};
  std::array<double, Capacity> last{};
  std::array<std::vector<double>, Capacity> gaps{};
  // Bounded quarter-millisecond buckets retain p99 for the entire active demand.
  // The final bucket records gaps >= 1024 ms, without growing during long runs.
  std::array<std::vector<uint64_t>, Capacity> intervals{};
  uint64_t sequence = 0;
  uint64_t requests = 0;
  uint64_t timeouts = 0;
  double retryAt = 0;
  unsigned failures = 0;

  void configure(const std::array<double, Capacity>& next, double now) {
    for (size_t i = 0; i < Capacity; i++) {
      if (next[i] > 0 && next[i] != hz[i]) {
        if (hz[i] == 0) {
          due[i] = now;
          samples[i] = {};
        } else if (next[i] > hz[i]) {
          due[i] = std::min(due[i], now);
        }
        counts[i] = 0;
        gaps[i].clear();
        intervals[i].assign(QuarterMsBucketCount, 0);
      }
      if (!next[i]) {
        samples[i] = {};
      }
      hz[i] = next[i];
    }
  }

  bool active() const {
    return std::any_of(hz.begin(), hz.end(), [](double v) { return v > 0; });
  }

  double deadline() const {
    double d = 1e30;
    for (size_t i = 0; i < Capacity; i++) {
      if (hz[i]) {
        d = std::min(d, due[i]);
      }
    }
    return std::max(d, retryAt);
  }

  std::vector<uint16_t> batch(double now) const {
    std::vector<uint16_t> ids;
    if (now < retryAt) {
      return ids;
    }
    for (uint16_t i = 0; i < Capacity; i++) {
      if (hz[i] > 0 && due[i] <= now) {
        ids.push_back(i);
      }
    }
    std::stable_sort(ids.begin(), ids.end(), [&](uint16_t a, uint16_t b) {
      if (hz[a] != hz[b]) {
        return hz[a] > hz[b];
      }
      return due[a] < due[b];
    });
    if (ids.size() > MaxKeysPerBatch) {
      ids.resize(MaxKeysPerBatch);
    }
    return ids;
  }

  void received(
      uint16_t pos,
      uint16_t distance,
      uint16_t adc,
      bool pressed,
      double at) {
    if (counts[pos]) {
      const double gap = std::max(0., at - last[pos]);
      gaps[pos].push_back(gap);
      if (gaps[pos].size() > MaxRecentGaps) {
        gaps[pos].erase(gaps[pos].begin());
      }
      if (intervals[pos].empty()) {
        intervals[pos].assign(QuarterMsBucketCount, 0);
      }
      const size_t bucket = size_t(std::min(double(QuarterMsBucketCount - 1), std::ceil(gap * 4)));
      intervals[pos][bucket]++;
    } else {
      first[pos] = at;
    }

    last[pos] = at;
    counts[pos]++;
    samples[pos] = {distance, adc, pressed, at, ++sequence};

    // Advance to the next future deadline; never replay missed work.
    const double interval = 1000 / hz[pos];
    due[pos] += interval;
    if (due[pos] <= at) {
      due[pos] += std::floor((at - due[pos]) / interval + 1) * interval;
    }
  }

  double measuredHz(size_t pos, double now) const {
    if (counts[pos] <= 1) {
      return 0;
    }
    return (counts[pos] - 1) * 1000. / std::max(1., now - first[pos]);
  }

  double p99(size_t pos) const {
    auto g = gaps[pos];
    if (g.empty()) {
      return 0;
    }
    std::sort(g.begin(), g.end());
    return g[size_t(std::ceil(g.size() * .99)) - 1];
  }

  double lifetimeP99(size_t pos) const {
    if (counts[pos] < 2) {
      return 0;
    }
    const auto rank = uint64_t(std::ceil((counts[pos] - 1) * .99));
    uint64_t cumulative = 0;
    for (size_t i = 0; i < intervals[pos].size(); i++) {
      cumulative += intervals[pos][i];
      if (cumulative >= rank) {
        return i * .25;
      }
    }
    return 0;
  }

  void success() {
    failures = 0;
    retryAt = 0;
  }

  void failed(double now) {
    timeouts++;
    retryAt = now + std::min(2000., 250. * std::pow(2., std::min(3u, failures++)));
    for (auto& s : samples) {
      s = {};
    }
  }
};

} // namespace hall
