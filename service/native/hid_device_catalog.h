#pragma once
#include <windows.h>
#include <cwctype>
#include <string>

namespace hid_catalog {

constexpr USHORT BYTETECH_VENDOR_ID = 0x372E;
constexpr USHORT BYTETECH_PRODUCT_IDS[] = {0x103E, 0x1000, 0x106C};
constexpr USHORT BYTETECH_USAGE_PAGE = 0xFF60;
constexpr USHORT BYTETECH_USAGE = 0x0061;

struct UsbVidPid {
  USHORT vid;
  USHORT pid;
};

constexpr UsbVidPid XSYD_DEVICE_IDS[] = {
    {0x1CA2, 0x1901},
    {0x1C4F, 0xEE88},
    {0x3554, 0xFA09},
};

inline bool isBytetechVidPid(USHORT vid, USHORT pid) {
  if (vid != BYTETECH_VENDOR_ID) {
    return false;
  }
  for (USHORT candidate : BYTETECH_PRODUCT_IDS) {
    if (pid == candidate) {
      return true;
    }
  }
  return false;
}

inline bool isXsydVidPid(USHORT vid, USHORT pid) {
  for (const auto& entry : XSYD_DEVICE_IDS) {
    if (entry.vid == vid && entry.pid == pid) {
      return true;
    }
  }
  return false;
}

inline bool isSupportedRawKeyboardName(const std::wstring& upperName) {
  const bool hero = upperName.find(L"VID_372E") != std::wstring::npos &&
                    (upperName.find(L"PID_103E") != std::wstring::npos ||
                     upperName.find(L"PID_1000") != std::wstring::npos ||
                     upperName.find(L"PID_106C") != std::wstring::npos);
  const bool xsyd = (upperName.find(L"VID_1CA2") != std::wstring::npos &&
                     upperName.find(L"PID_1901") != std::wstring::npos) ||
                    (upperName.find(L"VID_1C4F") != std::wstring::npos &&
                     upperName.find(L"PID_EE88") != std::wstring::npos) ||
                    (upperName.find(L"VID_3554") != std::wstring::npos &&
                     upperName.find(L"PID_FA09") != std::wstring::npos);
  return hero || xsyd;
}

}  // namespace hid_catalog

inline bool heroKeyboard(HANDLE handle) {
  if (!handle) {
    return false;
  }
  UINT length = 0;
  if (GetRawInputDeviceInfoW(handle, RIDI_DEVICENAME, nullptr, &length) != 0 || !length) {
    return false;
  }
  std::wstring name(length, L'\0');
  if (GetRawInputDeviceInfoW(handle, RIDI_DEVICENAME, name.data(), &length) == UINT(-1)) {
    return false;
  }
  for (auto& ch : name) {
    ch = std::towupper(ch);
  }
  return hid_catalog::isSupportedRawKeyboardName(name);
}
