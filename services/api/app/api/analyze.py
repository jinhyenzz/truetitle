from fastapi import APIRouter, HTTPException

from app.ml.predictor import MODEL_NAME, ModelUnavailableError, analyze_article
from app.schemas.analysis import AnalyzeRequest, AnalyzeResponse


router = APIRouter(tags=["analysis"])


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    try:
        score, classification, evidence = analyze_article(request.title, request.body)
    except ModelUnavailableError as error:
        raise HTTPException(status_code=503, detail="분석 모델을 준비하지 못했습니다.") from error

    return AnalyzeResponse(
        clickbait_score=score,
        classification=classification,
        evidence=evidence,
        model=MODEL_NAME,
        note="낚시성 신호와 제목·본문의 정확한 표현 비교 결과이며 기사 사실 여부를 판정하지 않습니다.",
    )
