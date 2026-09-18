"""services/api/.env를 읽어 프로세스 환경에 채운다. 이미 설정된 환경변수는
덮어쓰지 않는다(실제 배포 환경의 값이 우선한다)."""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
_loaded = False


def load_dotenv_once() -> None:
    global _loaded
    if _loaded:
        return
    _loaded = True
    load_dotenv(dotenv_path=_ENV_PATH, override=False)
