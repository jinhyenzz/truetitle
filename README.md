# TrueTitle

한국어 뉴스 기사에 진입한 뒤 제목과 본문을 분석해 낚시성·과장·제목과 본문의 불일치 신호를 보여 주는, 로그인 없는 PC Chrome 확장프로그램입니다.

> 현재 상태: KLUE RoBERTa 제목·본문 모델, FastAPI 분석 API, 네이버 뉴스용 Chrome 확장프로그램 연결을 구현했습니다. 로컬에서 실행·검증 중이며 외부 배포는 아직 하지 않았습니다.
> 낚시성 분류는 기사의 사실 여부 검증이 아닙니다. 낮은 점수를 안전한 기사라는 뜻으로 표시하지 않습니다.

## 개발 범위

- 2인 개발 프로젝트이며, 현재 로컬 통합 검증 단계입니다.
- 한국어 기사, 초기 지원 사이트 1곳(네이버 뉴스 일반 기사), 제목+본문 기반 분석.
- P0: 기사 제목·본문 추출, 분석 결과 화면, 동의·ON/OFF·설정 초기화, 오류 처리, 모델 평가.
- P1: 선택형 흐림, 캐시 고도화, 추가 접근성 개선.
- 제외: 로그인, SQL/DB, 별도 웹앱, 사실 여부 확정, 모든 사이트 지원.
- AI Hub 낚시성 기사 탐지 데이터의 정식 Part1 라벨링 Training·Validation을 사용합니다. 학습 입력은 `newTitle`과 `newsContent`, 정답은 `clickbaitClass`(0=낚시성, 1=비낚시성)입니다.

## 사용 기술

- 확장프로그램: WXT, TypeScript, DOM API, Manifest V3
- 분석 서버: Python, FastAPI, Pydantic
- 학습: 표준 Python 전처리, scikit-learn 베이스라인, KLUE RoBERTa 제목·본문 모델 비교
- 테스트: Python unittest + FastAPI TestClient, TypeScript 타입 검사, 실제 Chrome 확인
- 배포: 미배포. Docker·CI·외부 서버 운영 환경은 아직 구성하지 않았습니다.

실제 API 환경은 Python 3.14, FastAPI, PyTorch 2.14, Transformers 5.17을 사용합니다.

## 역할

| 담당 | 기능 |
| --- | --- |
| 진현 | 데이터 전처리·학습·평가, `/analyze` API, 모델 추론·참고 표현 비교 |
| 박소현 | 기사 추출, 확장프로그램 UI, Background 통신·동의·설정, 서버 공통 진입점·배포, 브라우저 테스트 |

A는 API 응답 계약·공통 타입을 관리하고, B는 분석 요청과 결과 화면을 연결합니다. 공통 파일은 상대와 합의 없이 수정하지 않습니다.

## 폴더

```text
apps/extension/
  entrypoints/popup/       # B: 진입점·팝업
  features/detection/     # B: 제목 감지·배지
  features/explanation/   # B: 결과 UI·API 통신
  settings/               # B: 동의·설정
  sites/                  # B: 사이트별 어댑터
  shared/                 # A: API 타입, 설정 계약은 함께 합의
  tests/
  public/
services/api/
  app/api/                # A: analyze
  app/ml/                 # A: 모델 로딩·추론·설명
  app/schemas/            # A: 입력·출력 형식
  app/core/               # B: 서버 설정·요청 제한
  training/               # A: 데이터 처리·학습·평가
  tests/
data/                     # 로컬 데이터, Git 제외
artifacts/                # 실행용 모델만 공유, 실험 산출물은 Git 제외
docs/                     # 계약·설계·작업 기록
.github/workflows/        # B: 향후 CI 설정
```

`.gitkeep`은 Git이 빈 폴더도 전달할 수 있도록 둔 표식입니다. 실행 코드가 아닙니다.

## 로컬 실행

GitHub Desktop으로 저장소를 복제하면 Git LFS가 5만 건 학습 모델을 함께 받습니다. 모델 폴더가 비어 있으면 프로젝트 루트에서 `git lfs pull`을 실행합니다.

API는 프로젝트 루트에서 아래 순서로 실행합니다.

```powershell
py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r .\services\api\requirements.txt
.\.venv\Scripts\python.exe -X utf8 -m uvicorn app.main:app --app-dir services/api --host 127.0.0.1 --port 8001
```

확장 프로그램은 별도 터미널에서 실행합니다.

```powershell
cd apps/extension
npm install
npm run dev
```

확장프로그램 팝업에서 전송에 동의하고 ON으로 설정한 뒤, 네이버 뉴스 일반 기사의 제목 위 버튼 또는 팝업의 `분석하기`를 누릅니다. 분석은 클릭 시 시작하며 자동 분석은 구현하지 않았습니다. 현재 이 코드에서 지원하는 사이트는 `n.news.naver.com`입니다.

Python 코드 변경 후에는 실행 중인 서버를 `Ctrl+C`로 종료하고 같은 실행 명령으로 다시 시작합니다. 확장프로그램 코드가 변경된 경우에는 Chrome 확장프로그램 관리 화면에서 확장을 새로고침하고 기사 탭도 새로고침합니다.

## API와 모델 결과 해석

- `GET /health`: 서버 응답 확인. `GET /ready`: 모델 로딩 가능 여부 확인(200/503).
- `POST /analyze`: `title`(1~300자), `body`(1~50,000자). 앞뒤 공백을 정리하며 빈 입력은 422로 거부합니다. 확장프로그램의 본문 전송 상한은 별도로 20,000자입니다.
- `clickbait_score`: 이진 분류 모델의 낚시성 출력값을 0~100점으로 표시합니다. 실세계 정확도나 사실일 확률이 아닙니다.
- `clickbait_signal_level`: 점수를 20·40·60·80 경계로 나눈 5구간입니다. 과장 심각도 다섯 단계를 직접 학습한 결과가 아닙니다.
- `title_body_similarity`, `evidence`: 제목의 단어·표현이 본문에 나타나는지 비교한 참고 정보입니다. 문맥 추론이나 모델 판단 이유의 설명이 아닙니다.
- `model`: 실행 모델·입력 보정 버전 식별자. 현재 `klue-roberta-small-50000-v1-quotes-v2`입니다.

현재 모델은 제목·본문 합계 최대 128토큰까지만 입력받아 긴 기사 전체를 읽지 못할 수 있습니다. 현재 서비스는 제목의 짝이 확인되는 큰따옴표만 굽은 큰따옴표로 통일합니다. 단독 부호와 본문은 보존합니다.

5만 건·3에포크 모델의 저장된 AI Hub 검증 5,000건 정확도는 96.06%입니다. 이 수치는 따옴표 보정 전 학습 결과이며 실제 네이버 기사나 보정 후 서비스 정확도를 뜻하지 않습니다. [평가 방법·재현 명령·한계](docs/model-evaluation.md)를 함께 확인하세요.

## 검사

API 가상환경에 개발 의존성을 설치한 뒤 프로젝트 루트에서 실행합니다.

```powershell
.\.venv\Scripts\python.exe -m pip install -r .\services\api\requirements-dev.txt
Push-Location services/api
& ..\..\.venv\Scripts\python.exe -B -X utf8 -m unittest discover -s tests -p 'test_*.py' -v
Pop-Location
```

실제 모델이 없는 환경에서는 모델 통합 테스트가 생략될 수 있으므로 테스트 출력의 `skipped`도 확인합니다.

```powershell
cd apps/extension
npm run compile
```

## 데이터 출처

학습에는 AI Hub의 「낚시성 기사 탐지 데이터」를 사용했습니다. 본 데이터는 한국지능정보사회진흥원(NIA) 사업의 결과물입니다. 원문 데이터는 저장소에 포함하지 않으며, 데이터와 학습 산출물의 외부 공개·활용 범위는 각각 제공 조건을 확인해야 합니다.

## 협업

- main + 짧은 기능 브랜치. 기능 변경은 PR과 상대 검토 후 병합합니다.
- 예: 진현은 feat/model-baseline, 박소현은 feat/extension-bootstrap.
- 프로젝트 전체를 OneDrive 공동 폴더로 동시 편집하지 않습니다. 각자 로컬 복제본에서 Git으로 변경을 교환합니다.
- Git에 올리기 전 staged 파일에 원문 데이터·비밀값·불필요한 실험 모델이 없는지 확인합니다. 현재 실행용 5만 건 모델 가중치는 Git LFS로 관리합니다. .gitignore는 이미 추적 중인 파일을 제거하지 않습니다.
- AI에게 작업을 맡길 때는 AGENTS.md, 현재 역할·Git 상태·실제 파일을 함께 전달합니다.

현재 경로는 OneDrive 바탕화면 아래입니다. 개인 절대 경로를 코드에 고정하지 않습니다.
