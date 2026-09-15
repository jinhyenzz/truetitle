import unittest

from app.ml.predictor import find_title_terms_not_in_body


class TitleBodyEvidenceTest(unittest.TestCase):
    def test_finds_terms_missing_from_body(self):
        result = find_title_terms_not_in_body(
            "인터넷전문은행 고공행진 멈추고 추락 시작하나",
            "인터넷전문은행의 자본 비율이 전 분기보다 하락했습니다.",
        )

        self.assertEqual(result, ["고공행진", "멈추고", "추락"])
