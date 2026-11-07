#define NOMINMAX
#include <windows.h>
// hidpi.h uses USAGE without including its definition; hidsdi.h pulls
// hidusage.h first. Keep this order: .clang-format disables include sorting.
#include <hidsdi.h>
#include <hidpi.h>
#include <psapi.h>
#include <setupapi.h>
#pragma comment(lib, "psapi.lib")
#include "frame_telemetry.h"
#include "gamepad_output.h"
#include "hall_core.h"
#include "ipc_output.h"
#include "rhythm_audio.h"
#include <array>
#include <chrono>
#include <cmath>
#include <cwctype>
#include <deque>
#include <iomanip>
#include <iostream>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

ipc::Output* ipcOutput = nullptr;
std::atomic<bool> powerSuspended{false};
std::atomic<gamepad::Output*> powerGamepad{nullptr};

void emitLine(const std::string& value) {
  auto& queue = ipcOutput->queue;
  if (value.rfind("key:", 0) == 0 || value.rfind("raw:", 0) == 0) {
    queue.key(value);
    return;
  }
  static constexpr std::array<std::pair<const char*, ipc::Channel>, 12> telemetryPrefixes{{
      {"hall-snapshot:", ipc::Channel::Hall},
      {"hall-stats:", ipc::Channel::HallStats},
      {"gamepad-status:", ipc::Channel::Gamepad},
      {"gamepad-input:", ipc::Channel::GamepadInput},
      {"custom-frame:", ipc::Channel::CustomFrame},
      {"rhythm-frame:", ipc::Channel::RhythmFrame},
      {"custom-tick:", ipc::Channel::CustomTick},
      {"bridge-stats:", ipc::Channel::Stats},
      {"hall-error:", ipc::Channel::HallError},
      {"custom-error:", ipc::Channel::CustomError},
      {"rhythm-error:", ipc::Channel::RhythmError},
      {"power:", ipc::Channel::Power},
  }};
  for (const auto& entry : telemetryPrefixes) {
    if (value.rfind(entry.first, 0) == 0) {
      queue.latest(entry.second, value);
      return;
    }
  }
  queue.reply(value);
}

template <class Report>
void emitReport(const Report& report) {
  std::ostringstream line;
  line << std::hex << std::setfill('0');
  for (size_t i = 0; i < 64; i++) {
    line << std::setw(2) << unsigned(report[i]);
  }
  emitLine(line.str());
}

bool heroKeyboard(HANDLE handle) {
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
  const bool hero = name.find(L"VID_372E") != std::wstring::npos &&
                    (name.find(L"PID_103E") != std::wstring::npos ||
                     name.find(L"PID_1000") != std::wstring::npos);
  const bool xsyd = (name.find(L"VID_1CA2") != std::wstring::npos &&
                     name.find(L"PID_1901") != std::wstring::npos) ||
                    (name.find(L"VID_3554") != std::wstring::npos &&
                     name.find(L"PID_FA09") != std::wstring::npos);
  return hero || xsyd;
}

LRESULT CALLBACK rawWindow(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
  if (message == WM_POWERBROADCAST) {
    if (wparam == PBT_APMSUSPEND) {
      powerSuspended = true;
      if (auto p = powerGamepad.load()) {
        p->pause(true);
      }
    }
    if (wparam == PBT_APMRESUMEAUTOMATIC || wparam == PBT_APMRESUMESUSPEND) {
      powerSuspended = false;
    }
  }
  if (message == WM_INPUT) {
    UINT length = 0;
    if (GetRawInputData(
            reinterpret_cast<HRAWINPUT>(lparam),
            RID_INPUT,
            nullptr,
            &length,
            sizeof(RAWINPUTHEADER)) == 0 &&
        length >= sizeof(RAWINPUTHEADER)) {
      std::vector<BYTE> bytes(length);
      if (GetRawInputData(
              reinterpret_cast<HRAWINPUT>(lparam),
              RID_INPUT,
              bytes.data(),
              &length,
              sizeof(RAWINPUTHEADER)) == length) {
        const auto* raw = reinterpret_cast<const RAWINPUT*>(bytes.data());
        if (raw->header.dwType == RIM_TYPEKEYBOARD && heroKeyboard(raw->header.hDevice)) {
          const auto& key = raw->data.keyboard;
          if (key.MakeCode && !(key.Flags & RI_KEY_E1)) {
            const unsigned scan = key.MakeCode | ((key.Flags & RI_KEY_E0) ? 0x100 : 0);
            char line[40];
            sprintf_s(line, "key:%03x:%d", scan, (key.Flags & RI_KEY_BREAK) ? 0 : 1);
            emitLine(line);
          }
        }
      }
    }
  }
  return DefWindowProcW(window, message, wparam, lparam);
}

DWORD WINAPI rawThread(LPVOID) {
  HINSTANCE module = GetModuleHandleW(nullptr);
  WNDCLASSW wc{};
  wc.hInstance = module;
  wc.lpfnWndProc = rawWindow;
  wc.lpszClassName = L"OpenAulaRawKeyboard";
  RegisterClassW(&wc);
  HWND window = CreateWindowExW(
      0,
      wc.lpszClassName,
      L"OpenAula Input",
      WS_OVERLAPPED,
      0,
      0,
      0,
      0,
      nullptr,
      nullptr,
      module,
      nullptr);
  if (!window) {
    emitLine("raw:unavailable");
    return 1;
  }
  RAWINPUTDEVICE input{};
  input.usUsagePage = 1;
  input.usUsage = 6;
  input.dwFlags = RIDEV_INPUTSINK;
  input.hwndTarget = window;
  emitLine(RegisterRawInputDevices(&input, 1, sizeof(input)) ? "raw:ready" : "raw:unavailable");
  MSG message;
  while (GetMessageW(&message, nullptr, 0, 0) > 0) {
    TranslateMessage(&message);
    DispatchMessageW(&message);
  }
  DestroyWindow(window);
  return 0;
}

struct Device {
  HANDLE h = INVALID_HANDLE_VALUE;
  std::wstring identity;
  DWORD input = 64;
  DWORD output = 64;
  bool xsyd = false;
  ~Device() {
    if (h != INVALID_HANDLE_VALUE) {
      CloseHandle(h);
    }
  }
};

std::unique_ptr<Device> openDevice() {
  GUID guid;
  HidD_GetHidGuid(&guid);
  auto list = SetupDiGetClassDevsW(
      &guid, nullptr, nullptr, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
  if (list == INVALID_HANDLE_VALUE) {
    return {};
  }
  std::unique_ptr<Device> xsydResult;
  std::unique_ptr<Device> heroWiredResult;
  std::unique_ptr<Device> heroDongleResult;
  unsigned xsydMatches = 0;
  unsigned heroWiredMatches = 0;
  unsigned heroDongleMatches = 0;
  for (DWORD i = 0;; ++i) {
    SP_DEVICE_INTERFACE_DATA item{};
    item.cbSize = sizeof(item);
    if (!SetupDiEnumDeviceInterfaces(list, nullptr, &guid, i, &item)) {
      break;
    }
    DWORD size = 0;
    SetupDiGetDeviceInterfaceDetailW(list, &item, nullptr, 0, &size, nullptr);
    if (size < sizeof(SP_DEVICE_INTERFACE_DETAIL_DATA_W)) {
      continue;
    }
    std::vector<unsigned char> data(size);
    auto detail = reinterpret_cast<SP_DEVICE_INTERFACE_DETAIL_DATA_W*>(data.data());
    detail->cbSize = sizeof(*detail);
    if (!SetupDiGetDeviceInterfaceDetailW(list, &item, detail, size, nullptr, nullptr)) {
      continue;
    }
    auto d = std::make_unique<Device>();
    d->h = CreateFileW(
        detail->DevicePath,
        GENERIC_READ | GENERIC_WRITE,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        nullptr,
        OPEN_EXISTING,
        FILE_FLAG_OVERLAPPED,
        nullptr);
    if (d->h == INVALID_HANDLE_VALUE) {
      continue;
    }
    HIDD_ATTRIBUTES attrs{};
    attrs.Size = sizeof(attrs);
    PHIDP_PREPARSED_DATA prepared = nullptr;
    HIDP_CAPS caps{};
    const bool hasAttrs =
        HidD_GetAttributes(d->h, &attrs) &&
        HidD_GetPreparsedData(d->h, &prepared) &&
        HidP_GetCaps(prepared, &caps) == HIDP_STATUS_SUCCESS &&
        caps.InputReportByteLength >= 64 &&
        caps.OutputReportByteLength >= 64;
    const bool heroMatch =
        hasAttrs &&
        attrs.VendorID == 0x372e &&
        (attrs.ProductID == 0x103e || attrs.ProductID == 0x1000) &&
        caps.UsagePage == 0xff60 &&
        caps.Usage == 0x61;
    const bool xsydMatch =
        hasAttrs &&
        ((attrs.VendorID == 0x1ca2 && attrs.ProductID == 0x1901) ||
         (attrs.VendorID == 0x3554 && attrs.ProductID == 0xfa09)) &&
        caps.UsagePage == 0xffa0 &&
        caps.Usage == 0x0001;
    const bool match = heroMatch || xsydMatch;
    d->xsyd = xsydMatch;
    if (prepared) {
      HidD_FreePreparsedData(prepared);
    }
    if (match) {
      d->identity = detail->DevicePath;
      wchar_t serial[256]{};
      if (HidD_GetSerialNumberString(d->h, serial, sizeof(serial))) {
        d->identity += std::wstring(L"|") + serial;
      }
      d->input = caps.InputReportByteLength;
      d->output = caps.OutputReportByteLength;
      if (xsydMatch) {
        ++xsydMatches;
        xsydResult = std::move(d);
      } else if (attrs.ProductID == 0x103e) {
        ++heroWiredMatches;
        heroWiredResult = std::move(d);
      } else {
        ++heroDongleMatches;
        heroDongleResult = std::move(d);
      }
    }
  }
  SetupDiDestroyDeviceInfoList(list);
  std::unique_ptr<Device> result;
  if (xsydMatches == 1) {
    result = std::move(xsydResult);
  } else if (xsydMatches == 0 && heroWiredMatches == 1) {
    result = std::move(heroWiredResult);
  } else if (xsydMatches == 0 && heroWiredMatches == 0 && heroDongleMatches == 1) {
    result = std::move(heroDongleResult);
  }
  if (result) {
    HidD_FlushQueue(result->h);
  }
  return result;
}

bool io(
    Device& d,
    std::vector<unsigned char>& buffer,
    bool write,
    DWORD timeout,
    DWORD& count) {
  OVERLAPPED ov{};
  ov.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (!ov.hEvent) {
    return false;
  }
  BOOL okay = write
                  ? WriteFile(d.h, buffer.data(), DWORD(buffer.size()), &count, &ov)
                  : ReadFile(d.h, buffer.data(), DWORD(buffer.size()), &count, &ov);
  if (!okay && GetLastError() == ERROR_IO_PENDING) {
    if (WaitForSingleObject(ov.hEvent, timeout) == WAIT_OBJECT_0) {
      okay = GetOverlappedResult(d.h, &ov, &count, FALSE);
    } else {
      CancelIoEx(d.h, &ov);
      WaitForSingleObject(ov.hEvent, INFINITE);
      okay = FALSE;
    }
  }
  CloseHandle(ov.hEvent);
  return !!okay;
}

bool valid(const unsigned char* p, size_t n) {
  unsigned sum = 0;
  for (size_t i = 0; i < 64 && i < n; ++i) {
    sum += p[i];
  }
  return n >= 64 && p[0] == 9 && p[6] <= 56 && (sum & 255) == 255;
}

struct ProcessMetrics {
  double at = 0;
  double cpu = 0;
  double rss = 0;
  uint64_t ticks = 0;

  void update(double now) {
    if (now - at < 1000) {
      return;
    }
    FILETIME created;
    FILETIME ended;
    FILETIME kernel;
    FILETIME user;
    PROCESS_MEMORY_COUNTERS memory{};
    if (GetProcessTimes(GetCurrentProcess(), &created, &ended, &kernel, &user)) {
      const uint64_t next = (uint64_t(kernel.dwHighDateTime) << 32) + kernel.dwLowDateTime +
                            (uint64_t(user.dwHighDateTime) << 32) + user.dwLowDateTime;
      if (at) {
        cpu = (next - ticks) / (now - at) / 100.;
      }
      ticks = next;
    }
    if (GetProcessMemoryInfo(GetCurrentProcess(), &memory, sizeof(memory))) {
      rss = memory.WorkingSetSize / 1048576.;
    }
    at = now;
  }
};

// Configuration commands used by OpenAula, plus volatile RGB and passive Hall.
// Firmware update, reset and calibration commands remain excluded.
bool allowed(const std::array<unsigned char, 64>& p) {
  if (!valid(p.data(), p.size())) {
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

bool parseHexPacket(const std::string& text, std::array<unsigned char, 64>& request) {
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

struct BridgeSession {
  ipc::Output& output;
  HANDLE timer = nullptr;
  std::unique_ptr<Device> device;
  rhythm::Capture capture;
  rhythm::Engine engine;
  bool rhythmActive = false;
  bool rhythmPaused = false;
  bool customActive = false;
  hall::Scheduler hallScheduler;
  gamepad::Config gamepadConfig;
  gamepad::Output gamepadOutput;
  bool gamepadPaused = false;
  bool hallFault = false;
  bool ioPaused = false;
  bool wasSuspended = false;
  bool wasGamepadEnabled = false;
  // Set by TS via `device-model:<id>`; HERO84-only keys copy a HERO68 key's colour.
  bool hero84Rhythm = false;
  // WIN 68 HE MAX rhythm state: the last sent colours and whether the `0x18`
  // Per-key Color switch has been written for this session yet.
  std::array<rhythm::Color, 68> xsydRhythmKeys{};
  bool xsydRhythmPrimed = false;
  uint8_t xsydTableStep = 0;
  uint8_t xsydActiveSlot = 0;
  std::array<std::array<uint32_t, 256>, 3> xsydRemaps{};
  bool xsydRemapsInitialized = false;
  std::array<uint16_t, hall::XsydHallTotalMatrixCount> xsydTravelUm{};
  // Last decoded `XsydHallSubcmdPressed` reply, kept for cycles whose pressed
  // read missed while the travel read succeeded.
  std::array<uint8_t, 192> xsydPressedFrame{};
  std::array<double, hall::Capacity> consumerHz{};
  double nextHallPublish = 0;
  double nextGamepadPublish = 0;
  double nextInputPublish = 0;
  bool inputStreaming = false;
  uint64_t inputSequence = 0;
  ProcessMetrics processMetrics;
  std::vector<rhythm::Report> customBatch;
  uint64_t submission = 0;
  uint64_t lastSubmission = 0;
  uint64_t reusedFrames = 0;
  ipc::FrameTelemetry customTelemetry;
  ipc::FrameTelemetry rhythmTelemetry;
  uint64_t customTicks = 0;
  double lastCustomTick = 0;
  double customTickMaxGap = 0;
  double nextFrame = 0;
  double reconnectAt = 0;
  double lastFrame = 0;
  uint64_t dropped = 0;
  uint64_t lastAudioSequence = 0;

  explicit BridgeSession(ipc::Output& out, HANDLE waitTimer)
      : output(out), timer(waitTimer) {
    powerGamepad = &gamepadOutput;
  }

  ~BridgeSession() {
    powerGamepad = nullptr;
    gamepadOutput.stop();
    capture.stop();
  }

  void setGamepadPause() {
    gamepadOutput.pause(
        gamepadPaused || rhythmPaused || powerSuspended.load() || hallFault || ioPaused);
  }

  void updateHall() {
    auto hz = consumerHz;
    if (gamepadOutput.enabled()) {
      for (const auto& b : gamepadConfig.bindings) {
        hz[b.pos] = std::max(
            hz[b.pos], double(gamepad::analog(b.action) ? gamepadConfig.rate : 200));
      }
    }
    hallScheduler.configure(hz, rhythm::clockMs());
  }

  bool writeReport(const rhythm::Report& request) {
    if (!device) {
      device = openDevice();
    }
    if (!device) {
      return false;
    }
    if (device->xsyd) {
      // XSYD boards address keys through XSYD opcodes only; a HERO68 `0x09`
      // frame has no meaning for them. Fail like a write instead of reporting
      // a success that never reached the keyboard.
      emitLine("error:XSYD boards need an XSYD lighting frame");
      return false;
    }
    std::vector<unsigned char> outBuf(device->output);
    std::copy(request.begin(), request.end(), outBuf.begin());
    DWORD count = 0;
    return io(*device, outBuf, true, 100, count) && count == outBuf.size();
  }

  void pollHallStep(double now) {
    auto ids = hallScheduler.batch(now);
    if (ids.empty()) {
      return;
    }
    hallScheduler.requests++;
    if (!device) {
      device = openDevice();
    }
    if (!device) {
      hallScheduler.failed(now);
      hallFault = true;
      setGamepadPause();
      emitLine("hall-error:Device disconnected");
      return;
    }
    if (device->xsyd) {
      // A HERO68 reply arrives as one report; XSYD splits it over three, so a
      // cycle costs six blocking reads. Both deadlines here must stay small
      // (their `io()` timeouts are floored at 1 ms) or a missed deadline stalls
      // the next one and the measured rate sags well below the demand.
      auto readXsydReply = [&](uint8_t subcmd, uint8_t tableId, std::array<uint8_t, 192>& frameOut) {
        auto req = hall::buildXsydHallRequest(subcmd, tableId);
        std::vector<unsigned char> outBuf(device->output, 0);
        std::vector<unsigned char> inBuf(device->input, 0);
        const size_t reportOffset = device->output > 64 ? 1 : 0;
        std::copy(req.begin(), req.end(), outBuf.begin() + reportOffset);
        DWORD count = 0;
        if (!io(*device, outBuf, true, hall::XsydWriteTimeoutMs, count) || count != outBuf.size()) {
          return hall::XsydReadFailed;
        }
        const double limit = rhythm::clockMs() + double(hall::XsydReplyBudgetMs);
        size_t collected = 0;
        while (collected < 192 && rhythm::clockMs() < limit) {
          if (!io(*device, inBuf, false, DWORD(std::max(1., limit - rhythm::clockMs())), count)) {
            return hall::XsydReadFailed;
          }
          const size_t inOffset = count > 64 ? 1 : 0;
          if (count < inOffset + 64) {
            continue;
          }
          const unsigned char* chunk = inBuf.data() + inOffset;
          if (collected == 0 && chunk[0] != hall::XsydMagic) {
            continue;
          }
          std::copy(chunk, chunk + 64, frameOut.begin() + collected);
          collected += 64;
        }
        const bool matched =
            subcmd == hall::XsydHallSubcmdPressed
                ? hall::matchesXsydPressedReply(frameOut.data(), collected)
                : hall::matchesXsydTravelReply(frameOut.data(), collected);
        return matched ? hall::XsydReadOk : hall::XsydReadFailed;
      };

      // Travel and pressed state are separate replies, so either half can be
      // missing for a cycle. Keep polling the other half instead of dropping
      // the whole cycle into a backoff.
      std::array<uint8_t, 192> pressedFrame{};
      const uint8_t tableId = (xsydTableStep++ & 1) ? 2 : 1;
      std::array<uint8_t, 192> travelFrame{};
      const uint8_t travelResult = readXsydReply(hall::XsydHallSubcmdTravel, tableId, travelFrame);
      const uint8_t pressedResult = readXsydReply(hall::XsydHallSubcmdPressed, 1, pressedFrame);
      if (travelResult == hall::XsydWriteFailed || pressedResult == hall::XsydWriteFailed) {
        hallScheduler.failed(rhythm::clockMs());
        hallFault = true;
        setGamepadPause();
        emitLine("hall-error:Hall request timed out");
        return;
      }
      const bool travelOk = travelResult == hall::XsydReadOk;
      // A missed pressed-state reply reuses the last one, so a key can stay
      // reported as pressed one cycle longer but never flickers to released.
      const bool pressedOk = pressedResult == hall::XsydReadOk;
      if (!travelOk && !pressedOk) {
        hallScheduler.failed(rhythm::clockMs());
        hallFault = true;
        setGamepadPause();
        emitLine("hall-error:Hall request timed out");
        return;
      }
      const size_t baseIndex = (tableId - 1) * hall::XsydHallHalfMatrixCount;
      if (travelOk) {
        for (size_t i = 0; i < hall::XsydHallHalfMatrixCount; ++i) {
          const uint16_t um = uint16_t(travelFrame[6 + i * 2] | (travelFrame[7 + i * 2] << 8));
          xsydTravelUm[baseIndex + i] = std::min<uint16_t>(3400, um);
        }
      }
      if (pressedOk) {
        std::copy(pressedFrame.begin(), pressedFrame.end(), xsydPressedFrame.begin());
      }
      const double at = rhythm::clockMs();
      hallFault = false;
      setGamepadPause();
      hallScheduler.success();
      for (size_t idx = 0; idx < hall::XsydHallTotalMatrixCount; ++idx) {
        const uint8_t heroPos = hall::XsydMatrixToHeroPos[idx];
        if (!heroPos || hallScheduler.hz[heroPos] <= 0) {
          continue;
        }
        const uint16_t distanceUnits = uint16_t((xsydTravelUm[idx] + 5) / 10);
        const bool pressed = xsydPressedFrame[6 + idx] != 0;
        hallScheduler.received(heroPos, distanceUnits, 0, pressed, at);
        gamepadOutput.sample(heroPos, hallScheduler.samples[heroPos]);
      }
      return;
    }
    std::vector<uint8_t> positions;
    for (auto id : ids) {
      positions.push_back(uint8_t(id >> 8));
      positions.push_back(uint8_t(id));
    }
    auto packet = rhythm::report(0x98, 1, 1, 0, positions);
    std::vector<unsigned char> outBuf(device->output);
    std::vector<unsigned char> inBuf(device->input);
    std::copy(packet.begin(), packet.end(), outBuf.begin());
    DWORD count = 0;
    bool okay = io(*device, outBuf, true, 20, count) && count == outBuf.size();
    bool matched = false;
    const double limit = rhythm::clockMs() + 20;
    while (okay && rhythm::clockMs() < limit) {
      okay = io(*device, inBuf, false, DWORD(std::max(1., limit - rhythm::clockMs())), count);
      if (!okay) {
        break;
      }
      matched = hall::matchesReply(inBuf.data(), count, ids);
      if (matched) {
        break;
      }
    }
    if (!matched) {
      device.reset();
      hallScheduler.failed(rhythm::clockMs());
      hallFault = true;
      setGamepadPause();
      emitLine("hall-error:Hall request timed out");
      return;
    }
    const double at = rhythm::clockMs();
    hallFault = false;
    setGamepadPause();
    hallScheduler.success();
    for (size_t i = 0; i < ids.size(); i++) {
      size_t o = 7 + i * 6;
      uint16_t word = uint16_t(inBuf[o + 4] * 256 + inBuf[o + 5]);
      hallScheduler.received(
          ids[i],
          uint16_t(inBuf[o + 2] * 256 + inBuf[o + 3]),
          word & 0x7fff,
          !!(word & 0x8000),
          at);
      gamepadOutput.sample(ids[i], hallScheduler.samples[ids[i]]);
    }
  }

  void publishTelemetryStep(double now) {
    if (inputStreaming && now >= nextInputPublish) {
      auto value = gamepadOutput.input();
      value.pop_back();
      emitLine(
          "gamepad-input:" + value + ",\"sequence\":" + std::to_string(++inputSequence) + "}");
      nextInputPublish = now + 1000. / 60;
    }
    if (wasGamepadEnabled != gamepadOutput.enabled()) {
      wasGamepadEnabled = gamepadOutput.enabled();
      updateHall();
    }
    if (wasSuspended != powerSuspended.load()) {
      wasSuspended = powerSuspended.load();
      for (auto& sample : hallScheduler.samples) {
        sample = {};
      }
      for (auto& due : hallScheduler.due) {
        due = now;
      }
      setGamepadPause();
      emitLine(wasSuspended ? "power:suspend" : "power:resume");
    }
    if (now >= nextHallPublish && hallScheduler.active()) {
      std::ostringstream event;
      event << std::setprecision(15) << "hall-snapshot:{\"publishedMs\":" << rhythm::clockMs()
            << ",\"requests\":" << hallScheduler.requests
            << ",\"timeouts\":" << hallScheduler.timeouts << ",\"records\":[";
      bool comma = false;
      // Publish every subscribed key's latest sample. Replacing a queued
      // snapshot must not discard a different batch's still-current keys.
      for (size_t pos = 0; pos < hall::Capacity; pos++) {
        if (hallScheduler.hz[pos] > 0) {
          const auto& s = hallScheduler.samples[pos];
          if (!s.sequence) {
            continue;
          }
          if (comma) {
            event << ',';
          }
          comma = true;
          event << "{\"pos\":" << pos
                << ",\"distanceUnits\":" << s.distance
                << ",\"adc\":" << s.adc
                << ",\"pressed\":" << (s.pressed ? "true" : "false")
                << ",\"timestampMs\":" << s.at
                << ",\"sequence\":" << s.sequence << "}";
        }
      }
      event << "]}";
      if (comma) {
        emitLine(event.str());
      }
      nextHallPublish = now + 10;
    }
    if (now >= nextGamepadPublish) {
      emitLine("gamepad-status:" + gamepadOutput.status());
      processMetrics.update(now);
      std::ostringstream stats;
      stats << "hall-stats:{\"requests\":" << hallScheduler.requests
            << ",\"timeouts\":" << hallScheduler.timeouts
            << ",\"nativeCpuPercent\":" << processMetrics.cpu
            << ",\"nativeRssMB\":" << processMetrics.rss << ",\"keys\":[";
      bool comma = false;
      for (size_t pos = 0; pos < hall::Capacity; pos++) {
        if (hallScheduler.hz[pos]) {
          if (comma) {
            stats << ',';
          }
          comma = true;
          stats << "{\"pos\":" << pos
                << ",\"requestedHz\":" << hallScheduler.hz[pos]
                << ",\"hz\":" << hallScheduler.measuredHz(pos, now)
                << ",\"intervalP99Ms\":" << hallScheduler.lifetimeP99(pos)
                << ",\"recentIntervalP99Ms\":" << hallScheduler.p99(pos) << "}";
        }
      }
      stats << "]}";
      emitLine(stats.str());

      const auto queued = output.queue.stats();
      std::ostringstream ipcStats;
      ipcStats << "bridge-stats:{\"customTicks\":" << customTicks
               << ",\"customTickMaxGapMs\":" << customTickMaxGap
               << ",\"queuedReplies\":" << queued.replies
               << ",\"queuedKeys\":" << queued.keys
               << ",\"queuedTelemetry\":" << queued.telemetry
               << ",\"coalescedTelemetry\":" << queued.coalesced << "}";
      emitLine(ipcStats.str());
      nextGamepadPublish = now + 250;
    }
  }

  void renderLightingStep(double now) {
    if (customActive && !rhythmPaused && !powerSuspended.load() && now >= nextFrame) {
      if (now - nextFrame >= 1000. / 60) {
        dropped += uint64_t((now - nextFrame) / (1000. / 60));
      }
      nextFrame += 1000. / 60;
      if (nextFrame <= now) {
        nextFrame = now + 1000. / 60;
      }
      if (!customBatch.empty() && now >= reconnectAt) {
        bool okay = true;
        for (const auto& p : customBatch) {
          if (!writeReport(p)) {
            okay = false;
            break;
          }
        }
        if (okay) {
          double completed = rhythm::clockMs();
          if (submission == lastSubmission) {
            ++reusedFrames;
          }
          lastSubmission = submission;
          const double gap = lastFrame ? completed - lastFrame : 0;
          customTelemetry.custom(submission, customBatch.size(), gap);
          std::ostringstream event;
          event << "custom-frame:{\"submission\":" << submission
                << ",\"packets\":" << customBatch.size()
                << ",\"frameMs\":" << completed - now
                << ",\"gapMs\":" << gap
                << ",\"droppedFrames\":" << dropped
                << ",\"reusedFrames\":" << reusedFrames;
          customTelemetry.append(event);
          event << "}";
          emitLine(event.str());
          lastFrame = completed;
        } else {
          gamepadOutput.pause(true);
          hallFault = true;
          device.reset();
          hallScheduler.failed(rhythm::clockMs());
          reconnectAt = now + 1000;
          emitLine("custom-error:Device disconnected or RGB write failed");
        }
      }
      const double tickAt = rhythm::clockMs();
      if (lastCustomTick) {
        customTickMaxGap = std::max(customTickMaxGap, tickAt - lastCustomTick);
      }
      lastCustomTick = tickAt;
      ++customTicks;
      emitLine("custom-tick:");
    }

    if (rhythmActive && !rhythmPaused && !powerSuspended.load() && now >= nextFrame) {
      if (now - nextFrame >= 1000. / 60) {
        dropped += uint64_t((now - nextFrame) / (1000. / 60));
      }
      nextFrame += 1000. / 60;
      if (nextFrame <= now) {
        nextFrame = now + 1000. / 60;
      }
      if (now >= reconnectAt) {
        auto audio = capture.snapshot();
        rhythm::Frame frame = engine.render(audio.audio, now);
        const double renderedAt = rhythm::clockMs();
        // WIN 68 HE MAX speaks XSYD `0x18`/`0x2A`; every other board uses the
        // HERO68/HERO84 `0x09` encoder.
        const bool xsydBoard = device && device->xsyd;
        const auto encoded = xsydBoard
            ? rhythm::encodeXsyd(frame, xsydRhythmKeys, xsydRhythmPrimed)
            : rhythm::encode(frame, hero84Rhythm);
        const double encodedAt = rhythm::clockMs();
        bool okay = true;
        for (const auto& p : encoded.packets) {
          if (!writeReport(p)) {
            okay = false;
            break;
          }
        }
        if (okay) {
          const double completed = rhythm::clockMs();
          std::ostringstream event;
          event << "rhythm-frame:{\"colors\":[";
          for (size_t i = 0; i < encoded.keys.size(); ++i) {
            if (i) {
              event << ',';
            }
            char color[8];
            sprintf_s(
                color,
                "#%02x%02x%02x",
                encoded.keys[i][0],
                encoded.keys[i][1],
                encoded.keys[i][2]);
            event << rhythm::jsonString(color);
          }
          event << "],\"packets\":" << encoded.packets.size()
                << ",\"frameMs\":" << completed - now
                << ",\"gapMs\":" << (lastFrame ? completed - lastFrame : 0)
                << ",\"droppedFrames\":" << dropped
                << ",\"renderMs\":" << renderedAt - now
                << ",\"encodeMs\":" << encodedAt - renderedAt
                << ",\"writeMs\":" << completed - encodedAt
                << ",\"audioLevel\":" << audio.level
                << ",\"audioState\":" << rhythm::jsonString(audio.state)
                << ",\"audioError\":" << rhythm::jsonString(audio.error)
                << ",\"sampleRate\":" << audio.sampleRate
                << ",\"audioEndpoint\":" << rhythm::jsonString(audio.endpoint);
          // Silence and repeatedly rendered snapshots are not latency samples.
          const bool freshAudio =
              audio.audio.sequence != lastAudioSequence &&
              audio.audio.envelope > .0001 &&
              audio.audio.sampleQpcMs > 0 &&
              completed - audio.audio.receivedMs < 100;
          const double sampleLatency = completed - audio.audio.sampleQpcMs;
          event << ",\"audioToWriteMs\":" << (freshAudio && sampleLatency >= 0 ? sampleLatency : -1)
                << ",\"captureToWriteMs\":"
                << (freshAudio ? completed - audio.audio.receivedMs : -1)
                << ",\"audioTimestampInvalid\":"
                << (freshAudio && sampleLatency < 0 ? "true" : "false");
          rhythmTelemetry.record(encoded.packets.size(), lastFrame ? completed - lastFrame : 0);
          rhythmTelemetry.append(event);
          event << "}";
          lastAudioSequence = audio.audio.sequence;
          emitLine(event.str());
          lastFrame = completed;
        } else {
          gamepadOutput.pause(true);
          hallFault = true;
          device.reset();
          hallScheduler.failed(rhythm::clockMs());
          reconnectAt = now + 1000;
          emitLine("rhythm-error:Device disconnected or RGB write failed");
        }
      }
    }
  }

  void handleHallConfig(const std::string& payload) {
    try {
      std::array<double, hall::Capacity> hz{};
      for (const auto& p : gamepad::split(payload, '|')) {
        auto v = gamepad::split(p, ',');
        if (v.size() != 2) {
          throw std::runtime_error("Invalid Hall demand");
        }
        double pos = gamepad::number(v[0]);
        double rate = gamepad::number(v[1]);
        if (pos < 1 ||
            pos >= hall::Capacity ||
            pos != std::floor(pos) ||
            !hall::heroPosition(unsigned(pos)) ||
            rate < 1 ||
            rate > 200) {
          throw std::runtime_error("Invalid Hall rate");
        }
        hz[size_t(pos)] = std::max(hz[size_t(pos)], rate);
      }
      consumerHz = hz;
      updateHall();
      emitLine("hall-ready");
    } catch (const std::exception& e) {
      emitLine("error:" + std::string(e.what()));
    }
  }

  void handleRhythmCommand(const std::string& payload) {
    try {
      rhythm::Config c;
      std::vector<std::string> fields;
      std::istringstream parts(payload);
      std::string part;
      while (std::getline(parts, part, ';')) {
        fields.push_back(part);
      }
      if (fields.size() != 14) {
        throw std::runtime_error("Invalid rhythm command");
      }
      c.keyMode = std::stoi(fields[0]);
      c.sideMode = std::stoi(fields[1]);
      c.brightness = std::stod(fields[2]);
      c.sensitivity = std::stod(fields[3]);
      c.releaseMs = std::stod(fields[4]);
      for (int i = 0; i < 3; ++i) {
        int n = std::stoi(fields[5 + i]);
        if (n < 0 || n > 255) {
          throw std::runtime_error("Invalid color");
        }
        c.color[i] = uint8_t(n);
      }
      c.palette = std::stoi(fields[8]);
      c.db = std::stod(fields[9]);
      c.window = std::stoi(fields[10]);
      c.spatialRadius = std::stoi(fields[11]);
      // Side protocol is not yet verified on the target board; reject activation honestly.
      if (fields[12] != "1" || c.sideMode != 500) {
        throw std::runtime_error("Side rhythm is not hardware-verified");
      }
      c.endpoint.clear();
      if (fields[13].size() % 2) {
        throw std::runtime_error("Invalid endpoint");
      }
      for (size_t i = 0; i < fields[13].size(); i += 2) {
        c.endpoint += char(std::stoi(fields[13].substr(i, 2), nullptr, 16));
      }
      engine.configure(c);
      capture.start(c.endpoint);
      customActive = false;
      customBatch.clear();
      output.queue.clear(ipc::Channel::CustomFrame);
      output.queue.clear(ipc::Channel::CustomTick);
      if (!rhythmActive) {
        dropped = 0;
        lastFrame = 0;
        rhythmTelemetry = {};
        output.queue.clear(ipc::Channel::RhythmFrame);
        nextFrame = rhythm::clockMs();
        // A new XSYD session must rewrite `0x18` mode 0x15 before the first
        // batch; the old keys are not a valid "already sent" baseline.
        xsydRhythmPrimed = false;
      }
      rhythmActive = true;
      emitLine("rhythm-ready");
    } catch (const std::exception& e) {
      emitLine("error:" + std::string(e.what()));
    }
  }

  void handleFrameOrBatchCommand(const std::string& line) {
    const bool queued = line.rfind("frame:", 0) == 0;
    uint64_t id = 0;
    std::string payload = line.substr(6);
    if (queued) {
      const auto colon = payload.find(':');
      try {
        id = std::stoull(payload.substr(0, colon));
        if (colon == std::string::npos || !customActive || id == 0) {
          throw std::runtime_error("Invalid frame");
        }
        payload = payload.substr(colon + 1);
      } catch (...) {
        emitLine("error:Invalid frame submission");
        return;
      }
    }
    std::vector<rhythm::Report> batch;
    std::istringstream parts(payload);
    std::string part;
    bool okay = !rhythmActive;
    while (std::getline(parts, part, ',')) {
      rhythm::Report p{};
      if (!parseHexPacket(part, p) ||
          p[1] != 8 ||
          p[2] != 1 ||
          p[4] > 4 ||
          p[4] == 0 ||
          p[5] != batch.size()) {
        okay = false;
        break;
      }
      batch.push_back(p);
    }
    if (batch.empty() || batch.size() > 4) {
      okay = false;
    }
    for (const auto& p : batch) {
      if (p[4] != batch.size()) {
        okay = false;
      }
    }
    if (!okay) {
      emitLine("error:Invalid RGB batch");
      return;
    }
    if (queued) {
      customBatch = std::move(batch);
      submission = id;
      emitLine("frame-queued");
      return;
    }
    for (const auto& p : batch) {
      if (!writeReport(p)) {
        okay = false;
        break;
      }
    }
    if (!okay) {
      device.reset();
      emitLine("error:RGB batch write failed");
    } else {
      emitLine("batch-written");
    }
  }

  void handleRawHidRequest(std::string line) {
    const bool sendOnly = line.rfind("send:", 0) == 0;
    if (sendOnly) {
      line = line.substr(5);
    }
    std::array<unsigned char, 64> request{};
    const bool parsed = parseHexPacket(line, request);
    const bool validSendOnly =
        !sendOnly || (request[1] == 4 && request[2] == 23 && request[6] == 1 && request[7] <= 6);
    if (!parsed || !validSendOnly) {
      emitLine("error:request");
      return;
    }

    ioPaused = true;
    setGamepadPause();
    if (device) {
      HIDD_ATTRIBUTES attrs{};
      attrs.Size = sizeof(attrs);
      if (!HidD_GetAttributes(device->h, &attrs)) {
        device.reset();
      }
    }
    if (!device) {
      device = openDevice();
    }
    if (!device) {
      hallFault = true;
      ioPaused = false;
      setGamepadPause();
      hallScheduler.failed(rhythm::clockMs());
      emitLine("error:disconnected");
      return;
    }

    if (device->xsyd) {
      if (!xsydRemapsInitialized) {
        for (size_t l = 0; l < 3; ++l) {
          for (size_t p = 0; p < 256; ++p) {
            xsydRemaps[l][p] = uint32_t(0x10000u + p);
          }
        }
        xsydRemapsInitialized = true;
      }
      std::array<unsigned char, 64> rep = request;
      const auto cmd = request[1];
      const auto zone = request[2];
      // HERO68-family commands decoded from the XSYD readback capture
      // (connect_keyboard_to_webhidofficial.pcapng); any other command the
      // board cannot serve must fail loudly instead of echoing fake data.
      const bool heroCommand =
          (cmd == 0x82) || (cmd == 0x90 && zone == 0) || (cmd == 0x92) ||
          (cmd == 0x93 && zone == 0) || (cmd == 0x99 && zone == 0) ||
          (cmd == 0x96 && zone == 0) || (cmd == 0x83);
      if (!heroCommand) {
        ioPaused = false;
        setGamepadPause();
        emitLine("error:unsupported");
        return;
      }
      if (cmd == 0x82) {
        rep.fill(0);
        rep[0] = 0x09;
        rep[1] = 0x82;
        rep[2] = zone;
        rep[4] = 1;
        if (zone == 1) {
          rep[6] = 6;
          rep[7] = 0x11;
          rep[12] = 0x5c;
        } else {
          rep[6] = 2;
          rep[7] = 1;
          rep[8] = 1;
        }
      } else if (cmd == 0x10 && zone == 0 && request[6] == 1 && request[7] <= 2) {
        xsydActiveSlot = request[7];
      } else if (cmd == 0x90 && zone == 0) {
        rep.fill(0);
        rep[0] = 0x09;
        rep[1] = 0x90;
        rep[4] = 1;
        rep[6] = 1;
        rep[7] = xsydActiveSlot;
      } else if (cmd == 0x92) {
        rep.fill(0);
        rep[0] = 0x09;
        rep[1] = 0x92;
        rep[2] = zone;
        rep[4] = 1;
        rep[6] = 0;
      } else if (cmd == 0x93 && zone == 0) {
        const unsigned n = request[6] / 2;
        rep.fill(0);
        rep[0] = 0x09;
        rep[1] = 0x93;
        rep[4] = 1;
        rep[6] = static_cast<unsigned char>(n * 5);
        for (unsigned i = 0; i < n && 7 + i * 5 + 4 < 63; ++i) {
          rep[7 + i * 5 + 0] = request[7 + i * 2];
          rep[7 + i * 5 + 1] = request[8 + i * 2];
          rep[7 + i * 5 + 2] = 0;
          rep[7 + i * 5 + 3] = 200;
          rep[7 + i * 5 + 4] = 0;
        }
      } else if (cmd == 0x99 && zone == 0) {
        const unsigned n = request[6] / 2;
        rep.fill(0);
        rep[0] = 0x09;
        rep[1] = 0x99;
        rep[4] = 1;
        rep[6] = static_cast<unsigned char>(n * 8);
        for (unsigned i = 0; i < n && 7 + i * 8 + 7 < 63; ++i) {
          rep[7 + i * 8 + 0] = request[7 + i * 2];
          rep[7 + i * 8 + 1] = request[8 + i * 2];
          rep[7 + i * 8 + 2] = 1;
          rep[7 + i * 8 + 4] = 20;
          rep[7 + i * 8 + 6] = 20;
        }
      } else if (cmd == 0x96 && zone == 0) {
        const unsigned n = request[6] / 2;
        rep.fill(0);
        rep[0] = 0x09;
        rep[1] = 0x96;
        rep[4] = 1;
        rep[6] = static_cast<unsigned char>(n * 8);
        for (unsigned i = 0; i < n && 7 + i * 8 + 7 < 63; ++i) {
          rep[7 + i * 8 + 0] = request[7 + i * 2];
          rep[7 + i * 8 + 1] = request[8 + i * 2];
          rep[7 + i * 8 + 3] = 20;
          rep[7 + i * 8 + 5] = 20;
        }
      } else if (cmd == 0x03 && zone <= 2) {
        const unsigned n = request[6] / 6;
        for (unsigned i = 0; i < n && 7 + i * 6 + 5 < 63; ++i) {
          const unsigned pos = (unsigned(request[7 + i * 6 + 0]) << 8) | request[7 + i * 6 + 1];
          const uint32_t kc = (uint32_t(request[7 + i * 6 + 2]) << 24) |
                              (uint32_t(request[7 + i * 6 + 3]) << 16) |
                              (uint32_t(request[7 + i * 6 + 4]) << 8) |
                              uint32_t(request[7 + i * 6 + 5]);
          if (pos < 256) {
            xsydRemaps[zone][pos] = kc;
          }
        }
      } else if (cmd == 0x83) {
        const unsigned n = request[6] / 2;
        rep.fill(0);
        rep[0] = 0x09;
        rep[1] = 0x83;
        rep[2] = zone;
        rep[4] = 1;
        rep[6] = static_cast<unsigned char>(n * 6);
        for (unsigned i = 0; i < n && 7 + i * 6 + 5 < 63; ++i) {
          const unsigned pos = (unsigned(request[7 + i * 2]) << 8) | request[8 + i * 2];
          const uint32_t kc = pos < 256 ? xsydRemaps[zone][pos] : 0;
          rep[7 + i * 6 + 0] = request[7 + i * 2];
          rep[7 + i * 6 + 1] = request[8 + i * 2];
          rep[7 + i * 6 + 2] = static_cast<unsigned char>((kc >> 24) & 0xff);
          rep[7 + i * 6 + 3] = static_cast<unsigned char>((kc >> 16) & 0xff);
          rep[7 + i * 6 + 4] = static_cast<unsigned char>((kc >> 8) & 0xff);
          rep[7 + i * 6 + 5] = static_cast<unsigned char>(kc & 0xff);
        }
      }
      unsigned sum = 0;
      for (size_t i = 0; i < 63; ++i) {
        sum += rep[i];
      }
      rep[63] = static_cast<unsigned char>((0xff - (sum & 0xff)) & 0xff);
      ioPaused = false;
      setGamepadPause();
      emitReport(rep);
      return;
    }

    std::vector<unsigned char> outBuf(device->output);
    std::copy(request.begin(), request.end(), outBuf.begin());
    DWORD count = 0;
    bool okay = io(*device, outBuf, true, 100, count) && count == outBuf.size();
    // Live RGB is fire-and-forget; firmware does not emit a CMD08 ACK.
    // Echo the submitted report after OS write completion to acknowledge IPC.
    if ((request[1] == 8 || sendOnly) && okay) {
      ioPaused = false;
      setGamepadPause();
      emitReport(request);
      return;
    }

    const DWORD replyTimeout = request[1] == 0x98 ? 100 : 800;
    const auto deadline =
        std::chrono::steady_clock::now() + std::chrono::milliseconds(replyTimeout);
    std::vector<unsigned char> inBuf(device->input);
    bool replied = false;
    while (okay && std::chrono::steady_clock::now() < deadline) {
      const auto remaining = std::chrono::duration_cast<std::chrono::milliseconds>(
                                 deadline - std::chrono::steady_clock::now())
                                 .count();
      okay = io(*device, inBuf, false, DWORD(std::max<int64_t>(1, remaining)), count);
      if (!okay) {
        break;
      }
      if (!valid(inBuf.data(), count) || inBuf[1] != request[1] || inBuf[2] != request[2]) {
        continue;
      }
      if (request[1] == 0x98) {
        if (inBuf[6] != request[6] * 3) {
          continue;
        }
        bool positionsMatch = true;
        for (unsigned i = 0; i < request[6] / 2; ++i) {
          positionsMatch &= inBuf[7 + i * 6] == request[7 + i * 2] &&
                            inBuf[8 + i * 6] == request[8 + i * 2];
        }
        if (!positionsMatch) {
          continue;
        }
      }
      replied = true;
      break;
    }
    if (!replied) {
      device.reset();
      hallFault = true;
      ioPaused = false;
      setGamepadPause();
      hallScheduler.failed(rhythm::clockMs());
      emitLine("error:timeout");
      return;
    }
    ioPaused = false;
    setGamepadPause();
    emitReport(inBuf);
  }

  void handleCommandLine(const std::string& line) {
    if (line.rfind("hall-config:", 0) == 0) {
      handleHallConfig(line.substr(12));
      return;
    }
    if (line == "ipc-status") {
      const auto queued = output.queue.stats();
      std::ostringstream stats;
      stats << "ipc-state:{\"customTicks\":" << customTicks
            << ",\"customTickMaxGapMs\":" << customTickMaxGap
            << ",\"queuedReplies\":" << queued.replies
            << ",\"queuedKeys\":" << queued.keys
            << ",\"queuedTelemetry\":" << queued.telemetry
            << ",\"coalescedTelemetry\":" << queued.coalesced << "}";
      emitLine(stats.str());
      return;
    }
    if (line.rfind("gamepad-config:", 0) == 0) {
      try {
        auto c = gamepad::parse(line.substr(15));
        gamepadOutput.configure(c);
        gamepadConfig = c;
        updateHall();
        emitLine("gamepad-configured");
      } catch (const std::exception& e) {
        emitLine("error:" + std::string(e.what()));
      }
      return;
    }
    if (line.rfind("gamepad-digital:", 0) == 0) {
      try {
        gamepadOutput.digitalSettings(gamepad::parseDigital(line.substr(16)));
        emitLine("gamepad-digital-ready");
      } catch (const std::exception& e) {
        emitLine("error:" + std::string(e.what()));
      }
      return;
    }
    if (line == "gamepad-start" || line == "gamepad-start-paused") {
      gamepadPaused = line == "gamepad-start-paused";
      if (gamepadOutput.start()) {
        setGamepadPause();
        updateHall();
        emitLine("gamepad-ready");
      } else {
        emitLine("error:" + gamepadOutput.error());
      }
      return;
    }
    if (line == "gamepad-stop") {
      gamepadOutput.stop();
      updateHall();
      emitLine("gamepad-stopped");
      return;
    }
    if (line == "gamepad-status") {
      emitLine("gamepad-state:" + gamepadOutput.status());
      return;
    }
    if (line.rfind("device-model:", 0) == 0) {
      hero84Rhythm = line.substr(13) == "hero84";
      emitLine("device-model-ready");
      return;
    }
    if (line == "device-identity") {
      if (!device) {
        device = openDevice();
      }
      if (!device) {
        emitLine("error:Device disconnected");
        return;
      }
      std::ostringstream id;
      id << "device-identity:" << std::hex << std::setfill('0');
      for (auto c : device->identity) {
        id << std::setw(4) << unsigned(std::towlower(c));
      }
      emitLine(id.str());
      return;
    }
    if (line == "gamepad-input-on" || line == "gamepad-input-off") {
      inputStreaming = line == "gamepad-input-on";
      nextInputPublish = 0;
      emitLine("gamepad-input-ready");
      return;
    }
    if (line == "gamepad-pause") {
      gamepadPaused = true;
      setGamepadPause();
      emitLine("gamepad-paused");
      return;
    }
    if (line == "gamepad-resume") {
      gamepadPaused = false;
      setGamepadPause();
      emitLine("gamepad-resumed");
      return;
    }
    if (line == "audio-devices") {
      emitLine("audio-devices:" + rhythm::audioDevices());
      return;
    }
    if (line == "custom-start") {
      rhythmActive = false;
      capture.stop();
      customActive = true;
      customBatch.clear();
      submission = 0;
      lastSubmission = 0;
      reusedFrames = 0;
      dropped = 0;
      customTelemetry = {};
      customTicks = 0;
      lastCustomTick = 0;
      customTickMaxGap = 0;
      output.queue.clear(ipc::Channel::CustomFrame);
      output.queue.clear(ipc::Channel::RhythmFrame);
      output.queue.clear(ipc::Channel::CustomTick);
      lastFrame = 0;
      rhythmPaused = false;
      nextFrame = rhythm::clockMs();
      emitLine("custom-ready");
      return;
    }
    if (line == "custom-stop") {
      customActive = false;
      customBatch.clear();
      output.queue.clear(ipc::Channel::CustomFrame);
      output.queue.clear(ipc::Channel::CustomTick);
      emitLine("custom-stopped");
      return;
    }
    if (line == "rhythm-stop") {
      rhythmActive = false;
      rhythmPaused = false;
      capture.stop();
      engine.reset();
      output.queue.clear(ipc::Channel::RhythmFrame);
      // Leaving XSYD Per-key Color behind would freeze the last rhythm frame on
      // the board; switch it back to its Static onboard effect.
      if (device && device->xsyd && xsydRhythmPrimed) {
        std::vector<uint8_t> onboard(0x2c, 0);
        onboard[0] = 0x01;
        onboard[37] = 0x01;
        onboard[38] = 4;
        onboard[39] = 0x00;
        onboard[41] = 0x02;
        writeReport(rhythm::xsydReport(rhythm::xsydRgbOpcode, onboard));
        xsydRhythmPrimed = false;
      }
      emitLine("rhythm-stopped");
      return;
    }
    if (line == "rhythm-pause") {
      rhythmPaused = true;
      setGamepadPause();
      emitLine("rhythm-paused");
      return;
    }
    if (line == "rhythm-resume") {
      rhythmPaused = false;
      setGamepadPause();
      nextFrame = rhythm::clockMs();
      emitLine("rhythm-resumed");
      return;
    }
    if (line.rfind("rhythm:", 0) == 0) {
      handleRhythmCommand(line.substr(7));
      return;
    }
    if (line.rfind("batch:", 0) == 0 || line.rfind("frame:", 0) == 0) {
      handleFrameOrBatchCommand(line);
      return;
    }
    if (line.rfind("wait:", 0) == 0) {
      double delay = 0;
      try {
        delay = std::stod(line.substr(5));
      } catch (...) {
      }
      if (std::isfinite(delay) && delay > 0 && delay <= 25) {
        LARGE_INTEGER due{};
        due.QuadPart = -static_cast<LONGLONG>(delay * 10000);
        if (timer && SetWaitableTimer(timer, &due, 0, nullptr, nullptr, FALSE)) {
          WaitForSingleObject(timer, INFINITE);
        } else {
          Sleep(static_cast<DWORD>(std::ceil(delay)));
        }
      }
      emitLine("waited");
      return;
    }
    if (line == "close") {
      hallFault = true;
      setGamepadPause();
      device.reset();
      hallScheduler.failed(rhythm::clockMs());
      reconnectAt = rhythm::clockMs() + 1000;
      emitLine("closed");
      return;
    }
    handleRawHidRequest(line);
  }
};

int main() {
  ipc::Output output;
  ipcOutput = &output;
  DWORD schedulingTask = 0;
  HANDLE scheduling = AvSetMmThreadCharacteristicsW(L"Playback", &schedulingTask);
  HANDLE rawWorker = CreateThread(nullptr, 0, rawThread, nullptr, 0, nullptr);
  HANDLE timer = CreateWaitableTimerExW(
      nullptr, nullptr, 0x00000002, TIMER_MODIFY_STATE | SYNCHRONIZE);
  if (!timer) {
    timer = CreateWaitableTimerW(nullptr, FALSE, nullptr);
  }
  HANDLE ready = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  std::mutex queueMutex;
  std::deque<std::string> queue;
  std::atomic<bool> ended{false};
  std::thread reader([&] {
    std::string line;
    while (std::getline(std::cin, line)) {
      {
        std::lock_guard<std::mutex> lock(queueMutex);
        queue.push_back(std::move(line));
      }
      SetEvent(ready);
    }
    ended = true;
    SetEvent(ready);
  });

  BridgeSession session(output, timer);

  while (!ended) {
    double now = rhythm::clockMs();
    session.publishTelemetryStep(now);

    // Housekeeping can cross a USB deadline. Use a fresh clock and write the
    // complete lighting batch before starting another blocking Hall request.
    now = rhythm::clockMs();
    session.renderLightingStep(now);

    if (!session.rhythmPaused && !session.gamepadPaused && !powerSuspended.load()) {
      session.pollHallStep(rhythm::clockMs());
    }

    std::string line;
    // Backlogged replies defer command consumption, never the frame deadline.
    if (output.queue.canReply()) {
      std::lock_guard<std::mutex> lock(queueMutex);
      if (!queue.empty()) {
        line = std::move(queue.front());
        queue.pop_front();
      }
    }
    if (line.empty()) {
      if (timer) {
        double deadline = session.nextGamepadPublish;
        if (session.inputStreaming) {
          deadline = std::min(deadline, session.nextInputPublish);
        }
        if ((session.rhythmActive || session.customActive) &&
            !session.rhythmPaused &&
            !powerSuspended.load()) {
          deadline = std::min(deadline, session.nextFrame);
        }
        if (!session.rhythmPaused && !session.gamepadPaused && !powerSuspended.load()) {
          deadline = std::min(deadline, session.hallScheduler.deadline());
        }
        LARGE_INTEGER due{};
        due.QuadPart = -std::max<LONGLONG>(1, LONGLONG((deadline - rhythm::clockMs()) * 10000));
        SetWaitableTimer(timer, &due, 0, nullptr, nullptr, FALSE);
        HANDLE handles[] = {ready, timer};
        WaitForMultipleObjects(2, handles, FALSE, 1000);
      } else {
        WaitForSingleObject(ready, 1000);
      }
      continue;
    }

    session.handleCommandLine(line);
  }

  reader.join();
  CloseHandle(ready);
  if (scheduling) {
    AvRevertMmThreadCharacteristics(scheduling);
  }
  if (timer) {
    CloseHandle(timer);
  }
  output.stop();
  if (rawWorker) {
    PostThreadMessageW(GetThreadId(rawWorker), WM_QUIT, 0, 0);
    WaitForSingleObject(rawWorker, 1000);
    CloseHandle(rawWorker);
  }
}
