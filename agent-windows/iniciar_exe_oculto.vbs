' Lanza AgenteZKTeco.exe sin ventana de consola (para tarea al iniciar sesion).
Option Explicit
Dim fso, sh, dir, exe
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("Wscript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
exe = dir & "\AgenteZKTeco.exe"
If Not fso.FileExists(exe) Then WScript.Quit 1
sh.CurrentDirectory = dir
sh.Run """" & exe & """", 0, False
