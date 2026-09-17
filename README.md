# TrueTitle

한국어 뉴스 기사에 진입한 뒤 제목과 본문을 분석해 낚시성·과장·제목과 본문의 불일치 신호를 보여 주는, 로그인 없는 PC Chrome 확장프로그램입니다.

> 현재 상태: KLUE RoBERTa 제목·본문 모델, FastAPI 분석 API, 네이버 뉴스용 Chrome 확장프로그램 연결을 구현했습니다. 로컬에서 실행·검증 중이며 외부 배포는 아직 하지 않았습니다.
> 낚시성 분류는 기사의 사실 여부 검증이 아닙니다. 낮은 점수를 안전한 기사라는 뜻으로 표시하지 않습니다.

## 개발 범위

- 2인, 2주 계획. 시작일과 하루 작업시간은 함께 정합니다.
- 한국어 기사, 초기 지원 사이트 1곳(네이버 뉴스 일반 기사), 제목+본문 기반 분석.
- P0: 기사 제목·본문 추출, 분석 결과 화면, 동의·ON/OFF·설정 초기화, 오류 처리, 모델 평가.
- P1: 선택형 흐림, 캐시 고도화, 추가 접근성 개선.
- 제외: 로그인, SQL/DB, 별도 웹앱, 사실 여부 확정, 모든 사이트 지원.
- AI Hub 낚시성 기사 탐지 데이터의 정식 Part1 라벨링 Training·Validation을 사용합니다. 학습 입력은 `newTitle`과 `newsContent`, 정답은 `clickbaitClass`(0=낚시성, 1=비낚시성)입니다.

## 계획 기술

- 확장프로그램: WXT, React, TypeScript, Manifest V3
- 분석 서버: Python, FastAPI, Pydantic
- 학습: 표준 Python 전처리, scikit-learn 베이스라인, KLUE RoBERTa 제목·본문 모델 비교
- 테스트: Vitest, pytest, 실제 Chrome 확인
- 배포: 분석 API용 Docker. 제공업체와 비용은 미정.

실제 API 환경은 Python 3.14, FastAPI, PyTorch 2.14, Transformers 5.17을 사용합니다.

## 역할

| 담당 | 기능 |
| --- | --- |
| 진현 | 데이터 전처리·학습·평가, predict/explain API, 모델 추론·설명 |
| 박소현 | 기사 추출, 확장프로그램 UI, Background 통신·동의·설정, 브라우저 테스트 |

A는 API 계약·공통 타입을 관리합니다. B는 설명 API 호출과 화면 상태 전달을 연결하고, A의 설명 UI는 전달받은 props를 표시합니다. 공통 파일은 상대와 합의 없이 수정하지 않습니다.

## 폴더

```text
apps/extension/
  entrypoints/popup/       # B: 진입점·팝업
  features/detection/     # B: 제목 감지·배지
  features/explanation/   # A: 설명 UI
  features/settings/      # B: 동의·설정
  sites/                  # B: 사이트별 어댑터
  shared/                 # A: API 타입, 설정 계약은 함께 합의
  tests/
  public/
services/api/
  app/api/                # A: predict/explain
  app/ml/                 # A: 모델 로딩·추론·설명
  app/schemas/            # A: 입력·출력 형식
  app/core/               # B: 서버 설정·요청 제한
  training/               # A: 데이터 처리·학습·평가
  tests/
data/                     # 로컬 데이터, Git 제외
artifacts/                # 로컬 모델, Git 제외
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

API 서버가 실행된 상태에서 네이버 뉴스 일반 기사에 들어가 확장 프로그램 팝업의 `분석하기`를 누르면 됩니다.

## 협업

- main + 짧은 기능 브랜치. 기능 변경은 PR과 상대 검토 후 병합합니다.
- 예: 진현은 feat/model-baseline, 박소현은 feat/extension-bootstrap.
- 프로젝트 전체를 OneDrive 공동 폴더로 동시 편집하지 않습니다. 각자 로컬 복제본에서 Git으로 변경을 교환합니다.
- Git에 올리기 전 staged 파일에 데이터·모델·비밀값이 없는지 반드시 확인합니다. .gitignore는 이미 추적 중인 파일을 제거하지 않습니다.
- AI에게 작업을 맡길 때는 AGENTS.md, 현재 역할·Git 상태·실제 파일을 함께 전달합니다.

현재 경로는 OneDrive 바탕화면 아래입니다. 개인 절대 경로를 코드에 고정하지 않습니다.
