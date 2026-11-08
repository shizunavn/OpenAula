#define NOMINMAX
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <windowsx.h>
#include <shellapi.h>
#include <winhttp.h>
#pragma comment(lib, "gdi32.lib")
#include "install_environment.h"
#include <atomic>
#include <string>
#include <thread>
#include <vector>
#include <version.h>

namespace {

HANDLE child;
NOTIFYICONDATAW tray{};
std::wstring launchCommand;
constexpr wchar_t RunKey[] = L"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
constexpr wchar_t RunName[] = OPENAULA_RUN_NAME;
UINT taskbarCreated;
std::atomic<bool> checkingUpdates{false};
std::atomic<bool> exiting{false};
HWND flyoutWindow = nullptr;

enum ActionId {
  ACT_NONE = 0,
  ACT_WEB_APP = 1,
  ACT_CONTROL_PANEL = 2,
  ACT_START_RGB = 3,
  ACT_STOP_RGB = 4,
  ACT_CHECK_UPDATES = 5,
  ACT_LOG_FOLDER = 6,
  ACT_AUTO_START = 7,
  ACT_QUIT = 8,
  ACT_START_GAMEPAD = 9,
  ACT_STOP_GAMEPAD = 10
};

struct TrayStatusSnapshot {
  bool online = false;
  bool connected = false;
  bool rgbEnabled = false;
  bool gamepadEnabled = false;
  bool tachyon = false;
  std::wstring deviceLabel = L"No keyboard connected";
  std::wstring rgbModeLabel = L"Onboard hardware";
  std::wstring gamepadLabel = L"Stopped";
};

TrayStatusSnapshot currentStatus{};
int hoveredAction = ACT_NONE;
int pressedAction = ACT_NONE;
bool trackingMouse = false;

void open(const wchar_t* url) {
  ShellExecuteW(nullptr, L"open", url, nullptr, nullptr, SW_SHOWNORMAL);
}

std::wstring autoStartCommand() {
  wchar_t value[32768];
  DWORD size = sizeof(value);
  if (RegGetValueW(HKEY_CURRENT_USER, RunKey, RunName, RRF_RT_REG_SZ, nullptr, value, &size) !=
      ERROR_SUCCESS) {
    // A pre-1.0 install stored its autostart under the old value name.
    size = sizeof(value);
    if (RegGetValueW(
            HKEY_CURRENT_USER,
            RunKey,
            OPENAULA_LEGACY_RUN_NAME,
            RRF_RT_REG_SZ,
            nullptr,
            value,
            &size) != ERROR_SUCCESS) {
      return L"";
    }
  }
  return value;
}

bool autoStart() {
  return autoStartCommand() == launchCommand;
}

void toggleAutoStart(HWND window) {
  HKEY key;
  LONG result = RegCreateKeyExW(
      HKEY_CURRENT_USER, RunKey, 0, nullptr, 0, KEY_SET_VALUE, nullptr, &key, nullptr);
  if (result == ERROR_SUCCESS) {
    if (autoStart()) {
      result = RegDeleteValueW(key, RunName);
      RegDeleteValueW(key, OPENAULA_LEGACY_RUN_NAME);
    } else {
      result = RegSetValueExW(
          key,
          RunName,
          0,
          REG_SZ,
          reinterpret_cast<const BYTE*>(launchCommand.c_str()),
          DWORD((launchCommand.size() + 1) * sizeof(wchar_t)));
    }
    RegCloseKey(key);
  }
  if (result != ERROR_SUCCESS) {
    MessageBoxW(
        window,
        L"Could not change auto-start for your Windows account.",
        OPENAULA_LABEL,
        MB_ICONERROR);
  }
}

struct HttpResult {
  DWORD status = 0;
  std::string body;
};

HttpResult requestHttp(const wchar_t* method, const wchar_t* endpoint, int receiveTimeout = 1500) {
  HttpResult result;
  HINTERNET session = WinHttpOpen(
      OPENAULA_LABEL L"/" HERO68_VERSION_W,
      WINHTTP_ACCESS_TYPE_NO_PROXY,
      nullptr,
      nullptr,
      0);
  if (!session) {
    return result;
  }
  WinHttpSetTimeouts(session, 250, 250, 800, receiveTimeout);
  HINTERNET connection = WinHttpConnect(session, L"127.0.0.1", servicePort(), 0);
  HINTERNET request =
      connection ? WinHttpOpenRequest(connection, method, endpoint, nullptr, nullptr, nullptr, 0)
                 : nullptr;
  DWORD status = 0;
  DWORD size = sizeof(status);
  char body[] = "{}";
  const bool isPost = wcscmp(method, L"POST") == 0;
  bool ok =
      request &&
      WinHttpSendRequest(
          request,
          isPost ? L"Content-Type: application/json\r\n" : WINHTTP_NO_ADDITIONAL_HEADERS,
          DWORD(-1),
          isPost ? body : WINHTTP_NO_REQUEST_DATA,
          isPost ? 2 : 0,
          isPost ? 2 : 0,
          0) &&
      WinHttpReceiveResponse(request, nullptr) &&
      WinHttpQueryHeaders(
          request,
          WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
          nullptr,
          &status,
          &size,
          nullptr);
  if (ok) {
    result.status = status;
    char buffer[1024];
    DWORD read = 0;
    while (result.body.size() < 16384 &&
           WinHttpReadData(request, buffer, sizeof(buffer), &read) &&
           read) {
      result.body.append(buffer, read);
    }
  }
  if (request) {
    WinHttpCloseHandle(request);
  }
  if (connection) {
    WinHttpCloseHandle(connection);
  }
  WinHttpCloseHandle(session);
  return result;
}

HttpResult post(const wchar_t* endpoint, int receiveTimeout = 1500) {
  return requestHttp(L"POST", endpoint, receiveTimeout);
}

bool command(const wchar_t* endpoint) {
  return post(endpoint).status == 200;
}

std::wstring wide(const std::string& value) {
  if (value.empty()) {
    return L"";
  }
  int length = MultiByteToWideChar(
      CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), int(value.size()), nullptr, 0);
  if (length <= 0) {
    return L"";
  }
  std::wstring result(size_t(length), L'\0');
  MultiByteToWideChar(
      CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), int(value.size()), result.data(), length);
  return result;
}

bool jsonBoolField(const std::string& json, const char* key) {
  std::string pattern = std::string("\"") + key + "\":";
  size_t pos = json.find(pattern);
  if (pos == std::string::npos) {
    return false;
  }
  pos += pattern.size();
  while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) {
    ++pos;
  }
  return json.compare(pos, 4, "true") == 0;
}

std::string jsonStringField(const std::string& json, const char* key) {
  std::string pattern = std::string("\"") + key + "\":\"";
  size_t pos = json.find(pattern);
  if (pos == std::string::npos) {
    return "";
  }
  pos += pattern.size();
  size_t end = json.find('"', pos);
  if (end == std::string::npos) {
    return "";
  }
  return json.substr(pos, end - pos);
}

void refreshTrayStatus() {
  const HttpResult res = requestHttp(L"GET", L"/status", 220);
  if (res.status != 200 || res.body.empty()) {
    currentStatus = {};
    return;
  }
  TrayStatusSnapshot next;
  next.online = true;
  next.connected = jsonBoolField(res.body, "connected");
  next.rgbEnabled = jsonBoolField(res.body, "enabled");
  next.tachyon = jsonBoolField(res.body, "tachyon");
  const std::string model = jsonStringField(res.body, "deviceModel");
  if (model == "hero68Xs") {
    next.deviceLabel = next.connected ? L"AULA HERO 68 XS \u00B7 Connected" : L"AULA HERO 68 XS \u00B7 Standby";
  } else if (model == "hero84") {
    next.deviceLabel = next.connected ? L"AULA HERO 84 HE \u00B7 Connected" : L"AULA HERO 84 HE \u00B7 Standby";
  } else if (model == "win68HeMax" || model == "win68") {
    next.deviceLabel = next.connected ? L"WIN 68 HE MAX \u00B7 Connected" : L"WIN 68 HE MAX \u00B7 Standby";
  } else if (model == "hero68") {
    next.deviceLabel = next.connected ? L"AULA HERO 68 HE \u00B7 Connected" : L"AULA HERO 68 HE \u00B7 Standby";
  } else {
    next.deviceLabel = next.connected ? L"Keyboard Connected" : L"No keyboard connected";
  }

  const std::string mode = jsonStringField(res.body, "mode");
  if (next.tachyon) {
    next.rgbModeLabel = L"Tachyon Mode (8000 Hz \u00B7 LEDs Off)";
  } else if (mode == "custom" && next.rgbEnabled) {
    next.rgbModeLabel = L"Custom RGB Effects \u00B7 Active";
  } else if (mode == "rhythm" && next.rgbEnabled) {
    next.rgbModeLabel = L"Audio Rhythm Sync \u00B7 Active";
  } else {
    next.rgbModeLabel = L"Onboard Hardware Lighting";
  }

  size_t gpPos = res.body.find("\"gamepad\":{");
  if (gpPos != std::string::npos) {
    std::string gpSub = res.body.substr(gpPos, 260);
    next.gamepadEnabled = jsonBoolField(gpSub, "enabled");
  }
  next.gamepadLabel = next.gamepadEnabled ? L"Virtual XInput \u00B7 Active" : L"Virtual XInput \u00B7 Stopped";
  currentStatus = next;
}

struct UpdateReply {
  std::string kind;
  std::wstring version;
  std::wstring file;
  bool valid = false;
};

UpdateReply parseUpdateReply(const HttpResult& result) {
  if (result.status != 200) {
    return {};
  }
  const size_t first = result.body.find('|');
  if (first == std::string::npos) {
    return {};
  }
  const size_t second = result.body.find('|', first + 1);
  UpdateReply reply;
  reply.kind = result.body.substr(0, first);
  reply.version = wide(result.body.substr(
      first + 1, second == std::string::npos ? second : second - first - 1));
  if (reply.version.empty()) {
    return {};
  }
  if (reply.kind == "package" && second != std::string::npos) {
    reply.file = wide(result.body.substr(second + 1));
  }
  reply.valid =
      ((reply.kind == "none" || reply.kind == "core" || reply.kind == "started") &&
       second == std::string::npos) ||
      (reply.kind == "package" && !reply.file.empty());
  return reply;
}

void notify(const wchar_t* message) {
  NOTIFYICONDATAW notice = tray;
  notice.uFlags = NIF_INFO;
  wcscpy_s(notice.szInfoTitle, OPENAULA_LABEL);
  wcscpy_s(notice.szInfo, message);
  notice.dwInfoFlags = NIIF_INFO;
  Shell_NotifyIconW(NIM_MODIFY, &notice);
}

void checkUpdates() {
  if (checkingUpdates.exchange(true)) {
    MessageBoxW(
        nullptr,
        L"An update check is already running.",
        OPENAULA_LABEL,
        MB_OK | MB_ICONINFORMATION | MB_SETFOREGROUND);
    return;
  }
  std::thread([] {
    // Service waits for the GitHub check before replying, so the result is the real outcome.
    const UpdateReply reply = parseUpdateReply(post(L"/updates/tray-check", 190000));
    if (!exiting) {
      if (!reply.valid) {
        notify(L"Update check failed. Open the service log folder for details.");
      } else if (reply.kind == "none") {
        notify((L"Up to date \u2714  Core " + reply.version + L"; launcher " HERO68_VERSION_W L".")
                   .c_str());
      } else if (reply.kind == "started") {
        notify(L"Updating the app. It will restart automatically; Windows will stay running.");
      } else if (reply.kind == "core") {
        notify((L"Core update " + reply.version + L" downloaded. The service is restarting.")
                   .c_str());
      } else if (reply.kind == "package") {
        const std::wstring message =
            L"Windows update " + reply.version + L" downloaded and verified to:\n" + reply.file +
            L"\n\nQuit the tray app, extract the ZIP over its folder, then restart it. Open the download folder?";
        if (MessageBoxW(
                nullptr,
                message.c_str(),
                OPENAULA_LABEL,
                MB_YESNO | MB_ICONINFORMATION | MB_SETFOREGROUND) == IDYES) {
          const size_t slash = reply.file.find_last_of(L"\\/");
          if (slash != std::wstring::npos) {
            const std::wstring folder = reply.file.substr(0, slash);
            open(folder.c_str());
          }
        }
      }
    }
    checkingUpdates = false;
  }).detach();
}

void addTray() {
  Shell_NotifyIconW(NIM_ADD, &tray);
  tray.uVersion = NOTIFYICON_VERSION_4;
  Shell_NotifyIconW(NIM_SETVERSION, &tray);
}

constexpr int FlyoutWidth = 340;
constexpr int FlyoutHeight = 416;

struct FlyoutButton {
  int id;
  RECT rect;
  const wchar_t* label;
  bool primary;
  bool danger;
  bool active;
};

std::vector<FlyoutButton> getFlyoutButtons() {
  const bool autostartOn = autoStart();
  return {
    {ACT_START_RGB, {24, 134, 166, 168}, L"\u25B6 Start Saved RGB", false, false, currentStatus.rgbEnabled},
    {ACT_STOP_RGB, {174, 134, 316, 168}, L"\u25A0 Onboard RGB", false, false, !currentStatus.rgbEnabled && currentStatus.online},
    {ACT_START_GAMEPAD, {24, 224, 166, 258}, L"\u25B6 Start Gamepad", false, false, currentStatus.gamepadEnabled},
    {ACT_STOP_GAMEPAD, {174, 224, 316, 258}, L"\u25A0 Stop Gamepad", false, false, !currentStatus.gamepadEnabled && currentStatus.online},
    {ACT_WEB_APP, {16, 278, 166, 316}, L"Open Web App", true, false, false},
    {ACT_CONTROL_PANEL, {174, 278, 324, 316}, L"Control Panel", false, false, false},
    {ACT_CHECK_UPDATES, {16, 326, 166, 360}, L"Check Updates", false, false, checkingUpdates.load()},
    {ACT_LOG_FOLDER, {174, 326, 324, 360}, L"Open Log Folder", false, false, false},
    {ACT_AUTO_START, {16, 368, 224, 402}, autostartOn ? L"\u2713 Auto-start with Windows" : L"Auto-start with Windows", false, false, autostartOn},
    {ACT_QUIT, {232, 368, 324, 402}, L"Quit", false, true, false}
  };
}

int hitTestFlyout(int x, int y) {
  POINT pt{x, y};
  for (const auto& btn : getFlyoutButtons()) {
    if (PtInRect(&btn.rect, pt)) {
      return btn.id;
    }
  }
  return ACT_NONE;
}

void drawRoundRect(HDC dc, const RECT& rc, int radius, COLORREF fill, COLORREF border) {
  HBRUSH brush = CreateSolidBrush(fill);
  HPEN pen = CreatePen(PS_SOLID, 1, border);
  HGDIOBJ oldBrush = SelectObject(dc, brush);
  HGDIOBJ oldPen = SelectObject(dc, pen);
  RoundRect(dc, rc.left, rc.top, rc.right, rc.bottom, radius, radius);
  SelectObject(dc, oldBrush);
  SelectObject(dc, oldPen);
  DeleteObject(brush);
  DeleteObject(pen);
}

void drawDot(HDC dc, int cx, int cy, int r, COLORREF color) {
  HBRUSH brush = CreateSolidBrush(color);
  HPEN pen = CreatePen(PS_SOLID, 1, color);
  HGDIOBJ oldBrush = SelectObject(dc, brush);
  HGDIOBJ oldPen = SelectObject(dc, pen);
  Ellipse(dc, cx - r, cy - r, cx + r, cy + r);
  SelectObject(dc, oldBrush);
  SelectObject(dc, oldPen);
  DeleteObject(brush);
  DeleteObject(pen);
}

void paintFlyout(HWND hwnd, HDC targetDc) {
  RECT client{};
  GetClientRect(hwnd, &client);
  HDC memDc = CreateCompatibleDC(targetDc);
  HBITMAP bmp = CreateCompatibleBitmap(targetDc, client.right, client.bottom);
  HGDIOBJ oldBmp = SelectObject(memDc, bmp);

  SetBkMode(memDc, TRANSPARENT);

  // Outer card background
  drawRoundRect(memDc, {0, 0, client.right, client.bottom}, 16, RGB(17, 20, 24), RGB(46, 54, 62));

  HFONT titleFont = CreateFontW(-16, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
      OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_SWISS, L"Segoe UI");
  HFONT subFont = CreateFontW(-12, 0, 0, 0, FW_MEDIUM, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
      OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_SWISS, L"Segoe UI");
  HFONT sectionFont = CreateFontW(-11, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
      OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_SWISS, L"Segoe UI");
  HFONT btnFont = CreateFontW(-12, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
      OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_SWISS, L"Segoe UI");

  // App Icon & Header
  if (tray.hIcon) {
    DrawIconEx(memDc, 18, 16, tray.hIcon, 28, 28, 0, nullptr, DI_NORMAL);
  }
  SelectObject(memDc, titleFont);
  SetTextColor(memDc, RGB(244, 247, 250));
  RECT titleRc{56, 13, 250, 34};
  DrawTextW(memDc, OPENAULA_LABEL L" Service", -1, &titleRc, DT_SINGLELINE | DT_LEFT | DT_VCENTER);

  SelectObject(memDc, subFont);
  SetTextColor(memDc, RGB(148, 158, 168));
  RECT verRc{56, 32, 250, 50};
  DrawTextW(memDc, L"Launcher v" HERO68_VERSION_W, -1, &verRc, DT_SINGLELINE | DT_LEFT | DT_VCENTER);

  // Online badge
  RECT badgeRc{254, 18, 324, 40};
  drawRoundRect(
      memDc,
      badgeRc,
      11,
      currentStatus.online ? RGB(19, 46, 36) : RGB(48, 38, 24),
      currentStatus.online ? RGB(46, 229, 157) : RGB(255, 212, 92));
  SelectObject(memDc, sectionFont);
  SetTextColor(memDc, currentStatus.online ? RGB(46, 229, 157) : RGB(255, 212, 92));
  DrawTextW(
      memDc,
      currentStatus.online ? L"ONLINE" : L"OFFLINE",
      -1,
      &badgeRc,
      DT_SINGLELINE | DT_CENTER | DT_VCENTER);

  // Device status pill bar
  RECT devCard{16, 56, 324, 84};
  drawRoundRect(memDc, devCard, 8, RGB(24, 29, 34), RGB(38, 45, 52));
  drawDot(
      memDc,
      30,
      70,
      4,
      currentStatus.connected ? RGB(46, 229, 157) : RGB(120, 130, 140));
  SelectObject(memDc, subFont);
  SetTextColor(memDc, currentStatus.connected ? RGB(230, 236, 242) : RGB(156, 166, 176));
  RECT devTextRc{42, 56, 316, 84};
  DrawTextW(memDc, currentStatus.deviceLabel.c_str(), -1, &devTextRc, DT_SINGLELINE | DT_LEFT | DT_VCENTER);

  // Section 1: RGB Lighting Card
  RECT rgbCard{16, 92, 324, 176};
  drawRoundRect(memDc, rgbCard, 10, RGB(24, 29, 34), RGB(40, 47, 55));
  SelectObject(memDc, sectionFont);
  SetTextColor(memDc, RGB(142, 152, 162));
  RECT rgbHdr{26, 98, 140, 114};
  DrawTextW(memDc, L"RGB LIGHTING", -1, &rgbHdr, DT_SINGLELINE | DT_LEFT | DT_VCENTER);

  SelectObject(memDc, subFont);
  SetTextColor(memDc, currentStatus.rgbEnabled ? RGB(255, 212, 92) : RGB(186, 194, 202));
  RECT rgbSub{26, 113, 314, 131};
  DrawTextW(memDc, currentStatus.rgbModeLabel.c_str(), -1, &rgbSub, DT_SINGLELINE | DT_LEFT | DT_VCENTER);

  // Section 2: Gamepad Card
  RECT gpCard{16, 182, 324, 266};
  drawRoundRect(memDc, gpCard, 10, RGB(24, 29, 34), RGB(40, 47, 55));
  SelectObject(memDc, sectionFont);
  SetTextColor(memDc, RGB(142, 152, 162));
  RECT gpHdr{26, 188, 170, 204};
  DrawTextW(memDc, L"ANALOG GAMEPAD", -1, &gpHdr, DT_SINGLELINE | DT_LEFT | DT_VCENTER);

  SelectObject(memDc, subFont);
  SetTextColor(memDc, currentStatus.gamepadEnabled ? RGB(46, 229, 157) : RGB(186, 194, 202));
  RECT gpSub{26, 203, 314, 221};
  DrawTextW(memDc, currentStatus.gamepadLabel.c_str(), -1, &gpSub, DT_SINGLELINE | DT_LEFT | DT_VCENTER);

  // Render all interactive buttons
  SelectObject(memDc, btnFont);
  for (const auto& btn : getFlyoutButtons()) {
    const bool hovered = (hoveredAction == btn.id);
    const bool pressed = (pressedAction == btn.id);
    COLORREF fill = RGB(31, 37, 44);
    COLORREF border = RGB(52, 61, 70);
    COLORREF text = RGB(232, 238, 244);

    if (btn.primary) {
      fill = pressed ? RGB(212, 172, 60) : hovered ? RGB(255, 221, 112) : RGB(245, 202, 78);
      border = RGB(255, 226, 128);
      text = RGB(18, 21, 24);
    } else if (btn.danger) {
      fill = pressed ? RGB(92, 26, 34) : hovered ? RGB(74, 24, 31) : RGB(34, 24, 28);
      border = hovered ? RGB(235, 87, 103) : RGB(78, 42, 48);
      text = hovered ? RGB(255, 196, 202) : RGB(242, 132, 144);
    } else if (btn.active) {
      fill = hovered ? RGB(30, 62, 50) : RGB(22, 48, 39);
      border = RGB(46, 229, 157);
      text = RGB(118, 245, 192);
    } else if (hovered) {
      fill = pressed ? RGB(38, 45, 54) : RGB(43, 51, 60);
      border = RGB(96, 108, 122);
      text = RGB(255, 255, 255);
    }

    drawRoundRect(memDc, btn.rect, 8, fill, border);
    SetTextColor(memDc, text);
    RECT textRc = btn.rect;
    DrawTextW(memDc, btn.label, -1, &textRc, DT_SINGLELINE | DT_CENTER | DT_VCENTER);
  }

  BitBlt(targetDc, 0, 0, client.right, client.bottom, memDc, 0, 0, SRCCOPY);

  DeleteObject(titleFont);
  DeleteObject(subFont);
  DeleteObject(sectionFont);
  DeleteObject(btnFont);
  SelectObject(memDc, oldBmp);
  DeleteObject(bmp);
  DeleteDC(memDc);
}

void executeTrayAction(HWND ownerWindow, int action) {
  switch (action) {
    case ACT_WEB_APP:
      ShowWindow(flyoutWindow, SW_HIDE);
      open(L"https://open-hero68.pages.dev/");
      break;
    case ACT_CONTROL_PANEL:
      ShowWindow(flyoutWindow, SW_HIDE);
      open(L"http://127.0.0.1:16868/");
      break;
    case ACT_START_RGB:
    case ACT_STOP_RGB:
      if (!command(action == ACT_START_RGB ? L"/start" : L"/stop")) {
        ShowWindow(flyoutWindow, SW_HIDE);
        MessageBoxW(
            ownerWindow,
            L"The RGB command failed. Open the control panel for details; Start requires a saved preset.",
            OPENAULA_LABEL,
            MB_ICONWARNING);
      } else {
        refreshTrayStatus();
        if (flyoutWindow) {
          InvalidateRect(flyoutWindow, nullptr, FALSE);
        }
      }
      break;
    case ACT_START_GAMEPAD:
    case ACT_STOP_GAMEPAD:
      if (!command(action == ACT_START_GAMEPAD ? L"/gamepad/start" : L"/gamepad/stop")) {
        ShowWindow(flyoutWindow, SW_HIDE);
        MessageBoxW(
            ownerWindow,
            L"Gamepad command failed. Open the control panel for driver and connection details.",
            OPENAULA_LABEL L" Gamepad",
            MB_ICONWARNING);
      } else {
        refreshTrayStatus();
        if (flyoutWindow) {
          InvalidateRect(flyoutWindow, nullptr, FALSE);
        }
      }
      break;
    case ACT_CHECK_UPDATES:
      ShowWindow(flyoutWindow, SW_HIDE);
      checkUpdates();
      break;
    case ACT_LOG_FOLDER: {
      ShowWindow(flyoutWindow, SW_HIDE);
      wchar_t local[32768];
      DWORD count = GetEnvironmentVariableW(L"LOCALAPPDATA", local, 32768);
      if (count && count < 32768) {
        open((std::wstring(local) + L"\\" OPENAULA_DATA_DIR L"\\rgb-service").c_str());
      }
      break;
    }
    case ACT_AUTO_START:
      toggleAutoStart(ownerWindow);
      if (flyoutWindow) {
        InvalidateRect(flyoutWindow, nullptr, FALSE);
      }
      break;
    case ACT_QUIT:
      ShowWindow(flyoutWindow, SW_HIDE);
      SendMessageW(ownerWindow, WM_CLOSE, 0, 0);
      break;
  }
}

LRESULT CALLBACK flyoutProc(HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam) {
  HWND owner = GetWindow(hwnd, GW_OWNER);
  switch (message) {
    case WM_ERASEBKGND:
      return 1;
    case WM_PAINT: {
      PAINTSTRUCT ps{};
      HDC dc = BeginPaint(hwnd, &ps);
      paintFlyout(hwnd, dc);
      EndPaint(hwnd, &ps);
      return 0;
    }
    case WM_MOUSEMOVE: {
      if (!trackingMouse) {
        TRACKMOUSEEVENT tme{sizeof(TRACKMOUSEEVENT), TME_LEAVE, hwnd, 0};
        TrackMouseEvent(&tme);
        trackingMouse = true;
      }
      int nextHover = hitTestFlyout(GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam));
      SetCursor(LoadCursorW(nullptr, nextHover != ACT_NONE ? IDC_HAND : IDC_ARROW));
      if (nextHover != hoveredAction) {
        hoveredAction = nextHover;
        InvalidateRect(hwnd, nullptr, FALSE);
      }
      return 0;
    }
    case WM_MOUSELEAVE:
      trackingMouse = false;
      if (hoveredAction != ACT_NONE || pressedAction != ACT_NONE) {
        hoveredAction = ACT_NONE;
        pressedAction = ACT_NONE;
        InvalidateRect(hwnd, nullptr, FALSE);
      }
      return 0;
    case WM_LBUTTONDOWN: {
      int hit = hitTestFlyout(GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam));
      pressedAction = hit;
      InvalidateRect(hwnd, nullptr, FALSE);
      return 0;
    }
    case WM_LBUTTONUP: {
      int hit = hitTestFlyout(GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam));
      int triggered = (hit != ACT_NONE && hit == pressedAction) ? hit : ACT_NONE;
      pressedAction = ACT_NONE;
      InvalidateRect(hwnd, nullptr, FALSE);
      if (triggered != ACT_NONE && owner) {
        executeTrayAction(owner, triggered);
      }
      return 0;
    }
    case WM_KEYDOWN:
      if (wparam == VK_ESCAPE) {
        ShowWindow(hwnd, SW_HIDE);
        return 0;
      }
      break;
    case WM_ACTIVATE:
      if (LOWORD(wparam) == WA_INACTIVE) {
        KillTimer(hwnd, 2);
        ShowWindow(hwnd, SW_HIDE);
        return 0;
      }
      break;
    case WM_TIMER:
      if (wparam == 2 && IsWindowVisible(hwnd)) {
        refreshTrayStatus();
        InvalidateRect(hwnd, nullptr, FALSE);
      }
      return 0;
  }
  return DefWindowProcW(hwnd, message, wparam, lparam);
}

void showTrayFlyout(HWND ownerWindow) {
  refreshTrayStatus();
  if (!flyoutWindow) {
    WNDCLASSW wc{};
    wc.lpfnWndProc = flyoutProc;
    wc.hInstance = GetModuleHandleW(nullptr);
    wc.lpszClassName = L"OpenAulaTrayFlyoutWindow";
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    RegisterClassW(&wc);
    flyoutWindow = CreateWindowExW(
        WS_EX_TOOLWINDOW | WS_EX_TOPMOST,
        wc.lpszClassName,
        OPENAULA_LABEL,
        WS_POPUP,
        0,
        0,
        FlyoutWidth,
        FlyoutHeight,
        ownerWindow,
        nullptr,
        wc.hInstance,
        nullptr);
    if (flyoutWindow) {
      HRGN rgn = CreateRoundRectRgn(0, 0, FlyoutWidth + 1, FlyoutHeight + 1, 16, 16);
      SetWindowRgn(flyoutWindow, rgn, TRUE);
    }
  }
  if (!flyoutWindow) {
    return;
  }

  POINT pt{};
  GetCursorPos(&pt);
  RECT workArea{};
  SystemParametersInfoW(SPI_GETWORKAREA, 0, &workArea, 0);
  HMONITOR mon = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
  MONITORINFO mi{sizeof(MONITORINFO)};
  if (GetMonitorInfoW(mon, &mi)) {
    workArea = mi.rcWork;
  }

  int x = pt.x - FlyoutWidth / 2;
  int y = pt.y - FlyoutHeight - 12;
  if (x < workArea.left + 8) {
    x = workArea.left + 8;
  }
  if (x + FlyoutWidth > workArea.right - 8) {
    x = workArea.right - FlyoutWidth - 8;
  }
  if (y < workArea.top + 8) {
    y = pt.y + 12;
  }
  if (y + FlyoutHeight > workArea.bottom - 8) {
    y = workArea.bottom - FlyoutHeight - 8;
  }

  hoveredAction = ACT_NONE;
  pressedAction = ACT_NONE;
  SetWindowPos(
      flyoutWindow,
      HWND_TOPMOST,
      x,
      y,
      FlyoutWidth,
      FlyoutHeight,
      SWP_SHOWWINDOW);
  SetForegroundWindow(flyoutWindow);
  SetFocus(flyoutWindow);
  SetTimer(flyoutWindow, 2, 1200, nullptr);
  InvalidateRect(flyoutWindow, nullptr, FALSE);
}

LRESULT CALLBACK windowProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
  if (message == taskbarCreated) {
    addTray();
    return 0;
  }
  switch (message) {
    case WM_APP + 1:
      if (LOWORD(lparam) == WM_CONTEXTMENU ||
          LOWORD(lparam) == NIN_KEYSELECT ||
          LOWORD(lparam) == NIN_SELECT ||
          LOWORD(lparam) == WM_RBUTTONUP ||
          LOWORD(lparam) == WM_LBUTTONUP) {
        showTrayFlyout(window);
      }
      return 0;
    case WM_TIMER:
      if (WaitForSingleObject(child, 0) == WAIT_OBJECT_0) {
        DestroyWindow(window);
      }
      return 0;
    case WM_CLOSE:
      exiting = true;
      command(L"/shutdown");
      WaitForSingleObject(child, 2000);
      DestroyWindow(window);
      return 0;
    case WM_QUERYENDSESSION:
      return TRUE;
    case WM_ENDSESSION:
      if (wparam) {
        DestroyWindow(window);
      }
      return 0;
    case WM_DESTROY:
      exiting = true;
      KillTimer(window, 1);
      Shell_NotifyIconW(NIM_DELETE, &tray);
      PostQuitMessage(0);
      return 0;
  }
  return DefWindowProcW(window, message, wparam, lparam);
}

} // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR arguments, int) {
  HANDLE mutex = CreateMutexW(nullptr, TRUE, trayMutexName());
  if (!mutex || GetLastError() == ERROR_ALREADY_EXISTS) {
    if (mutex) {
      CloseHandle(mutex);
      open(L"http://127.0.0.1:16868/");
    }
    return 0;
  }

  wchar_t path[32768];
  GetModuleFileNameW(nullptr, path, 32768);
  std::wstring dir(path);
  dir.resize(dir.find_last_of(L"\\/"));
  launchCommand = L"\"" + std::wstring(path) + L"\"";

  std::wstring installRoot = dir;
  for (int i = 0; i < 2; ++i) {
    auto slash = installRoot.find_last_of(L"\\/");
    if (slash != std::wstring::npos) {
      installRoot.resize(slash);
    }
  }
  if (GetFileAttributesW((installRoot + L"\\installation.json").c_str()) !=
      INVALID_FILE_ATTRIBUTES) {
    launchCommand = L"\"" + installRoot + L"\\" OPENAULA_LAUNCHER L"\"";
  } else if (*arguments) {
    launchCommand += L" " + std::wstring(arguments);
  }

  std::wstring runtime = dir + L"\\runtime.exe";
  std::wstring commandLine = L"\"" + runtime + L"\" \"" + dir + L"\\bootstrap.cjs\" " + arguments;

  HANDLE job = CreateJobObjectW(nullptr, nullptr);
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags =
      JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_BREAKAWAY_OK;
  if (!job ||
      !SetInformationJobObject(
          job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
    if (job) {
      CloseHandle(job);
    }
    CloseHandle(mutex);
    return 1;
  }

  STARTUPINFOW startup{};
  startup.cb = sizeof(startup);
  PROCESS_INFORMATION process{};
  SetEnvironmentVariableW(L"OPENAULA_LAUNCHER_VERSION", HERO68_VERSION_W);
  // Older cores still read the pre-1.0 variable name.
  SetEnvironmentVariableW(L"OPENHERO68_LAUNCHER_VERSION", HERO68_VERSION_W);
  if (!CreateProcessW(
          runtime.c_str(),
          commandLine.data(),
          nullptr,
          nullptr,
          FALSE,
          CREATE_NO_WINDOW | CREATE_SUSPENDED,
          nullptr,
          dir.c_str(),
          &startup,
          &process)) {
    MessageBoxW(
        nullptr,
        L"Cannot start bundled RGB runtime. Keep the service folder together.",
        OPENAULA_LABEL,
        MB_ICONERROR);
    CloseHandle(job);
    CloseHandle(mutex);
    return 1;
  }
  if (!AssignProcessToJobObject(job, process.hProcess)) {
    TerminateProcess(process.hProcess, 1);
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    CloseHandle(job);
    CloseHandle(mutex);
    return 1;
  }
  ResumeThread(process.hThread);
  CloseHandle(process.hThread);
  child = process.hProcess;

  WNDCLASSW wc{};
  wc.lpfnWndProc = windowProc;
  wc.hInstance = instance;
  wc.lpszClassName = OPENAULA_TRAY_CLASS;
  RegisterClassW(&wc);
  taskbarCreated = RegisterWindowMessageW(L"TaskbarCreated");
  HWND window = CreateWindowExW(
      0, wc.lpszClassName, OPENAULA_LABEL, 0, 0, 0, 0, 0, nullptr, nullptr, instance, nullptr);

  tray.cbSize = sizeof(tray);
  tray.hWnd = window;
  tray.uID = 1;
  tray.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP | NIF_SHOWTIP;
  tray.uCallbackMessage = WM_APP + 1;
  tray.hIcon = LoadIconW(instance, MAKEINTRESOURCEW(1));
  if (!tray.hIcon) {
    tray.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
  }
  wcscpy_s(tray.szTip, OPENAULA_LABEL L" Background Service (" HERO68_VERSION_W L")");
  addTray();
  SetTimer(window, 1, 500, nullptr);

  MSG msg;
  while (GetMessageW(&msg, nullptr, 0, 0)) {
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }
  CloseHandle(child);
  CloseHandle(job);
  CloseHandle(mutex);
  return 0;
}
