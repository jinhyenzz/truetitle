import unittest
from unittest.mock import patch

from training.evaluate_quote_normalization import evaluate


class QuoteEvaluationTest(unittest.TestCase):
    def test_counts_both_improvements_and_regressions(self):
        examples = [
            {"title": '"발표"', "body": "본문", "label": 1},
            {"title": '"충격"', "body": "본문", "label": 0},
            {"title": "일반 제목", "body": "본문", "label": 1},
        ]
        with patch("training.evaluate_quote_normalization.predict_clickbait_score", side_effect=[90, 10, 90, 10, 10]) as predict:
            report = evaluate(examples)
        self.assertEqual(predict.call_count, 5)
        self.assertEqual(report["changed_titles"], 2)
        self.assertEqual(report["changed_predictions"], 2)
        self.assertEqual(report["improved"], 1)
        self.assertEqual(report["regressed"], 1)
        self.assertEqual(report["before"]["false_positive"], 1)
        self.assertEqual(report["after"]["false_negative"], 1)
        self.assertAlmostEqual(report["before"]["accuracy"], 2 / 3)
        self.assertAlmostEqual(report["after"]["accuracy"], 2 / 3)
