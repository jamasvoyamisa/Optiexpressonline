; Instalador Agente Optiexpress (bandeja del sistema)
; Compilar con Inno Setup 6: build_installer.bat

#define MyAppName "Agente Optiexpress"
#define MyAppVersion "1.2.9"
#define MyAppPublisher "Optiexpress"
#define MyAppExeName "OptiexpressAgent.exe"
#define MyAppId "{{B8E4F2A1-9C3D-4E5F-A6B7-1D2E3F4A5B6C}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Optiexpress\Agent
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=OptiexpressAgent-Setup-{#MyAppVersion}
SetupIconFile=..\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
; "force" falla en algunos Windows Server / equipos sin Restart Manager
CloseApplications=no
UsePreviousAppDir=yes

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "autostart"; Description: "Iniciar con Windows"; GroupDescription: "Opciones:"; Flags: checkedonce

[Files]
Source: "..\dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\agent_gui.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\config_guard.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\log_setup.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\win_utils.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\config.yaml.example"; DestDir: "{app}"; DestName: "config.yaml"; Flags: onlyifdoesntexist uninsneveruninstall

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "OptiexpressAgent"; ValueData: """{app}\{#MyAppExeName}"""; Tasks: autostart; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Optiexpress\Agent"; ValueType: string; ValueName: "Version"; ValueData: "{#MyAppVersion}"; Flags: uninsdeletekeyifempty
Root: HKCU; Subkey: "Software\Optiexpress\Agent"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekeyifempty

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Iniciar {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill"; Parameters: "/F /IM {#MyAppExeName}"; Flags: runhidden skipifdoesntexist

[Code]
var
  IsUpdate: Boolean;
  PrevVersion: String;

function IsAgentInstalled: Boolean;
var
  S: String;
begin
  Result := False;
  if RegQueryStringValue(HKCU, 'Software\Optiexpress\Agent', 'Version', S) then
  begin
    PrevVersion := S;
    Result := True;
    Exit;
  end;
  if RegQueryStringValue(HKCU, 'Software\Optiexpress\Agent', 'InstallPath', S) then
  begin
    if FileExists(S + '\{#MyAppExeName}') then
    begin
      PrevVersion := '(desconocida)';
      Result := True;
    end;
  end;
end;

function InitializeSetup: Boolean;
begin
  IsUpdate := IsAgentInstalled;
  Result := True;
end;

procedure InitializeWizard;
begin
  if IsUpdate then
    WizardForm.Caption := 'Actualizar {#MyAppName}'
  else
    WizardForm.Caption := 'Instalar {#MyAppName}';
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  Exec('schtasks', '/Delete /TN OptiexpressAgentSync /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill', '/F /IM {#MyAppExeName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(800);
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if (CurPageID = wpWelcome) and IsUpdate then
  begin
    WizardForm.WelcomeLabel2.Caption :=
      'Se actualizará Agente Optiexpress a la versión {#MyAppVersion}.' + #13#10 + #13#10 +
      'Versión actual: ' + PrevVersion + #13#10 + #13#10 +
      'Se conservará config.yaml, logs y datos de checadas pendientes.';
  end;
end;
