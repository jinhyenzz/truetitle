import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from training.compare_models import calculate_metrics


class MetricsTest(unittest.TestCase):
    def test_metrics_for_two_classes(self):
        result = calculate_metrics([0, 0, 1, 1], [0, 1, 1, 1])

        self.assertEqual(result["accuracy"], 0.75)
        self.assertAlmostEqual(result["f1_macro"], 0.7333, places=4)
