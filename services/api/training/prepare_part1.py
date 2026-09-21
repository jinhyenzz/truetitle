"""AI Hub Part1 라벨링 ZIP을 모델 학습용 JSONL로 변환한다.

원본 ZIP은 읽기만 한다. 생성 파일은 data/processed/ 아래에 저장되며
.gitignore 규칙으로 Git에 포함되지 않는다.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ml.text import normalize_model_text as normalize_text


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATASET_ROOT = PROJECT_ROOT / "146.낚시성 기사 탐지 데이터"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data" / "processed" / "part1_body_disjoint"


def build_article(raw: dict[str, Any]) -> dict[str, Any]:
    """원본 JSON에서 모델 학습에 필요한 필드만 꺼낸다."""
    source = raw["sourceDataInfo"]
    labeled = raw["labeledDataInfo"]

    article_id = source["newsID"]
    raw_title = labeled["newTitle"]
    raw_body = source["newsContent"]
    title = normalize_text(raw_title)
    body = normalize_text(raw_body)
    label = labeled["clickbaitClass"]

    if not isinstance(article_id, str) or not article_id:
        raise ValueError("newsID가 비어 있습니다.")
    if not title:
        raise ValueError("newTitle이 비어 있습니다.")
    if not body:
        raise ValueError("newsContent가 비어 있습니다.")
    if label not in (0, 1):
        raise ValueError(f"알 수 없는 clickbaitClass: {label!r}")

    return {
        "id": article_id,
        "title": title,
        "body": body,
        # 정규화 이전 원문. evaluate_quote_normalization.py가 정규화 전/후 예측을
        # 비교하려면 실제 "정규화 전" 텍스트가 필요한데, title/body는 이미 정규화된
        # 값이라 그 자체로는 비교 기준이 될 수 없다.
        "raw_title": raw_title,
        "raw_body": raw_body,
        "label": label,
    }


def content_key(article: dict[str, Any]) -> str:
    """제목과 본문이 같은 기사를 찾는 해시 키를 만든다."""
    text = f"{article['title']}\0{article['body']}"
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def body_key(article: dict[str, Any]) -> str:
    """따옴표·공백이 정리된 본문으로 학습·검증 간 중복을 확인한다."""
    return hashlib.sha256(article["body"].encode("utf-8")).hexdigest()


def label_directory(dataset_root: Path, split_name: str) -> tuple[Path, str]:
    """AI Hub의 Training/Validation 폴더와 ZIP 접두어를 반환한다."""
    if split_name == "train":
        return (
            dataset_root
            / "01-1.정식개방데이터"
            / "Training"
            / "02.라벨링데이터",
            "TL",
        )
    if split_name == "validation":
        return (
            dataset_root
            / "01-1.정식개방데이터"
            / "Validation"
            / "02.라벨링데이터",
            "VL",
        )
    raise ValueError(f"지원하지 않는 분할: {split_name}")


def prepare_split(
    *,
    dataset_root: Path,
    split_name: str,
    output_path: Path,
    seen_contents: dict[str, int],
    training_bodies: set[str],
) -> Counter[str]:
    """한 분할을 JSONL로 작성하고 통계를 반환한다."""
    directory, prefix = label_directory(dataset_root, split_name)
    archives = sorted(directory.glob(f"{prefix}_Part1_*.zip"))
    if len(archives) != 21:
        raise FileNotFoundError(
            f"{directory}에서 Part1 라벨 ZIP 21개를 찾지 못했습니다. 찾은 수: {len(archives)}"
        )

    stats: Counter[str] = Counter(archives=len(archives))
    with output_path.open("x", encoding="utf-8") as output_file:
        for archive_path in archives:
            with ZipFile(archive_path) as archive:
                json_names = sorted(
                    name for name in archive.namelist() if name.endswith(".json")
                )
                stats["input_json"] += len(json_names)

                for name in json_names:
                    try:
                        raw = json.loads(archive.read(name))
                        article = build_article(raw)
                    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
                        stats["invalid_json"] += 1
                        print(f"[제외] {archive_path.name} / {name}: {error}")
                        continue

                    key = content_key(article)
                    previous_label = seen_contents.get(key)
                    if previous_label is not None:
                        if previous_label == article["label"]:
                            stats["duplicate_content"] += 1
                        else:
                            stats["conflicting_content_label"] += 1
                        continue

                    seen_contents[key] = article["label"]
                    body_hash = body_key(article)
                    if split_name == "validation" and body_hash in training_bodies:
                        stats["training_body_overlap"] += 1
                        continue
                    if split_name == "train":
                        training_bodies.add(body_hash)

                    output_file.write(json.dumps(article, ensure_ascii=False) + "\n")
                    stats["written"] += 1
                    stats[f"label_{article['label']}"] += 1

            print(
                f"[{split_name}] {archive_path.name} 완료 "
                f"(누적 {stats['written']:,}건)",
                flush=True,
            )

    return stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AI Hub Part1 라벨 데이터를 JSONL로 변환")
    parser.add_argument(
        "--dataset-root",
        type=Path,
        default=DEFAULT_DATASET_ROOT,
        help="'146.낚시성 기사 탐지 데이터' 폴더 경로",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="학습용 JSONL을 저장할 로컬 폴더",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    dataset_root = args.dataset_root.resolve()
    output_dir = args.output_dir.resolve()

    if not dataset_root.is_dir():
        raise FileNotFoundError(f"데이터 폴더를 찾을 수 없습니다: {dataset_root}")

    output_dir.mkdir(parents=True, exist_ok=True)
    train_path = output_dir / "part1_train.jsonl"
    validation_path = output_dir / "part1_validation.jsonl"
    report_path = output_dir / "part1_preparation_report.json"
    existing = [path for path in (train_path, validation_path, report_path) if path.exists()]
    if existing:
        paths = ", ".join(str(path) for path in existing)
        raise FileExistsError(f"기존 결과 파일이 있어 덮어쓰지 않습니다: {paths}")

    # 학습에 사용한 본문은 제목이 달라도 검증에서 제외한다.
    seen_contents: dict[str, int] = {}
    training_bodies: set[str] = set()
    train_stats = prepare_split(
        dataset_root=dataset_root,
        split_name="train",
        output_path=train_path,
        seen_contents=seen_contents,
        training_bodies=training_bodies,
    )
    validation_stats = prepare_split(
        dataset_root=dataset_root,
        split_name="validation",
        output_path=validation_path,
        seen_contents=seen_contents,
        training_bodies=training_bodies,
    )

    report = {
        "dataset": "AI Hub 낚시성 기사 탐지 데이터",
        "input": "Part1 라벨링데이터만 사용",
        "label_meaning": {"0": "clickbait", "1": "non_clickbait"},
        "deduplication": "제목+본문 중복 제외 후, Training에 있는 본문을 사용하는 Validation 기사 제외",
        "body_comparison": "큰따옴표 앞 잔여 역슬래시·공백 정리 후 본문 일치 (유사 문서 검사는 포함하지 않음)",
        "training_unique_bodies": len(training_bodies),
        "train": dict(train_stats),
        "validation": dict(validation_stats),
    }
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("\n완료")
    print(f"학습용: {train_path}")
    print(f"검증용: {validation_path}")
    print(f"보고서: {report_path}")


if __name__ == "__main__":
    main()
