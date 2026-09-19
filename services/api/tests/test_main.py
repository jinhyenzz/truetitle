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

    def test_analyze_rejects_whitespace_and_over_limit_inputs(self):
        for title, body in (("   ", "본문"), ("제목", "\n\t"), ("가" * 301, "본문"), ("제목", "가" * 50001)):
            with self.subTest(title_length=len(title), body_length=len(body)):
                response = client.post("/analyze", json={"title": title, "body": body})
                self.assertEqual(response.status_code, 422)

    @unittest.skipUnless(MODEL_PATH.is_dir(), "현재 Transformer 모델 폴더가 로컬에 없어 생략")
    def test_quote_variants_return_identical_analysis(self):
        body = '정부는 내년부터 청년 주거 지원을 확대한다고 발표했다.'
        titles = ('정부 "청년 주거 지원 확대" 발표', '정부 “청년 주거 지원 확대” 발표', '정부 “청년 주거 지원 확대" 발표')
        responses = [client.post("/analyze", json={"title": title, "body": body}) for title in titles]
        for response in responses:
            self.assertEqual(response.status_code, 200)
        self.assertEqual(responses[0].json(), responses[1].json())
        self.assertEqual(responses[0].json(), responses[2].json())

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

    @unittest.skipUnless(
        MODEL_PATH.is_dir(), "현재 Transformer 모델 폴더가 로컬에 없어 생략"
    )
    def test_analyze_accepts_long_title(self):
        response = client.post(
            "/analyze",
            json={
                "title": "가 " * 149,
                "body": "본문은 정상적으로 분석되어야 합니다.",
            },
        )

        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
