#pragma once
#include <windows.h>
#include <string>
// Keep in sync with service/brand.ts: these are the same identifiers, and
// brand.ts is the single place the product name is decided.
#define OPENAULA_NAME L"OpenAula"
#define OPENAULA_LABEL L"OpenAula RGB"
#define OPENAULA_RUN_NAME L"OpenAulaRgbService"
#define OPENAULA_LEGACY_RUN_NAME L"OpenHero68RgbService"
#define OPENAULA_DATA_DIR L"OpenAula"
#define OPENAULA_LEGACY_DATA_DIR L"OpenHero68"
#define OPENAULA_LAUNCHER L"OpenAula.exe"
#define OPENAULA_TRAY_CLASS L"OpenAulaRgbTray"
inline bool setupTestMode(){return GetEnvironmentVariableW(L"OPENAULA_SETUP_TEST",nullptr,0)>0;}
inline const wchar_t* trayMutexName(){return setupTestMode()?L"Local\\OpenAulaSetupTest":L"Local\\OpenAulaRgbService";}
inline INTERNET_PORT servicePort(){return setupTestMode()?17868:16868;}
// An upgrade from a pre-1.0 install must find the old autostart value too.
inline const wchar_t* legacyTrayMutexName(){return L"Local\\OpenHero68RgbService";}
