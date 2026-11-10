#include "../service/native/foreground_monitor.h"
#include <cassert>
#include <iostream>

int main() {
  using namespace foreground;

  assert(baseName(L"C:\\Program Files (x86)\\Steam\\steamapps\\common\\CS2\\cs2.EXE") == L"cs2.exe");
  assert(baseName(L"VALORANT-Win64-Shipping.exe") == L"valorant-win64-shipping.exe");

  AppSnapshot snap{};
  snap.pid = 4242;
  snap.exe = L"cs2.exe";
  snap.path = L"C:\\Steam\\cs2.exe";
  snap.title = L"Counter-Strike 2 \"Competitive\"";

  std::string json = toJson(snap);
  assert(json.find("\"pid\":4242") != std::string::npos);
  assert(json.find("\"exe\":\"cs2.exe\"") != std::string::npos);
  assert(json.find("\"path\":\"C:\\\\Steam\\\\cs2.exe\"") != std::string::npos);
  assert(json.find("\\\"Competitive\\\"") != std::string::npos);

  std::string arr = toJsonArray({snap});
  assert(arr.front() == '[' && arr.back() == ']');
  std::cout << "native-foreground-monitor tests passed\n";
  return 0;
}
