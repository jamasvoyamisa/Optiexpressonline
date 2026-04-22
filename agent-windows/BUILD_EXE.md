# Compilar EXE del agente (Windows)

Este proyecto ya trae el código corregido para usar `POST` en:
- `/agent/pending-users/mark-sent`
- `/agent/pending-enroll/{id}/mark-done`

## Pasos

1. Abrir `cmd` en la carpeta `agent-windows`.
2. Ejecutar:

```bat
install.bat
build_exe.bat
```

3. Los ejecutables quedan en:
- `dist\AgenteZKTeco.exe` (consola)
- `dist\AgenteZKTecoGUI.exe` (interfaz)

## Despliegue recomendado en la PC de Optishop

1. Detener la tarea/servicio actual del agente.
2. Reemplazar el ejecutable viejo por el nuevo.
3. Copiar `config.yaml` en la misma carpeta del `.exe`.
4. Iniciar el agente.
5. Verificar en VPS que ya no aparezcan `405` en:
   - `GET /agent/pending-users/mark-sent`
   - `GET /agent/pending-enroll/.../mark-done`

Debe verse `POST ... 200`.
