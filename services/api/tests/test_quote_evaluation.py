import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from training.data import ArticleExample
from training.evaluate_quote_normalization import evaluate, main


class QuoteEvaluationTest(unittest.TestCase):
    def test_counts_both_improvements_and_regressions(self):
        examples = [
            ArticleExample(r'\"발표\"', "본문", 1),
            ArticleExample('"충격"', r'\"본문\"', 0),
            ArticleExample("일반 제목", "본문", 1),
        ]
        with patch("training.evaluate_quote_normalization.predict_clickbait_score", side_effect=[90, 10, 90, 10, 10]) as predict:
            report = evaluate(examples)
        self.assertEqual(predict.call_count, 5)
        self.assertEqual(predict.call_args_list[0].kwargs, {"normalize": False})
        self.assertEqual(predict.call_args_list[1].args, ('"발표"', "본문"))
        self.assertEqual(predict.call_args_list[1].kwargs, {})
        self.assertEqual(report["changed_titles"], 1)
        self.assertEqual(report["changed_bodies"], 1)
        self.assertEqual(report["changed_predictions"], 2)
        self.assertEqual(report["improved"], 1)
        self.assertEqual(report["regressed"], 1)
        self.assertEqual(report["before"]["false_positive"], 1)
        self.assertEqual(report["after"]["false_negative"], 1)
        self.assertAlmostEqual(report["before"]["accuracy"], 2 / 3)
        self.assertAlmostEqual(report["after"]["accuracy"], 2 / 3)

    def test_rejects_empty_input(self):
        with self.assertRaisesRegex(ValueError, "평가할 기사"):
            evaluate([])

    def test_cli_reads_real_loader_objects_and_writes_report(self):
        # 실제 JSONL -> load_examples -> main -> evaluate -> 보고서 경로를 검사한다.
        # 모델의 정답 능력 검사가 아니므로 추론 값과 가중치 파일만 대체한다.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            records = [
                {"title": r'\"발표\"', "body": "본문 A", "label": 0},
                {"title": "일반 제목", "body": "본문 B", "label": 1},
            ]
            (root / "part1_validation.jsonl").write_text(
                "\n".join(json.dumps(row, ensure_ascii=False) for row in records), encoding="utf-8"
            )
            (root / "model.safetensors").write_bytes(b"test-only-weights")
            report_path = root / "report.json"
            arguments = ["evaluate_quote_normalization.py", "--input-dir", str(root), "--samples", "2", "--report-path", str(report_path)]
            with (
                patch.object(sys, "argv", arguments),
                patch("training.evaluate_quote_normalization.MODEL_PATH", root),
                patch("training.evaluate_quote_normalization.predict_clickbait_score", side_effect=[90, 90, 10]),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                main()
            report = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertEqual(report["samples"], 2)
            self.assertEqual(report["after"]["accuracy"], 1.0)
            self.assertEqual(report["changed_titles"], 1)
            self.assertEqual(len(report["weights_sha256"]), 64)
            before = report_path.read_bytes()
            with patch.object(sys, "argv", arguments), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit):
                    main()
            self.assertEqual(report_path.read_bytes(), before)
