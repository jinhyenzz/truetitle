import unittest
from types import SimpleNamespace

from sklearn.feature_extraction.text import TfidfVectorizer

from app.ml.predictor import calculate_title_body_similarity, find_title_terms_not_in_body


class TitleBodyEvidenceTest(unittest.TestCase):
    def test_finds_terms_missing_from_body(self):
        result = find_title_terms_not_in_body(
            "인터넷전문은행 고공행진 멈추고 추락 시작하나",
            "인터넷전문은행의 자본 비율이 전 분기보다 하락했습니다.",
        )

        self.assertEqual(result, ["고공행진", "멈추고", "추락"])


class TitleBodySimilarityTest(unittest.TestCase):
    def test_matching_text_scores_higher_than_unrelated_text(self):
        vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(2, 3)).fit(
            ["한미약품 인증 획득", "한미약품이 인증을 받았습니다.", "축구 경기 결과"]
        )
        model = SimpleNamespace(named_steps={"tfidf": vectorizer})

        matching_score = calculate_title_body_similarity(
            model, "한미약품 인증 획득", "한미약품이 인증을 받았습니다."
        )
        unrelated_score = calculate_title_body_similarity(
            model, "축구 경기 결과", "한미약품이 인증을 받았습니다."
        )

        self.assertGreater(matching_score, unrelated_score)
