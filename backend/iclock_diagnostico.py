#!/usr/bin/env python3
"""
Servidor de DIAGNÓSTICO mínimo para ZKTeco ADMS.
Sin base de datos. Solo registra TODAS las peticiones y responde OK.

Uso: python iclock_diagnostico.py [puerto]
Ejemplo: python iclock_diagnostico.py 8081

Si el dispositivo ZKTeco conecta, verás las peticiones en consola.
Si NO ves nada → el problema es red o configuración del dispositivo.
"""
import sys
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9081  # 9081 por defecto para no chocar con backend (8081)


class IClockHandler(BaseHTTPRequestHandler):
    def log_request(self, code="-", size="-"):
        pass  # Evitar log duplicado

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)
        client_ip = self.client_address[0]

        print(f"\n{'='*60}")
        print(f"[{datetime.now().isoformat()}] GET {self.path}")
        print(f"  Cliente: {client_ip}")
        print(f"  Path: {path}")
        print(f"  Params: {params}")

        if path == "/iclock/getrequest" or path == "/getrequest":
            sn = (params.get("SN", [None]) or params.get("sn", [None]) or [None])[0]
            print(f"  >>> DISPOSITIVO DETECTADO: SN={sn}")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"OK")
        else:
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"OK")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)
        client_ip = self.client_address[0]
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8", errors="ignore") if content_length else ""

        print(f"\n{'='*60}")
        print(f"[{datetime.now().isoformat()}] POST {self.path}")
        print(f"  Cliente: {client_ip}")
        print(f"  Path: {path}")
        print(f"  Params: {params}")
        if body:
            print(f"  Body: {body[:500]}...")

        if "/iclock/cdata" in path or path == "/cdata":
            sn = (params.get("SN", [None]) or params.get("sn", [None]) or [None])[0]
            table = (params.get("table", [None]) or [None])[0]
            print(f"  >>> CDATA DISPOSITIVO: SN={sn}, table={table}")

        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"OK")


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), IClockHandler)
    print(f"\n*** Servidor diagnóstico iClock en puerto {PORT} ***")
    print(f"URL: http://0.0.0.0:{PORT}/iclock/getrequest")
    print(f"Configura el dispositivo: IP=192.168.2.55, Puerto={PORT}")
    print(f"(Puerto por defecto 9081; pasa otro como argumento si necesitas)")
    print(f"Esperando peticiones... (Ctrl+C para salir)\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDetenido.")
        server.shutdown()
