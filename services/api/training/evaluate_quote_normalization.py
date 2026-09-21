"""같은 검증 기사에 API의 입력 정리 전후를 적용해 회귀를 확인한다."""

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import torch

from app.ml.predictor import MODEL_PATH, predict_clickbait_score
from app.ml.text import DEFAULT_MAX_LENGTH, NORMALIZATION_DESCRIPTION
from training.compare_models import DEFAULT_INPUT_DIR
from training.data import ArticleExample, load_examples
from training.metrics import calculate_metrics


def evaluate(examples: list[ArticleExample]) -> dict:
    if not examples:
        raise ValueError("평가할 기사가 없습니다.")
    if any(article.raw_title is None or article.raw_body is None for article in examples):
        # prepare_part1.py가 만든 JSONL에는 raw_title/raw_body(정규화 이전 원문)가 있어야
        # "정규화 전/후"를 실제로 비교할 수 있다. article.title/body는 이미 정규화가 끝난
        # 값이라, 그것만으로는 정규화 전과 비교해도 항상 같은 값이 되어 회귀를 검출하지 못한다.
        raise ValueError(
            "raw_title/raw_body가 없는 데이터입니다. prepare_part1.py를 다시 실행해 "
            "정규화 이전 원문을 포함한 JSONL을 생성한 뒤 다시 시도하세요."
        )
    labels, before, after = [], [], []
    changed_titles = changed_bodies = changed_predictions = improved = regressed = 0
    score_deltas = []
    started = time.perf_counter()
    for index, article in enumerate(examples, start=1):
        raw_title, raw_body, label = article.raw_title, article.raw_body, article.label
        normalized_title, normalized_body = article.title, article.body
        old_score = predict_clickbait_score(raw_title, raw_body, normalize=False)
        # normalized_title/normalized_body(article.title/body)는 prepare_part1.py에서 이미
        # normalize_model_text를 거친 값이므로, tokenize_article이 내부에서 다시 정규화하지
        # 않도록 normalize=False로 호출한다 (불필요한 재작업 방지).
        new_score = (
            old_score
            if (normalized_title, normalized_body) == (raw_title, raw_body)
            else predict_clickbait_score(normalized_title, normalized_body, normalize=False)
        )
        old_label, new_label = int(old_score < 50), int(new_score < 50)
        labels.append(label)
        before.append(old_label)
        after.append(new_label)
        changed_titles += normalized_title != raw_title
        changed_bodies += normalized_body != raw_body
        changed_predictions += old_label != new_label
        improved += old_label != label and new_label == label
        regressed += old_label == label and new_label != label
        score_deltas.append(abs(new_score - old_score))
        if index % 50 == 0 or index == len(examples):
            print(f"평가 {index}/{len(examples)}", flush=True)

    def metrics(predictions: list[int]) -> dict:
        return {
            **calculate_metrics(labels, predictions),
            "false_positive": sum(actual == 1 and predicted == 0 for actual, predicted in zip(labels, predictions)),
            "false_negative": sum(actual == 0 and predicted == 1 for actual, predicted in zip(labels, predictions)),
        }

    return {
        "samples": len(examples),
        "label_counts": {str(label): labels.count(label) for label in (0, 1)},
        "changed_titles": changed_titles,
        "changed_bodies": changed_bodies,
        "changed_predictions": changed_predictions,
        "improved": improved,
        "regressed": regressed,
        "mean_absolute_score_change": sum(score_deltas) / len(score_deltas),
        "max_absolute_score_change": max(score_deltas),
        "before": metrics(before),
        "after": metrics(after),
        "seconds": round(time.perf_counter() - started, 2),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--samples", type=int, default=200)
    parser.add_argument("--report-path", type=Path, required=True)
    args = parser.parse_args()
    if args.samples < 2:
        parser.error("samples는 두 라벨을 포함하도록 2 이상이어야 합니다.")
    if args.report_path.exists():
        parser.error("기존 보고서를 덮어쓰지 않도록 새 report-path를 지정하세요.")
    torch.set_num_threads(2)
    input_path = args.input_dir / "part1_validation.jsonl"
    examples = load_examples(input_path, args.samples)
    if len(examples) != args.samples or {article.label for article in examples} != {0, 1}:
        parser.error("요청한 수의 두 라벨 검증 표본을 확보하지 못했습니다.")
    report = {
        "model": MODEL_PATH.name,
        "dataset": "AI Hub Part1 Validation, body-disjoint",
        "sampling_seed": 42,
        "max_length": DEFAULT_MAX_LENGTH,
        "truncation": True,
        "classification_threshold": 50,
        "normalization": NORMALIZATION_DESCRIPTION,
        "scope": "Regression sample from existing validation pool; not an independent real-world accuracy estimate.",
        **evaluate(examples),
    }
    with input_path.open("rb") as source:
        report["input_sha256"] = hashlib.file_digest(source, "sha256").hexdigest()
    with (MODEL_PATH / "model.safetensors").open("rb") as weights:
        report["weights_sha256"] = hashlib.file_digest(weights, "sha256").hexdigest()
    args.report_path.parent.mkdir(parents=True, exist_ok=True)
    with args.report_path.open("x", encoding="utf-8") as output:
        json.dump(report, output, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
