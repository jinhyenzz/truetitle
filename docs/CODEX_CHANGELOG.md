# 작업 변경 기록

## 2026-09-17 - 5만 건 Transformer 모델을 기본 실행 모델로 교체하고 Git LFS 배포 준비

- 요청 및 승인: 사용자가 사람 평가 전에 5만 건 학습 모델을 사용하고, 소현이가 저장소를 받은 뒤 실행할 수 있게 준비하도록 요청함.
- 백업: 수정 전 `services/api/app/ml/predictor.py`, `services/api/tests/test_main.py`, `.gitignore`, `.gitattributes`, `README.md`, `docs/CODEX_CHANGELOG.md`를 `.codex-backups/20260917-150000/`에 원래 상대 경로로 복사하고 SHA-256 일치를 확인함.
- 수정 파일: `predictor.py`의 기본 모델 경로를 `artifacts/transformer-10000-v1`에서 `artifacts/transformer-50000-v1`로 변경함. `.gitignore`는 5만 건 모델 폴더만 예외 처리했고, `.gitattributes`는 272,382,200바이트 `model.safetensors`만 Git LFS로 추적하도록 추가함. README에는 현재 구현 상태와 Git LFS를 포함한 로컬 API·확장 프로그램 실행 방법을 갱신함.
- 이유와 영향: 동일한 AI Hub 검증 5,000건에서 5만 건 모델의 정확도·Macro F1이 1만 건 모델보다 높았고(0.9606 대 0.9496), GitHub 일반 파일 제한 100MB를 넘는 실행 모델을 Git LFS로 전달할 수 있게 함. GitHub Desktop으로 LFS 지원 복제본을 받으면 소현이도 같은 모델을 내려받아 API를 실행할 수 있음.
- 검증: API 가상환경에서 `python -m unittest discover -s services/api/tests -p 'test_*.py' -v`를 실행해 12개 검사를 통과했고, 실제 `transformer-50000-v1` 가중치를 불러온 `/analyze` 검사도 통과함. `git check-attr`로 큰 가중치 파일의 LFS filter/diff/merge 속성을 확인했고, `git status --untracked-files=all`에서 5만 건 모델 폴더 다섯 파일이 추적 후보로 표시됨을 확인함. 1만 건 모델은 계속 ignore됨. 확장 프로그램의 `npm run compile` TypeScript 검사도 통과했고, `git diff --check`는 다음 확인 대상으로 남김.
- 미검증: 새 모델의 두 사람 실제 기사 합의 라벨 성능, Git LFS 모델의 원격 push·동료 복제, 새 5단계 응답을 사용한 확장 프로그램 화면은 아직 수행하지 않음. Git commit·push·PR·병합은 수행하지 않음.
- 원상복구: 별도 승인 후 `.codex-backups/20260917-150000/`의 파일을 원래 위치로 복원하면 1만 건 모델과 이전 Git 제외 설정으로 돌아감. Git LFS로 원격에 push한 모델 객체 삭제는 별도 원격 정리 작업이 필요함.

## 2026-09-17 - 분석 결과의 5단계 낚시성 신호 추가

- 요청 및 승인: 사용자가 점수만 표시하지 않고 확장 프로그램에서 5단계로 표현하기를 요청했고, 소현이의 사람 평가를 기다리는 동안 API에서 먼저 사용할 수 있는 형태로 준비하도록 요청함.
- 백업: 수정 전 `services/api/app/ml/predictor.py`, `services/api/app/api/analyze.py`, `services/api/app/schemas/analysis.py`, `services/api/tests/test_predictor.py`, `services/api/tests/test_main.py`, `docs/CODEX_CHANGELOG.md`를 `.codex-backups/20260917-144500/`에 원래 상대 경로로 복사하고 SHA-256 일치를 확인함.
- 수정 파일: `predictor.py`에 점수 구간을 1~5단계와 한국어 표시 문구로 변환하는 순수 함수를 추가함. `/analyze` 성공 응답에 `clickbait_signal_level`(1~5)과 `clickbait_signal_label`을 추가했고, 응답 스키마와 경계값·실제 API 응답 검사를 갱신함.
- 구간: 0~19.9점은 1단계(매우 낮음), 20~39.9점은 2단계(낮음), 40~59.9점은 3단계(확인 권장), 60~79.9점은 4단계(높음), 80~100점은 5단계(매우 높음)임.
- 이유와 영향: 이 단계는 기존 모델 점수를 사람이 읽기 쉽게 표현하는 보조 정보이며, 기사 진위 판정이나 보정된 확률이 아님. 기존 `clickbait_score`, 이진 `classification`, 제목·본문 유사도와 근거 목록은 변경하지 않아 현재 확장 프로그램도 계속 동작함. 소현이는 이후 선택적으로 새 필드를 사용해 현재 3단계 화면을 5단계로 바꿀 수 있음.
- 검증: API 가상환경에서 `python -m unittest discover -s services/api/tests -p 'test_*.py' -v`를 실행해 12개 검사를 통과함. 실제 `transformer-10000-v1` 모델을 불러온 `/analyze` 검사에서 새 5단계 필드도 포함됨을 확인함. 확장 프로그램의 `npm run compile` TypeScript 검사를 통과했고, `git diff --check`는 다음 확인 대상으로 남김.
- 미검증: 사람 평가 기반의 점수 구간 보정, 새 응답 필드를 사용한 확장 프로그램 5단계 표시, Git commit·push·PR·병합은 아직 수행하지 않음.
- 원상복구: 별도 승인 후 `.codex-backups/20260917-144500/`의 파일을 원래 위치로 복원하면 됨.

## 2026-09-17 - 5만 건 Transformer 비교 및 API 통합 검사 복구

- 요청 및 승인: 사용자가 소현이의 실제 기사 평가를 기다리는 동안 AI가 독립적으로 처리할 수 있는 다음 작업을 진행하도록 요청함. 사용자가 5만 건·3에포크 Transformer 학습을 완료한 뒤, 기존 1만 건 모델과 같은 기사로 비교함.
- 백업: 수정 전 `services/api/tests/test_main.py`, `docs/CODEX_CHANGELOG.md`를 `.codex-backups/20260917-143000/`에 원래 상대 경로로 복사하고 SHA-256 일치를 확인함.
- 수정 파일: `services/api/tests/test_main.py`의 실제 모델 API 검사 조건을 `MODEL_PATH.is_file()`에서 `MODEL_PATH.is_dir()`로 수정함. 현재 Transformer는 단일 모델 파일이 아니라 모델·토크나이저 파일을 담은 폴더이므로, 기존 조건에서는 실제 모델이 있어도 검사가 생략됐음. API 동작이나 모델 경로는 변경하지 않음.
- 학습 결과: 사용자가 `transformer-50000-v1`에 AI Hub Part1 학습 50,000건(라벨별 25,000건), 검증 5,000건(라벨별 2,500건), 최대 128토큰, 배치 8, CPU, 3에포크로 학습을 완료함. 저장된 학습 결과는 정확도 0.9606, Macro F1 0.9605945임.
- 동일 표본 비교: 고정 시드 42로 선택한 검증 5,000건(라벨별 2,500건)을 두 모델에 동일하게 입력함. 1만 건 모델은 정확도 0.9496, Macro F1 0.9496000, 오답 252건, 혼동행렬 `[[2372, 128], [124, 2376]]`이었고, 5만 건 모델은 정확도 0.9606, Macro F1 0.9605945, 오답 197건, 혼동행렬 `[[2372, 128], [69, 2431]]`이었음. 행은 실제 라벨, 열은 예측 라벨이고 라벨 순서는 [낚시성, 비낚시성]임. 새 모델은 기존 오답 133건을 고치고 새 오답 78건을 만들었으며, 낚시성 기사 미탐지 128건은 같고 비낚시성 기사 오경고가 124건에서 69건으로 감소함.
- 이유와 영향: 학습 당시 각 모델이 사용한 검증 표본 수가 달라 저장된 metrics.json 수치를 직접 비교하면 안 되므로, 동일 기사 비교 결과를 모델 선택 근거로 기록함. 아직 API는 `transformer-10000-v1`을 사용하며 새 모델로 자동 교체하지 않음.
- 검증: API 가상환경에서 `python -m unittest discover -s services/api/tests -p 'test_*.py' -v`를 실행해 11개 검사를 통과함. 수정한 실제 모델 검사에서 `transformer-10000-v1` 가중치를 불러와 `/analyze`가 정상 응답함을 확인함. 확장 프로그램에서 `npm run compile`을 실행해 TypeScript 검사도 통과했고, `git diff --check`는 오류 없이 통과함(LF/CRLF 경고만 출력).
- 미검증: 두 사람의 새 네이버 기사 20건 합의 라벨, 그 라벨에 따른 실제 서비스 성능 비교, 5만 건 모델의 API 교체 및 확장 프로그램 통합 실행은 아직 수행하지 않음. Git commit·push·PR·병합은 수행하지 않음.
- 원상복구: 별도 승인 후 `.codex-backups/20260917-143000/services/api/tests/test_main.py`와 `docs/CODEX_CHANGELOG.md`를 원래 위치로 복원하면 됨. 5만 건 모델 산출물은 이 변경으로 수정하지 않음.

## 2026-09-16 - 1만 건 Transformer 모델을 분석 API 기본 모델로 교체

- 요청 및 승인: 동일 2,000건 검증에서 1만 건 학습 모델이 기존 2천 건 모델보다 정확도와 Macro F1 모두 높았고(0.9565 대 0.9195), 사용자가 실제 기사 재검증을 위해 API 기본 모델 교체를 승인함.
- 백업: 수정 전 `services/api/app/ml/predictor.py`와 `docs/CODEX_CHANGELOG.md`를 `.codex-backups/20260916-214500/`에 원래 상대 경로로 복사했으며, 각 원본과 백업의 SHA-256 일치를 확인함.
- 수정 파일: `services/api/app/ml/predictor.py`의 `MODEL_PATH`만 `artifacts/transformer-experiment-2000-v2`에서 `artifacts/transformer-10000-v1`로 변경함. API 요청·응답 형식, 점수 계산, 제목·본문 유사도, 확장프로그램 코드는 변경하지 않음.
- 이유와 영향: 학습 데이터 10,000건·검증 2,000건 모델을 새 기본 후보로 연결한다. FastAPI 서버는 재시작해야 새 모델을 읽으며, 해당 로컬 모델 폴더가 없으면 준비 상태가 false가 될 수 있다. 모델 파일과 원본 데이터는 Git에 추가하지 않음.
- 검증: `predictor.py`를 직접 import해 새 `MODEL_PATH`가 `artifacts/transformer-10000-v1`임을 확인함. 서버 재시작 뒤 FastAPI `/ready`가 `ready: true`를 반환했고, 기존 2천 건 모델로 점수를 기록한 실제 네이버 기사 일반 10건·낚시성 의심 10건을 같은 `/analyze` 요청으로 다시 분석함. 동일 AI Hub 검증 2,000건에서는 기존 2천 건 모델보다 정확도·Macro F1이 0.9195에서 0.9565로 높았지만, 실제 의심 기사 중 결론을 숨기는 표현을 낮게 판단한 사례와 사람 3단계 기사를 높게 판단한 사례가 모두 있었음. 따라서 이 20건은 서비스 정확도로 사용하지 않고 후속 사람 평가용 고정 검증 세트로 유지함.
- 미검증: 이번 경로 변경 뒤 `test_predictor.py` 단위 테스트는 재실행하지 않았음. 사람 2인의 최종 합의 라벨과 합의 라벨 기준의 실제 기사 비교 결과도 아직 확정하지 않음. Git commit·push·PR·병합은 수행하지 않음.
- 원상복구: 별도 승인 후 `.codex-backups/20260916-214500/services/api/app/ml/predictor.py`를 복원하거나 `MODEL_PATH`를 기존 폴더로 되돌리면 이전 2천 건 모델을 다시 사용함.

## 2026-09-16 - 실행용 전체 학습 모델 Git 포함

- 요청 및 승인: 사용자가 동료가 main에서 코드를 받을 때 실행용 학습 모델도 함께 받을 수 있도록 Git 제외 설정을 변경하라고 요청함.
- 원인: `/artifacts/**`와 `*.joblib` 규칙 때문에 API가 사용하는 모델도 업로드 대상에서 제외돼 있었음.
- 백업: `.gitignore`와 `docs/CODEX_CHANGELOG.md`를 `.codex-backups/20260916-004231/`에 원래 경로로 복사하고 SHA-256 일치를 확인함.
- 변경: `.gitignore` 마지막에 `artifacts/baseline-full/` 디렉터리와 그 안의 `tfidf_logistic_regression.joblib` 파일에 대한 예외를 추가함. 실행용 모델 파일 크기는 6,970,368바이트임. 모델 파일 자체와 API 코드는 수정하지 않음.
- 영향: 해당 모델 한 개를 커밋·푸시·병합하면 동료도 main에서 코드와 모델을 함께 받을 수 있음. 원본 데이터, 전처리 데이터, 다른 실험 모델, 평가 파일의 제외는 유지됨.
- 검증: `git ls-files --others --exclude-standard -- artifacts` 결과가 실행용 모델 파일 한 개임을 확인함. `git check-ignore`로 학습 JSONL, 제목 전용 실험 모델, 전체 모델 metrics.json의 제외 유지를 확인함. 설정 수정 후 `git diff --check` 통과(LF/CRLF 경고만 출력).
- 미실행: commit·push·main 병합은 실행하지 않음. GitHub Desktop에서 사용자가 진행할 수 있도록 준비함. 실행 코드 변경이 없어 모델 재학습과 API 테스트는 재실행하지 않음.
- 복구: 위 백업의 두 파일을 복원하면 이전 제외 설정으로 돌아갈 수 있음. 이후 모델을 커밋한 경우 추적 해제는 별도 Git 작업이 필요하며, ignore 복원만으로 기존 커밋에서 모델이 제거되지는 않음.

## 2026-09-15 - 제목·본문 표현 유사도 응답 추가

- 요청 및 승인: 사용자가 제목과 본문의 유사도를 별도 신호로 제공하는 다음 단계를 진행하도록 승인함. 사전 실험에서 같은 본문에 원래 불일치 제목을 사용했을 때 0.5%, 본문과 맞춘 비교 제목을 사용했을 때 37.0%가 확인되어, 낚시성 분류 점수와 섞지 않고 API의 보조 응답 필드로만 추가함.
- 백업: `services/api/app/ml/predictor.py`, `services/api/app/schemas/analysis.py`, `services/api/app/api/analyze.py`, `services/api/tests/test_predictor.py`, `docs/CODEX_CHANGELOG.md`를 `.codex-backups/20260915-225656/`에 원래 경로로 복사하고 SHA-256 일치를 확인함.
- 수정 파일: `app/ml/predictor.py`가 저장된 TF-IDF 변환기로 제목과 본문을 각각 벡터화한 뒤, 두 벡터의 코사인 유사도(0~100)를 계산해 기존 점수·분류·표현 목록과 함께 반환하도록 변경함. 새 의존성은 추가하지 않음. `app/schemas/analysis.py`에 0~100 범위의 `title_body_similarity` 응답 필드를 추가했고, `app/api/analyze.py`는 이를 POST `/analyze` 성공 응답에 포함함. `services/api/tests/test_predictor.py`에는 관련 문장이 무관한 문장보다 더 높은 유사도를 받는 최소 검사를 추가함.
- 이유와 영향: `clickbait_score`는 기존 분류 모델 확률이고, `title_body_similarity`는 제목과 본문의 표면 표현이 얼마나 겹치는지 보는 독립 보조 지표다. 유사도를 분류 기준이나 기사 진위 판정에 반영하지 않으므로 기존 낚시성 점수·분류 기준은 변하지 않는다. `evidence`의 정확한 표현 부재 목록도 그대로 유지한다. B 담당 `app/main.py`와 확장프로그램 파일은 수정하지 않음.
- 검증: `.venv` 환경에서 `python -m compileall -q services/api/app services/api/tests`를 통과했고, `python -m unittest discover -s services/api/tests -p test_predictor.py`로 2개 검사를 통과함. 실제 `artifacts/baseline-full` 모델로 `analyze()`를 직접 호출해 응답에 0~100 범위의 `title_body_similarity`가 포함되는 것을 확인함. 같은 짧은 본문에서 불일치 제목은 0.3%, 본문과 맞춘 제목은 51.0%로 반환됨. `git diff --check`도 오류 없이 통과함(LF/CRLF 경고만 출력). FastAPI 서버·실제 HTTP 요청·B 라우터 등록·확장프로그램 표시는 아직 검증하지 않음. Git commit·push·병합도 수행하지 않음.
- 원상복구: 별도 승인 후 `.codex-backups/20260915-225656/`의 파일을 원래 위치로 복원하면 이 변경 전 상태로 돌아갈 수 있음. 모델과 원본 데이터는 변경하지 않음.

## 2026-09-15 - 제목·본문 표현 비교 근거 추가

- 요청 및 승인: 사용자가 분석 결과에 판단 근거를 추가하는 다음 단계를 진행하도록 승인함. 현재 모델의 내부 문자 n-gram 기여도를 노출하면 단어 조각이 사용자 화면에 표시되는 것을 확인해, 모델 점수와 분리된 제목·본문의 정확한 표현 비교 신호를 최소 구현으로 추가함.
- 백업: `services/api/app/ml/predictor.py`, `services/api/app/schemas/analysis.py`, `services/api/app/api/analyze.py`, `docs/CODEX_CHANGELOG.md`를 `.codex-backups/20260915-170251/`에 원래 경로로 복사하고 SHA-256 일치를 확인함. `services/api/tests/test_predictor.py`는 신규 파일이라 기존 백업 대상이 없음.
- 수정 파일: `app/ml/predictor.py`에 제목에서 한글·영문·숫자 2자 이상 표현을 추출하고, 본문에 같은 표현이 없는 항목을 최대 3개 반환하는 `find_title_terms_not_in_body`를 추가함. `analyze_article`은 점수·분류·표현 목록을 반환함. `app/schemas/analysis.py`의 성공 응답에 최대 3개의 `evidence` 목록을 추가했고, `app/api/analyze.py`는 이를 POST `/analyze` 응답에 포함함. `services/api/tests/test_predictor.py`에는 표현 비교의 최소 단위 검사를 추가함.
- 이유와 영향: 기존 학습 모델의 낚시성 점수는 그대로 유지한다. `evidence`는 제목의 표현이 본문에 정확히 포함됐는지만 비교하는 보조 신호이며, 의미상 동의어·조사 변화·기사 진위나 모델의 내부 판단 근거를 뜻하지 않는다. 확장프로그램은 이후 이 목록을 근거 칩 또는 안내 문구로 표시할 수 있다. B 담당 `app/main.py`와 확장프로그램 파일은 수정하지 않음.
- 검증: `.venv` 환경에서 `python -m unittest discover -s services/api/tests -p test_predictor.py`를 실행해 1개 검사를 통과함. `python -m compileall -q services/api/app services/api/tests`를 통과함. `AnalyzeRequest`로 `analyze()`를 직접 호출하여 점수 범위와 `evidence`가 `["고공행진", "멈추고", "추락"]`으로 반환됨을 확인함.
- 미검증: FastAPI 서버 시작, 실제 HTTP 요청, B의 `app/main.py` 라우터 등록, 확장프로그램 화면 표시는 아직 수행하지 않음. Git commit·push·병합도 수행하지 않음.
- 원상복구: 별도 승인 후 `.codex-backups/20260915-170251/`의 파일을 원래 위치로 복원하고 신규 `services/api/tests/test_predictor.py`를 제거하면 이전 상태로 돌아갈 수 있음. 모델·원본 데이터·artifacts는 변경하지 않음.

## 2026-09-15 - 저장 모델 분석 API 모듈 추가

- 요청 및 승인: 사용자가 모델 학습 다음 단계로 API 구현을 진행하도록 요청함. Ponytail 스킬의 최소 구현 원칙을 적용해 로그인·DB·설명 엔진·서버 시작 파일 없이 분석 요청·모델 추론·응답 모듈만 추가함.
- 백업: `docs/CODEX_CHANGELOG.md`를 `.codex-backups/20260915-020632/docs/CODEX_CHANGELOG.md`에 복사하고 SHA-256 일치를 확인함. 새 API 모듈 3개는 기존 파일이 없음을 확인함.
- 수정 파일: `services/api/app/schemas/analysis.py`에 제목·본문 요청과 분석 응답 형식을 추가함. 제목은 1~300자, 본문은 1~50,000자로 공백을 정리한 뒤 검증함. `app/ml/predictor.py`는 `artifacts/baseline-20k-stratified/tfidf_logistic_regression.joblib`을 최초 요청 시 한 번 읽고, 학습 때와 같은 제목·본문 형식으로 낚시성 점수(0~100)와 라벨을 반환함. `app/api/analyze.py`는 POST `/analyze` 라우트와 모델 준비 실패 시 503 응답을 추가함.
- API 계약: 요청은 `{"title":"기사 제목","body":"기사 본문"}`이고, 성공 응답은 `clickbait_score`, `classification`, `model`, `note`를 포함함. 점수는 현 베이스라인 분류기의 낚시성 라벨 확률을 0~100으로 표시한 값이며, 진위·안전 여부 판정이 아님.
- 이유와 영향: 확장프로그램이 제목·본문만 보내면 현재 저장 모델의 결과를 받을 수 있게 하는 A 담당 API 계층의 최소 단위임. 사용자 기사 원문을 저장·로그·DB에 기록하지 않음. B 담당 `app/main.py`, `app/core/`, 공통 의존성·Docker·확장프로그램 파일은 수정하지 않음.
- 검증: Python 문법 컴파일을 통과함. FastAPI 없이 실행 가능한 predictor를 실제 Validation 첫 기사에 적용해 점수 73.9, 분류 `clickbait`, 정답 라벨 0을 확인함. 점수 범위와 반환 라벨 형식 검증도 통과함. `git diff --check`는 오류 없이 통과함(기존 README·변경기록의 LF/CRLF 경고만 표시됨).
- 미검증: 현재 가상환경에는 FastAPI·Pydantic이 설치되지 않아 실제 HTTP 요청·입력 검증·라우터 연결은 미검증임. FastAPI 설치 후 B가 서버 시작 파일에서 `router`를 포함하면 실제 API를 실행할 수 있음.
- 원상복구: 별도 승인 후 이 기록의 `.codex-backups/20260915-020732/docs/CODEX_CHANGELOG.md` 또는 최초 백업을 복원하고 신규 API 모듈 3개를 제거할 수 있음. 모델과 artifacts 파일은 변경하지 않음.

## 2026-09-15 - 제한 학습의 표본 편향 수정 및 전체 검증

- 요청 및 승인: 사용자가 이전 학습을 이어 진행하도록 요청함. 전체 검증에서 발견된 표본 편향의 근거, 수정 파일, 백업 및 동일 검증 데이터 재평가 방식을 설명한 뒤 기존 학습 작업 범위에서 수정함.
- 백업: 코드와 변경 기록을 `.codex-backups/20260915-013341/`에 원래 경로대로 복사하고 SHA-256 일치를 확인함. 변경 기록의 추가 백업은 `.codex-backups/20260915-013312/docs/CODEX_CHANGELOG.md`임. `docs/CODEX_WORK_RULES.md`는 존재하지 않아 AGENTS.md 절차를 적용함.
- 확인된 사실: 기존 제한 학습은 라벨별로 파일 앞부분부터 선택했음. 학습 20,000건과 제한 검증 2,000건의 기사 ID 접두어는 모두 EC였음. 20,000/2,000건 실행은 종료 코드 0으로 완료되어 정확도 0.8950, Macro F1 0.8949895를 기록했으나 이 수치는 전체 분야 성능이 아님.
- 이전 모델 전체 검증: 저장된 모델을 다시 불러와 Validation 35,309건을 500건씩 평가함. 정확도 0.5488969, Macro F1 0.4915405, 혼동행렬 `[[3761, 13894], [2034, 15620]]`을 확인했고 결과를 `artifacts/baseline-20k/metrics-full-validation.json`에 기록함. 행은 실제 라벨, 열은 예측 라벨이며 순서는 모두 [0, 1]임.
- 수정 파일: `services/api/training/train_baseline.py`의 제한 데이터 선택을 전체 파일 대상 라벨별 reservoir sampling으로 변경함. 고정 시드 42로 재현 가능하며 홀수 제한도 정확히 지킴. 빈 문자열·잘못된 라벨 형식 검사를 보강하고 학습·검증 진행 출력 및 metrics의 표본 선택 설정을 추가함. 전체 데이터를 사용하는 경우에는 모두 읽는 동작을 유지함.
- 표본 검증: 메모리 기반 합성 입력으로 재현성, 라벨별 할당, 홀수 제한, 파일 뒷부분 선택, 제한 없는 전체 읽기를 확인함. 실제 Training의 동일 표본 선택 알고리즘으로 7개 접두어(EC, ET, GB, IS, LC, PO, SO)가 양쪽 라벨에 모두 포함됨을 확인함. 각 라벨 10,000건을 선택했고 분야별 같은 수를 강제하지는 않음.
- 실행: Python 3.14.7 / scikit-learn 1.8.0 환경에서 `.\.venv\Scripts\python.exe -X utf8 -u .\services\api\training\train_baseline.py --max-train-samples 20000 --artifact-dir .\artifacts\baseline-20k-stratified`를 실행함. 학습 20,000건, 검증 전체 35,309건으로 종료 코드 0을 확인함.
- 새 결과: 정확도 0.6939307, Macro F1 0.6938308, 혼동행렬 `[[11932, 5723], [5084, 12570]]`. `artifacts/baseline-20k-stratified/`에 모델과 metrics.json을 저장함. 같은 전체 검증 데이터에서 이전 표본 모델 대비 개선됐지만 실제 서비스 정확도나 사실 검증 능력을 뜻하지 않음.
- 실행 추적: 앞선 50,000건 및 중단된 20,000건 실행의 종료 코드가 보존되지 않아 종료 원인은 확정할 수 없음. 이번에는 반환된 실행 세션을 추적하여 학습과 평가의 정상 종료를 확인함. 메모리 부족을 원인으로 확정하지 않음.
- 영향 및 미검증: 원본 ZIP·전처리 JSONL·기존 모델은 보존함. 모델·평가 파일의 Git 제외를 확인함. 전체 291,216건 학습, 제목 전용 비교, 최신 독립 데이터 평가, API·확장 연결은 아직 미실행이며 Git commit·push도 하지 않음.
- 원상복구: 별도 승인 후 위 백업의 학습 코드·기록을 복원할 수 있음. 기존 모델은 `artifacts/baseline-20k/`와 `artifacts/baseline-smoke/`에 남아 있음. 이번 산출물은 삭제하지 않음.

## 2026-09-15 - TF-IDF + Logistic Regression 베이스라인 학습 코드 추가

- 요청 및 승인: 사용자가 전처리 다음 실제 프로젝트 단계 진행을 요청했고, Python용 scikit-learn 설치를 직접 완료함. 설치 확인 결과 Python 3.14.7 및 scikit-learn 1.8.0임.
- 백업: `docs/CODEX_CHANGELOG.md`를 `.codex-backups/20260915-002748/docs/CODEX_CHANGELOG.md`에 복사하고 SHA-256 일치를 확인함. `services/api/training/train_baseline.py`는 신규 파일이라 백업할 기존 파일이 없음을 확인함.
- 수정 파일: `services/api/training/train_baseline.py`를 추가함. 본문 중복을 제거한 Part1 JSONL에서 가공 제목과 본문만 읽어 TF-IDF 문자 n-gram(2~5)과 Logistic Regression 모델을 학습함. 모델과 평가 결과는 Git 제외 대상인 `artifacts/`의 새 폴더에만 저장하며 기존 산출물 경로는 덮어쓰지 않음. 빠른 실행 확인을 위해 `--max-train-samples`, `--max-validation-samples` 옵션을 제공하고, 이 경우 라벨별로 가능한 같은 수를 읽음.
- 이유와 영향: 형태소 분석기 없이 한국어 공백·조사·표현 차이를 처리할 수 있는 재현 가능한 기본 비교 모델을 만든 것임. 이 결과는 낚시성 데이터셋 라벨 예측 성능일 뿐 기사 사실 여부 또는 개별 기사의 진위를 판정하지 않음.
- 검증: Python 문법 검사 통과. 실제 전처리 Training 4,000건(라벨 0·1 각 2,000건), Validation 1,000건(각 500건)을 읽어 학습·저장·평가 흐름을 완료함. 검증 정확도는 0.6700, Macro F1은 0.6691, 혼동행렬(행=실제 0·1, 열=예측 0·1)은 `[[309, 191], [139, 361]]`임. 산출물은 `artifacts/baseline-smoke/`에만 생성됐고 `.gitignore`로 제외됨. `git diff --check`는 오류 없이 통과함(기존 README·변경기록의 LF/CRLF 경고만 표시됨).
- 미검증: 이 결과는 4,000/1,000건 제한 실행이라 전체 데이터 성능이 아님. 전체 291,216건 학습, 한국어 사전학습 모델 비교, API·확장프로그램 연결, Git commit·push·PR·병합은 수행하지 않음.
- 원상복구: 별도 승인 후 위 백업 또는 `.codex-backups/20260915-002947/`의 변경 기록을 복원하고 신규 학습 스크립트를 제거할 수 있음. `artifacts/baseline-smoke/` 산출물 삭제도 별도 승인 대상이며 현재 삭제하지 않음.

## 2026-09-14 - 학습·검증 간 동일 본문 제외

- 요청 및 승인: 동일 본문이 학습·검증 양쪽에 존재하는 검사 결과와 수정 방향을 설명한 뒤, 사용자가 다음 단계 진행을 승인함.
- 원인: 기존 전처리는 제목+본문 조합만 비교해 제목이 다른 동일 본문의 검증 기사 1,074건(공유 본문 819종류)을 남겼음.
- 백업: `.codex-backups/20260914-233007/`에 `services/api/training/prepare_part1.py`, `docs/CODEX_CHANGELOG.md`를 상대 경로대로 복사하고 SHA-256 일치를 확인함.
- 수정 파일: `services/api/training/prepare_part1.py`에 본문 해시 함수와 학습 본문 집합을 추가함. 학습에 저장한 본문을 사용하는 검증 기사를 제외하고 `training_body_overlap`으로 집계함. 같은 분할 내 제목이 다른 본문 변형은 유지함. 기본 출력 위치를 `data/processed/part1_body_disjoint/`로 변경해 이전 결과를 보존함. 보고서에 본문 비교 기준과 학습용 고유 본문 수를 기록함.
- 신규 결과: 위 출력 폴더에 `part1_train.jsonl`, `part1_validation.jsonl`, `part1_preparation_report.json`을 생성함. 이후 모델 학습은 이 폴더를 입력으로 사용해야 함.
- 영향: 학습용 291,216건은 이전 결과와 바이트 단위로 동일함. 검증용은 36,383건에서 35,309건으로 감소함(라벨 0=17,655건, 1=17,654건). 기존 제목+본문 중복 제외 51건과 별도로 본문 중복 1,074건을 제외함. 원본 ZIP·기존 출력·Git 인덱스는 변경하지 않음.
- 검증: Python 문법 검사 통과. 메모리 ZIP 사례로 학습 내 다른 제목 유지, 공백 차이 본문 중복 제외, 새로운 검증 본문의 다른 제목 유지, 반복 레코드 제외, 검증 시 학습 본문 집합 불변을 확인함. 실제 정식 ZIP 42개 처리 완료. 새 JSONL 전체를 읽어 필드·라벨·통계 정합성을 검증했고 학습·검증 간 동일 본문, 동일 ID, 동일 제목+본문 교집합은 각각 0건임. 기존 결과 3개 SHA-256 보존 및 새 학습 JSONL과 기존 파일의 해시 일치를 확인함. 새 결과의 Git ignore 적용과 `git diff --check`도 확인함.
- 검증 중 제약: 첫 임시 폴더 기반 사례 검사는 CreatorTemp 하위 폴더 접근 권한 오류로 중단됨. 이후 파일 생성 없는 메모리 ZIP 사례 검사로 동일 동작을 확인함. 실패한 임시 경로는 `C:\Users\Public\Documents\ESTsoft\CreatorTemp\truetitle-body-check-smgs0knh`이며 정리가 권한 오류로 완료되지 않았을 수 있음.
- 미검증: 일부 문구만 다른 유사 기사 중복, 독립 최신 기사 평가, 모델 학습·정확도는 아직 검증하지 않음. 패키지 설치·Git commit·push는 수행하지 않음.
- 원상복구: 별도 승인 후 위 백업의 코드와 변경 기록을 복원하고 기존 `data/processed/` 결과를 사용하면 이전 처리 상태로 돌아갈 수 있음. 신규 결과 삭제는 실행하지 않음.

## 2026-09-14 - Part1 정식 데이터 전처리 코드 추가

- 요청 및 승인: 사용자가 정식 데이터 다운로드와 Git 제외 정리 후 다음 실제 프로젝트 단계로 진행하도록 요청함. 반복 작업은 지원하되 Python을 배우며 진행하길 원함.
- 백업: `README.md`와 작업 시작 시점의 `docs/CODEX_CHANGELOG.md`를 `.codex-backups/20260914-204657/`에 원래 경로 구조로 복사하고 SHA-256 일치를 확인함. 실행 결과를 기록하기 전의 변경 기록은 `.codex-backups/20260914-204958/docs/CODEX_CHANGELOG.md`에 다시 백업하고 해시 일치를 확인함. `services/api/training/prepare_part1.py`는 신규 파일로 기존 파일이 없어 백업 대상 없음.
- `services/api/training/prepare_part1.py`: AI Hub Part1 라벨 ZIP 42개를 읽어 Training·Validation JSONL로 각각 변환하는 실행 코드를 추가함. `newsID`, `newTitle`, `newsContent`, `clickbaitClass`만 추출하고 제목·본문 공백을 정리함. 제목+본문 중복은 Training을 우선 보존하여 Validation 누출을 줄이며, 누락·잘못된 라벨·중복 통계를 보고서로 기록함. 원본 ZIP은 읽기만 하고 결과는 Git 제외된 `data/processed/`에 생성함.
- `README.md`: 과거 영어 제목 전용 계획을 현재 한국어 제목·본문 분석, 정식 Part1 데이터, 두 사람의 실제 역할·시작 순서로 갱신함.
- 이유와 영향: 샘플 확인을 끝내고 실제 학습 입력을 재현 가능하게 준비함. 스크립트를 실행하면 로컬 `data/processed/`에 대용량 JSONL·보고서가 생성되지만 원본 ZIP은 수정하지 않음.
- 검증: Python 3.14.7에서 문법 검사와 `--help`를 정상 실행함. 실제 정식 Part1 라벨 ZIP 42개를 처리해 Training 입력 291,466건 중 291,216건(중복 250건 제외), Validation 입력 36,434건 중 36,383건(중복 51건 제외)을 JSONL로 생성함. Training 라벨은 0=146,120건·1=145,096건, Validation 라벨은 0=18,265건·1=18,118건임. 각 JSONL을 전부 다시 읽어 필드·라벨·빈 제목/본문을 검사했고 정상 확인함. Training/Validation 간 동일 기사 ID와 동일 제목+본문은 각각 0건임. `git diff --check`도 오류 없이 통과함.
- 미검증: 모델 학습·성능·API·확장프로그램 실행, Git commit·push·PR·병합은 수행하지 않음.
- 원상복구: 별도 승인 후 신규 전처리 스크립트를 제거하고 위 백업본의 README·변경 기록을 복원할 수 있음. `data/processed/` 결과가 생성된 경우에는 별도 승인 후 해당 폴더만 삭제할 수 있음. 삭제·복원은 실행하지 않음.

## 2026-09-14 - 정식 데이터 반영 및 Git 제외 규칙 정리

- 요청 및 승인: 사용자가 프로젝트 폴더에 받은 정식 데이터를 확인한 뒤, Git 제외 설정과 프로젝트 지침을 현재 계획에 맞게 변경하고 다음 단계로 진행하도록 요청함.
- 백업: `.codex-backups/20260914-150029/`에 `.gitignore`, `AGENTS.md`, `docs/CODEX_CHANGELOG.md`를 원래 경로 구조로 복사하고 각 파일의 SHA-256 일치를 확인함.
- `.gitignore`: `146.낚시성 기사 탐지 데이터/` 다운로드 폴더 전체를 Git 제외 대상으로 추가함. 데이터 파일을 Git 추적·게시하지 않도록 함.
- `AGENTS.md`: 기존 영어 뉴스 제목 전용 계획을 현재의 한국어 제목·본문 기반 낚시성·과장·불일치 신호 분석 계획으로 갱신함. 정식 Part1 Training·Validation 데이터, 라벨 의미, 누출 방지, NIA 출처·재배포·국외 반출 제한, 진현·박소현 담당 경계를 반영함.
- 이유와 영향: 실제 데이터와 현재 두 사람의 작업 범위를 기준으로, 이후 AI·확장프로그램 작업이 오래된 지침과 충돌하지 않게 함. 원본 ZIP·기사 데이터·모델·실행 코드는 수정하지 않음.
- 검증: 정식 데이터 폴더에서 ZIP 168개(약 2.601GB), Part1 Training 라벨 JSON 291,466개, Validation 라벨 JSON 36,434개를 읽기로 확인. Part1 라벨 ZIP 42개에서 각 첫 JSON의 `newTitle`, `newsContent`, `clickbaitClass` 구조를 확인했고 오류는 없었음. Git 상태에서 다운로드 폴더가 수정 전 미추적 항목이었음을 확인함. 변경 후 ignore 적용 여부와 문서 차이는 별도 읽기 검사 예정.
- 미검증: 전체 327,900개 JSON의 품질 검사, 모델 학습·API·확장프로그램 실행, Git commit·push·원격 저장소 변경은 수행하지 않음.
- 원상복구: 별도 승인 후 위 백업본의 `.gitignore`, `AGENTS.md`, 이 작업 기록을 원래 경로로 복원할 수 있음. 복원·삭제는 실행하지 않음.

## 2026-09-13 - 기본 폴더 생성

- 요청 및 승인: 사용자가 바탕화면에 프로젝트 위치를 정하고 폴더 구조를 먼저 생성하도록 요청함.
- 생성 위치: `C:\Users\wlsgu\OneDrive\Desktop\truetitle`.
- 변경 내용: `apps/extension/` 아래 entrypoints/popup, features/detection, features/explanation, features/settings, sites, shared, tests, public 생성. `services/api/` 아래 app/api, app/schemas, app/ml, app/core, training, tests 생성. 루트에 artifacts, data, docs, .github/workflows 생성.
- 생성 파일: 작업 기록인 이 파일만 생성. 코드·설정·패키지 파일은 아직 없음.
- 이유와 영향: 확장프로그램과 Python 분석 API의 작업 위치를 분리. 기존 파일·프로젝트에는 영향 없음.
- 백업: 생성 직전 대상 폴더가 존재하지 않음을 확인. 기존 수정 파일이 없어 백업 대상 없음.
- 검증: 최초 기본 권한 실행은 거부되었으며 대상 폴더가 생성되지 않았음을 확인. 추가 실행 승인 후 18개 지정 경로 생성 명령 정상 완료. 생성 후 폴더 존재 및 파일 목록을 별도 검사함.
- 미검증: 코드 실행·빌드·테스트는 수행하지 않음. Git 초기화·원격 저장소 생성·패키지 설치도 수행하지 않음.
- 원상복구: 이후 추가된 파일이 없는지 확인하고 별도 승인 후 이번 신규 폴더만 제거 가능. 삭제는 실행하지 않음.

## 2026-09-13 - Git 연결 전 기본 파일 준비

- 요청 및 승인: 사용자가 직접 할 필요 없는 준비는 먼저 진행하고 설명하라고 요청. Git 연결은 사용자 본인이 안내를 따라 수행하도록 명시함.
- 범위: .gitignore, README.md, AGENTS.md, 빈 폴더 유지용 .gitkeep 및 이 작업 기록. 실행 코드·패키지·Git 저장소는 만들지 않음.
- 백업: 기존 작업 기록을 `.codex-backups/20260913-234848/docs/CODEX_CHANGELOG.md`에 복사하고 SHA-256 일치 확인 후 수정함. 그 외 파일은 신규 생성으로 백업할 이전 파일이 없음.
- .gitignore: 환경 비밀값, Node/Python 의존성·빌드 산출물, 데이터·모델, 로그·백업·브라우저 프로필 제외. data/artifacts의 .gitkeep은 예외로 둠.
- README.md: 실제 준비 상태, 범위·기술 계획·담당·폴더·시작 순서·Git 협업 안내. 실행되지 않은 기능을 완료로 표기하지 않음.
- AGENTS.md: 변경 승인·백업·기록·개인정보·역할 경계·Git 별도 승인 원칙과 현재 실행 코드가 없음을 명시.
- .gitkeep: 기존 하위 폴더 17곳에 빈 표식 추가. 실제 기능이나 설정이 아니라 향후 Git 커밋 시 디렉터리 구조를 유지하기 위한 파일임.
- 이유와 영향: 첫 업로드 전 민감·대용량 파일 제외와 두 개발자·AI의 작업 경계 준비. 외부 저장소나 기존 제품 코드는 변경하지 않음.
- 검증: Git 설치 버전 `2.54.0.windows.1` 확인. 백업 제외 파일 21개, .gitkeep 17개, 필수 문서 4개 존재 확인. 주요 ignore 규칙 존재 확인. 프로젝트 .git 부재 확인.
- 미검증: 실제 Git 인덱스에서 ignore 적용 테스트는 저장소 초기화 전이라 수행하지 않음. 빌드·모델·API 테스트도 미실행. 패키지 설치·Git 초기화·커밋·원격 연결·push 없음.
- 원상복구: 추가 변경 여부를 확인한 뒤 별도 승인으로 신규 파일을 제거하고 백업한 작업 기록을 복원할 수 있음. 원복·삭제는 수행하지 않음.

## 2026-09-14 - A/B 동시 개발용 API 계약 준비

- 요청 및 승인: 사용자가 `feat/model-baseline` 브랜치를 게시한 뒤 다음 작업 진행을 요청함.
- 수정 범위: `docs/api-contract.md`, `docs/decisions.md`, 이 변경 기록. 실행 코드·의존성·Git 설정은 수정하지 않음.
- 백업: 기존 `docs/CODEX_CHANGELOG.md`를 `.codex-backups/20260914-001342/docs/CODEX_CHANGELOG.md`에 복사하고 SHA-256 일치를 확인함. 새 API 계약·결정 기록은 기존 파일이 없어 신규 생성함.
- `docs/api-contract.md`: predict/explain/health/ready의 요청·응답·HTTP 오류·상태·mock·설명 화면 연결 책임·계약 변경 절차를 v0.1 합의안으로 작성함.
- `docs/decisions.md`: P0 범위, A/B 경계, 최소 전송, 점수 표현, 미확정 항목을 기록함.
- 이유와 영향: A는 모델·API를, B는 mock·확장프로그램 흐름을 서로 기다리지 않고 구현할 수 있음. 실제 데이터·언어 감지·사이트 확인 전인 기준은 미확정으로 남김.
- 검증: 생성 후 파일 존재, API 이름·상태·JSON 예시·계약 변경 항목을 읽기로 확인. 현재 브랜치는 `feat/model-baseline`, 원격 추적은 `origin/feat/model-baseline`, 작업 시작 전 상태는 깨끗했음.
- 미검증: API·모델·언어 감지·확장프로그램을 구현하거나 실행하지 않음. Git commit·push·PR·패키지 설치·외부 게시 없음.
- 원상복구: 별도 승인 후 신규 문서 두 개를 제거하고 이 작업 기록을 백업본으로 복원할 수 있음. 삭제·복원은 실행하지 않음.

## 2026-09-16 - 제목·본문 쌍 Transformer 학습 실험 추가

- 요청 및 승인: 사용자가 제목·본문 관계를 더 잘 다루는 한국어 사전학습 모델 실험을 진행하도록 명시적으로 승인함. 기존 TF-IDF 모델은 유지하고, 성능 비교 후에만 서비스 모델 변경을 검토하기로 함.
- 백업: 작업 전 `docs/CODEX_CHANGELOG.md`를 `.codex-backups/20260916-191055/docs/CODEX_CHANGELOG.md`에 복사하고 SHA-256 일치를 확인함. 학습 중 발견한 호환성 문제를 수정하기 전 `services/api/training/train_transformer.py`도 같은 백업 폴더의 원래 경로에 복사하고 SHA-256 일치를 확인함. 나머지 두 코드는 신규 파일이라 기존 백업 대상이 없음.
- 수정 파일: `services/api/training/train_transformer.py`를 추가함. `klue/roberta-small`에 가공 제목과 본문을 두 입력으로 전달하고, 제목은 보존하며 긴 본문만 절단한다. 라벨 균형 표본, CPU/CUDA/XPU 장치 선택, 학습·평가·로컬 산출물 저장을 포함한다. `services/api/tests/test_train_transformer.py`를 추가해 두 입력 전달·본문 전용 절단·평가 수치를 확인한다. `services/api/requirements-ml.txt`에 전용 학습 환경의 `torch==2.14.0`, `transformers==5.17.0`을 기록함.
- 호환성 수정: 첫 소형 학습에서 KLUE RoBERTa가 `token_type_ids`의 값 1을 받을 수 없어 `IndexError`가 발생한 것을 확인함. 두 입력 사이의 구분 토큰은 유지하고 호환되지 않는 보조 필드만 제거하도록 수정한 뒤 재검증함.
- 이유와 영향: 기존 문자 n-gram TF-IDF는 제목·본문 위치를 바꿔도 특징이 달라지지 않아 둘의 관계를 직접 학습하지 못했음. 새 실험은 분리된 모델·전용 가상환경·Git 제외 산출물을 사용하므로 현재 API, 확장 프로그램, 배포용 TF-IDF 모델에는 영향이 없음.
- 설치·실행: 프로젝트 루트의 Git 제외 `venv/`에 PyTorch CPU 빌드와 Transformers를 설치함. `klue/roberta-small`을 로컬 Hugging Face 캐시에 내려받음. 64건 학습·32건 검증·1 에포크·CPU·최대 128토큰의 소형 실행을 완료해 `artifacts/transformer-smoke-20260916/`에 모델(약 272MB), 토크나이저, 평가 파일을 생성함.
- 검증: 새 파일 문법 검사, 새 단위 테스트 2건, 학습 스크립트 `--help`, 소형 실제 학습·모델 저장을 통과함. 소형 실행의 정확도 0.5000, Macro F1 0.3333은 연결 확인용 표본이 너무 작고 1 에포크뿐이어서 성능 지표로 사용하지 않음. `git diff --check`는 통과했고 Git commit·push·PR·병합은 수행하지 않음.
- 미검증: 더 큰 표본·다중 에포크의 성능 비교, 사람 평가용 실제 기사 시나리오, CPU 학습 시간, Intel XPU 사용, Transformer를 API에 연결하는 작업은 수행하지 않음.
- 원상복구: 별도 승인 후 새 학습 코드·테스트·의존성 기록을 제거하고 위 백업의 변경 기록과 학습 코드를 복원할 수 있음. `venv/`, Hugging Face 캐시, 소형 모델 산출물 삭제는 별도 승인 없이는 수행하지 않음.

## 2026-09-16 - 동일 검증 표본 모델 비교 추가

- 요청 및 승인: 사용자가 기존 TF-IDF와 Transformer를 동일 검증 표본으로 공정 비교하는 코드를 추가하고 실제 결과까지 확인하도록 승인함.
- 백업: 수정 전 `docs/CODEX_CHANGELOG.md`를 `.codex-backups/20260916-202845/docs/CODEX_CHANGELOG.md`에 복사하고 SHA-256 일치를 확인함. 비교 코드·테스트는 신규 파일이라 기존 백업 대상이 없음.
- 수정 파일: `services/api/training/compare_models.py`를 추가함. 고정 시드 42로 Part1 검증 데이터의 라벨 균형 500건을 선택하고, `--model baseline` 또는 `--model transformer`로 각 환경에서 예측·정확도·Macro F1·최대 20건의 오답 제목을 JSON 보고서에 저장함. `services/api/tests/test_compare_models.py`를 추가해 이진 분류 지표 계산을 확인함.
- 이유와 영향: 기존 전체 검증 수치와 500건 Transformer 수치는 직접 비교할 수 없었음. 같은 500건·같은 정답으로 두 모델을 각각 평가하도록 해 모델 선택 근거를 만들었음. 기존 API, 확장 프로그램, 학습 모델, Git 설정에는 영향을 주지 않음.
- 실행 결과: `artifacts/model-comparison-v1/`에 Git 제외 보고서를 생성함. TF-IDF 전체 학습 모델은 정확도 0.7460, Macro F1 0.7460, 오답 127건이었음. 2,000건 학습 Transformer는 정확도 0.9300, Macro F1 0.9300, 오답 35건이었음. Transformer 학습·검증은 본문 중복이 제거된 Part1 분할을 사용함.
- 검증: 기존 `.venv`에서 비교 코드 문법 검사·단위 테스트 1건·TF-IDF 실제 500건 평가를 통과함. Transformer 전용 `venv`에서 같은 500건 실제 평가를 통과함. 추가 패키지 설치 없이 각 모델이 이미 사용하는 환경을 분리해 사용함. Git commit·push·PR·병합은 수행하지 않음.
- 미검증: 다른 무작위 표본·더 큰 검증 표본·최근 실제 네이버 기사에 대한 사람 기준 평가, Transformer API 연결·배포 성능은 아직 확인하지 않음.
- 원상복구: 별도 승인 후 신규 비교 코드·테스트를 제거하고 위 백업의 변경 기록을 복원할 수 있음. 로컬 비교 보고서 삭제는 별도 승인 없이는 수행하지 않음.

## 2026-09-16 - Transformer 분석 API 연결

- 요청 및 승인: 사용자가 공정 비교 결과 후 다음 단계 진행을 승인했고, 확장 프로그램의 API 응답 형식은 유지한 채 Transformer를 실제 분석 엔진으로 연결함.
- 백업: 수정 전 `services/api/app/ml/predictor.py`, `services/api/tests/test_predictor.py`, `services/api/requirements.txt`, `docs/CODEX_CHANGELOG.md`를 `.codex-backups/20260916-203427/`에 원래 경로대로 복사하고 SHA-256 일치를 확인함.
- 수정: `predictor.py`가 로컬 `artifacts/transformer-experiment-2000-v2` 모델과 토크나이저를 한 번만 불러와 제목·본문 쌍을 분석하도록 변경함. 기존 `/analyze` 응답의 필드·형식은 유지함. `title_body_similarity`는 기존 TF-IDF 코사인 유사도 대신 제목의 핵심어가 본문에 실제 등장하는 비율로 계산하도록 단순화함. `requirements.txt`에 `torch==2.14.0`, `transformers==5.17.0`을 추가하고 API `.venv`에 설치함. 테스트를 새 유사도 함수 호출 방식에 맞게 갱신함.
- 이유와 영향: 동일 500건 비교에서 Transformer가 Macro F1 0.9300으로 TF-IDF 0.7460보다 높아, 실제 서비스의 판별 점수를 Transformer로 교체함. 확장 프로그램 호출 주소와 JSON 계약은 바뀌지 않아 소현이의 코드 변경은 필요 없음. API 시작 후 첫 모델 로딩에는 수 초가 걸리고 로컬 Transformer 산출물이 있어야 `/ready`가 true가 됨.
- 설치 이슈: 첫 패키지 설치 중 Windows 파일 잠금(`WinError 32`)이 발생했으나, 기존 설치 프로세스가 파일 해제를 마친 뒤 `torch=2.14.0+cpu`, `transformers=5.17.0` 정상 import를 확인함.
- 검증: API 환경에서 단위 테스트 2건 통과. FastAPI TestClient로 `/ready`가 200과 `ready: true`를 반환하고, `/analyze`가 200·점수·분류·유사도·근거·모델명을 포함한 기존 계약 형식의 JSON을 반환함을 확인함. `git diff --check` 통과. TestClient 실행 중 Starlette의 `httpx` 사용 중단 예정 경고는 있었으나 API 응답에는 영향이 없었음. Git commit·push·PR·병합은 수행하지 않음.
- 미검증: 실제 Chrome 확장 프로그램과 새 API의 통합 실행, 최근 네이버 기사 사람 기준 평가, 모델 산출물 배포·공유 방식은 아직 확인하지 않음.
- 원상복구: 별도 승인 후 위 백업의 predictor·테스트·requirements·변경 기록을 복원하면 TF-IDF API로 돌아갈 수 있음. PyTorch·Transformers 제거와 모델 파일 삭제는 별도 승인 없이는 수행하지 않음.
