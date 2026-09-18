"""라벨/예측 리스트로부터 accuracy·macro F1을 계산하는 공용 유틸리티.
train_transformer.py(학습 중 검증)와 compare_models.py(모델 비교)가 같은
채점 기준을 쓰게 한다.
"""

from __future__ import annotations

from training.data import LABEL_NAMES


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
