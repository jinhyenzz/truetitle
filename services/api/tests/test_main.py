import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.ml.predictor import MODEL_PATH, ModelUnavailableError


client = TestClient(app)


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
        MODEL_PATH.is_dir(), "현재 Transformer 모델 폴더가 로컬에 없어 생략"
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


if __name__ == "__main__":
    unittest.main()
