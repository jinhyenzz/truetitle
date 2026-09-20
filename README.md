# TrueTitle

뉴스 제목을 보고 들어갔는데, 본문은 기대한 내용과 다른 경우가 있습니다. TrueTitle은 기사를 읽을 때 제목의 낚시성 신호와 제목·본문의 표현 차이를 함께 확인할 수 있도록 만든 Chrome 확장프로그램입니다.

네이버 뉴스 일반 기사에서 제목 위 버튼이나 확장프로그램 팝업의 **분석하기**를 누르면 결과를 볼 수 있습니다. 현재는 로컬 API 서버와 연결해 사용하며, 외부 서버 배포와 Chrome 웹 스토어 등록은 아직 하지 않았습니다.

기사의 사실 여부를 판정하는 서비스는 아닙니다. 결과는 제목을 한 번 더 살펴보기 위한 참고 정보입니다.

## 주요 기능

- 네이버 뉴스 페이지에서 제목과 본문을 추출합니다.
- 학습한 모델로 낚시성 점수를 계산하고 5단계로 표시합니다.
- 제목의 표현이 본문에 얼마나 등장하는지, 본문에서 찾지 못한 표현이 무엇인지 함께 보여 줍니다.
- 전송 동의, 분석 기능 ON/OFF, 설정 초기화를 제공합니다.
- 서버 연결 실패, 응답 시간 초과, 모델 준비 실패를 오류로 안내합니다.

현재 지원 범위는 `n.news.naver.com`의 일반 기사입니다. 기사를 열기 전의 뉴스 목록 분석과 다른 언론사 사이트 지원은 포함하지 않습니다. 기사 분석은 버튼을 눌렀을 때 시작합니다.

## 동작 방식

1. 확장프로그램이 기사 페이지에서 제목과 본문을 읽습니다.
2. 사용자가 분석을 요청하면 동의·설정 상태를 확인하고 FastAPI 서버의 `POST /analyze`로 제목과 본문을 보냅니다.
3. 서버가 입력을 검사한 뒤 저장된 모델로 점수를 계산합니다.
4. 확장프로그램이 점수, 5단계 신호, 표현 비교 결과를 표시합니다.

학습 결과는 모델 파일로 저장해 두고 서버가 불러와 재사용합니다. 분석할 때마다 다시 학습하지 않습니다. 기사 분석에 외부 생성형 AI API를 호출하지 않으며, 현재 분석 요청에는 제목과 본문만 전송합니다.

## 사용 기술과 담당

| 구분 | 기술 |
| --- | --- |
| 확장프로그램 | WXT, TypeScript, DOM API, Chrome Manifest V3 |
| 분석 API | Python, FastAPI, Pydantic |
| 모델 | PyTorch, Hugging Face Transformers, KLUE RoBERTa |
| 비교 모델 | scikit-learn의 TF-IDF + Logistic Regression |
| 검사·협업 | unittest, pytest, GitHub Actions, Git LFS |

2명이 함께 개발했습니다.

- **진현:** 데이터 전처리, 모델 학습·평가, 분석 API, 모델 추론과 제목·본문 표현 비교
- **박소현:** 기사 추출, 확장프로그램 화면·통신·설정, 서버 공통 기능과 CI

## 모델을 만들며 확인한 것

먼저 TF-IDF와 Logistic Regression으로 비교 기준이 되는 모델을 만들었습니다. 이후 제목과 본문을 두 입력으로 받는 `klue/roberta-small`을 파인튜닝하고, 같은 검증 표본에서 결과를 비교했습니다. 현재 API에는 Transformer 모델을 사용합니다.

학습에는 AI Hub 「낚시성 기사 탐지 데이터」 Part1을 사용했습니다. 전처리 과정에서 제목·본문이 같은 중복을 정리하고, 학습 데이터와 검증 데이터에 동일 본문이 겹치지 않도록 했습니다.

현재 실행 모델의 학습 기록은 다음과 같습니다.

| 항목 | 값 |
| --- | --- |
| 학습 데이터 | 50,000건 |
| 검증 데이터 | 5,000건 |
| 학습 횟수 | 3에포크 |
| 정확도 | 96.06% |
| Macro F1 | 0.9606 |

이 결과는 AI Hub 검증 데이터에서 측정한 값입니다. 실제 네이버 기사에서도 96.06%를 맞힌다는 의미는 아닙니다.

실제 기사를 확인하면서 큰따옴표 모양만 달라져도 점수가 크게 바뀌는 사례를 발견했습니다. 현재 API는 제목에서 짝이 확인되는 큰따옴표를 같은 형태로 정리합니다. 기존 검증 데이터 200건에서는 보정 전후 분류가 같았지만, 신규 기사 점검에서는 정보가 생략된 제목의 점수까지 낮아지는 사례도 있었습니다. 보정으로 모든 오판이 해결됐다고 보지는 않습니다.

평가 표본과 비교 결과는 [모델 평가 기록](docs/model-evaluation.md)에 정리했습니다.

## 결과를 읽을 때 주의할 점

- **5단계는 점수 구간입니다.** 이진 분류 점수를 20·40·60·80점 경계로 나눠 표시합니다. 과장 정도를 다섯 단계로 직접 학습한 모델은 아닙니다.
- **제목·본문 유사도는 표현 일치 지표입니다.** 단어와 일부 한국어 형태 변화를 비교하며, 문장 전체의 의미가 같은지 판단하지는 않습니다.
- **본문에서 찾지 못한 표현은 참고 정보입니다.** 그 표현 때문에 모델이 낚시성으로 판단했다는 뜻은 아닙니다.
- **모델이 긴 본문 전체를 읽지는 못합니다.** 제목과 본문을 합쳐 최대 128토큰을 입력받으므로 뒤쪽의 조건이나 해명을 놓칠 수 있습니다.
- 낮은 점수가 기사의 신뢰성을 보장하지 않습니다. 다양한 실제 기사에 대한 추가 검증이 필요합니다.

## 로컬 실행

아래 명령은 저장소를 복제한 뒤 프로젝트 루트에서 PowerShell로 실행하는 기준입니다. Git LFS, Python, Node.js와 npm이 필요합니다. 기존 로컬 실행은 Python 3.14, CI는 Python 3.12를 사용합니다. 확장프로그램은 CI에서 Node.js LTS로 검사합니다.

### 1. 실행 모델 받기

가중치 파일은 Git LFS로 관리합니다. 저장소 복제 후 아래 명령으로 모델을 받습니다.

```powershell
git lfs install
git lfs pull
```

실행 모델은 `artifacts/transformer-50000-v1/`에 있습니다. `model.safetensors`는 약 272MB이며, 파일이 수백 바이트뿐이라면 실제 모델 대신 LFS 포인터만 받은 상태입니다.

### 2. 분석 서버 실행

처음 실행할 때 가상환경과 패키지를 준비합니다. 이미 가상환경이 있다면 생성 단계는 건너뜁니다.

```powershell
py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r .\services\api\requirements.txt
.\.venv\Scripts\python.exe -X utf8 -m uvicorn app.main:app --app-dir services/api --host 127.0.0.1 --port 8001
```

서버 실행 후 [API 문서](http://127.0.0.1:8001/docs)에서 요청 형식을 확인할 수 있습니다. [준비 상태](http://127.0.0.1:8001/ready)가 `{"ready": true}`이면 모델을 사용할 수 있습니다.

### 3. 확장프로그램 실행

별도 터미널에서 실행합니다.

```powershell
cd apps/extension
npm ci
npm run build
```

Chrome 주소창에 `chrome://extensions`를 입력하고 개발자 모드를 켭니다. **압축해제된 확장 프로그램을 로드합니다**에서 `apps/extension/.output/chrome-mv3` 폴더를 선택합니다.

확장프로그램 팝업에서 전송에 동의하고 기능을 ON으로 설정한 뒤, 네이버 뉴스 일반 기사에서 분석 버튼을 누릅니다. API 서버는 켜 두어야 합니다.

확장프로그램 개발 중에는 `npm run dev`를 사용할 수 있습니다. 이때 사용하는 `.output/chrome-mv3-dev`는 위의 빌드 폴더와 다르며 개발 서버가 실행 중이어야 합니다.

기본 API 주소는 `http://127.0.0.1:8001`입니다. 주소를 바꿀 때는 `apps/extension/.env`의 `WXT_API_BASE_URL`을 설정하고 다시 빌드합니다. Python 코드 변경 후에는 API를 재시작하고, 확장프로그램을 다시 빌드한 뒤에는 Chrome에서 확장과 기사 탭을 새로고침합니다.

## API

| 요청 | 용도 |
| --- | --- |
| `GET /health` | 서버 응답 확인 |
| `GET /ready` | 모델 준비 상태 확인 |
| `POST /analyze` | 제목·본문 분석 |

`/analyze` 요청 예시입니다.

```json
{
  "title": "정부, 내년 청년 주거 지원 확대",
  "body": "정부는 내년부터 청년 주거 지원 대상을 확대한다고 발표했다."
}
```

제목은 1~300자, 본문은 1~50,000자를 받습니다. 앞뒤 공백을 정리하고 공백뿐인 입력은 거부합니다.

응답에는 `clickbait_score`, `clickbait_signal_level`, `clickbait_signal_label`, `classification`, `title_body_similarity`, `evidence`, `model`, `note`가 포함됩니다. 현재 모델 식별자는 `klue-roberta-small-50000-v1-quotes-v2`입니다.

잘못된 입력은 422, 모델 준비 실패는 503, 요청 제한 초과는 429로 응답합니다. 요청 제한 기본값은 IP당 60초에 30회이며 서버 프로세스 메모리에서 관리합니다. 여러 서버 사이에 제한 횟수를 공유하는 구조는 아닙니다.

## 테스트

프로젝트 루트에서 개발 의존성을 설치한 뒤 API 테스트를 실행합니다.

```powershell
.\.venv\Scripts\python.exe -m pip install -r .\services\api\requirements-dev.txt
Push-Location services/api
& ..\..\.venv\Scripts\python.exe -m pytest
Pop-Location
```

표준 라이브러리의 unittest로도 같은 테스트를 실행할 수 있습니다.

```powershell
Push-Location services/api
& ..\..\.venv\Scripts\python.exe -B -X utf8 -m unittest discover -s tests -p 'test_*.py' -v
Pop-Location
```

확장프로그램은 `apps/extension`에서 검사합니다.

```powershell
npm run compile
npm run build
```

GitHub Actions는 PR과 main 변경 시 API 테스트, 확장프로그램 타입 검사와 빌드를 실행합니다. 현재 CI는 LFS 모델 가중치를 내려받지 않으므로 실제 모델이 필요한 통합 테스트는 생략합니다. 모델이 있는 로컬 환경에서는 이 테스트도 실행됩니다. 따라서 CI 통과와 모델의 실제 기사 판단 성능은 별도로 확인해야 합니다.

## 폴더 구조

```text
apps/extension/
  entrypoints/          # 팝업, 기사 페이지, 백그라운드 진입점
  sites/                # 사이트별 제목·본문 추출
  features/             # 기사 감지, 분석 요청, 결과 화면
  settings/             # 동의와 사용 설정
  shared/               # 공통 타입
services/api/
  app/api/              # 분석 요청 처리
  app/ml/               # 모델 로딩·추론, 표현 비교
  app/schemas/          # 요청·응답 형식
  app/core/             # 환경 설정, 요청 제한
  training/             # 전처리·학습·평가
  tests/                # API·모델 처리·전처리 테스트
artifacts/              # 실행 모델과 로컬 실험 결과
data/                   # 로컬 학습 데이터
docs/                   # 평가 기록과 개발 문서
.github/workflows/      # 자동 검사
```

## 남은 작업

- 다양한 최신 기사에서 오탐·미탐 사례를 더 확인하기
- OFF·초기화·연속 요청 상황에서 확장프로그램 동작 점검하기
- 추가 사이트 지원 후 제목·본문 추출과 API 연결 확인하기
- 외부 서버 배포와 Chrome 웹 스토어 등록 준비하기

## 데이터 출처

AI Hub의 「낚시성 기사 탐지 데이터」를 사용했습니다. 본 데이터는 한국지능정보사회진흥원(NIA) 사업의 결과물입니다. 원문 데이터는 저장소에 포함하지 않습니다. 데이터와 학습 산출물의 외부 공개·활용 범위는 각각의 제공 조건을 확인해야 합니다.
