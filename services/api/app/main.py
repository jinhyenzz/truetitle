from fastapi import FastAPI, Response, status

from app.api.analyze import router as analyze_router
from app.ml.predictor import ModelUnavailableError, load_model

app = FastAPI(title="TrueTitle Analysis API")
app.include_router(analyze_router)


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
