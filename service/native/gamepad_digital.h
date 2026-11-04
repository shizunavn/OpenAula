#pragma once
#include "gamepad_core.h"

namespace gamepad {

constexpr size_t DigitalFieldCount = 8;
constexpr size_t PosIndex = 0;
constexpr size_t ApIndex = 1;
constexpr size_t RtEnabledIndex = 2;
constexpr size_t ReleaseIndex = 3;
constexpr size_t PressIndex = 4;
constexpr size_t DeadzoneEnabledIndex = 5;
constexpr size_t TopDeadzoneIndex = 6;
constexpr size_t BottomDeadzoneIndex = 7;
constexpr unsigned MaxTravelUnits = 340;

struct DigitalSetting {
  bool configured = false;
  bool rt = false;
  bool deadzone = false;
  uint16_t ap = 0;
  uint16_t release = 0;
  uint16_t press = 0;
  uint16_t top = 0;
  uint16_t bottom = 0;
};

using DigitalSettings = std::array<DigitalSetting, hall::Capacity>;

inline DigitalSettings parseDigital(const std::string& payload) {
  DigitalSettings settings{};
  for (const auto& record : split(payload, '|')) {
    auto fields = split(record, ',');
    if (fields.size() != DigitalFieldCount) {
      throw std::runtime_error("Invalid digital settings");
    }
    std::array<unsigned, DigitalFieldCount> v{};
    for (size_t i = 0; i < v.size(); i++) {
      double n = number(fields[i]);
      if (n < 0 || n > MaxTravelUnits || n != std::floor(n)) {
        throw std::runtime_error("Invalid digital setting value");
      }
      v[i] = unsigned(n);
    }

    const unsigned pos = v[PosIndex];
    if (pos >= hall::Capacity ||
        !hall::heroPosition(pos) ||
        settings[pos].configured ||
        v[RtEnabledIndex] > 1 ||
        v[DeadzoneEnabledIndex] > 1) {
      throw std::runtime_error("Invalid digital key settings");
    }

    settings[pos] = {
        true,
        bool(v[RtEnabledIndex]),
        bool(v[DeadzoneEnabledIndex]),
        uint16_t(v[ApIndex]),
        uint16_t(v[ReleaseIndex]),
        uint16_t(v[PressIndex]),
        uint16_t(v[TopDeadzoneIndex]),
        uint16_t(v[BottomDeadzoneIndex]),
    };
  }
  return settings;
}

struct DigitalState {
  bool down = false;
  bool activated = false;
  uint16_t extreme = 0;
  double at = -1;
  uint64_t sequence = 0;

  bool sample(const DigitalSetting& c, const hall::Sample& s) {
    if (!c.configured) {
      *this = {};
      return false;
    }
    if (sequence && s.sequence == sequence) {
      return down;
    }
    if (!sequence || s.at < at || s.at - at >= SampleStaleTimeoutMs) {
      down = false;
      activated = false;
      extreme = s.distance;
    }
    at = s.at;
    sequence = s.sequence;

    const auto distance = s.distance;
    const unsigned top = c.deadzone ? c.top : 0;
    if (distance <= top) {
      down = false;
      activated = false;
      extreme = distance;
      return false;
    }

    // AP starts each stroke. RT thereafter tracks the deepest pressed point
    // and shallowest released point, including reactivation below AP.
    if (!c.rt) {
      down = distance >= c.ap;
      extreme = distance;
      return down;
    }
    if (!activated) {
      down = distance >= c.ap;
      if (down) {
        activated = true;
      }
      extreme = distance;
      return down;
    }
    if (c.deadzone && c.bottom && distance >= MaxTravelUnits - c.bottom) {
      extreme = down ? std::max(extreme, distance) : distance;
      down = true;
      return true;
    }

    if (down) {
      extreme = std::max(extreme, distance);
      if (extreme > distance &&
          unsigned(extreme - distance) >= std::max(1u, unsigned(c.release))) {
        down = false;
        extreme = distance;
      }
    } else {
      extreme = std::min(extreme, distance);
      if (distance > extreme &&
          unsigned(distance - extreme) >= std::max(1u, unsigned(c.press))) {
        down = true;
        extreme = distance;
      }
    }
    return down;
  }
};

} // namespace gamepad
