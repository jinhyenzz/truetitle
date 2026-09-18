import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.ml.predictor import MODEL_PATH, ModelUnavailableError


client = TestClient(app)


def setUpModule() -> None:
    # TestClient를 with 없이 쓰면 ASGI lifespan(=app.main의 @app.on_event("startup"))이
    # 아예 실행되지 않는다. 이 모듈의 모든 테스트가 공유하는 client 하나에 대해
    # 시작 이벤트를 한 번 직접 트리거해서, 실제 uvicorn 구동과 같은 경로를 검증한다.
    client.__enter__()


def tearDownModule() -> None:
    client.__exit__(None, None, None)


# CI 체크아웃은 Git LFS를 받지 않으므로 model.safetensors가 실제 가중치 대신
# ~130바이트짜리 LFS 포인터 텍스트로 남아 있을 수 있다. MODEL_PATH.is_dir()만
# 보면 디렉터리는 존재해서 스킵되지 않고 실제 로딩을 시도하다 실패하므로,
# 파일 크기로 진짜 가중치가 받아져 있는지까지 확인한다.
_MODEL_WEIGHTS_FILE = MODEL_PATH / "model.safetensors"
_MODEL_AVAILABLE = (
    MODEL_PATH.is_dir()
    and _MODEL_WEIGHTS_FILE.is_file()
    and _MODEL_WEIGHTS_FILE.stat().st_size > 1_000_000
)


class HealthTest(unittest.TestCase):
    def test_health_returns_ok(self):
        response = client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


class ReadyTest(unittest.TestCase):
    def test_ready_without_model_returns_503(self):
        with patch("app.main.load_model", side_effect=ModelUnavailableError):
            response = client.get("/ready")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"ready": False})


class AnalyzeTest(unittest.TestCase):
    def test_analyze_without_model_returns_503(self):
        with patch("app.ml.predictor.load_model", side_effect=ModelUnavailableError):
            response = client.post(
                "/analyze",
                json={"title": "충격 발표", "body": "실제로는 평범한 내용입니다."},
            )

        self.assertEqual(response.status_code, 503)

    def test_analyze_rejects_empty_title(self):
        response = client.post(
            "/analyze",
            json={"title": "", "body": "본문"},
        )

        self.assertEqual(response.status_code, 422)

    def test_analyze_rejects_missing_body(self):
        response = client.post(
            "/analyze",
            json={"title": "제목"},
        )

        self.assertEqual(response.status_code, 422)

    @unittest.skipUnless(
        _MODEL_AVAILABLE, "현재 Transformer 모델 가중치가 로컬에 없어 생략 (LFS 포인터만 있을 수 있음)"
    )
    def test_analyze_returns_prediction_when_model_available(self):
        response = client.post(
            "/analyze",
            json={
                "title": "충격 단독 이 남자 알고보니",
                "body": "이 기사는 평범한 사실을 전달하는 내용입니다.",
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn(body["classification"], ("clickbait", "non_clickbait"))
        self.assertGreaterEqual(body["clickbait_score"], 0)
        self.assertLessEqual(body["clickbait_score"], 100)
        self.assertIn(body["clickbait_signal_level"], (1, 2, 3, 4, 5))
        self.assertTrue(body["clickbait_signal_label"])


class RateLimitTest(unittest.TestCase):
    def test_analyze_returns_429_with_retry_after_when_rate_limited(self):
        with patch("app.core.rate_limit._limiter.check", return_value=12.0):
            response = client.post(
                "/analyze",
                json={"title": "충격 발표", "body": "실제로는 평범한 내용입니다."},
            )

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers.get("Retry-After"), "13")


if __name__ == "__main__":
    unittest.main()
