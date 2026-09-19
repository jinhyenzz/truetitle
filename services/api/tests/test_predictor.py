import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import torch

from app.ml.predictor import (
    analyze_article,
    calculate_title_body_similarity,
    find_title_terms_not_in_body,
    normalize_straight_quotes,
    predict_clickbait_score,
    score_to_signal_level,
)


class TitleQuoteNormalizationTest(unittest.TestCase):
    def test_normalizes_straight_quotes_to_curly_pairs(self):
        result = normalize_straight_quotes('"첫 문장"과 "다음 문장"')

        self.assertEqual(result, "“첫 문장”과 “다음 문장”")

    def test_preserves_content_and_unpaired_quotes(self):
        cases = {
            '“지원 확대" 발표': '“지원 확대” 발표',
            '"지원 확대” 발표': '“지원 확대” 발표',
            '“기존 인용”과 "새 인용"': '“기존 인용”과 “새 인용”',
            '24" 모니터 출시': '24" 모니터 출시',
            '"끝나지 않은 인용': '"끝나지 않은 인용',
            "'작은따옴표'와 일반 제목": "'작은따옴표'와 일반 제목",
            '"첫 줄\n둘째 줄"': '"첫 줄\n둘째 줄"',
        }
        for original, expected in cases.items():
            with self.subTest(title=original):
                result = normalize_straight_quotes(original)
                self.assertEqual(result, expected)
                self.assertEqual(normalize_straight_quotes(result), expected)

    def test_analysis_normalizes_only_model_title_input(self):
        title = '정부 "지원 확대" 발표'
        body = '정부는 "지원 확대" 방안을 발표했다.'
        with patch("app.ml.predictor.predict_clickbait_score", return_value=25.0) as predict:
            result = analyze_article(title, body)
        predict.assert_called_once_with('정부 “지원 확대” 발표', body)
        self.assertEqual(result[:2], (25.0, "non_clickbait"))


class ModelPredictionTest(unittest.TestCase):
    def test_uses_model_configured_clickbait_index(self):
        tokenizer = Mock(
            return_value={
                "input_ids": torch.tensor([[1, 2]]),
                "token_type_ids": torch.tensor([[0, 0]]),
            }
        )
        model = Mock(return_value=SimpleNamespace(logits=torch.tensor([[0.0, 2.0]])))

        with patch("app.ml.predictor.load_model", return_value=(tokenizer, model, 1)):
            score = predict_clickbait_score("제목", "본문")

        self.assertEqual(score, 88.1)
        tokenizer.assert_called_once_with(
            "제목",
            "본문",
            truncation=True,
            max_length=128,
            padding=True,
            return_tensors="pt",
        )


class TitleBodyEvidenceTest(unittest.TestCase):
    def test_finds_terms_missing_from_body(self):
        result = find_title_terms_not_in_body(
            "인터넷전문은행 고공행진 멈추고 추락 시작하나",
            "인터넷전문은행의 자본 비율이 전 분기보다 하락했습니다.",
        )

        self.assertEqual(result, ["고공행진", "멈추고", "추락"])

    def test_korean_word_variants_are_not_missing_evidence(self):
        result = find_title_terms_not_in_body(
            "국민 주무시기 전 알려드리려 생각한 것",
            "국민들이 주무시기 전에 방송으로 알려드리고 나름대로 생각했다.",
        )

        self.assertEqual(result, [])

    def test_partial_term_in_compound_word_remains_matching(self):
        result = find_title_terms_not_in_body(
            "계엄 선포",
            "비상계엄을 선포했다.",
        )

        self.assertEqual(result, [])


class TitleBodySimilarityTest(unittest.TestCase):
    def test_matching_text_scores_higher_than_unrelated_text(self):
        matching_score = calculate_title_body_similarity("한미약품 인증 획득", "한미약품이 인증을 받았습니다.")
        unrelated_score = calculate_title_body_similarity("축구 경기 결과", "한미약품이 인증을 받았습니다.")

        self.assertGreater(matching_score, unrelated_score)

    def test_korean_word_variants_raise_similarity(self):
        score = calculate_title_body_similarity(
            "국민 주무시기 전 알려드리려 생각한 것",
            "국민들이 주무시기 전에 방송으로 알려드리고 나름대로 생각했다.",
        )

        self.assertEqual(score, 100.0)


class SignalLevelTest(unittest.TestCase):
    def test_maps_score_boundaries_to_five_levels(self):
        self.assertEqual(score_to_signal_level(0), (1, "낚시성 신호 매우 낮음"))
        self.assertEqual(score_to_signal_level(20), (2, "낚시성 신호 낮음"))
        self.assertEqual(score_to_signal_level(40), (3, "확인 권장"))
        self.assertEqual(score_to_signal_level(60), (4, "낚시성 신호 높음"))
        self.assertEqual(score_to_signal_level(80), (5, "낚시성 신호 매우 높음"))
        self.assertEqual(score_to_signal_level(100), (5, "낚시성 신호 매우 높음"))
