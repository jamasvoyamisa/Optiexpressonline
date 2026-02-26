# Contrato API Asistencia

Los schemas del backend deben coincidir con `frontend/src/types/api.ts`.

## DispositivoCreate (POST /asistencia/devices)
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| nombre | string | Sí | Nombre del dispositivo |
| ubicacion | string \| null | No | Sucursal/ubicación |
| serial_number | string \| null | No | SN para ZKTeco ADMS (requerido para push) |

## DispositivoResponse
| Campo | Tipo |
|-------|------|
| id | number |
| nombre | string |
| ip_local | string \| null |
| ubicacion | string \| null |
| serial_number | string \| null |
| api_key | string |
| activo | boolean |
| created_at | string |
| updated_at | string \| null |
