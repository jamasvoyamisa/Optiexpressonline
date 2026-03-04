# Agente ZKTeco - Inicio Automatico en Windows

Este documento explica como hacer que el agente inicie **automaticamente al
encender la PC**, sin intervencion humana. El agente corre en segundo plano
(sin ventana) y se puede verificar desde la web.

La unica intervencion manual necesaria es la configuracion inicial
(editar `config.yaml` con la IP del dispositivo y la API Key).

---

## Requisitos previos (una sola vez)

1. Copiar la carpeta `agent-local` completa a la PC. Ejemplo:
   `C:\AgenteZKTeco\agent-local`

2. Ejecutar `install.bat` (doble clic). Esto crea el entorno virtual e
   instala las dependencias de Python.

3. Editar `config.yaml` con los datos reales:
   - `api_url`: URL del servidor backend
   - `devices`: IP, puerto y API Key de cada checador

4. Probar que funciona ejecutando `run.bat` (doble clic). Deben aparecer
   logs de sincronizacion. Cerrar con Ctrl+C.

---

## Configurar inicio automatico

### Opcion A: Ejecutar el script automatico (recomendado)

Ejecutar `instalar_autoinicio.bat` como **Administrador**:

1. Clic derecho sobre `instalar_autoinicio.bat`
2. Seleccionar "Ejecutar como administrador"
3. Listo. El agente se iniciara automaticamente en cada arranque.

Este script crea una Tarea Programada en Windows que:
- Inicia al encender el equipo (no requiere inicio de sesion)
- Corre en segundo plano (sin ventana)
- Se reinicia si falla (cada 1 minuto, hasta 3 intentos)

### Opcion B: Manual con Programador de Tareas

Si prefieres hacerlo a mano:

1. Abrir **Programador de tareas** (buscar en menu Inicio).
2. Panel derecho: clic en **Crear tarea** (NO "Crear tarea basica").
3. Pestana **General**:
   - Nombre: `AgenteZKTeco`
   - Marcar: "Ejecutar tanto si el usuario inicio sesion como si no"
   - Marcar: "Ejecutar con los privilegios mas altos"
4. Pestana **Desencadenadores** > Nuevo:
   - Iniciar la tarea: "Al iniciar el sistema"
   - Retrasar la tarea durante: 30 segundos (da tiempo a la red)
5. Pestana **Acciones** > Nueva:
   - Programa: `C:\AgenteZKTeco\agent-local\venv\Scripts\pythonw.exe`
   - Argumentos: `main.py`
   - Iniciar en: `C:\AgenteZKTeco\agent-local`
6. Pestana **Configuracion**:
   - Marcar: "Si se produce un error, reiniciar cada: 1 minuto"
   - Intentos de reinicio: 3
   - Desmarcar: "Detener la tarea si se ejecuta durante mas de..."
7. Aceptar (pedira la contrasena del usuario de Windows).

---

## Verificar que funciona

1. **Reiniciar la PC** y NO tocar nada.

2. Despues de ~1 minuto, verificar de cualquiera de estas formas:

   a) **Desde la web**: Ir a Configuracion > Dispositivos. La tarjeta debe
      mostrar "Ultima sincronizacion" con fecha/hora reciente.

   b) **Revisar el log**: Abrir `agent.log` en la carpeta del agente.
      Debe tener lineas recientes de sincronizacion.

   c) **Administrador de tareas**: Presionar Ctrl+Shift+Esc. En la pestana
      "Detalles", buscar `pythonw.exe`. Si aparece, el agente esta corriendo.

---

## Detener el agente (si es necesario)

- Abrir Administrador de tareas > Detalles > buscar `pythonw.exe` > Finalizar tarea
- O desde CMD como administrador: `taskkill /F /IM pythonw.exe`

## Desinstalar el inicio automatico

- Abrir Programador de tareas > Buscar "AgenteZKTeco" > Clic derecho > Eliminar
- O ejecutar como administrador: `schtasks /Delete /TN "AgenteZKTeco" /F`

---

## Resumen

| Paso | Accion | Frecuencia |
|------|--------|------------|
| 1 | Copiar carpeta y ejecutar `install.bat` | Una vez |
| 2 | Editar `config.yaml` | Una vez (o al agregar dispositivos) |
| 3 | Ejecutar `instalar_autoinicio.bat` como admin | Una vez |
| 4 | Reiniciar PC | El agente inicia solo cada vez |
