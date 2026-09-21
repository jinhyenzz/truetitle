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
        # title/body는 prepare_part1.py가 이미 정규화한 값, raw_title/raw_body는 정규화 이전
        # 원문이다. evaluate()는 이 둘을 비교해서 정규화가 실제로 예측을 바꾸는지 확인한다.
        examples = [
            ArticleExample('"발표"', "본문", 1, raw_title=r'\"발표\"', raw_body="본문"),
            ArticleExample('"충격"', '"본문"', 0, raw_title='"충격"', raw_body=r'\"본문\"'),
            ArticleExample("일반 제목", "본문", 1, raw_title="일반 제목", raw_body="본문"),
        ]
        with patch("training.evaluate_quote_normalization.predict_clickbait_score", side_effect=[90, 10, 90, 10, 10]) as predict:
            report = evaluate(examples)
        self.assertEqual(predict.call_count, 5)
        self.assertEqual(predict.call_args_list[0].args, (r'\"발표\"', "본문"))
        self.assertEqual(predict.call_args_list[0].kwargs, {"normalize": False})
        self.assertEqual(predict.call_args_list[1].args, ('"발표"', "본문"))
        # article.title/body는 이미 normalize_model_text를 거친 값이므로 다시 정규화하지 않도록
        # normalize=False로 호출해야 한다.
        self.assertEqual(predict.call_args_list[1].kwargs, {"normalize": False})
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

    def test_rejects_examples_without_raw_text(self):
        # raw_title/raw_body가 없으면(예: prepare_part1.py 이전 버전으로 만든 JSONL)
        # 정규화 전/후를 비교할 방법이 없다. 조용히 "변화 없음"으로 보고하는 대신 에러를 내야 한다.
        examples = [ArticleExample('"발표"', "본문", 1)]
        with self.assertRaisesRegex(ValueError, "raw_title/raw_body"):
            evaluate(examples)

    def test_cli_reads_real_loader_objects_and_writes_report(self):
        # 실제 JSONL -> load_examples -> main -> evaluate -> 보고서 경로를 검사한다.
        # 모델의 정답 능력 검사가 아니므로 추론 값과 가중치 파일만 대체한다.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            records = [
                {"title": '"발표"', "body": "본문 A", "label": 0, "raw_title": r'\"발표\"', "raw_body": "본문 A"},
                {"title": "일반 제목", "body": "본문 B", "label": 1, "raw_title": "일반 제목", "raw_body": "본문 B"},
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
