#pragma once
#include "hall_core.h"
#include "keyboard_hook_core.h"
#include <sstream>
#include <stdexcept>
#include <string>

namespace gamepad {

constexpr int FirstAnalogAction = 15;
constexpr int ActionCount = 25;
// Stick action indices: [Up, Down, Left, Right] starting at 15 (Left) and 19 (Right).
constexpr int LeftStickUpAction = 15;
constexpr int RightStickUpAction = 19;
constexpr int LeftTriggerAction = 23;
constexpr int RightTriggerAction = 24;
constexpr double SampleStaleTimeoutMs = 50.0;
// 8 distance units = 0.08 mm (keys below this travel with pressed=false are considered at rest).
constexpr uint16_t RestingThresholdUnits = 8;
constexpr double MaxTravelMm = 3.4;
constexpr double MinAngleDeg = 30.0;
constexpr double MaxAngleDeg = 60.0;
constexpr size_t MinCurvePoints = 2;
constexpr size_t MaxCurvePoints = 16;
constexpr double Pi = 3.141592653589793;

struct Point {
  double x;
  double y;
};

struct Binding {
  uint16_t pos;
  int action;
  double start;
  double end;
};

struct Config {
  int rate = 200;
  bool snappy = true;
  bool square = false;
  bool angleEnabled = false;
  bool suppressMappedKeys = false;
  double angle = 45;
  std::vector<Point> curve{{0, 0}, {1, 1}};
  std::vector<Binding> bindings;
  keyboard::Mask keyboardScans;
};

struct Report {
  uint16_t buttons = 0;
  int16_t lx = 0;
  int16_t ly = 0;
  int16_t rx = 0;
  int16_t ry = 0;
  uint8_t lt = 0;
  uint8_t rt = 0;
};

inline bool analog(int action) {
  return action >= FirstAnalogAction && action < ActionCount;
}

inline std::vector<std::string> split(const std::string& value, char sep) {
  std::vector<std::string> out;
  std::istringstream in(value);
  std::string part;
  while (std::getline(in, part, sep)) {
    out.push_back(part);
  }
  return out;
}

inline double number(const std::string& value) {
  size_t used = 0;
  double n = std::stod(value, &used);
  if (used != value.size() || !std::isfinite(n)) {
    throw std::runtime_error("Invalid number");
  }
  return n;
}

inline void parseKeyboardSuppression(
    const std::string& toggleField,
    const std::string& scansField,
    Config& out) {
  if (toggleField != "0" && toggleField != "1") {
    throw std::runtime_error("Invalid keyboard toggle");
  }
  out.suppressMappedKeys = toggleField == "1";
  for (const auto& s : split(scansField, ',')) {
    double scan = number(s);
    if (scan < 1 ||
        scan >= 512 ||
        scan != std::floor(scan) ||
        (unsigned(scan) & 255) == 0 ||
        out.keyboardScans[unsigned(scan)]) {
      throw std::runtime_error("Invalid Windows scan code");
    }
    out.keyboardScans.set(unsigned(scan));
  }
}

inline std::vector<Point> parseResponseCurve(const std::string& field) {
  std::vector<Point> points;
  for (const auto& p : split(field, '|')) {
    auto v = split(p, ',');
    if (v.size() != 2) {
      throw std::runtime_error("Invalid curve");
    }
    Point point{number(v[0]), number(v[1])};
    const bool outOfBounds = point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1;
    const bool nonMonotonic =
        !points.empty() && (point.x <= points.back().x || point.y < points.back().y);
    if (outOfBounds || nonMonotonic) {
      throw std::runtime_error("Non-monotonic curve");
    }
    points.push_back(point);
  }
  if (points.size() < MinCurvePoints ||
      points.size() > MaxCurvePoints ||
      points.front().x != 0 ||
      points.front().y != 0 ||
      points.back().x != 1 ||
      points.back().y != 1) {
    throw std::runtime_error("Invalid curve endpoints");
  }
  return points;
}

inline std::vector<Binding> parseBindings(const std::string& field) {
  std::vector<Binding> bindings;
  std::array<bool, hall::Capacity> seen{};
  for (const auto& p : split(field, '|')) {
    auto v = split(p, ',');
    if (v.size() != 4) {
      throw std::runtime_error("Invalid binding");
    }
    double pos = number(v[0]);
    double action = number(v[1]);
    double start = number(v[2]);
    double end = number(v[3]);
    if (pos < 1 ||
        pos >= hall::Capacity ||
        pos != std::floor(pos) ||
        !hall::heroPosition(unsigned(pos)) ||
        action < 0 ||
        action >= ActionCount ||
        action != std::floor(action) ||
        start < 0 ||
        end > MaxTravelMm ||
        end - start < .01 - 1e-9 ||
        seen[size_t(pos)]) {
      throw std::runtime_error("Invalid binding values");
    }
    seen[size_t(pos)] = true;
    bindings.push_back({uint16_t(pos), int(action), start, end});
  }
  if (bindings.size() > hall::MaxBoardKeys) {
    throw std::runtime_error("Too many bindings");
  }
  return bindings;
}

/**
 * Parses the semicolon-delimited `gamepad-config:` wire payload:
 *   `rate;snappy;square;angleEnabled;angle;curve;bindings[;suppress;scans]`
 */
inline Config parse(const std::string& payload) {
  auto f = split(payload, ';');
  if (!payload.empty() && payload.back() == ';') {
    f.push_back("");
  }
  if (f.size() != 7 && f.size() != 9) {
    throw std::runtime_error("Invalid gamepad fields");
  }

  Config c;
  if (f.size() == 9) {
    parseKeyboardSuppression(f[7], f[8], c);
  }

  const double rate = number(f[0]);
  if (rate != 50 && rate != 100 && rate != 200) {
    throw std::runtime_error("Invalid rate");
  }
  c.rate = int(rate);

  for (int i = 1; i <= 3; i++) {
    if (f[i] != "0" && f[i] != "1") {
      throw std::runtime_error("Invalid toggle");
    }
  }
  c.snappy = f[1] == "1";
  c.square = f[2] == "1";
  c.angleEnabled = f[3] == "1";
  c.angle = number(f[4]);
  if (c.angle < MinAngleDeg || c.angle > MaxAngleDeg) {
    throw std::runtime_error("Invalid angle");
  }

  c.curve = parseResponseCurve(f[5]);
  c.bindings = parseBindings(f[6]);
  return c;
}

inline double curve(const Config& c, double value) {
  double x = std::clamp(value, 0., 1.);
  for (size_t i = 1; i < c.curve.size(); i++) {
    auto a = c.curve[i - 1];
    auto b = c.curve[i];
    if (x <= b.x) {
      return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
    }
  }
  return 1;
}

inline double resolveAxis(bool snappy, double positive, double negative) {
  if (snappy) {
    if (positive == negative) {
      return 0.;
    }
    return positive > negative ? positive : -negative;
  }
  return positive - negative;
}

/**
 * Computes signed 16-bit XInput stick coordinates from directional travel values.
 * When `angleEnabled` is active, scales the Y axis by `tan(angle)` while preserving
 * the original Euclidean vector magnitude (`magnitude / adjusted`), then optionally
 * clamps to the unit circle (`!square`) before scaling to [-32767, 32767].
 */
inline void computeStickAxes(
    const Config& c,
    double right,
    double left,
    double up,
    double down,
    int16_t& outX,
    int16_t& outY) {
  double x = resolveAxis(c.snappy, right, left);
  double y = resolveAxis(c.snappy, up, down);
  if (c.angleEnabled) {
    double magnitude = std::hypot(x, y);
    y *= std::tan(c.angle * Pi / 180);
    double adjusted = std::hypot(x, y);
    if (adjusted) {
      x *= magnitude / adjusted;
      y *= magnitude / adjusted;
    }
  }
  if (!c.square) {
    double len = std::hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
  }
  outX = int16_t(std::lround(std::clamp(x, -1., 1.) * 32767));
  outY = int16_t(std::lround(std::clamp(y, -1., 1.) * 32767));
}

inline Report map(
    const Config& c,
    const std::array<hall::Sample, hall::Capacity>& samples,
    double now,
    bool& stale,
    bool& resting) {
  // Maps digital action indices 0..14 to XUSB_GAMEPAD_* bitmasks:
  // 0:A(0x1000), 1:B(0x2000), 2:X(0x4000), 3:Y(0x8000), 4:Start(0x0010),
  // 5:Back(0x0020), 6:Guide(0x0400), 7:Up(0x0001), 8:Down(0x0002),
  // 9:Left(0x0004), 10:Right(0x0008), 11:LB(0x0100), 12:RB(0x0200),
  // 13:LClick(0x0040), 14:RClick(0x0080).
  static constexpr uint16_t buttons[] = {
      4096, 8192, 16384, 32768, 16, 32, 1024, 1, 2, 4, 8, 256, 512, 64, 128};

  std::array<double, ActionCount> values{};
  Report out;
  stale = false;
  resting = true;

  for (const auto& b : c.bindings) {
    const auto& s = samples[b.pos];
    if (!s.sequence || now - s.at >= SampleStaleTimeoutMs || now < s.at) {
      stale = true;
      continue;
    }
    if (s.pressed || s.distance > RestingThresholdUnits) {
      resting = false;
    }
    if (analog(b.action)) {
      const double normalizedTravel = (s.distance / 100. - b.start) / (b.end - b.start);
      values[b.action] = std::max(values[b.action], curve(c, normalizedTravel));
    } else if (s.pressed) {
      out.buttons |= buttons[b.action];
    }
  }

  if (stale) {
    return {};
  }

  computeStickAxes(
      c,
      values[LeftStickUpAction + 3],
      values[LeftStickUpAction + 2],
      values[LeftStickUpAction],
      values[LeftStickUpAction + 1],
      out.lx,
      out.ly);
  computeStickAxes(
      c,
      values[RightStickUpAction + 3],
      values[RightStickUpAction + 2],
      values[RightStickUpAction],
      values[RightStickUpAction + 1],
      out.rx,
      out.ry);
  out.lt = uint8_t(std::lround(values[LeftTriggerAction] * 255));
  out.rt = uint8_t(std::lround(values[RightTriggerAction] * 255));
  return out;
}

} // namespace gamepad
