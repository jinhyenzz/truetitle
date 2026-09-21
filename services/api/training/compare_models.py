"""같은 검증 표본에서 TF-IDF와 Transformer를 각각 평가한다."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

# 스크립트로 직접 실행(python compare_models.py)하든, 테스트에서
# training.compare_models로 패키지 임포트하든 training.data/training.metrics를
# 같은 이름으로 찾을 수 있도록 services/api를 sys.path에 넣어둔다. training/ 자체를
# 넣고 data/metrics를 상위 없이 바로 import하면 'data'·'metrics'라는 흔한 이름이
# sys.modules에 등록돼 나중에 같은 이름의 다른 패키지와 충돌할 수 있어 피한다.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from training.data import ArticleExample, load_examples  # noqa: E402
from training.metrics import calculate_metrics  # noqa: E402
from training.train_baseline import article_text  # noqa: E402
from app.ml.text import DEFAULT_MAX_LENGTH, NORMALIZATION_DESCRIPTION, tokenize_article  # noqa: E402


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_INPUT_DIR = PROJECT_ROOT / "data" / "processed" / "part1_body_disjoint"


def predict_baseline(examples: list[ArticleExample], artifact_dir: Path, input_mode: str) -> list[int]:
    from joblib import load

    model = load(artifact_dir / "tfidf_logistic_regression.joblib")
    # train_baseline.py와 같은 article_text()를 써서, 여기서 만드는 입력 형식이 실제로
    # 그 모델이 학습된 형식(--input-mode)과 항상 같게 유지한다. 형식이 어긋나면
    # (예: title 모드로 학습한 모델에 title_body 텍스트를 넣으면) 평가 지표가 조용히 무의미해진다.
    texts = [
        article_text({"title": example.title, "body": example.body}, input_mode)
        for example in examples
    ]
    return model.predict(texts).tolist()


def predict_transformer(
    examples: list[ArticleExample],
    artifact_dir: Path,
    batch_size: int,
    max_length: int = DEFAULT_MAX_LENGTH,
) -> list[int]:
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(artifact_dir)
    model = AutoModelForSequenceClassification.from_pretrained(artifact_dir).eval()
    predictions: list[int] = []
    with torch.no_grad():
        for start in range(0, len(examples), batch_size):
            batch = examples[start:start + batch_size]
            encoded = tokenize_article(
                tokenizer,
                [example.title for example in batch],
                [example.body for example in batch],
                max_length=max_length,
                padding=True,
            )
            predictions.extend(model(**encoded).logits.argmax(dim=1).tolist())
    return predictions


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="동일 검증 표본 모델 비교")
    parser.add_argument("--model", choices=("baseline", "transformer"), required=True)
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--samples", type=int, default=500)
    parser.add_argument("--baseline-artifact-dir", type=Path, default=PROJECT_ROOT / "artifacts" / "baseline-full")
    parser.add_argument("--transformer-artifact-dir", type=Path, default=PROJECT_ROOT / "artifacts" / "transformer-experiment-2000-v2")
    # baseline 모델이 실제로 학습된 입력 형식과 반드시 일치해야 한다(train_baseline.py --input-mode).
    parser.add_argument("--input-mode", choices=("title", "title_body"), default="title_body")
    # transformer 모델이 실제로 학습된 길이와 반드시 일치해야 한다(train_transformer.py --max-length).
    parser.add_argument("--max-length", type=int, default=DEFAULT_MAX_LENGTH)
    parser.add_argument("--report-path", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    examples = load_examples(args.input_dir / "part1_validation.jsonl", args.samples)
    labels = [example.label for example in examples]
    if args.model == "baseline":
        predictions = predict_baseline(examples, args.baseline_artifact_dir, args.input_mode)
    else:
        predictions = predict_transformer(
            examples, args.transformer_artifact_dir, batch_size=8, max_length=args.max_length
        )
    metrics = calculate_metrics(labels, predictions)
    errors = [
        {"title": example.title, "actual": actual, "predicted": predicted}
        for example, actual, predicted in zip(examples, labels, predictions)
        if actual != predicted
    ]
    report = {
        "model": args.model,
        "samples": len(examples),
        "label_counts": dict(Counter(labels)),
        **metrics,
        "errors": errors[:20],
    }
    if args.model == "baseline":
        report.update(input_mode=args.input_mode)
    else:
        report.update(
            artifact_dir=str(args.transformer_artifact_dir.resolve()),
            max_length=args.max_length,
            truncation="longest_first",
            normalization=NORMALIZATION_DESCRIPTION,
        )
    args.report_path.parent.mkdir(parents=True, exist_ok=True)
    args.report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"정확도: {metrics['accuracy']:.4f}")
    print(f"Macro F1: {metrics['f1_macro']:.4f}")
    print(f"오답 수: {len(errors)}")
    print(f"보고서: {args.report_path}")


if __name__ == "__main__":
    main()
