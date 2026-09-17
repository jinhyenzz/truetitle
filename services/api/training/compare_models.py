"""같은 검증 표본에서 TF-IDF와 Transformer를 각각 평가한다."""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_INPUT_DIR = PROJECT_ROOT / "data" / "processed" / "part1_body_disjoint"
LABEL_NAMES = {0: "clickbait", 1: "non_clickbait"}


def load_examples(path: Path, limit: int) -> list[dict[str, Any]]:
    quotas = {0: (limit + 1) // 2, 1: limit // 2}
    reservoirs: dict[int, list[dict[str, Any]]] = {0: [], 1: []}
    counts: Counter[int] = Counter()
    rng = random.Random(42)
    with path.open(encoding="utf-8") as input_file:
        for line in input_file:
            article = json.loads(line)
            label = article["label"]
            counts[label] += 1
            reservoir = reservoirs[label]
            if len(reservoir) < quotas[label]:
                reservoir.append(article)
            else:
                replacement = rng.randrange(counts[label])
                if replacement < quotas[label]:
                    reservoir[replacement] = article
    return reservoirs[0] + reservoirs[1]


def calculate_metrics(labels: list[int], predictions: list[int]) -> dict[str, float]:
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


def predict_baseline(examples: list[dict[str, Any]], artifact_dir: Path) -> list[int]:
    from joblib import load

    model = load(artifact_dir / "tfidf_logistic_regression.joblib")
    texts = [f"[제목] {article['title']} [본문] {article['body']}" for article in examples]
    return model.predict(texts).tolist()


def predict_transformer(examples: list[dict[str, Any]], artifact_dir: Path, batch_size: int) -> list[int]:
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(artifact_dir)
    model = AutoModelForSequenceClassification.from_pretrained(artifact_dir).eval()
    predictions: list[int] = []
    with torch.no_grad():
        for start in range(0, len(examples), batch_size):
            batch = examples[start:start + batch_size]
            encoded = tokenizer(
                [article["title"] for article in batch],
                [article["body"] for article in batch],
                truncation="only_second",
                max_length=128,
                padding=True,
                return_tensors="pt",
            )
            encoded.pop("token_type_ids", None)
            predictions.extend(model(**encoded).logits.argmax(dim=1).tolist())
    return predictions


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="동일 검증 표본 모델 비교")
    parser.add_argument("--model", choices=("baseline", "transformer"), required=True)
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--samples", type=int, default=500)
    parser.add_argument("--baseline-artifact-dir", type=Path, default=PROJECT_ROOT / "artifacts" / "baseline-full")
    parser.add_argument("--transformer-artifact-dir", type=Path, default=PROJECT_ROOT / "artifacts" / "transformer-experiment-2000-v2")
    parser.add_argument("--report-path", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    examples = load_examples(args.input_dir / "part1_validation.jsonl", args.samples)
    labels = [article["label"] for article in examples]
    if args.model == "baseline":
        predictions = predict_baseline(examples, args.baseline_artifact_dir)
    else:
        predictions = predict_transformer(examples, args.transformer_artifact_dir, batch_size=8)
    metrics = calculate_metrics(labels, predictions)
    errors = [
        {"title": article["title"], "actual": actual, "predicted": predicted}
        for article, actual, predicted in zip(examples, labels, predictions)
        if actual != predicted
    ]
    report = {
        "model": args.model,
        "samples": len(examples),
        "label_counts": dict(Counter(labels)),
        **metrics,
        "errors": errors[:20],
    }
    args.report_path.parent.mkdir(parents=True, exist_ok=True)
    args.report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"정확도: {metrics['accuracy']:.4f}")
    print(f"Macro F1: {metrics['f1_macro']:.4f}")
    print(f"오답 수: {len(errors)}")
    print(f"보고서: {args.report_path}")


if __name__ == "__main__":
    main()
