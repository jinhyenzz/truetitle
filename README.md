# TrueTitle

지원 뉴스 목록에서 기사 클릭 전에 제목의 낚시성 신호와 모델 설명을 보여 주는, 로그인 없는 PC Chrome 확장프로그램입니다.

> 현재 상태: 기본 폴더와 협업 문서만 준비했습니다. 실행 코드·학습 모델·패키지 설정·Git 저장소·배포는 아직 준비되지 않았습니다.
> 낚시성 분류는 기사의 사실 여부 검증이 아닙니다. 낮은 점수를 안전한 기사라는 뜻으로 표시하지 않습니다.

## 개발 범위

- 2인, 2주 계획. 시작일과 하루 작업시간은 함께 정합니다.
- 영어 제목, 뉴스 사이트 1곳, TF-IDF + Logistic Regression 모델 1개.
- P0: 제목 감지, 분석 배지, 이유 설명, 동의·ON/OFF·설정 초기화, 기본 중복 방지·메모리 캐시, 키보드·Esc·확대 대응, 오류 처리·평가.
- P1: 선택형 흐림, 캐시 고도화, 추가 접근성 개선.
- 제외: 로그인, SQL/DB, 별도 웹앱, 본문 진위 판정, 한국어 모델, 모든 사이트 지원.
- BBC 영문 목록과 Webis-Clickbait-17은 후보이며, 첫날 실제 접근·데이터 사용 조건을 확인합니다.

## 계획 기술

- 확장프로그램: WXT, React, TypeScript, Manifest V3
- 분석 서버: Python, FastAPI, Pydantic
- 학습: pandas, scikit-learn
- 테스트: Vitest, pytest, 실제 Chrome 확인
- 배포: 분석 API용 Docker. 제공업체와 비용은 미정.

아직 설치하지 않았습니다. 버전과 실제 실행 명령은 첫 실행 뼈대를 만들 때 확인하고 기록합니다.

## 역할

| 담당 | 기능 |
| --- | --- |
| A | 데이터·학습·평가, predict/explain API, 모델 추론·설명, 결과 설명 UI |
| B | 사이트 감지·배지, Background 통신·큐·캐시, 동의·설정, 서버 실행 기반·CI·배포 |

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

## 시작 순서

1. GitHub에 비공개 truetitle 저장소를 만들고 친구를 초대합니다. Git 연결은 사용자가 직접 진행합니다.
2. 두 사람이 API 요청·응답·오류 및 설명창 props를 합의합니다.
3. A는 데이터와 학습을 준비하고 B는 WXT·FastAPI 뼈대 및 로컬 mock을 만듭니다.
4. D2 최소 동의·OFF·전송 차단을 검사한 뒤 D3 실제 분석 API에 연결합니다.
5. D4-D5 설명창·설정 연결, D7 중간 점검, D10 기능 동결, D14 최종 검증을 목표로 합니다.

## 협업

- main + 짧은 기능 브랜치. 기능 변경은 PR과 상대 검토 후 병합합니다.
- 예: A는 feat/model-baseline, B는 feat/detect-badge.
- 프로젝트 전체를 OneDrive 공동 폴더로 동시 편집하지 않습니다. 각자 로컬 복제본에서 Git으로 변경을 교환합니다.
- Git에 올리기 전 staged 파일에 데이터·모델·비밀값이 없는지 반드시 확인합니다. .gitignore는 이미 추적 중인 파일을 제거하지 않습니다.
- AI에게 작업을 맡길 때는 AGENTS.md, 공유 계획서/인계서, 현재 역할·Issue·진행 상황을 함께 전달합니다.

현재 경로는 OneDrive 바탕화면 아래입니다. 개인 절대 경로를 코드에 고정하지 않습니다.
