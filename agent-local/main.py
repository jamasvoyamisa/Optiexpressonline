#!/usr/bin/env python3
"""
Agente Optiexpress - Motor de sincronización multi-dispositivo.
"""
import yaml
import time
import logging
import sys
from pathlib import Path
from datetime import datetime

from win_utils import init_frozen_windows, should_use_console_logging, remove_console_log_handlers

init_frozen_windows()

from zkteco_client import ZKTecoClient
from cloud_sync import CloudSync
from local_buffer import LocalBuffer
from single_instance import SingleInstanceLock
from log_setup import setup_agent_logging, DEFAULT_RETENTION_DAYS

_handlers = []
if should_use_console_logging():
    _handlers.append(logging.StreamHandler(sys.stdout))
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=_handlers if _handlers else [logging.NullHandler()],
    force=True,
)
if not should_use_console_logging():
    remove_console_log_handlers()
logger = logging.getLogger(__name__)


class DeviceHandler:
    """Maneja la sincronizacion de un dispositivo individual."""

    def __init__(self, name: str, zkteco: ZKTecoClient, cloud: CloudSync, buffer=None):
        self.name = name
        self.zkteco = zkteco
        self.cloud = cloud
        self.buffer = buffer
        self.sync_cycle = 0
        self.synced_checadas_file = f"synced_{name.replace(' ', '_').lower()}.txt"
        self.synced_checadas = self._load_synced_checadas()

    def _load_synced_checadas(self) -> set:
        try:
            p = Path(self.synced_checadas_file)
            if p.exists():
                with open(p, 'r') as f:
                    return set(line.strip() for line in f if line.strip())
            return set()
        except Exception as e:
            logger.warning(f"[{self.name}] No se pudo cargar checadas sincronizadas: {e}")
            return set()

    def _save_synced_checada(self, checada_id: str):
        try:
            with open(self.synced_checadas_file, 'a') as f:
                f.write(f"{checada_id}\n")
        except Exception as e:
            logger.warning(f"[{self.name}] No se pudo guardar checada: {e}")

    def test_device(self) -> bool:
        ok = self.zkteco.test_connection()
        if ok:
            logger.info(f"[{self.name}] Conexion con dispositivo OK")
        else:
            logger.error(f"[{self.name}] No se puede conectar al dispositivo. Verifica IP y puerto.")
        return ok

    def sync_attendance(self):
        try:
            logs = self.zkteco.get_attendance_logs()
            if not logs:
                return

            nuevas = 0
            errores = 0
            for log_entry in logs:
                user_id = log_entry.get("user_id")
                timestamp = log_entry.get("timestamp")
                tipo = log_entry.get("type", "checada")
                if not user_id or not timestamp:
                    continue

                rec_no = log_entry.get("rec_no", "")
                checada_id = f"{user_id}_{rec_no}_{timestamp}" if rec_no else f"{user_id}_{timestamp}_{tipo}"
                if checada_id in self.synced_checadas:
                    continue

                success = self.cloud.sync_attendance(user_id, timestamp, tipo)
                if success:
                    self.synced_checadas.add(checada_id)
                    self._save_synced_checada(checada_id)
                    nuevas += 1
                else:
                    errores += 1
                    if self.buffer:
                        self.buffer.add_checada(user_id, timestamp, "local", tipo)

            if nuevas or errores:
                logger.info(f"[{self.name}] Checadas: {nuevas} sincronizadas, {errores} errores")
        except Exception as e:
            logger.error(f"[{self.name}] Error al sincronizar asistencia: {e}")

    def sync_buffer(self):
        if not self.buffer:
            return
        pendientes = self.buffer.get_pendientes(limit=50)
        if not pendientes:
            return
        logger.info(f"[{self.name}] Sincronizando {len(pendientes)} checadas del buffer")
        for c in pendientes:
            if self.cloud.sync_attendance(c["user_id"], c["timestamp"], c.get("tipo", "checada")):
                self.buffer.mark_synced(c["id"])
            else:
                self.buffer.increment_retry(c["id"])

    def sync_pending_users(self):
        try:
            pending = self.cloud.get_pending_users()
            self.sync_cycle += 1
            if not pending:
                return
            logger.info(f"[{self.name}] Enviando {len(pending)} usuario(s) al dispositivo...")
            sent_ids = []
            for u in pending:
                # Usar pin_checador si existe (único en dispositivo); si no, numero_empleado
                uid = u.get("pin_checador") or u.get("numero_empleado")
                ok = self.zkteco.set_user(user_id=str(uid), name=u.get("nombre", ""))
                if ok:
                    sent_ids.append(u["id"])
                else:
                    logger.warning(f"[{self.name}] set_user fallo: {uid}")
            if sent_ids:
                self.cloud.mark_users_sent(sent_ids)
                logger.info(f"[{self.name}] {len(sent_ids)} usuarios enviados OK")
        except Exception as e:
            logger.error(f"[{self.name}] Error sync_pending_users: {e}")

    def sync_pending_enroll(self):
        try:
            pending = self.cloud.get_pending_enroll()
            if not pending:
                return
            pe = pending[0]
            enroll_id = pe["id"]
            numero = str(pe["numero_empleado"]).strip()
            uid = str(pe.get("pin_checador") or numero).strip()
            logger.info(f"[{self.name}] ENROLL: id={enroll_id}, empleado={numero}, uid_dispositivo={uid}")

            device_users = self.zkteco.get_users()
            if not any(str(u.get("user_id", "")) == uid for u in device_users):
                logger.info(f"[{self.name}] Usuario {uid} no existe en dispositivo, creando...")
                if not self.zkteco.set_user(user_id=uid, name=pe.get("nombre", uid)):
                    logger.error(f"[{self.name}] No se pudo crear usuario {uid}, marcando enroll como fallido")
                    self.cloud.mark_enroll_done(enroll_id, success=False)
                    return

            # Huella ya en el checador pero enroll sigue "pending" en BD (p.ej. falló mark-done con agente viejo).
            # Sin esto, pending[0] bloquea para siempre el resto de la cola.
            ya_registradas = self.zkteco.get_user_templates(user_id=uid)
            if ya_registradas:
                logger.info(
                    f"[{self.name}] ENROLL id={enroll_id}: {uid} ya tiene huella en el dispositivo; "
                    "cerrando cola en servidor y subiendo plantillas."
                )
                self.cloud.mark_enroll_done(enroll_id, success=True)
                for tpl in ya_registradas:
                    self.cloud.upload_template(
                        numero,
                        tpl["finger_index"],
                        tpl["template_data"],
                        pin_checador=uid,
                    )
                return

            logger.info(f"[{self.name}] Iniciando registro de huella para {uid}. Esperando dedo en dispositivo...")
            try:
                ok = self.zkteco.enroll_user(user_id=uid)
            except Exception as enroll_err:
                logger.error(f"[{self.name}] Excepcion en enroll_user: {enroll_err}")
                self.cloud.mark_enroll_done(enroll_id, success=False)
                return

            self.cloud.mark_enroll_done(enroll_id, success=ok)

            if ok:
                logger.info(f"[{self.name}] Huella registrada para {uid} (empleado {numero})")
                for tpl in self.zkteco.get_user_templates(user_id=uid):
                    self.cloud.upload_template(
                        numero,
                        tpl["finger_index"],
                        tpl["template_data"],
                        pin_checador=uid,
                    )
            else:
                logger.warning(f"[{self.name}] Enroll fallo para {uid} (timeout o el empleado no coloco el dedo)")
        except Exception as e:
            logger.error(f"[{self.name}] Error sync_pending_enroll: {e}")
            try:
                if 'enroll_id' in locals():
                    self.cloud.mark_enroll_done(enroll_id, success=False)
            except Exception:
                pass

    def sync_device_templates_to_backend(self):
        try:
            device_users = self.zkteco.get_users()
            if not device_users:
                return
            pin_to_numero = self.cloud.get_pin_to_numero()
            uploaded = 0
            for u in device_users:
                pin = str(u.get("user_id", "")).strip()
                if not pin:
                    continue
                # El dispositivo guarda user_id=pin (1,2,3); necesitamos numero_empleado (124) para el backend.
                # Si el pin no está mapeado, no usar el pin como número (genera 404 en upload-template).
                if pin not in pin_to_numero:
                    continue
                numero = pin_to_numero[pin]
                if self.cloud.get_employee_templates(numero, pin_checador=pin):
                    continue
                templates = self.zkteco.get_user_templates(user_id=pin)
                if not templates:
                    continue
                for tpl in templates:
                    self.cloud.upload_template(
                        numero,
                        tpl["finger_index"],
                        tpl["template_data"],
                        pin_checador=pin,
                    )
                    uploaded += 1
            if uploaded:
                logger.info(f"[{self.name}] {uploaded} huella(s) sincronizadas al backend")
        except Exception as e:
            logger.error(f"[{self.name}] Error sync_device_templates: {e}")

    def sync_pending_replicate(self):
        """Replica huellas almacenadas en el backend hacia este dispositivo."""
        try:
            pending = self.cloud.get_pending_replicate()
            if not pending:
                return

            # Agrupar por id de replicacion (puede haber varios dedos por empleado)
            from collections import defaultdict
            by_id = defaultdict(list)
            for item in pending:
                by_id[item["id"]].append(item)

            for replicate_id, items in by_id.items():
                uid = str(items[0]["user_id"]).strip()
                nombre = (items[0].get("nombre") or uid)[:24]
                logger.info(f"[{self.name}] REPLICATE id={replicate_id} empleado={items[0]['numero_empleado']} uid={uid} dedos={len(items)}")

                device_users = self.zkteco.get_users()
                if not any(str(u.get("user_id", "")) == uid for u in device_users):
                    logger.info(f"[{self.name}] Usuario {uid} no existe en dispositivo, creando...")
                    if not self.zkteco.set_user(user_id=uid, name=nombre):
                        logger.error(f"[{self.name}] No se pudo crear usuario {uid} para replicar huella")
                        self.cloud.mark_replicate_done(replicate_id, success=False)
                        continue

                ok_count = 0
                for item in items:
                    finger = item["finger_index"]
                    tpl_data = item["template_data"]
                    ok = self.zkteco.upload_template(uid, finger, tpl_data)
                    if ok:
                        ok_count += 1
                        logger.info(f"[{self.name}] Huella replicada: uid={uid} dedo={finger}")
                    else:
                        logger.warning(f"[{self.name}] Fallo replicar huella: uid={uid} dedo={finger}")

                success = ok_count > 0
                self.cloud.mark_replicate_done(replicate_id, success=success)
                if success:
                    logger.info(f"[{self.name}] Replicacion {replicate_id}: {ok_count}/{len(items)} huellas OK")
                else:
                    logger.warning(f"[{self.name}] Replicacion {replicate_id} fallida completamente")
        except Exception as e:
            logger.error(f"[{self.name}] Error sync_pending_replicate: {e}")

    def sync_pending_deletes(self):
        try:
            pending = self.cloud.get_pending_deletes()
            if not pending:
                return
            for pd in pending:
                delete_id = pd["id"]
                numero = str(pd["numero_empleado"]).strip()
                uid = str(pd.get("pin_checador") or numero).strip()
                logger.info(f"[{self.name}] Eliminando usuario {uid} (empleado {numero}) del dispositivo...")
                ok = self.zkteco.delete_user(user_id=uid)
                if ok:
                    self.cloud.mark_delete_done(delete_id)
                    logger.info(f"[{self.name}] Usuario {uid} eliminado OK")
                else:
                    logger.warning(f"[{self.name}] No se pudo eliminar usuario {uid}")
        except Exception as e:
            logger.error(f"[{self.name}] Error sync_pending_deletes: {e}")

    def sync_pending_templates(self):
        try:
            pending = self.cloud.get_pending_templates()
            if not pending:
                return
            from collections import defaultdict
            by_numero = defaultdict(list)
            for tpl in pending:
                by_numero[(tpl.get("numero_empleado") or "").strip()].append(tpl)

            # Usuarios actualmente en el dispositivo (para crear los que falten)
            device_users = self.zkteco.get_users()
            existing_uids = {str(u.get("user_id", "")).strip() for u in device_users}

            for numero, templates in by_numero.items():
                if not numero:
                    continue
                user_id = str(templates[0].get("user_id") or templates[0].get("numero_empleado") or numero).strip()
                nombre = (templates[0].get("nombre") or user_id)[:24]

                # Crear el usuario en el dispositivo si no existe: sin usuario no se puede subir huella.
                if user_id not in existing_uids:
                    if not self.zkteco.set_user(user_id=user_id, name=nombre):
                        logger.warning(f"[{self.name}] No se pudo crear usuario {user_id} antes de subir huella")
                        continue
                    logger.info(f"[{self.name}] Usuario creado en dispositivo: {user_id}")
                    existing_uids.add(user_id)
                    fingers_en_dispositivo = set()
                else:
                    # Dedos que ya tiene el dispositivo: evita re-subir en cada ciclo (bucle infinito).
                    fingers_en_dispositivo = {
                        t.get("finger_index")
                        for t in self.zkteco.get_user_templates(user_id=user_id)
                    }

                for tpl in templates:
                    finger = tpl["finger_index"]
                    if finger in fingers_en_dispositivo:
                        continue  # La huella ya está en el dispositivo, no re-subir.
                    ok = self.zkteco.upload_template(user_id, finger, tpl["template_data"])
                    if ok:
                        logger.info(f"[{self.name}] Huella subida: {user_id} dedo={finger}")
                        fingers_en_dispositivo.add(finger)
                    else:
                        logger.warning(f"[{self.name}] Fallo subir huella: {user_id}")
        except Exception as e:
            logger.error(f"[{self.name}] Error sync_pending_templates: {e}")

    def sync_device_users_to_backend(self):
        """
        Lee todos los usuarios del reloj y los reporta al backend.
        El servidor los registra en Actividad (categoría checador) y en agent.log (logger checador).
        Se ejecuta una vez al iniciar y luego cada ~6 horas.
        """
        checador_log = logging.getLogger("checador")
        try:
            raw_users = self.zkteco.get_users()
            payload = [
                {"pin": u.get("user_id", ""), "nombre": u.get("name", "") or None}
                for u in (raw_users or [])
                if u.get("user_id")
            ]
            if not payload:
                checador_log.warning(
                    f"[{self.name}] No se leyeron usuarios del reloj; se reporta lista vacía al backend"
                )
            else:
                checador_log.info(f"[{self.name}] Reportando {len(payload)} usuario(s) del reloj al backend...")
            result = self.cloud.report_device_users(payload)
            if result.get("sin_mapeo", 0) > 0:
                desconocidos = result.get("desconocidos", [])
                checador_log.warning(
                    f"[{self.name}] {result['sin_mapeo']} usuario(s) del reloj sin empleado mapeado: "
                    + ", ".join(
                        f"PIN={d.get('pin')}({d.get('nombre') or '?'})" for d in desconocidos
                    )
                )
            elif result:
                checador_log.info(
                    f"[{self.name}] Sincronización de usuarios OK "
                    f"({result.get('reconocidos', 0)}/{result.get('total_en_reloj', 0)} reconocidos)"
                )
        except Exception as e:
            checador_log.error(f"[{self.name}] Error al sincronizar usuarios del reloj: {e}")


class Agent:
    """Agente multi-dispositivo que coordina la sincronizacion."""

    def __init__(self, config_path: str = "config.yaml"):
        self.config = self._load_config(config_path)
        self._setup_logging()
        self.running = True
        self.handlers = []
        self._init_devices()
        from cloud_sync import AGENT_VERSION
        logger.info(f"Optiexpress Agent v{AGENT_VERSION}")

    def _load_config(self, config_path: str) -> dict:
        try:
            with open(config_path, 'r') as f:
                config = yaml.safe_load(f)
            logger.info(f"Configuracion cargada desde {config_path}")
            return config
        except FileNotFoundError:
            logger.error(f"Archivo no encontrado: {config_path}")
            logger.error("Copia config.yaml.example a config.yaml y configuralo")
            sys.exit(1)
        except Exception as e:
            logger.error(f"Error al cargar configuracion: {e}")
            sys.exit(1)

    def _setup_logging(self):
        log_config = self.config.get("logging", {})
        level_name = log_config.get("level", "INFO")
        log_file = log_config.get("file", "agent.log")
        retention = int(log_config.get("retention_days", DEFAULT_RETENTION_DAYS))
        level = getattr(logging, level_name, logging.INFO)
        setup_agent_logging(
            log_file,
            retention_days=retention,
            level=level,
            console=should_use_console_logging(),
        )

    def _init_devices(self):
        api_url = self.config.get("api_url", "").strip()
        buffer_enabled = self.config.get("buffer", {}).get("enabled", True)

        # Soporte formato viejo (device singular) y nuevo (devices lista)
        devices_cfg = self.config.get("devices", [])
        if not devices_cfg:
            old_device = self.config.get("device", {})
            old_cloud = self.config.get("cloud", {})
            if old_device.get("ip"):
                devices_cfg = [{
                    "name": old_cloud.get("device_id", "Dispositivo"),
                    "ip": old_device["ip"],
                    "port": old_device.get("port", 4370),
                    "api_key": old_cloud.get("api_key", ""),
                }]
                if not api_url:
                    api_url = old_cloud.get("api_url", "")

        if not devices_cfg:
            logger.error("No hay dispositivos configurados. Agrega al menos uno en config.yaml")
            sys.exit(1)

        seen_devices: set = set()  # Para detectar duplicados (ip:puerto:api_key)

        for i, dev in enumerate(devices_cfg):
            name = dev.get("name", f"Dispositivo_{i+1}")
            ip = dev.get("ip", "").strip()
            port = int(dev.get("port", 4370))
            api_key = (dev.get("api_key") or "").strip()

            if not ip:
                logger.warning(f"[{name}] Sin IP configurada, omitiendo")
                continue
            if not api_key or api_key == "COPIAR_DE_LA_WEB":
                logger.warning(f"[{name}] API Key no configurada, omitiendo")
                continue

            # Detectar dispositivo duplicado en config.yaml
            device_key = f"{ip}:{port}:{api_key}"
            if device_key in seen_devices:
                logger.error(
                    f"[{name}] DISPOSITIVO DUPLICADO detectado en config.yaml: "
                    f"{ip}:{port} con la misma API Key ya está configurado. "
                    "Esto causa que cada checada se envíe dos veces al servidor. "
                    "Elimina la entrada duplicada de config.yaml."
                )
                continue
            seen_devices.add(device_key)

            zkteco = ZKTecoClient(ip=ip, port=port, timeout=dev.get("timeout", 5))
            cloud = CloudSync(api_url=api_url, api_key=api_key, device_id=name)
            buffer = LocalBuffer(f"buffer_{name.replace(' ', '_').lower()}.db") if buffer_enabled else None

            handler = DeviceHandler(name=name, zkteco=zkteco, cloud=cloud, buffer=buffer)
            self.handlers.append(handler)
            logger.info(f"[{name}] Configurado: {ip}:{port}")

        if not self.handlers:
            logger.error("Ningun dispositivo valido configurado. Verifica config.yaml")
            sys.exit(1)

        logger.info(f"Total: {len(self.handlers)} dispositivo(s) configurado(s)")

    def run(self):
        logger.info("=" * 60)
        logger.info(f"Agente Multi-Dispositivo iniciando ({len(self.handlers)} dispositivo(s))")
        logger.info("=" * 60)

        active_handlers = []
        for h in self.handlers:
            if h.test_device():
                active_handlers.append(h)

        if not active_handlers:
            logger.error("Ningun dispositivo responde. Verifica IPs y que esten en la misma red.")
            return

        logger.info(f"{len(active_handlers)} de {len(self.handlers)} dispositivo(s) activo(s)")

        for h in self.handlers:
            if h.cloud.test_connection():
                h.cloud.log_backend_device_binding(h.name)
            else:
                logger.warning(
                    f"[{h.name}] Sin conexion al backend; no se puede comprobar a que dispositivo pertenece la API Key"
                )

        for h in active_handlers:
            if h.cloud.test_connection():
                logger.info(f"[{h.name}] Sincronizacion inicial de huellas...")
                h.sync_device_templates_to_backend()
                logger.info(f"[{h.name}] Reporte inicial de usuarios del reloj...")
                h.sync_device_users_to_backend()

        interval = self.config.get("sync", {}).get("interval_seconds", 30)
        logger.info(f"Ciclo de sincronizacion: cada {interval} segundos")
        template_sync_counter = 0
        template_sync_every = max(1, 300 // interval)
        # Reporte de usuarios del reloj cada 6 horas
        USER_SYNC_SECONDS = 6 * 3600
        user_sync_counter = 0
        user_sync_every = max(1, USER_SYNC_SECONDS // interval)

        try:
            while self.running:
                for h in active_handlers:
                    tag = h.name
                    try:
                        has_cloud = h.cloud.test_connection()
                        if has_cloud:
                            h.sync_pending_users()
                            h.sync_pending_enroll()
                            h.sync_pending_replicate()
                            h.sync_pending_templates()
                            h.sync_pending_deletes()

                        h.sync_attendance()

                        if has_cloud:
                            h.sync_buffer()
                    except Exception as e:
                        logger.error(f"[{tag}] Error en ciclo: {e}")

                template_sync_counter += 1
                if template_sync_counter >= template_sync_every:
                    for h in active_handlers:
                        try:
                            if h.cloud.test_connection():
                                h.sync_device_templates_to_backend()
                        except Exception as e:
                            logger.error(f"[{h.name}] Error sync templates: {e}")
                    template_sync_counter = 0

                user_sync_counter += 1
                if user_sync_counter >= user_sync_every:
                    for h in active_handlers:
                        try:
                            if h.cloud.test_connection():
                                h.sync_device_users_to_backend()
                        except Exception as e:
                            logger.error(f"[{h.name}] Error sync usuarios reloj: {e}")
                    user_sync_counter = 0

                time.sleep(interval)

        except KeyboardInterrupt:
            logger.info("Deteniendo agente...")
            self.running = False
        except Exception as e:
            logger.error(f"Error en loop principal: {e}")
            raise


def main():
    lock = SingleInstanceLock("optiexpress-agent")
    if not lock.acquire():
        logger.error(
            "No se inicia el agente porque ya hay otra instancia corriendo. "
            "Cierra la otra instancia antes de volver a ejecutar."
        )
        sys.exit(1)
    try:
        config_path = sys.argv[1] if len(sys.argv) > 1 else "config.yaml"
        agent = Agent(config_path)
        agent.run()
    finally:
        lock.release()


if __name__ == "__main__":
    main()
