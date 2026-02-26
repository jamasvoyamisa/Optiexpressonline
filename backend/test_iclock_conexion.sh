#!/bin/bash
# Script para probar si el servidor recibe peticiones iClock
# Ejecutar desde otra máquina en la red (o desde la misma)
#
# Uso: ./test_iclock_conexion.sh [IP] [SN]
# Ejemplo: ./test_iclock_conexion.sh 192.168.2.55 DGD919000012345

IP="${1:-192.168.2.55}"
SN="${2:-TEST123}"
URL="http://${IP}:9081/iclock/getrequest?SN=${SN}"

echo "=== Prueba de conexión iClock ==="
echo "Servidor: $IP:9081"
echo "URL: $URL"
echo ""

echo "1. Probando si el servidor responde..."
if curl -s -o /dev/null -w "%{http_code}" "$URL" | grep -q "200"; then
    echo "   ✅ El servidor responde (HTTP 200)"
    RESP=$(curl -s "$URL")
    echo "   Respuesta: $RESP"
else
    echo "   ❌ El servidor NO responde. Posibles causas:"
    echo "      - Backend no está corriendo (¿python main.py o uvicorn?)"
    echo "      - Firewall bloqueando puerto 9081"
    echo "      - IP incorrecta o máquina inalcanzable"
fi

echo ""
echo "2. Si el servidor responde pero el dispositivo no conecta:"
echo "   - Verifica en el dispositivo: Server Address = ${IP}, Puerto = 9081"
echo "   - Reinicia el dispositivo después de cambiar la config"
echo "   - El dispositivo debe estar en la red 192.168.2.x (o poder alcanzar $IP)"
