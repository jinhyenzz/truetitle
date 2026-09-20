import re
from typing import Any


DEFAULT_MAX_LENGTH = 128


def normalize_model_text(value: str) -> str:
    """학습·추론에서 잔여 이스케이프와 연속 공백을 같은 방식으로 정리한다."""
    value = re.sub(r'\\+"', '"', value)
    return " ".join(value.split())


def tokenize_article(
    tokenizer: Any,
    title: str | list[str],
    body: str | list[str],
    max_length: int = DEFAULT_MAX_LENGTH,
    *,
    padding: bool | str = "max_length",
    normalize: bool = True,
) -> Any:
    """학습·평가·API의 공통 입력 규칙. normalize=False는 정리 전 대조 검사 전용."""
    if normalize:
        title = normalize_model_text(title) if isinstance(title, str) else [normalize_model_text(value) for value in title]
        body = normalize_model_text(body) if isinstance(body, str) else [normalize_model_text(value) for value in body]
    # longest_first: 보통 긴 본문을 줄이며, 제목도 한도를 넘으면 함께 줄인다.
    # 본문 전체를 읽는 방식은 아니며, 학습·평가·추론에 같은 길이를 지정해야 한다.
    encoded = tokenizer(
        title,
        body,
        truncation=True,
        max_length=max_length,
        padding=padding,
        return_tensors="pt",
    )
    encoded.pop("token_type_ids", None)
    return encoded
