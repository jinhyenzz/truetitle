from fastapi import APIRouter, HTTPException

from app.ml.predictor import MODEL_NAME, ModelUnavailableError, analyze_article, score_to_signal_level
from app.schemas.analysis import AnalyzeRequest, AnalyzeResponse


router = APIRouter(tags=["analysis"])


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    try:
        score, classification, similarity, evidence = analyze_article(
            request.title, request.body
        )
    except ModelUnavailableError as error:
        raise HTTPException(status_code=503, detail="분석 모델을 준비하지 못했습니다.") from error

    signal_level, signal_label = score_to_signal_level(score)

    return AnalyzeResponse(
        clickbait_score=score,
        clickbait_signal_level=signal_level,
        clickbait_signal_label=signal_label,
        classification=classification,
        title_body_similarity=similarity,
        evidence=evidence,
        model=MODEL_NAME,
        note="낚시성 신호와 제목·본문의 표현 유사도·정확한 표현 비교 결과이며 기사 사실 여부를 판정하지 않습니다.",
    )
