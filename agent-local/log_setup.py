"""
Rotación y retención de agent.log (por defecto 30 días / 1 mes).
"""
from __future__ import annotations

import logging
import re
import sys
from datetime import datetime, timedelta
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path
from typing import Optional, Union

DEFAULT_RETENTION_DAYS = 30
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
_DATE_LINE = re.compile(r"^(\d{4}-\d{2}-\d{2})")


def agent_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent.resolve()
    return Path(__file__).parent.resolve()


def resolve_log_path(log_file: Union[str, Path], base: Optional[Path] = None) -> Path:
    path = Path(log_file)
    if not path.is_absolute():
        path = (base or agent_dir()) / path
    return path.resolve()


def purge_old_log_files(log_path: Path, retention_days: int = DEFAULT_RETENTION_DAYS) -> int:
    """Elimina archivos rotados agent.log.YYYY-MM-DD más viejos que retention_days."""
    if retention_days <= 0:
        return 0
    cutoff = (datetime.now() - timedelta(days=retention_days)).date()
    removed = 0
    pattern = f"{log_path.name}.*"
    for f in log_path.parent.glob(pattern):
        if not f.is_file() or f.resolve() == log_path.resolve():
            continue
        suffix = f.name[len(log_path.name) + 1 :]
        try:
            file_date = datetime.strptime(suffix, "%Y-%m-%d").date()
            if file_date < cutoff:
                f.unlink()
                removed += 1
        except ValueError:
            mtime = datetime.fromtimestamp(f.stat().st_mtime).date()
            if mtime < cutoff:
                f.unlink()
                removed += 1
    return removed


def trim_log_file(log_path: Path, retention_days: int = DEFAULT_RETENTION_DAYS) -> int:
    """Quita del agent.log activo las líneas con fecha anterior al periodo de retención."""
    if retention_days <= 0 or not log_path.is_file():
        return 0
    cutoff = (datetime.now() - timedelta(days=retention_days)).date()
    tmp = log_path.with_name(log_path.name + ".trimtmp")
    removed = 0
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as src, open(
            tmp, "w", encoding="utf-8"
        ) as dst:
            for line in src:
                m = _DATE_LINE.match(line)
                if m:
                    try:
                        if datetime.strptime(m.group(1), "%Y-%m-%d").date() < cutoff:
                            removed += 1
                            continue
                    except ValueError:
                        pass
                dst.write(line)
        tmp.replace(log_path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    return removed


def make_rotating_handler(
    log_path: Path,
    retention_days: int = DEFAULT_RETENTION_DAYS,
) -> TimedRotatingFileHandler:
    backup = max(1, retention_days) if retention_days > 0 else 0
    handler = TimedRotatingFileHandler(
        filename=str(log_path),
        when="midnight",
        interval=1,
        backupCount=backup,
        encoding="utf-8",
    )
    handler.suffix = "%Y-%m-%d"
    handler.setFormatter(logging.Formatter(LOG_FORMAT))
    return handler


def _handler_targets_log(handler: logging.Handler, log_path: Path) -> bool:
    base = getattr(handler, "baseFilename", None)
    if not base:
        return False
    return str(Path(base).resolve()) == str(log_path.resolve())


def setup_agent_logging(
    log_file: Union[str, Path] = "agent.log",
    retention_days: int = DEFAULT_RETENTION_DAYS,
    level: int = logging.INFO,
    console: bool = False,
    base_dir: Optional[Path] = None,
) -> Path:
    """
    Configura logging con rotación diaria y purga de logs > retention_days.
    Idempotente: no duplica handlers para el mismo archivo.
    """
    log_path = resolve_log_path(log_file, base_dir)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    purge_old_log_files(log_path, retention_days)
    try:
        trim_log_file(log_path, retention_days)
    except Exception:
        pass

    root = logging.getLogger()
    root.setLevel(level)

    if not console:
        from win_utils import remove_console_log_handlers
        remove_console_log_handlers()

    has_rotating = any(
        isinstance(h, TimedRotatingFileHandler) and _handler_targets_log(h, log_path)
        for h in root.handlers
    )
    if not has_rotating:
        for h in list(root.handlers):
            if isinstance(h, logging.FileHandler) and _handler_targets_log(h, log_path):
                root.removeHandler(h)
                h.close()
        if retention_days > 0:
            root.addHandler(make_rotating_handler(log_path, retention_days))

    if console and not any(type(h) is logging.StreamHandler for h in root.handlers):
        sh = logging.StreamHandler(sys.stdout)
        sh.setFormatter(logging.Formatter(LOG_FORMAT))
        root.addHandler(sh)

    for h in root.handlers:
        if hasattr(h, "setFormatter") and not h.formatter:
            h.setFormatter(logging.Formatter(LOG_FORMAT))

    return log_path
