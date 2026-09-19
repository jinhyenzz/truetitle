"""IP 기준 분당 요청 횟수 제한. 별도 인프라(Redis 등) 없이 단일 서버 프로세스
메모리에서만 동작하며, 여러 서버 인스턴스 간에는 공유되지 않는다."""

from __future__ import annotations

import math
import os
import threading
import time
from collections import deque
from typing import Callable, TypeVar

from fastapi import HTTPException, Request

from app.core.env import load_dotenv_once

_Number = TypeVar("_Number", int, float)


def _read_positive_env(name: str, default: _Number, cast: Callable[[str], _Number]) -> _Number:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = cast(raw)
    except ValueError:
        return default
    return value if math.isfinite(value) and value > 0 else default


load_dotenv_once()
# 초기 제안값(IP 기준 분당 30회). 실측 후 .env의 RATE_LIMIT_MAX_REQUESTS·
# RATE_LIMIT_WINDOW_SECONDS로 조정한다 (services/api/.env.example 참고).
MAX_REQUESTS_PER_WINDOW = _read_positive_env("RATE_LIMIT_MAX_REQUESTS", 30, int)
WINDOW_SECONDS = _read_positive_env("RATE_LIMIT_WINDOW_SECONDS", 60.0, float)

# 신뢰할 수 있는 리버스 프록시 뒤에 배포했을 때만 켠다. 프록시 없이(직접 접속)
# 켜두면 클라이언트가 헤더를 직접 위조해 제한을 우회하거나 다른 IP를 사칭할 수 있다.
TRUST_PROXY_HEADERS = os.environ.get("TRUST_PROXY_HEADERS", "").strip().lower() in ("1", "true", "yes")

# 이만큼 호출될 때마다 한 번씩, 요청이 끊긴 키(빈 기록)를 정리한다. 매 호출마다
# 전체를 훑진 않으면서도 메모리가 무한정 늘어나지 않게 한다.
_SWEEP_EVERY = 200


class InMemoryRateLimiter:
    def __init__(self, max_requests: int, window_seconds: float, sweep_every: int = _SWEEP_EVERY) -> None:
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._sweep_every = sweep_every
        self._lock = threading.Lock()
        self._hits: dict[str, deque[float]] = {}
        self._calls_since_sweep = 0

    def check(self, key: str) -> float | None:
        """허용되면 None, 제한되면 다음 요청까지 기다려야 하는 초(Retry-After)를 반환한다."""
        now = time.monotonic()
        cutoff = now - self._window_seconds
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            self._purge(hits, cutoff)

            if len(hits) >= self._max_requests:
                return max(hits[0] + self._window_seconds - now, 0.0)

            hits.append(now)

            self._calls_since_sweep += 1
            if self._calls_since_sweep >= self._sweep_every:
                self._calls_since_sweep = 0
                self._sweep(cutoff)

            return None

    @staticmethod
    def _purge(hits: deque[float], cutoff: float) -> None:
        while hits and hits[0] < cutoff:
            hits.popleft()

    def _sweep(self, cutoff: float) -> None:
        """요청이 끊긴 IP의 빈 기록을 지워서 메모리가 계속 쌓이지 않게 한다."""
        stale_keys = []
        for key, hits in self._hits.items():
            self._purge(hits, cutoff)
            if not hits:
                stale_keys.append(key)
        for key in stale_keys:
            del self._hits[key]


_limiter = InMemoryRateLimiter(MAX_REQUESTS_PER_WINDOW, WINDOW_SECONDS)


def _resolve_client_key(request: Request) -> str:
    if TRUST_PROXY_HEADERS:
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            # 체인의 첫 값이 프록시에 가장 먼저 도달한 클라이언트 IP다.
            return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(request: Request) -> None:
    client_key = _resolve_client_key(request)
    retry_after = _limiter.check(client_key)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
            headers={"Retry-After": str(int(retry_after) + 1)},
        )
