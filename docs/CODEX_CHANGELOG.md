# 작업 변경 기록

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
