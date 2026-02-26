#!/usr/bin/env python3
"""
Agente Local para sincronizar dispositivo ZKTeco MB160 con sistema en la nube
"""
import yaml
import time
import logging
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional

from zkteco_client import ZKTecoClient
from cloud_sync import CloudSync
from local_buffer import LocalBuffer

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


class Agent:
    """Agente principal que coordina la sincronización"""

    def __init__(self, config_path: str = "config.yaml"):
        self.config = self._load_config(config_path)
        self._setup_logging()

        # Inicializar clientes
        device_config = self.config["device"]
        self.zkteco_client = ZKTecoClient(
            ip=device_config["ip"],
            port=device_config.get("port", 4370),
            timeout=device_config.get("timeout", 5)
        )

        cloud_config = self.config["cloud"]
        self.cloud_sync = CloudSync(
            api_url=cloud_config["api_url"],
            api_key=cloud_config["api_key"],
            device_id=cloud_config["device_id"]
        )

        # Inicializar buffer si está habilitado
        self.buffer = None
        if self.config.get("buffer", {}).get("enabled", True):
            buffer_path = self.config.get("buffer", {}).get("db_path", "buffer.db")
            self.buffer = LocalBuffer(buffer_path)

        self.last_sync_index = 0
        self.running = True
        self.synced_checadas_file = "synced_checadas.txt"
        self.synced_checadas = self._load_synced_checadas()

    def _load_config(self, config_path: str) -> dict:
        """Carga la configuración desde archivo YAML"""
        try:
            with open(config_path, 'r') as f:
                config = yaml.safe_load(f)
            logger.info(f"Configuración cargada desde {config_path}")
            return config
        except FileNotFoundError:
            logger.error(f"Archivo de configuración no encontrado: {config_path}")
            logger.error("Por favor, copia config.yaml.example a config.yaml y configúralo")
            sys.exit(1)
        except Exception as e:
            logger.error(f"Error al cargar configuración: {e}")
            sys.exit(1)

    def _setup_logging(self):
        """Configura el logging según la configuración"""
        log_config = self.config.get("logging", {})
        level = log_config.get("level", "INFO")
        log_file = log_config.get("file")

        logging.getLogger().setLevel(getattr(logging, level))

        if log_file:
            file_handler = logging.FileHandler(log_file)
            file_handler.setFormatter(
                logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            )
            logging.getLogger().addHandler(file_handler)

    def _load_synced_checadas(self) -> set:
        """Carga las checadas ya sincronizadas desde archivo"""
        try:
            synced_file = Path(self.synced_checadas_file)
            if synced_file.exists():
                with open(synced_file, 'r') as f:
                    return set(line.strip() for line in f if line.strip())
            return set()
        except Exception as e:
            logger.warning(f"No se pudo cargar checadas sincronizadas: {e}")
            return set()

    def _save_synced_checada(self, checada_id: str):
        """Guarda una checada sincronizada en archivo"""
        try:
            synced_file = Path(self.synced_checadas_file)
            with open(synced_file, 'a') as f:
                f.write(f"{checada_id}\n")
        except Exception as e:
            logger.warning(f"No se pudo guardar checada sincronizada: {e}")

    def sync_new_attendance(self):
        """Sincroniza nuevas checadas del dispositivo"""
        try:
            logger.info("")
            logger.info("=" * 60)
            logger.info(f"🔄 [{datetime.now().strftime('%H:%M:%S')}] Iniciando sincronización")
            logger.info(f"   Checadas ya sincronizadas: {len(self.synced_checadas)}")
            logger.info("=" * 60)

            logs = self.zkteco_client.get_attendance_logs()

            if not logs:
                logger.info("")
                logger.info("ℹ️ RESULTADO: No hay checadas en el dispositivo")
                logger.info("   💡 Para ver datos: Haz una checada en el dispositivo físico")
                logger.info("")
                return

            logger.info(f"📥 Obtenidas {len(logs)} checadas del dispositivo ZKTeco")

            sincronizadas = 0
            errores = 0

            for i, log in enumerate(logs, 1):
                user_id = log.get("user_id")
                timestamp = log.get("timestamp")
                tipo = log.get("type", "entrada")

                if not user_id or not timestamp:
                    logger.warning(f"⚠️ Checada incompleta, omitiendo: user_id={user_id}, timestamp={timestamp}")
                    continue

                rec_no = log.get("rec_no", "")
                checada_id = f"{user_id}_{rec_no}_{timestamp}" if rec_no else f"{user_id}_{timestamp}_{tipo}"

                if checada_id in self.synced_checadas:
                    continue

                logger.info(f"📤 [{i}/{len(logs)}] Enviando checada a la nube: Usuario={user_id}, Hora={timestamp}, Tipo={tipo}")

                success = self.cloud_sync.sync_attendance(user_id, timestamp, tipo)

                if success:
                    self.synced_checadas.add(checada_id)
                    self._save_synced_checada(checada_id)
                    self.last_sync_index += 1
                    sincronizadas += 1
                    logger.info(f"✅ Checada sincronizada exitosamente")
                else:
                    errores += 1
                    if self.buffer:
                        self.buffer.add_checada(user_id, timestamp, self.config["cloud"]["device_id"], tipo)
                    logger.warning(f"❌ No se pudo sincronizar: {user_id} - {timestamp}")

            logger.info(f"📊 Resumen: {sincronizadas} sincronizadas, {errores} errores")

        except Exception as e:
            logger.error(f"❌ Error al sincronizar asistencia: {e}", exc_info=True)

    def sync_buffer(self):
        """Sincroniza checadas pendientes del buffer"""
        if not self.buffer:
            return

        pendientes = self.buffer.get_pendientes(limit=50)

        if not pendientes:
            return

        logger.info(f"Sincronizando {len(pendientes)} checadas del buffer")

        for checada in pendientes:
            success = self.cloud_sync.sync_attendance(
                checada["user_id"],
                checada["timestamp"],
                checada["tipo"]
            )

            if success:
                self.buffer.mark_synced(checada["id"])
            else:
                self.buffer.increment_retry(checada["id"])

    def sync_pending_users(self):
        """Envía usuarios pendientes al dispositivo con set_user y marca como enviados"""
        if not self.cloud_sync.test_connection():
            return
        try:
            pending = self.cloud_sync.get_pending_users()
            if not pending:
                return
            logger.info(f"📤 Enviando {len(pending)} usuarios pendientes al dispositivo...")
            sent_ids = []
            for u in pending:
                ok = self.zkteco_client.set_user(
                    user_id=str(u["numero_empleado"]),
                    name=u.get("nombre", "")
                )
                if ok:
                    sent_ids.append(u["id"])
            if sent_ids:
                self.cloud_sync.mark_users_sent(sent_ids)
                logger.info(f"✅ {len(sent_ids)} usuarios enviados al dispositivo")
        except Exception as e:
            logger.error(f"Error al sincronizar usuarios pendientes: {e}", exc_info=True)

    def sync_pending_enroll(self):
        """Procesa enrolls pendientes: inicia enroll_user en el dispositivo"""
        if not self.cloud_sync.test_connection():
            return
        try:
            pending = self.cloud_sync.get_pending_enroll()
            if not pending:
                return
            for pe in pending:
                enroll_id = pe["id"]
                numero = pe["numero_empleado"]
                logger.info(f"👆 Iniciando registro de huella para {numero}. El empleado debe colocar el dedo en el dispositivo.")
                ok = self.zkteco_client.enroll_user(user_id=numero)
                self.cloud_sync.mark_enroll_done(enroll_id, success=ok)
                if ok:
                    logger.info(f"✅ Enroll completado para {numero}")
                else:
                    logger.warning(f"⚠️ Enroll falló para {numero}")
                # Solo procesamos uno por ciclo para no bloquear
                break
        except Exception as e:
            logger.error(f"Error al procesar enroll: {e}", exc_info=True)

    def run(self):
        """Loop principal del agente"""
        logger.info("Iniciando agente local (ZKTeco MB160)...")

        if not self.zkteco_client.test_connection():
            logger.error("No se puede conectar con el dispositivo ZKTeco. Verifica IP y puerto (4370).")
            return

        logger.info("Conexión con dispositivo ZKTeco establecida")

        if not self.cloud_sync.test_connection():
            logger.warning("No se puede conectar con la nube. Las checadas se guardarán en buffer.")

        interval = self.config.get("sync", {}).get("interval_seconds", 30)
        logger.info(f"Agente iniciado. Sincronizando cada {interval} segundos...")

        try:
            while self.running:
                if self.cloud_sync.test_connection():
                    self.sync_pending_users()
                    self.sync_pending_enroll()

                self.sync_new_attendance()

                if self.cloud_sync.test_connection():
                    self.sync_buffer()

                time.sleep(interval)

        except KeyboardInterrupt:
            logger.info("Deteniendo agente...")
            self.running = False
        except Exception as e:
            logger.error(f"Error en loop principal: {e}")
            raise


def main():
    """Función principal"""
    config_path = sys.argv[1] if len(sys.argv) > 1 else "config.yaml"

    agent = Agent(config_path)
    agent.run()


if __name__ == "__main__":
    main()
