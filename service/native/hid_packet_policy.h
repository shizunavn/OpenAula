#pragma once
#include <array>
#include <cstddef>
#include <string>

namespace hid_policy {

inline bool isBytetechPacketValid(const unsigned char* p, size_t n) {
  unsigned sum = 0;
  for (size_t i = 0; i < 64 && i < n; ++i) {
    sum += p[i];
  }
  return n >= 64 && p[0] == 9 && p[6] <= 56 && (sum & 255) == 255;
}

// Configuration commands used by OpenAula, plus volatile RGB and passive Hall.
// Firmware update, reset and calibration commands remain excluded.
inline bool isBytetechPacketAllowed(const std::array<unsigned char, 64>& p) {
  if (!isBytetechPacketValid(p.data(), p.size())) {
    return false;
  }
  const auto c = p[1];
  const auto z = p[2];
  const auto n = p[6];
  const bool config =
      ((c == 3 || c == 0x83 || c == 0x12 || c == 0x92) && z <= 2) ||
      ((c == 0x13 || c == 0x15 || c == 0x16 || c == 0x19 ||
        c == 0x93 || c == 0x95 || c == 0x96 || c == 0x99) &&
       z == 0 && n > 0) ||
      (c == 0x10 && z == 0 && n == 1 && p[7] <= 2) ||
      ((c == 0x90 || c == 0x87) && z == 0) ||
      ((c == 0x1a || c == 0x9a) && z <= 2) ||
      (c == 5 && z == 0) ||
      ((c == 4 || c == 0x84) &&
       (z == 1 || z == 6 || z == 17 || z == 19 || z == 21 ||
        z == 23 || z == 24 || z == 25 || z == 29 || z == 30)) ||
      ((c == 6 || c == 0x86) && z == 0) ||
      (c == 0x82 && (z == 1 || z == 2 || z == 3 || z == 4 || z == 6 || z == 8 || z == 9));
  return config ||
         (p[1] == 8 && (p[2] == 1 || (p[2] == 2 && p[6] == 3))) ||
         (p[1] == 0x98 && p[2] == 1 && p[6] > 0 && p[6] <= 18 && p[6] % 2 == 0);
}

inline bool isXsydPacketValid(const unsigned char* p, size_t n) {
  return n >= 64 && p[0] == 0x5c;
}

}  // namespace hid_policy

inline bool valid(const unsigned char* p, size_t n) {
  return hid_policy::isBytetechPacketValid(p, n);
}

inline bool allowed(const std::array<unsigned char, 64>& p) {
  return hid_policy::isBytetechPacketAllowed(p);
}

inline bool parseHexPacket(const std::string& text, std::array<unsigned char, 64>& request) {
  if (text.size() != 128) {
    return false;
  }
  auto digit = [](char c) {
    return c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : -1;
  };
  for (size_t i = 0; i < 64; ++i) {
    int a = digit(text[i * 2]);
    int b = digit(text[i * 2 + 1]);
    if (a < 0 || b < 0) {
      return false;
    }
    request[i] = static_cast<unsigned char>(a * 16 + b);
  }
  return allowed(request);
}
