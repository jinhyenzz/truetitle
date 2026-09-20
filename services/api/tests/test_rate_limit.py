import time
import types
import unittest
from unittest.mock import patch

from app.core.rate_limit import InMemoryRateLimiter, _resolve_client_key


class InMemoryRateLimiterTest(unittest.TestCase):
    def test_allows_requests_within_limit(self):
        limiter = InMemoryRateLimiter(max_requests=3, window_seconds=60)

        for _ in range(3):
            self.assertIsNone(limiter.check("1.2.3.4"))

    def test_blocks_requests_over_limit_and_reports_retry_after(self):
        limiter = InMemoryRateLimiter(max_requests=2, window_seconds=60)
        limiter.check("1.2.3.4")
        limiter.check("1.2.3.4")

        retry_after = limiter.check("1.2.3.4")

        self.assertIsNotNone(retry_after)
        self.assertGreater(retry_after, 0)
        self.assertLessEqual(retry_after, 60)

    def test_tracks_each_key_independently(self):
        limiter = InMemoryRateLimiter(max_requests=1, window_seconds=60)

        self.assertIsNone(limiter.check("a"))
        self.assertIsNone(limiter.check("b"))
        self.assertIsNotNone(limiter.check("a"))

    def test_allows_again_after_window_expires(self):
        limiter = InMemoryRateLimiter(max_requests=1, window_seconds=0.05)
        self.assertIsNone(limiter.check("1.2.3.4"))
        self.assertIsNotNone(limiter.check("1.2.3.4"))

        time.sleep(0.06)

        self.assertIsNone(limiter.check("1.2.3.4"))

    def test_stale_keys_are_evicted_after_enough_calls(self):
        limiter = InMemoryRateLimiter(max_requests=5, window_seconds=0.02, sweep_every=3)
        limiter.check("stale-ip")
        time.sleep(0.03)  # stale-ip의 기록이 시간창 밖으로 만료되도록 기다린다.

        # sweep_every(3)번 이상 다른 키로 호출해서 정리(sweep)를 유도한다.
        limiter.check("a")
        limiter.check("b")
        limiter.check("c")

        self.assertNotIn("stale-ip", limiter._hits)


class _FakeRequest:
    def __init__(self, host: str | None, headers: dict[str, str] | None = None) -> None:
        self.client = types.SimpleNamespace(host=host) if host is not None else None
        self.headers = headers or {}


class ResolveClientKeyTest(unittest.TestCase):
    def test_uses_direct_client_ip_by_default(self):
        request = _FakeRequest("203.0.113.5", {"x-forwarded-for": "198.51.100.9"})

        with patch("app.core.rate_limit.TRUST_PROXY_HEADERS", False):
            key = _resolve_client_key(request)

        self.assertEqual(key, "203.0.113.5")

    def test_uses_forwarded_for_last_value_when_proxy_trusted(self):
        # 마지막 값은 신뢰하는 프록시 자신이 실제 연결을 보고 덧붙인 값이다.
        # 앞쪽 값(198.51.100.9)은 클라이언트가 보낸 헤더를 그대로 옮긴 것일 수 있어 신뢰하지 않는다.
        request = _FakeRequest("203.0.113.5", {"x-forwarded-for": "198.51.100.9, 203.0.113.5"})

        with patch("app.core.rate_limit.TRUST_PROXY_HEADERS", True):
            key = _resolve_client_key(request)

        self.assertEqual(key, "203.0.113.5")

    def test_ignores_client_spoofed_leading_value(self):
        # 클라이언트가 X-Forwarded-For를 직접 위조해도(예: 요청마다 다른 가짜 IP),
        # 신뢰하는 프록시가 실제 연결 IP를 마지막에 덧붙이므로 매번 같은 키로 잡혀야 한다.
        first = _FakeRequest("203.0.113.5", {"x-forwarded-for": "1.1.1.1, 203.0.113.5"})
        second = _FakeRequest("203.0.113.5", {"x-forwarded-for": "9.9.9.9, 203.0.113.5"})

        with patch("app.core.rate_limit.TRUST_PROXY_HEADERS", True):
            first_key = _resolve_client_key(first)
            second_key = _resolve_client_key(second)

        self.assertEqual(first_key, second_key)
        self.assertEqual(first_key, "203.0.113.5")

    def test_falls_back_to_direct_ip_when_header_missing_even_if_trusted(self):
        request = _FakeRequest("203.0.113.5")

        with patch("app.core.rate_limit.TRUST_PROXY_HEADERS", True):
            key = _resolve_client_key(request)

        self.assertEqual(key, "203.0.113.5")


if __name__ == "__main__":
    unittest.main()
