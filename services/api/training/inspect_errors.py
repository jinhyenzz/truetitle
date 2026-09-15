import json
from pathlib import Path

import joblib

from train_baseline import article_text


PROJECT_ROOT = Path(__file__).resolve().parents[3]
MODEL_PATH = PROJECT_ROOT / "artifacts/baseline-full/tfidf_logistic_regression.joblib"
DATA_PATH = PROJECT_ROOT / "data/processed/part1_body_disjoint/part1_validation.jsonl"

model = joblib.load(MODEL_PATH)
error_count = 0

with DATA_PATH.open(encoding="utf-8") as input_file:
    for line in input_file:
        article = json.loads(line)
        text = article_text(article)
        prediction = int(model.predict([text])[0])

        if prediction != article["label"]:
            print("제목:", article["title"])
            print("실제 정답:", article["label"])
            print("모델 예측:", prediction)
            print("본문:", article["body"])
            comparison_title = "한미약품, ISO37001 인증 획득"
            comparison_text = (
                f"[제목] {comparison_title} [본문] {article['body']}"
            )

            probabilities = model.predict_proba([text, comparison_text])

            original_score = probabilities[0][0] * 100
            comparison_score = probabilities[1][0] * 100

            print("원래 제목 낚시성 점수:", round(original_score, 1))
            print("비교 제목 낚시성 점수:", round(comparison_score, 1))
            break