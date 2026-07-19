#!/bin/bash
# Checklist de humo post-deploy para los fixes de seguridad
# (ver plan "Impacto de los fixes de seguridad y estrategia de despliegue", paso 5).
#
# Para cada endpoint tocado por los Lotes 1-4, confirma con curl que:
#   - SIN token responde 401 donde ahora debe exigirse autenticación.
#   - CON token válido (de un usuario Administrador) responde 200, igual que antes.
#   - Las descargas funcionan con el JWT en el header Authorization (Lote 4).
#
# No crea, modifica ni borra ningún dato: solo peticiones GET (y un login).
#
# Uso:
#   BASE_URL=https://intranetoptiexpress.net/api/v1 \
#   SMOKE_USER='admin_o_numero_empleado' SMOKE_PASS='contraseña' \
#   ./scripts/smoke-test-post-deploy.sh
#
# Contra el servidor de pruebas local (ver scripts/deploy-test.sh):
#   BASE_URL=http://10.10.20.9:9081/api/v1 SMOKE_USER=... SMOKE_PASS=... \
#   ./scripts/smoke-test-post-deploy.sh
#
# Opcional, para además probar el caso de IDOR corregido en Lote 3 (un empleado
# normal NO debe poder ver la solicitud de vacaciones de otro):
#   SMOKE_EMPLOYEE_USER=... SMOKE_EMPLOYEE_PASS=... SMOKE_OTRO_SOLICITUD_ID=123
set -uo pipefail

BASE_URL="${BASE_URL:-https://intranetoptiexpress.net/api/v1}"
SMOKE_USER="${SMOKE_USER:-}"
SMOKE_PASS="${SMOKE_PASS:-}"

if [ -z "$SMOKE_USER" ] || [ -z "$SMOKE_PASS" ]; then
  echo "Faltan SMOKE_USER / SMOKE_PASS (credenciales de un usuario Administrador/RH ya existente)." >&2
  echo "Uso: SMOKE_USER=... SMOKE_PASS=... ./scripts/smoke-test-post-deploy.sh" >&2
  exit 2
fi

PASS_COUNT=0
FAIL_COUNT=0

# check DESCRIPCION METODO RUTA ESPERADO(S, separados por "|") [HEADER_AUTH]
check() {
  local desc="$1" metodo="$2" ruta="$3" esperados="$4" auth="${5:-}"
  local args=(-s -o /dev/null -w "%{http_code}" -X "$metodo" "$BASE_URL$ruta")
  if [ -n "$auth" ]; then
    args+=(-H "Authorization: Bearer $auth")
  fi
  local code
  code="$(curl "${args[@]}" 2>/dev/null || echo "000")"
  local esperado
  IFS='|' read -ra _esperados <<< "$esperados"
  for esperado in "${_esperados[@]}"; do
    if [ "$code" = "$esperado" ]; then
      printf '  OK   [%s] %-60s (HTTP %s)\n' "$metodo" "$desc" "$code"
      PASS_COUNT=$((PASS_COUNT + 1))
      return
    fi
  done
  printf '  FAIL [%s] %-60s (HTTP %s, se esperaba %s)\n' "$metodo" "$desc" "$code" "$esperados"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

echo "=== Smoke test post-deploy contra $BASE_URL ==="

echo ""
echo "--- Login (Lote 1: rate limit + verificación de password) ---"
LOGIN_BODY="$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$SMOKE_USER\",\"password\":\"$SMOKE_PASS\"}")"
TOKEN="$(echo "$LOGIN_BODY" | grep -o '"access_token"[[:space:]]*:[[:space:]]*"[^"]*"' | sed -E 's/.*:"([^"]*)"/\1/')"
if [ -z "$TOKEN" ]; then
  echo "  FAIL login con SMOKE_USER — no se obtuvo access_token. Respuesta: $LOGIN_BODY"
  echo ""
  echo "Login roto: no se pueden correr el resto de checks. Revisar antes de continuar."
  exit 1
fi
echo "  OK   login correcto, token obtenido."
PASS_COUNT=$((PASS_COUNT + 1))

echo ""
echo "--- Lote 2/3: personal / rh (antes sin auth, ahora requieren token) ---"
check "GET /personal/empresas sin token -> 401"        GET "/personal/empresas" 401
check "GET /personal/empresas con token -> 200"        GET "/personal/empresas" 200 "$TOKEN"
check "GET /personal/empleados sin token -> 401"        GET "/personal/empleados" 401
check "GET /personal/empleados con token -> 200"        GET "/personal/empleados" 200 "$TOKEN"
check "GET /personal/roles con token -> 200"            GET "/personal/roles" 200 "$TOKEN"
check "GET /rh/tipos-documento sin token -> 401"        GET "/rh/tipos-documento" 401
check "GET /rh/tipos-documento con token -> 200/403*"   GET "/rh/tipos-documento" "200|403" "$TOKEN"

echo ""
echo "--- Lote 2: dispositivos biométricos (solo Administrador/Superuser) ---"
check "GET /asistencia/devices sin token -> 401"        GET "/asistencia/devices" 401
check "GET /asistencia/devices con token -> 200/403*"   GET "/asistencia/devices" "200|403" "$TOKEN"

echo ""
echo "--- Lote 3: incapacidades (solo Administrador/RH) ---"
check "GET /incapacidades sin token -> 401"             GET "/incapacidades" 401
check "GET /incapacidades con token -> 200/403*"        GET "/incapacidades" "200|403" "$TOKEN"

echo ""
echo "--- Lote 4: descargas (JWT por header, ya no por query) ---"
check "GET plantilla import sin token -> 401"           GET "/personal/importar/plantilla" 401
check "GET plantilla import con header Authorization -> 200/403*" GET "/personal/importar/plantilla" "200|403" "$TOKEN"

if [ -n "${SMOKE_EMPLOYEE_USER:-}" ] && [ -n "${SMOKE_EMPLOYEE_PASS:-}" ]; then
  echo ""
  echo "--- Lote 3: IDOR en vacaciones (empleado normal NO debe ver solicitudes de otros) ---"
  EMP_LOGIN_BODY="$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$SMOKE_EMPLOYEE_USER\",\"password\":\"$SMOKE_EMPLOYEE_PASS\"}")"
  EMP_TOKEN="$(echo "$EMP_LOGIN_BODY" | grep -o '"access_token"[[:space:]]*:[[:space:]]*"[^"]*"' | sed -E 's/.*:"([^"]*)"/\1/')"
  if [ -z "$EMP_TOKEN" ]; then
    echo "  FAIL login con SMOKE_EMPLOYEE_USER — no se obtuvo access_token."
    FAIL_COUNT=$((FAIL_COUNT + 1))
  elif [ -n "${SMOKE_OTRO_SOLICITUD_ID:-}" ]; then
    check "GET /vacaciones/solicitudes/{id de otro empleado} -> 403/404" \
      GET "/vacaciones/solicitudes/$SMOKE_OTRO_SOLICITUD_ID" "403|404" "$EMP_TOKEN"
  else
    echo "  (Define SMOKE_OTRO_SOLICITUD_ID con el id de una solicitud de OTRO empleado para probar el bloqueo de IDOR.)"
  fi
fi

echo ""
echo "=== Resumen: $PASS_COUNT OK, $FAIL_COUNT FAIL ==="
echo "* Donde se marca 200/403: 200 si SMOKE_USER es Administrador/Superuser; 403 si"
echo "  solo tiene un rol intermedio. Un FAIL real aquí sería 401 (token válido rechazado)"
echo "  o 500 (endpoint roto), no 403 con un usuario sin ese rol."
echo ""
echo "Revisa también, en el VPS, los primeros 30-60 min tras el deploy:"
echo "  ssh -i \$SSH_KEY \$VPS 'journalctl -u optiexpress-backend -f'"
echo "  y compara actividad_log (401/403) contra la línea base de precheck_seguridad_deploy.py"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
