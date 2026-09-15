from functools import lru_cache
from pathlib import Path
import re
from typing import Literal

import joblib


MODEL_PATH = (
    Path(__file__).resolve().parents[4]
    / "artifacts"
    / "baseline-full"
    / "tfidf_logistic_regression.joblib"
)
MODEL_NAME = "tfidf-logistic-regression-full"
WORD_PATTERN = re.compile(r"[가-힣A-Za-z0-9]{2,}")
MAX_EVIDENCE_TERMS = 3


class ModelUnavailableError(RuntimeError):
    pass


@lru_cache
def load_model():
    try:
        return joblib.load(MODEL_PATH)
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


def calculate_title_body_similarity(model, title: str, body: str) -> float:
    vectorizer = model.named_steps["tfidf"]
    title_vector, body_vector = vectorizer.transform([title, body])
    similarity = title_vector.multiply(body_vector).sum()
    return round(float(similarity) * 100, 1)


def analyze_article(
    title: str, body: str
) -> tuple[float, Literal["clickbait", "non_clickbait"], float, list[str]]:
    model = load_model()
    text = f"[제목] {title} [본문] {body}"
    classes = model.named_steps["classifier"].classes_
    probabilities = model.predict_proba([text])[0]
    clickbait_probability = dict(zip(classes, probabilities))[0]
    score = round(float(clickbait_probability) * 100, 1)
    classification = "clickbait" if score >= 50 else "non_clickbait"
    similarity = calculate_title_body_similarity(model, title, body)
    return score, classification, similarity, find_title_terms_not_in_body(title, body)
