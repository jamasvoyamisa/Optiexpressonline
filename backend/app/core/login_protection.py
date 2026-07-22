"""Protección anti-fuerza bruta (corto plazo): rate por usuario, contadores IP y alertas.

- A1: máx. 5 fallos / 15 min por identificador de login (memoria de proceso).
- A2: bloqueo de cuenta en BD tras 5 fallos consecutivos (15 min) — ver columnas en Empleado.
- A3: alerta en actividad_log si IP ≥ 20 fallos / 10 min, o al bloquear cuenta.
"""
from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Deque, Dict, Optional, Tuple

from sqlalchemy.orm import Session

USER_FAIL_LIMIT = 5
USER_FAIL_WINDOW_SEC = 15 * 60
ACCOUNT_LOCK_FAILS = 5
ACCOUNT_LOCK_MINUTES = 15
IP_ALERT_THRESHOLD = 20
IP_ALERT_WINDOW_SEC = 10 * 60
IP_ALERT_COOLDOWN_SEC = 30 * 60

MSG_CREDENCIALES = "Credenciales incorrectas"
MSG_DEMASIADOS = "Demasiados intentos. Espera unos minutos e inténtalo de nuevo."

_lock = Lock()
_user_fails: Dict[str, Deque[float]] = defaultdict(deque)
_ip_fails: Dict[str, Deque[float]] = defaultdict(deque)
_ip_alerted_at: Dict[str, float] = {}


def normalize_login_id(username: str) -> str:
    return (username or "").strip().lower()


def _now_ts() -> float:
    return datetime.now(timezone.utc).timestamp()


def _now_naive_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _prune(dq: Deque[float], window_sec: float, now: float) -> None:
    while dq and now - dq[0] > window_sec:
        dq.popleft()


def is_user_rate_limited(login_id: str) -> bool:
    key = normalize_login_id(login_id)
    if not key:
        return False
    now = _now_ts()
    with _lock:
        dq = _user_fails[key]
        _prune(dq, USER_FAIL_WINDOW_SEC, now)
        return len(dq) >= USER_FAIL_LIMIT


def register_auth_failure(
    login_id: str,
    ip: Optional[str],
) -> Tuple[bool, bool]:
    """
    Registra un fallo de autenticación (usuario inexistente o password incorrecta).
    Returns: (user_now_rate_limited, should_alert_ip)
    """
    key = normalize_login_id(login_id)
    now = _now_ts()
    should_alert_ip = False
    user_limited = False
    with _lock:
        if key:
            udq = _user_fails[key]
            _prune(udq, USER_FAIL_WINDOW_SEC, now)
            udq.append(now)
            user_limited = len(udq) >= USER_FAIL_LIMIT
        if ip:
            idq = _ip_fails[ip]
            _prune(idq, IP_ALERT_WINDOW_SEC, now)
            idq.append(now)
            if len(idq) >= IP_ALERT_THRESHOLD:
                last = _ip_alerted_at.get(ip, 0.0)
                if now - last >= IP_ALERT_COOLDOWN_SEC:
                    _ip_alerted_at[ip] = now
                    should_alert_ip = True
    return user_limited, should_alert_ip


def clear_user_failures(login_id: str) -> None:
    key = normalize_login_id(login_id)
    if not key:
        return
    with _lock:
        _user_fails.pop(key, None)


def account_is_locked(empleado) -> bool:
    until = getattr(empleado, "login_bloqueado_hasta", None)
    if until is None:
        return False
    now = _now_naive_utc()
    # Comparar naive; si viene aware, normalizar
    if getattr(until, "tzinfo", None) is not None:
        until = until.astimezone(timezone.utc).replace(tzinfo=None)
    return until > now


def register_account_failure(db: Session, empleado) -> bool:
    """
    Incrementa fallos consecutivos; si llega a ACCOUNT_LOCK_FAILS bloquea 15 min.
    Returns True si la cuenta quedó (o sigue) bloqueada tras este fallo.
    """
    fallos = int(getattr(empleado, "login_fallos_consecutivos", 0) or 0) + 1
    empleado.login_fallos_consecutivos = fallos
    just_locked = False
    if fallos >= ACCOUNT_LOCK_FAILS:
        empleado.login_bloqueado_hasta = _now_naive_utc() + timedelta(minutes=ACCOUNT_LOCK_MINUTES)
        just_locked = True
    db.add(empleado)
    db.commit()
    db.refresh(empleado)
    return account_is_locked(empleado) or just_locked


def clear_account_failures(db: Session, empleado) -> None:
    if (
        int(getattr(empleado, "login_fallos_consecutivos", 0) or 0) == 0
        and getattr(empleado, "login_bloqueado_hasta", None) is None
    ):
        return
    empleado.login_fallos_consecutivos = 0
    empleado.login_bloqueado_hasta = None
    db.add(empleado)
    db.commit()


def log_bruteforce_ip_alert(db: Session, *, ip: str, ruta: str) -> None:
    from app.modules.audit.service import ActividadService

    ActividadService.registrar(
        db,
        nivel="warning",
        categoria="auth",
        mensaje=f"Alerta fuerza bruta: IP {ip} ≥{IP_ALERT_THRESHOLD} fallos en {IP_ALERT_WINDOW_SEC // 60} min",
        empleado_id=None,
        ip_cliente=ip,
        metodo_http="POST",
        ruta=ruta[:500],
        codigo_http=401,
        contexto={
            "accion": "alerta_fuerza_bruta_ip",
            "umbral": IP_ALERT_THRESHOLD,
            "ventana_segundos": IP_ALERT_WINDOW_SEC,
        },
    )


def log_account_lock(db: Session, *, empleado, ip: Optional[str], ruta: str) -> None:
    from app.modules.audit.service import ActividadService

    num = getattr(empleado, "numero_empleado", None) or getattr(empleado, "id", None)
    ActividadService.registrar(
        db,
        nivel="warning",
        categoria="auth",
        mensaje=f"Cuenta bloqueada temporalmente por fallos de login: No. {num}",
        empleado_id=getattr(empleado, "id", None),
        ip_cliente=ip,
        metodo_http="POST",
        ruta=ruta[:500],
        codigo_http=401,
        contexto={
            "accion": "bloqueo_cuenta_login",
            "empleado_afectado_id": getattr(empleado, "id", None),
            "empleado_afectado_numero": getattr(empleado, "numero_empleado", None),
            "fallos": int(getattr(empleado, "login_fallos_consecutivos", 0) or 0),
            "bloqueado_hasta": str(getattr(empleado, "login_bloqueado_hasta", None)),
            "minutos": ACCOUNT_LOCK_MINUTES,
        },
    )
