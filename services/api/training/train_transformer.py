"""제목과 본문을 한 쌍으로 입력하는 한국어 Transformer 분류 모델을 학습한다."""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
from torch.optim import AdamW
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_INPUT_DIR = PROJECT_ROOT / "data" / "processed" / "part1_body_disjoint"
DEFAULT_ARTIFACT_DIR = PROJECT_ROOT / "artifacts" / "transformer-title-body"
DEFAULT_MODEL_NAME = "klue/roberta-small"
LABEL_NAMES = {0: "clickbait", 1: "non_clickbait"}


@dataclass(frozen=True)
class ArticleExample:
    title: str
    body: str
    label: int


def load_examples(path: Path, limit: int | None) -> list[ArticleExample]:
    """JSONL을 읽고, 필요하면 라벨 균형을 맞춘 표본만 반환한다."""
    if not path.is_file():
        raise FileNotFoundError(f"전처리 결과를 찾을 수 없습니다: {path}")
    if limit is not None and limit < 2:
        raise ValueError("limit은 2 이상이어야 합니다.")

    quotas = {0: (limit + 1) // 2, 1: limit // 2} if limit is not None else None
    reservoirs: dict[int, list[ArticleExample]] = {0: [], 1: []}
    examples: list[ArticleExample] = []
    counts: Counter[int] = Counter()
    rng = random.Random(42)

    with path.open(encoding="utf-8") as input_file:
        for line_number, line in enumerate(input_file, start=1):
            article: dict[str, Any] = json.loads(line)
            title = article.get("title")
            body = article.get("body")
            label = article.get("label")
            if not isinstance(title, str) or not title.strip() or not isinstance(body, str) or not body.strip():
                raise ValueError(f"{path.name}:{line_number} 제목 또는 본문 형식이 올바르지 않습니다.")
            if type(label) is not int or label not in LABEL_NAMES:
                raise ValueError(f"{path.name}:{line_number} 라벨이 올바르지 않습니다: {label!r}")

            example = ArticleExample(title=title, body=body, label=label)
            counts[label] += 1
            if quotas is None:
                examples.append(example)
                continue

            reservoir = reservoirs[label]
            if len(reservoir) < quotas[label]:
                reservoir.append(example)
                continue
            replacement = rng.randrange(counts[label])
            if replacement < quotas[label]:
                reservoir[replacement] = example

    if quotas is not None:
        for label in LABEL_NAMES:
            examples.extend(reservoirs[label])
    if len({example.label for example in examples}) != 2:
        raise ValueError(f"{path.name}에서 두 라벨을 모두 읽지 못했습니다: {dict(counts)}")
    return examples


def tokenize_article(tokenizer: Any, title: str, body: str, max_length: int) -> dict[str, torch.Tensor]:
    """제목은 보존하고, 긴 본문만 자르도록 두 입력을 토크나이저에 전달한다."""
    encoded = tokenizer(
        title,
        body,
        truncation="only_second",
        max_length=max_length,
        padding="max_length",
        return_tensors="pt",
    )
    encoded.pop("token_type_ids", None)
    return encoded


class ArticleDataset(Dataset[dict[str, torch.Tensor]]):
    def __init__(self, examples: list[ArticleExample], tokenizer: Any, max_length: int) -> None:
        self.examples = examples
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self) -> int:
        return len(self.examples)

    def __getitem__(self, index: int) -> dict[str, torch.Tensor]:
        example = self.examples[index]
        encoded = tokenize_article(self.tokenizer, example.title, example.body, self.max_length)
        item = {key: value.squeeze(0) for key, value in encoded.items()}
        item["labels"] = torch.tensor(example.label, dtype=torch.long)
        return item


def choose_device(requested_device: str) -> torch.device:
    available = {
        "cuda": torch.cuda.is_available(),
        "xpu": bool(getattr(torch, "xpu", None) and torch.xpu.is_available()),
    }
    if requested_device == "auto":
        for name in ("cuda", "xpu"):
            if available[name]:
                return torch.device(name)
        return torch.device("cpu")
    if requested_device != "cpu" and not available[requested_device]:
        raise RuntimeError(f"요청한 장치를 사용할 수 없습니다: {requested_device}")
    return torch.device(requested_device)


def move_batch(batch: dict[str, torch.Tensor], device: torch.device) -> dict[str, torch.Tensor]:
    return {key: value.to(device) for key, value in batch.items()}


def train_one_epoch(
    model: Any,
    loader: DataLoader[dict[str, torch.Tensor]],
    optimizer: AdamW,
    device: torch.device,
) -> float:
    model.train()
    total_loss = 0.0
    for batch_index, batch in enumerate(loader, start=1):
        optimizer.zero_grad()
        output = model(**move_batch(batch, device))
        output.loss.backward()
        optimizer.step()
        total_loss += output.loss.item()
        if batch_index % 50 == 0 or batch_index == len(loader):
            print(f"  학습 배치 {batch_index:,}/{len(loader):,}", flush=True)
    return total_loss / len(loader)


def calculate_metrics(labels: list[int], predictions: list[int]) -> dict[str, float]:
    if not labels:
        raise ValueError("평가할 데이터가 없습니다.")
    scores: list[float] = []
    for label in LABEL_NAMES:
        true_positive = sum(actual == label and predicted == label for actual, predicted in zip(labels, predictions))
        false_positive = sum(actual != label and predicted == label for actual, predicted in zip(labels, predictions))
        false_negative = sum(actual == label and predicted != label for actual, predicted in zip(labels, predictions))
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
        scores.append(2 * precision * recall / (precision + recall) if precision + recall else 0.0)
    return {
        "accuracy": sum(actual == predicted for actual, predicted in zip(labels, predictions)) / len(labels),
        "f1_macro": sum(scores) / len(scores),
    }


def evaluate(
    model: Any,
    loader: DataLoader[dict[str, torch.Tensor]],
    device: torch.device,
) -> dict[str, float]:
    model.eval()
    labels: list[int] = []
    predictions: list[int] = []
    with torch.no_grad():
        for batch in loader:
            output = model(**move_batch(batch, device))
            labels.extend(batch["labels"].tolist())
            predictions.extend(output.logits.argmax(dim=1).cpu().tolist())
    return calculate_metrics(labels, predictions)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="한국어 Transformer 제목·본문 쌍 분류 학습")
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--artifact-dir", type=Path, default=DEFAULT_ARTIFACT_DIR)
    parser.add_argument("--model-name", default=DEFAULT_MODEL_NAME)
    parser.add_argument("--max-train-samples", type=int, required=True, help="학습할 최대 기사 수")
    parser.add_argument("--max-validation-samples", type=int, required=True, help="검증할 최대 기사 수")
    parser.add_argument("--max-length", type=int, default=256, help="제목+본문 토큰 최대 길이")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda", "xpu"), default="auto")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.max_length < 32:
        raise ValueError("--max-length는 32 이상이어야 합니다.")
    if args.batch_size < 1 or args.epochs < 1 or args.learning_rate <= 0:
        raise ValueError("batch-size, epochs, learning-rate 값을 확인하세요.")

    random.seed(42)
    torch.manual_seed(42)
    input_dir = args.input_dir.resolve()
    artifact_dir = args.artifact_dir.resolve()
    if artifact_dir.exists():
        raise FileExistsError(f"기존 학습 결과를 덮어쓰지 않습니다: {artifact_dir}")

    train_examples = load_examples(input_dir / "part1_train.jsonl", args.max_train_samples)
    validation_examples = load_examples(input_dir / "part1_validation.jsonl", args.max_validation_samples)
    print(f"학습: {len(train_examples):,}건 / {dict(Counter(example.label for example in train_examples))}")
    print(f"검증: {len(validation_examples):,}건 / {dict(Counter(example.label for example in validation_examples))}")

    device = choose_device(args.device)
    print(f"학습 장치: {device}")
    print(f"토크나이저와 사전학습 모델 다운로드: {args.model_name}", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name,
        num_labels=2,
        id2label=LABEL_NAMES,
        label2id={name: label for label, name in LABEL_NAMES.items()},
    ).to(device)

    train_loader = DataLoader(
        ArticleDataset(train_examples, tokenizer, args.max_length),
        batch_size=args.batch_size,
        shuffle=True,
    )
    validation_loader = DataLoader(
        ArticleDataset(validation_examples, tokenizer, args.max_length),
        batch_size=args.batch_size,
    )
    optimizer = AdamW(model.parameters(), lr=args.learning_rate)
    for epoch in range(1, args.epochs + 1):
        print(f"{epoch}/{args.epochs} 에포크 학습 시작", flush=True)
        average_loss = train_one_epoch(model, train_loader, optimizer, device)
        print(f"평균 학습 손실: {average_loss:.4f}")

    print("검증 데이터 평가 시작", flush=True)
    metrics = evaluate(model, validation_loader, device)
    artifact_dir.mkdir(parents=True)
    model.save_pretrained(artifact_dir)
    tokenizer.save_pretrained(artifact_dir)
    result = {
        "dataset": "AI Hub 낚시성 기사 탐지 데이터 Part1",
        "model": args.model_name,
        "input": "가공 제목(newTitle)과 본문(newsContent)을 쌍으로 입력",
        "truncation": "제목은 유지하고 긴 본문만 max_length까지 절단",
        "label_meaning": {str(key): value for key, value in LABEL_NAMES.items()},
        "train_samples": len(train_examples),
        "validation_samples": len(validation_examples),
        "train_label_counts": dict(Counter(example.label for example in train_examples)),
        "validation_label_counts": dict(Counter(example.label for example in validation_examples)),
        "max_length": args.max_length,
        "batch_size": args.batch_size,
        "epochs": args.epochs,
        "learning_rate": args.learning_rate,
        "device": str(device),
        **metrics,
    }
    (artifact_dir / "metrics.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n정확도: {result['accuracy']:.4f}")
    print(f"Macro F1: {result['f1_macro']:.4f}")
    print(f"모델: {artifact_dir}")


if __name__ == "__main__":
    main()
