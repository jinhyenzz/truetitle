"""가중치 없이 실제 토크나이저로 학습·평가·추론 입력 계약을 확인한다."""

import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import torch
from transformers import AutoTokenizer

from app.ml.predictor import MODEL_PATH, predict_clickbait_score
from app.ml.text import DEFAULT_MAX_LENGTH, normalize_model_text, tokenize_article
from training.compare_models import predict_transformer
from training.data import ArticleExample
from training.train_transformer import ArticleDataset, parse_args


@unittest.skipUnless((MODEL_PATH / "tokenizer.json").is_file(), "로컬 토크나이저 파일 필요 (가중치는 불필요)")
class ModelInputContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, local_files_only=True)

    def test_training_comparison_and_api_receive_identical_tokens(self):
        examples = [
            ArticleExample(r'정부 \"지원 확대\"  발표', '정부는 \\"지원 확대\\" 방안을\n 발표했다.', 0),
            ArticleExample("가 " * 149, "정상 본문입니다. " * 200, 1),
        ]
        model = Mock(side_effect=lambda **inputs: SimpleNamespace(
            logits=torch.zeros((inputs["input_ids"].shape[0], 2))
        ))
        model.eval.return_value = model

        with (
            patch("transformers.AutoTokenizer.from_pretrained", return_value=self.tokenizer),
            patch("transformers.AutoModelForSequenceClassification.from_pretrained", return_value=model),
        ):
            predict_transformer(examples, MODEL_PATH, batch_size=2)
        batch = model.call_args.kwargs
        dataset = ArticleDataset(examples, self.tokenizer, DEFAULT_MAX_LENGTH)

        for index, example in enumerate(examples):
            with self.subTest(title_chars=len(example.title)):
                training = dataset[index]
                with patch("app.ml.predictor.load_model", return_value=(self.tokenizer, model, 0)):
                    predict_clickbait_score(example.title, example.body)
                runtime = model.call_args.kwargs
                expected = training["input_ids"][training["attention_mask"].bool()].tolist()
                actual = runtime["input_ids"][0][runtime["attention_mask"][0].bool()].tolist()
                compared = batch["input_ids"][index][batch["attention_mask"][index].bool()].tolist()
                self.assertEqual(expected, actual)
                self.assertEqual(expected, compared)
                self.assertLessEqual(len(expected), DEFAULT_MAX_LENGTH)
                self.assertNotIn("token_type_ids", runtime)

    def test_normalization_and_raw_diagnostic_are_distinct(self):
        title, body = r'정부 \"지원 확대\"', '정부는  지원을\n확대했다.'
        normalized = tokenize_article(self.tokenizer, title, body)
        expected = self.tokenizer(
            normalize_model_text(title), normalize_model_text(body),
            truncation=True, max_length=DEFAULT_MAX_LENGTH, padding="max_length", return_tensors="pt",
        )
        self.assertTrue(torch.equal(normalized["input_ids"], expected["input_ids"]))
        model = Mock(return_value=SimpleNamespace(logits=torch.tensor([[0.0, 1.0]])))
        with patch("app.ml.predictor.load_model", return_value=(self.tokenizer, model, 0)):
            predict_clickbait_score(title, body, normalize=False)
        raw = self.tokenizer(title, body, truncation=True, max_length=DEFAULT_MAX_LENGTH, padding=True, return_tensors="pt")
        self.assertTrue(torch.equal(model.call_args.kwargs["input_ids"], raw["input_ids"]))
        normalized_unpadded = tokenize_article(self.tokenizer, title, body, padding=True)
        self.assertFalse(torch.equal(raw["input_ids"], normalized_unpadded["input_ids"]))


class TrainingDefaultsTest(unittest.TestCase):
    def test_default_length_matches_api(self):
        with patch("sys.argv", ["train_transformer.py", "--max-train-samples", "2", "--max-validation-samples", "2"]):
            self.assertEqual(parse_args().max_length, DEFAULT_MAX_LENGTH)
