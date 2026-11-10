#pragma once
#define NOMINMAX
#ifdef _WIN32
#include <windows.h>
#endif
#include <algorithm>
#include <cwctype>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

namespace foreground {

struct AppSnapshot {
  unsigned long pid = 0;
  std::wstring exe;
  std::wstring path;
  std::wstring title;
};

inline std::wstring toLower(std::wstring s) {
  std::transform(s.begin(), s.end(), s.begin(), [](wchar_t ch) { return std::towlower(ch); });
  return s;
}

inline std::wstring baseName(const std::wstring& fullPath) {
  size_t pos = fullPath.find_last_of(L"\\/");
  return toLower(pos == std::wstring::npos ? fullPath : fullPath.substr(pos + 1));
}

inline std::string utf8FromWide(const std::wstring& wide) {
  if (wide.empty()) return {};
#ifdef _WIN32
  int needed = WideCharToMultiByte(CP_UTF8, 0, wide.data(), int(wide.size()), nullptr, 0, nullptr, nullptr);
  if (needed <= 0) return {};
  std::string out(size_t(needed), '\0');
  WideCharToMultiByte(CP_UTF8, 0, wide.data(), int(wide.size()), out.data(), needed, nullptr, nullptr);
  return out;
#else
  std::string out;
  out.reserve(wide.size());
  for (wchar_t ch : wide) {
    if (ch < 0x80) {
      out.push_back(static_cast<char>(ch));
    } else if (ch < 0x800) {
      out.push_back(static_cast<char>(0xC0 | ((ch >> 6) & 0x1F)));
      out.push_back(static_cast<char>(0x80 | (ch & 0x3F)));
    } else {
      out.push_back(static_cast<char>(0xE0 | ((ch >> 12) & 0x0F)));
      out.push_back(static_cast<char>(0x80 | ((ch >> 6) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | (ch & 0x3F)));
    }
  }
  return out;
#endif
}

inline std::string jsonEscape(const std::string& s) {
  std::ostringstream oss;
  for (unsigned char c : s) {
    switch (c) {
      case '"': oss << "\\\""; break;
      case '\\': oss << "\\\\"; break;
      case '\b': oss << "\\b"; break;
      case '\f': oss << "\\f"; break;
      case '\n': oss << "\\n"; break;
      case '\r': oss << "\\r"; break;
      case '\t': oss << "\\t"; break;
      default:
        if (c < 0x20) {
          char buf[8];
          snprintf(buf, sizeof(buf), "\\u%04x", unsigned(c));
          oss << buf;
        } else {
          oss << char(c);
        }
    }
  }
  return oss.str();
}

inline std::string toJson(const AppSnapshot& snap) {
  std::ostringstream oss;
  oss << "{\"pid\":" << snap.pid
      << ",\"exe\":\"" << jsonEscape(utf8FromWide(snap.exe)) << "\""
      << ",\"path\":\"" << jsonEscape(utf8FromWide(snap.path)) << "\""
      << ",\"title\":\"" << jsonEscape(utf8FromWide(snap.title)) << "\"}";
  return oss.str();
}

inline std::string toJsonArray(const std::vector<AppSnapshot>& list) {
  std::ostringstream oss;
  oss << "[";
  for (size_t i = 0; i < list.size(); ++i) {
    if (i > 0) oss << ",";
    oss << toJson(list[i]);
  }
  oss << "]";
  return oss.str();
}

#ifdef _WIN32
// OpenMAD Standard: Uses PROCESS_QUERY_LIMITED_INFORMATION (0x1000) so elevated
// or Anti-Cheat protected games (Vanguard, EAC, BattlEye, Faceit) can be queried
// without failing with ERROR_ACCESS_DENIED.
static constexpr DWORD kProcessQueryLimitedInformation = 0x1000;

inline AppSnapshot queryWindowApp(HWND hwnd) {
  AppSnapshot out{};
  if (!hwnd) return out;

  wchar_t titleBuf[512] = {};
  int titleLen = GetWindowTextW(hwnd, titleBuf, 511);
  if (titleLen > 0) {
    out.title.assign(titleBuf, titleLen);
  }

  DWORD pid = 0;
  GetWindowThreadProcessId(hwnd, &pid);
  if (!pid) return out;
  out.pid = pid;

  HANDLE hProc = OpenProcess(kProcessQueryLimitedInformation, FALSE, pid);
  if (!hProc) return out;

  wchar_t pathBuf[4096] = {};
  DWORD pathCap = 4095;
  if (QueryFullProcessImageNameW(hProc, 0, pathBuf, &pathCap)) {
    out.path.assign(pathBuf, pathCap);
    out.exe = baseName(out.path);
  }
  CloseHandle(hProc);
  return out;
}

inline AppSnapshot getForegroundApp() {
  return queryWindowApp(GetForegroundWindow());
}

inline std::vector<AppSnapshot> listWindowedProcesses() {
  struct EnumCtx {
    std::unordered_map<std::wstring, AppSnapshot> byExe;
  } ctx;

  EnumWindows([](HWND hwnd, LPARAM lParam) -> BOOL {
    if (!IsWindowVisible(hwnd) || GetWindowTextLengthW(hwnd) <= 0) {
      return TRUE;
    }
    auto* c = reinterpret_cast<EnumCtx*>(lParam);
    AppSnapshot snap = queryWindowApp(hwnd);
    if (!snap.exe.empty() && snap.exe != L"explorer.exe" && snap.exe != L"applicationframehost.exe") {
      if (c->byExe.find(snap.exe) == c->byExe.end()) {
        c->byExe.emplace(snap.exe, std::move(snap));
      }
    }
    return TRUE;
  }, reinterpret_cast<LPARAM>(&ctx));

  std::vector<AppSnapshot> result;
  result.reserve(ctx.byExe.size());
  for (auto& kv : ctx.byExe) {
    result.push_back(std::move(kv.second));
  }
  return result;
}
#else
inline AppSnapshot getForegroundApp() {
  return AppSnapshot{};
}
inline std::vector<AppSnapshot> listWindowedProcesses() {
  return {};
}
#endif

} // namespace foreground
