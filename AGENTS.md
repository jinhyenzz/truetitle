# TrueTitle 작업 규칙

## 시작 전

- 사용자 최신 요청과 실제 파일 상태를 먼저 확인합니다. 질문·점검 요청은 수정 허가가 아닙니다.
- 현재는 폴더와 협업 문서만 있는 준비 단계입니다. 코드·모델·Git·배포가 완료되었다고 가정하지 않습니다.
- 읽기와 분석은 가능하지만 파일 수정·설치·실행 범위는 사용자 승인을 따릅니다.
- 수정 전 범위·이유·영향·백업·검증 계획을 설명합니다. 기존 파일은 .codex-backups/YYYYMMDD-HHMMSS/에 원래 상대 경로로 백업하고 해시를 확인합니다. 실패하면 수정하지 않습니다.
- 작업 후 docs/CODEX_CHANGELOG.md에 요청·승인, 백업, 파일별 변경, 이유·영향, 실제 검증·미검증, 복구 방법을 기록합니다.
- 기존 사용자 변경을 덮어쓰지 않습니다. 새 파일은 덮어쓸 기존 파일이 없는지 확인하고, 신규 생성으로 기록합니다.

## 프로젝트 범위

- 로그인 없는 PC Chrome 확장프로그램. 영어 뉴스 목록 1곳, 낚시성 제목 모델 1개.
- WXT + React + TypeScript, Python + FastAPI + scikit-learn.
- 낚시성 신호를 표시할 뿐, 가짜뉴스 확정이나 진위 확률을 표시하지 않습니다.
- 로그인·DB·NestJS·Next.js·한국어 확장·새 모델을 임의로 추가하지 않습니다.
- 데이터 출처·사용 조건과 사이트 접근 가능 여부는 아직 검증되지 않았습니다.

## 담당 경계

- A: services/api/training/, app/ml/, app/api/predict·explain, app/schemas/, 관련 테스트, apps/extension/features/explanation/.
- A 관리: API 계약과 shared/의 API 타입. 설정 타입 등 공동 경계 변경은 B와 합의.
- B: 확장 entrypoints/, sites/, detection/, settings/, 통신·브라우저 테스트, WXT·패키지 설정.
- B: 서버 app/main.py, app/core/, health·ready, 공통 의존성, Docker, CI, 운영 문서.
- 공통 진입 파일을 양쪽 AI가 동시에 덮어쓰지 않습니다. 담당 변경은 두 사람 합의와 Issue에 남깁니다.
- B가 Background에서 explain을 요청하고 loading/ready/error·onClose를 A UI에 전달합니다. A UI는 직접 서버를 호출하지 않습니다.
- 409 복구는 B가 캐시를 우회해 predict+explain 한 번만 재요청하고 재실패 시 error로 끝냅니다.

## 안전·데이터

- 동의 전·OFF·초기화 후에는 제목을 전송하지 않습니다. 최소 전송 차단을 실제 모델 연결 전에 구현합니다.
- 초기화 후 OFF 및 재동의 상태로 복귀하고 큐·캐시·표시를 정리합니다.
- URL·본문·쿠키·검색어·방문 기록을 분석 요청에 넣지 않습니다. 고정 API와 합의한 payload만 사용합니다.
- 제목과 요청 본문을 서버 로그에 남기지 않습니다. 원본 데이터·모델·비밀값·개인 브라우저 프로필은 Git에 올리지 않습니다.
- 오류를 0점·정상 분석으로 바꾸지 않습니다. 개발용 mock은 명확히 구분하고 운영 결과처럼 시연하지 않습니다.

## Git과 검증

- Git 초기화·원격 연결·commit·push·merge·switch·reset·restore·clean·rebase 등 상태 변경은 별도 명시적 승인 없이 하지 않습니다.
- Git 연결은 현재 사용자가 직접 진행할 예정입니다. 자동으로 진행하지 않습니다.
- 가능한 읽기 검사: git status, git diff. 아직 저장소가 없으면 그 사실을 보고합니다.
- 의존성 설치·비용 발생·외부 배포·원격 저장소 생성도 명시적 승인이 필요합니다.
- 현재 실행 가능한 npm scripts·pytest 설정은 없습니다. 빌드·테스트 명령을 완료했다고 꾸미지 않습니다.
- 초기 개발 시 패키지 버전과 실제 설치·실행·검증 명령을 확인하고 README 또는 docs/setup.md에 기록합니다.
- 두 AI는 대화 기억을 공유하지 않습니다. 최신 코드·API 계약·결정 기록·실제 진행 상황으로 동기화합니다.
