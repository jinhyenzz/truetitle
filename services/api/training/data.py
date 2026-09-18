"""제목/본문/라벨 JSONL 데이터를 읽고 라벨 균형을 맞춰 표본을 뽑는 공용 유틸리티.
train_transformer.py와 compare_models.py가 같은 표본 추출 로직을 쓰게 해서
학습과 비교 평가에 쓰이는 데이터가 서로 어긋나지 않게 한다.
"""

from __future__ import annotations

import json
import random
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any


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
