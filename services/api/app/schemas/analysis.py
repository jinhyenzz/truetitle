from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=50_000)


class AnalyzeResponse(BaseModel):
    clickbait_score: float = Field(ge=0, le=100)
    clickbait_signal_level: Literal[1, 2, 3, 4, 5]
    clickbait_signal_label: str
    classification: Literal["clickbait", "non_clickbait"]
    title_body_similarity: float = Field(ge=0, le=100)
    evidence: list[str] = Field(default_factory=list, max_length=3)
    model: str
    note: str
