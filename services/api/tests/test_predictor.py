import unittest

from app.ml.predictor import (
    calculate_title_body_similarity,
    find_title_terms_not_in_body,
    score_to_signal_level,
)


class TitleBodyEvidenceTest(unittest.TestCase):
    def test_finds_terms_missing_from_body(self):
        result = find_title_terms_not_in_body(
            "인터넷전문은행 고공행진 멈추고 추락 시작하나",
            "인터넷전문은행의 자본 비율이 전 분기보다 하락했습니다.",
        )

        self.assertEqual(result, ["고공행진", "멈추고", "추락"])


class TitleBodySimilarityTest(unittest.TestCase):
    def test_matching_text_scores_higher_than_unrelated_text(self):
        matching_score = calculate_title_body_similarity("한미약품 인증 획득", "한미약품이 인증을 받았습니다.")
        unrelated_score = calculate_title_body_similarity("축구 경기 결과", "한미약품이 인증을 받았습니다.")

        self.assertGreater(matching_score, unrelated_score)


class SignalLevelTest(unittest.TestCase):
    def test_maps_score_boundaries_to_five_levels(self):
        self.assertEqual(score_to_signal_level(0), (1, "낚시성 신호 매우 낮음"))
        self.assertEqual(score_to_signal_level(20), (2, "낚시성 신호 낮음"))
        self.assertEqual(score_to_signal_level(40), (3, "확인 권장"))
        self.assertEqual(score_to_signal_level(60), (4, "낚시성 신호 높음"))
        self.assertEqual(score_to_signal_level(80), (5, "낚시성 신호 매우 높음"))
        self.assertEqual(score_to_signal_level(100), (5, "낚시성 신호 매우 높음"))
