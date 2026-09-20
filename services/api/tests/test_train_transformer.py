import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from training.train_transformer import calculate_metrics, tokenize_article


class RecordingTokenizer:
    def __init__(self):
        self.args = None
        self.kwargs = None

    def __call__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        return {"token_type_ids": "not-supported", "input_ids": "kept"}


class PairTokenizationTest(unittest.TestCase):
    def test_title_and_body_are_sent_as_a_pair(self):
        tokenizer = RecordingTokenizer()

        encoded = tokenize_article(tokenizer, "제목", "본문", 256)

        self.assertEqual(tokenizer.args, ("제목", "본문"))
        self.assertIs(tokenizer.kwargs["truncation"], True)
        self.assertEqual(tokenizer.kwargs["max_length"], 256)
        self.assertNotIn("token_type_ids", encoded)
        self.assertEqual(encoded["input_ids"], "kept")


class MetricsTest(unittest.TestCase):
    def test_binary_metrics(self):
        metrics = calculate_metrics([0, 0, 1, 1], [0, 1, 1, 1])

        self.assertEqual(metrics["accuracy"], 0.75)
        self.assertAlmostEqual(metrics["f1_macro"], 0.7333, places=4)
