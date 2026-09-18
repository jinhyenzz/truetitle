from functools import lru_cache
from pathlib import Path
import re
from typing import Literal

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer


MODEL_PATH = Path(__file__).resolve().parents[4] / "artifacts" / "transformer-50000-v1"
MODEL_NAME = "klue-roberta-small-title-body"
WORD_PATTERN = re.compile(r"[가-힣A-Za-z0-9]{2,}")
MAX_EVIDENCE_TERMS = 3
SIGNAL_LABELS = {
    1: "낚시성 신호 매우 낮음",
    2: "낚시성 신호 낮음",
    3: "확인 권장",
    4: "낚시성 신호 높음",
    5: "낚시성 신호 매우 높음",
}


class ModelUnavailableError(RuntimeError):
    pass


@lru_cache
def load_model():
    try:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
        model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH).eval()
        # 모델 config의 label2id에서 "clickbait" 인덱스를 직접 조회한다.
        # 재학습으로 라벨 순서가 바뀌어도(예: 0/1이 뒤바뀌어도) 점수가 조용히
        # 뒤집히지 않도록, 인덱스를 하드코딩하지 않고 여기서 한 번 검증해둔다.
        clickbait_index = model.config.label2id.get("clickbait")
        if clickbait_index is None:
            raise ValueError(f"모델 config에 'clickbait' 라벨이 없습니다: {model.config.label2id!r}")
        return tokenizer, model, clickbait_index
    except Exception as error:
        raise ModelUnavailableError(
            "분석 모델을 불러오지 못했습니다."
        ) from error


def find_title_terms_not_in_body(title: str, body: str) -> list[str]:
    normalized_body = body.casefold()
    seen_terms: set[str] = set()
    evidence: list[str] = []

    for term in WORD_PATTERN.findall(title):
        normalized_term = term.casefold()
        if normalized_term in seen_terms or normalized_term in normalized_body:
            continue
        seen_terms.add(normalized_term)
        evidence.append(term)
        if len(evidence) == MAX_EVIDENCE_TERMS:
            break

    return evidence


def calculate_title_body_similarity(title: str, body: str) -> float:
    terms = list(dict.fromkeys(term.casefold() for term in WORD_PATTERN.findall(title)))
    if not terms:
        return 0.0
    normalized_body = body.casefold()
    return round(sum(term in normalized_body for term in terms) / len(terms) * 100, 1)


def score_to_signal_level(score: float) -> tuple[Literal[1, 2, 3, 4, 5], str]:
    if score < 20:
        level = 1
    elif score < 40:
        level = 2
    elif score < 60:
        level = 3
    elif score < 80:
        level = 4
    else:
        level = 5
    return level, SIGNAL_LABELS[level]


def analyze_article(
    title: str, body: str
) -> tuple[float, Literal["clickbait", "non_clickbait"], float, list[str]]:
    tokenizer, model, clickbait_index = load_model()
    encoded = tokenizer(title, body, truncation="only_second", max_length=128, padding=True, return_tensors="pt")
    encoded.pop("token_type_ids", None)
    with torch.no_grad():
        clickbait_probability = torch.softmax(model(**encoded).logits, dim=1)[0, clickbait_index].item()
    score = round(clickbait_probability * 100, 1)
    classification = "clickbait" if score >= 50 else "non_clickbait"
    similarity = calculate_title_body_similarity(title, body)
    return score, classification, similarity, find_title_terms_not_in_body(title, body)
