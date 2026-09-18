from fastapi import FastAPI, Response, status

from app.api.analyze import router as analyze_router
from app.ml.predictor import ModelUnavailableError, load_model

app = FastAPI(title="TrueTitle Analysis API")
app.include_router(analyze_router)


@app.on_event("startup")
def warm_up_model() -> None:
    # 서버 시작 시 한 번만 모델을 로드해둔다. 이걸 안 하면 재시작 직후 여러 요청이
    # 동시에 캐시 미스를 겪을 때 load_model()의 무거운 작업(토크나이저+모델 로드)이
    # 요청마다 중복 실행될 수 있다 (lru_cache는 함수 실행 중엔 잠금을 풀어둔다).
    # 실패해도 서버 자체는 뜨게 두고, /ready와 /analyze가 상태를 알려주게 한다.
    try:
        load_model()
    except ModelUnavailableError:
        pass


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def ready(response: Response) -> dict[str, bool]:
    try:
        load_model()
    except ModelUnavailableError:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"ready": False}
    return {"ready": True}
