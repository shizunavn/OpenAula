#ifndef AppVersion
  #error AppVersion is required
#endif
#ifndef Distribution
  #error Distribution is required
#endif
#ifndef ReleaseDirectory
  #error ReleaseDirectory is required
#endif
#ifndef DriverInstaller
  #error DriverInstaller is required
#endif

#ifdef TestBuild
#define InstallId "OpenAulaSetupTest"
#define ShortcutName "OpenAula Setup Test"
#else
#define InstallId "OpenAula"
#define ShortcutName "OpenAula"
#endif

[Setup]
AppId={#InstallId}
AppName=OpenAula
AppVersion={#AppVersion}
AppPublisher=OpenAula
AppPublisherURL=https://github.com/shizunavn/OpenAula
DefaultDirName={localappdata}\Programs\OpenAula
DefaultGroupName={#ShortcutName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir={#ReleaseDirectory}
OutputBaseFilename=OpenAula-Setup-Windows-x64
SetupIconFile=..\native\hero68.ico
UninstallDisplayIcon={app}\OpenAula.exe
Compression=lzma2
SolidCompression=yes
CloseApplications=no
RestartApplications=no
AlwaysRestart=no
UsePreviousTasks=yes
UninstallLogging=yes

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "vi"; MessagesFile: "compiler:Default.isl,Vietnamese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopShortcut}"; Flags: checkedonce
Name: "autostart"; Description: "{cm:AutoStart}"; Flags: unchecked
Name: "gamepaddriver"; Description: "{cm:GamepadDriver}"; Flags: unchecked; Check: ShowDriverTask

[Files]
Source: "{#Distribution}\*"; DestDir: "{app}\versions\{#AppVersion}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.obj,*.res,*.pdb,version.h"
Source: "{#Distribution}\update-host.exe"; DestDir: "{app}"; DestName: "OpenAula.exe"; Flags: ignoreversion
Source: "{#Distribution}\runtime.exe"; Flags: dontcopy
Source: "{#Distribution}\update-worker.cjs"; Flags: dontcopy
Source: "{#Distribution}\update-host.exe"; Flags: dontcopy
Source: "{#DriverInstaller}"; DestName: "ViGEmBus.exe"; Flags: dontcopy

[Icons]
Name: "{group}\{#ShortcutName}"; Filename: "{app}\OpenAula.exe"
Name: "{autodesktop}\{#ShortcutName}"; Filename: "{app}\OpenAula.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#InstallId}RgbService"; ValueData: """{app}\OpenAula.exe"""; Tasks: autostart; Flags: uninsdeletevalue

[CustomMessages]
en.DesktopShortcut=Create a Desktop shortcut
vi.DesktopShortcut=Tạo shortcut trên Desktop
en.AutoStart=Start with Windows
vi.AutoStart=Khởi động cùng Windows
en.GamepadDriver=Install Gamepad driver (ViGEmBus)
vi.GamepadDriver=Cài driver Gamepad (ViGEmBus)
en.DriverBroken=The Gamepad driver is installed but unavailable. RGB and Rhythm still work. Restart the app and check Gamepad diagnostics.
vi.DriverBroken=Driver Gamepad đã cài nhưng chưa hoạt động. RGB và Rhythm vẫn dùng được. Mở lại app và kiểm tra trạng thái Gamepad.
en.DriverFailed=The driver was not installed. RGB and Rhythm are ready; you can run setup again to install the Gamepad driver.
vi.DriverFailed=Chưa cài được driver. RGB và Rhythm vẫn dùng được; bạn có thể chạy setup lại để cài driver Gamepad.
en.DriverReboot=The driver requires a Windows restart. Setup will NOT restart Windows; restart manually when convenient.
vi.DriverReboot=Driver cần khởi động lại Windows. Setup KHÔNG tự khởi động lại Windows; bạn có thể chủ động thực hiện sau.
en.StopFailed=Could not safely close the app. Close OpenAula and run setup again.
vi.StopFailed=Không thể đóng app an toàn. Hãy đóng OpenAula rồi chạy setup lại.
en.LegacyRemoveFailed=OpenAula replaces the earlier OpenHero68 install but could not remove it. Uninstall OpenHero68 from Windows Settings, then run this setup again.
vi.LegacyRemoveFailed=OpenAula thay thế bản OpenHero68 trước đó nhưng chưa gỡ được. Hãy gỡ OpenHero68 trong Cài đặt Windows rồi chạy lại setup này.

[Code]
var
  DriverStatus: Integer;
  IsUpdate: Boolean;
  LegacyInstalled: Boolean;

function ShowDriverTask(): Boolean;
begin
  Result := (not IsUpdate) and (DriverStatus = 1);
end;

// Before 1.0 the app was OpenHero68 with its own AppId, autostart value and
// install folder. Detect it so the upgrade keeps the user's auto-start choice
// and so we can tell them the old copy has to go.
function LegacyAppDir(): String;
begin
  Result := ExpandConstant('{localappdata}\Programs\OpenHero68');
end;

function LegacyUninstaller(): String;
begin
  Result := LegacyAppDir() + '\unins000.exe';
end;

procedure InitializeWizard();
var Code: Integer; OldStartup: String;
begin
  IsUpdate := ExpandConstant('{param:UPDATE|0}') = '1';
  LegacyInstalled := FileExists(LegacyUninstaller());
  ExtractTemporaryFile('update-host.exe');
  DriverStatus := 2;
  if Exec(ExpandConstant('{tmp}\update-host.exe'), '--probe-driver', '', SW_HIDE, ewWaitUntilTerminated, Code) then
    DriverStatus := Code;
  if (not IsUpdate) and RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', '{#InstallId}RgbService', OldStartup) and (OldStartup <> '') then
    WizardSelectTasks('autostart')
  // Carry the pre-1.0 auto-start choice across the rename.
  else if (not IsUpdate) and RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'OpenHero68RgbService', OldStartup) and (OldStartup <> '') then
    WizardSelectTasks('autostart');
  if (DriverStatus = 2) and (not WizardSilent) then
    SuppressibleMsgBox(CustomMessage('DriverBroken'), mbInformation, MB_OK, IDOK);
#ifdef TestBuild
  // Isolated test builds record task eligibility; production installers do not.
  SaveStringToFile(ExpandConstant('{param:TESTREPORT|{tmp}\driver-test.txt}'), IntToStr(DriverStatus) + '|' + IntToStr(Ord(ShowDriverTask())), False);
#endif
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var Code: Integer;
begin
  Result := '';
  if IsUpdate then exit;
  // The pre-1.0 copy has a different AppId, so Inno would otherwise install
  // beside it and leave two tray apps fighting over the service port.
  if LegacyInstalled then begin
    if not Exec(LegacyUninstaller(), '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_HIDE, ewWaitUntilTerminated, Code) or (Code <> 0) then begin
      Result := CustomMessage('LegacyRemoveFailed');
      exit;
    end;
  end;
  ExtractTemporaryFile('runtime.exe');
  ExtractTemporaryFile('update-worker.cjs');
  if (not Exec(ExpandConstant('{tmp}\runtime.exe'), '"' + ExpandConstant('{tmp}\update-worker.cjs') + '" --stop "' + ExpandConstant('{app}') + '"', '', SW_HIDE, ewWaitUntilTerminated, Code)) or (Code <> 0) then
    Result := CustomMessage('StopFailed');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var Code: Integer; Params: String;
begin
  if (CurStep <> ssPostInstall) or IsUpdate then exit;
  Params := '"' + ExpandConstant('{app}\versions\{#AppVersion}\update-worker.cjs') + '" --activate "' + ExpandConstant('{app}') + '" {#AppVersion}';
  if WizardIsTaskSelected('desktopicon') then Params := Params + ' --desktop';
  if WizardIsTaskSelected('autostart') then Params := Params + ' --autostart';
  if not Exec(ExpandConstant('{app}\versions\{#AppVersion}\runtime.exe'), Params, '', SW_HIDE, ewWaitUntilTerminated, Code) or (Code <> 0) then
    RaiseException('Could not activate installed app');
  if ShowDriverTask() and WizardIsTaskSelected('gamepaddriver') then begin
    ExtractTemporaryFile('ViGEmBus.exe');
    // InstallShield EXE forwards these MSI options; NEVER reboot automatically.
    if ShellExec('runas', ExpandConstant('{tmp}\ViGEmBus.exe'), '/exenoui /qn /norestart', '', SW_HIDE, ewWaitUntilTerminated, Code) then begin
      if (Code = 3010) or (Code = 1641) then
        SuppressibleMsgBox(CustomMessage('DriverReboot'), mbInformation, MB_OK, IDOK)
      else if Code <> 0 then
        SuppressibleMsgBox(CustomMessage('DriverFailed'), mbInformation, MB_OK, IDOK);
    end else SuppressibleMsgBox(CustomMessage('DriverFailed'), mbInformation, MB_OK, IDOK);
  end;
  if not WizardSilent then
    Exec(ExpandConstant('{app}\OpenAula.exe'), '', '', SW_HIDE, ewNoWait, Code);
end;

function InitializeUninstall(): Boolean;
var Code: Integer; Version: AnsiString; Runtime, Worker: String;
begin
  Result := True;
  if LoadStringFromFile(ExpandConstant('{app}\active-version.txt'), Version) then begin
    Runtime := ExpandConstant('{app}\versions\') + Trim(String(Version)) + '\runtime.exe';
    Worker := ExpandConstant('{app}\versions\') + Trim(String(Version)) + '\update-worker.cjs';
    Result := Exec(Runtime, '"' + Worker + '" --stop "' + ExpandConstant('{app}') + '"', '', SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0);
  end;
end;

[UninstallDelete]
Type: files; Name: "{app}\installation.json"
Type: files; Name: "{app}\active-version.txt"
Type: files; Name: "{app}\update-transaction.json"
Type: files; Name: "{app}\updater.lock"
