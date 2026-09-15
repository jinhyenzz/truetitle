"""낚시성 기사 탐지용 TF-IDF + Logistic Regression 베이스라인을 학습한다.

전처리된 JSONL의 제목과 본문만 사용한다. 원본 데이터와 모델 산출물은 Git에 올리지
않으며, 학습 결과는 artifacts/ 아래의 새 폴더에 저장한다.
"""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter
from pathlib import Path
from typing import Any

from joblib import dump
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.pipeline import Pipeline


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_INPUT_DIR = PROJECT_ROOT / "data" / "processed" / "part1_body_disjoint"
DEFAULT_ARTIFACT_DIR = PROJECT_ROOT / "artifacts" / "baseline"
LABEL_NAMES = {0: "clickbait", 1: "non_clickbait"}
INPUT_DESCRIPTIONS = {
    "title": "가공 제목(newTitle)",
    "title_body": "가공 제목(newTitle) + 본문(newsContent)",
}


def article_text(
    article: dict[str, Any],
    input_mode: str = "title_body",
) -> str:
    """설정에 따라 제목 또는 제목과 본문을 모델 입력 문자열로 만든다."""
    if input_mode == "title":
        return article["title"]

    return f"[제목] {article['title']} [본문] {article['body']}"


def load_examples(
    path: Path,
    limit: int | None,
    input_mode: str = "title_body",
) -> tuple[list[str], list[int]]:
    """JSONL을 읽어 텍스트와 라벨을 반환한다.

    limit을 주면 전체 파일에서 라벨별 reservoir sampling을 수행한다.
    고정 시드로 재현성을 유지하고, 파일 앞부분에 있는 분야만 뽑히는 것을 방지한다.
    """
    if not path.is_file():
        raise FileNotFoundError(f"전처리 결과를 찾을 수 없습니다: {path}")

    if limit is not None and limit < 2:
        raise ValueError("limit은 2 이상이어야 합니다.")
    quotas = {0: (limit + 1) // 2, 1: limit // 2} if limit is not None else None
    rng = random.Random(42)
    reservoirs: dict[int, list[str]] = {0: [], 1: []}
    texts: list[str] = []
    labels: list[int] = []
    counts: Counter[int] = Counter()

    with path.open(encoding="utf-8") as input_file:
        for line_number, line in enumerate(input_file, start=1):
            article = json.loads(line)
            title = article.get("title")
            body = article.get("body")
            label = article.get("label")

            if not isinstance(title, str) or not isinstance(body, str) or not title.strip() or not body.strip():
                raise ValueError(f"{path.name}:{line_number} 제목 또는 본문 형식이 올바르지 않습니다.")
            if type(label) is not int or label not in LABEL_NAMES:
                raise ValueError(f"{path.name}:{line_number} 라벨이 올바르지 않습니다: {label!r}")
            counts[label] += 1
            if quotas is None:
                texts.append(article_text(article, input_mode))
                labels.append(label)
                continue

            reservoir = reservoirs[label]
            if len(reservoir) < quotas[label]:
                reservoir.append(article_text(article, input_mode))
            else:
                replacement = rng.randrange(counts[label])
                if replacement < quotas[label]:
                    reservoir[replacement] = article_text(article, input_mode)

    if quotas is not None:
        for label in LABEL_NAMES:
            texts.extend(reservoirs[label])
            labels.extend([label] * len(reservoirs[label]))

    if len(set(labels)) != 2:
        raise ValueError(f"{path.name}에서 두 라벨을 모두 읽지 못했습니다: {dict(counts)}")
    return texts, labels


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="TF-IDF + Logistic Regression 베이스라인 학습")
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=DEFAULT_INPUT_DIR,
        help="prepare_part1.py가 만든 JSONL 폴더 경로",
    )
    parser.add_argument(
        "--artifact-dir",
        type=Path,
        default=DEFAULT_ARTIFACT_DIR,
        help="모델과 평가 결과를 새로 저장할 로컬 폴더",
    )
    parser.add_argument(
        "--max-train-samples",
        type=int,
        default=None,
        help="빠른 확인용 학습 건수 상한. 생략하면 전체를 사용",
    )
    parser.add_argument(
        "--max-validation-samples",
        type=int,
        default=None,
        help="빠른 확인용 검증 건수 상한. 생략하면 전체를 사용",
    )
    parser.add_argument(
        "--input-mode",
        choices=("title_body", "title"),
        default="title_body",
        help="모델 입력으로 제목과 본문을 함께 쓸지, 제목만 쓸지 선택",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.max_train_samples is not None and args.max_train_samples < 2:
        raise ValueError("--max-train-samples는 2 이상이어야 합니다.")
    if args.max_validation_samples is not None and args.max_validation_samples < 2:
        raise ValueError("--max-validation-samples는 2 이상이어야 합니다.")

    input_dir = args.input_dir.resolve()
    artifact_dir = args.artifact_dir.resolve()
    if artifact_dir.exists():
        raise FileExistsError(f"기존 학습 결과를 덮어쓰지 않습니다: {artifact_dir}")

    train_texts, train_labels = load_examples(
        input_dir / "part1_train.jsonl", args.max_train_samples, args.input_mode,
    )
    validation_texts, validation_labels = load_examples(
        input_dir / "part1_validation.jsonl", args.max_validation_samples, args.input_mode,
    )
    print(f"학습: {len(train_labels):,}건 / {dict(Counter(train_labels))}")
    print(f"검증: {len(validation_labels):,}건 / {dict(Counter(validation_labels))}")

    model = Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    analyzer="char_wb",
                    ngram_range=(2, 5),
                    min_df=2,
                    max_features=150_000,
                    sublinear_tf=True,
                ),
            ),
            (
                "classifier",
                LogisticRegression(max_iter=1_000, solver="liblinear", random_state=42),
            ),
        ]
    )
    print("TF-IDF 변환 및 분류 모델 학습 시작", flush=True)
    model.fit(train_texts, train_labels)
    print("검증 데이터 평가 시작", flush=True)
    predictions = model.predict(validation_texts)

    artifact_dir.mkdir(parents=True)
    dump(model, artifact_dir / "tfidf_logistic_regression.joblib")
    metrics = {
        "dataset": "AI Hub 낚시성 기사 탐지 데이터 Part1",
        "input": INPUT_DESCRIPTIONS[args.input_mode],
        "input_mode": args.input_mode,
        "label_meaning": {str(key): value for key, value in LABEL_NAMES.items()},
        "train_samples": len(train_labels),
        "validation_samples": len(validation_labels),
        "sampling": {
            "train": "stratified_reservoir" if args.max_train_samples is not None else "all",
            "validation": "stratified_reservoir" if args.max_validation_samples is not None else "all",
            "seed": 42,
            "max_train_samples": args.max_train_samples,
            "max_validation_samples": args.max_validation_samples,
        },
        "train_label_counts": dict(Counter(train_labels)),
        "validation_label_counts": dict(Counter(validation_labels)),
        "vectorizer": {
            "analyzer": "char_wb",
            "ngram_range": [2, 5],
            "min_df": 2,
            "max_features": 150_000,
        },
        "classifier": {"name": "LogisticRegression", "solver": "liblinear", "random_state": 42},
        "accuracy": accuracy_score(validation_labels, predictions),
        "f1_macro": f1_score(validation_labels, predictions, average="macro"),
        "confusion_matrix": confusion_matrix(validation_labels, predictions, labels=[0, 1]).tolist(),
        "classification_report": classification_report(
            validation_labels,
            predictions,
            labels=[0, 1],
            target_names=[LABEL_NAMES[0], LABEL_NAMES[1]],
            output_dict=True,
            zero_division=0,
        ),
    }
    (artifact_dir / "metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"\n정확도: {metrics['accuracy']:.4f}")
    print(f"Macro F1: {metrics['f1_macro']:.4f}")
    print(f"모델: {artifact_dir / 'tfidf_logistic_regression.joblib'}")
    print(f"평가: {artifact_dir / 'metrics.json'}")


if __name__ == "__main__":
    main()
