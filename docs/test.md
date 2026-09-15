# TrueTitle 확장프로그램 - 1차 구현 코드 설명

## 파일 구조 및 역할

### `shared/types.ts`
전체 코드에서 공통으로 쓰는 타입 모음.
- `ExtractResult`: 추출 결과 형태
- `AnalyzeRequest`: 서버로 보낼 요청 형태
- `AnalyzeResult`: 분석 응답 형태

나중에 필드 추가/변경할 때 이 파일 한 곳만 고치면 됨.

---

### `sites/naver.ts`
네이버 뉴스 페이지에서 실제로 제목·본문을 뽑아내는 로직.

- `isNaverArticle(url)`: 지금 열린 URL이 네이버 뉴스인지 판별
- `extractNaverArticle(doc)`: DOM에서 제목/본문 셀렉터 찾고 광고·캡션 같은 불필요한 요소 제거한 뒤 텍스트만 추출

> 사이트별로 다른 이 파일이 계속 늘어나는 구조. 나중에 `daum.ts`, `chosun.ts` 등 추가하면 됨.

---

### `features/detection/extractArticle.ts`
"지금 이 페이지가 어떤 사이트인지 판단해서 알맞은 추출기를 실행"하는 오케스트레이터.

`sites/`에 있는 개별 사이트 로직들을 배열로 관리하고, URL에 맞는 걸 찾아서 실행만 함.

> 사이트 추가할 때 이 배열에 한 줄만 추가하면 되는 구조.

---

### `features/explanation/analyzeApi.ts`
분석 요청을 보내는 함수.

- 현재: mock 응답 (1초 딜레이 후 랜덤 점수 반환)
- 목적: 나중에 진현이 서버 API 붙일 때 **이 파일 내부만 fetch 코드로 교체**하면 나머지 코드는 하나도 안 건드려도 되게 분리해둠

---

### `entrypoints/content.ts`
크롬 확장프로그램의 content script.

네이버 뉴스 페이지에 자동으로 주입돼서 대기하다가, 팝업으로부터 `EXTRACT_ARTICLE` 메시지를 받으면 추출 로직을 실행해서 결과를 돌려줌.

> 팝업은 페이지 DOM에 직접 접근 못 하기 때문에 이런 메신저 역할이 필요함.

---

### `entrypoints/popup/main.ts`
사용자가 실제로 보는 화면(팝업) 로직.

1. 열리자마자 로딩 표시 → content script에 메시지 보내 추출 요청
2. 결과 없으면 "기사 아님" 화면, 있으면 제목/본문 미리보기/글자수/분석버튼 렌더링
3. 분석하기 누르면 `analyzeApi` 호출 → 분석중 → 결과 or 실패 시 재시도 버튼

---

## 전체 흐름

```
popup (사용자 클릭)
  → content script (페이지에서 추출)
    → sites/naver.ts (실제 파싱)
  → 결과를 popup으로 돌려받아 화면 표시
  → 분석하기 클릭 시 analyzeApi (지금은 mock) 호출
```

---

## 2차 작업 - 실제 서버 연결 (2026-09-16)

### 한 일

1. **`services/api/app/main.py` 추가**
   - 그동안 없던 FastAPI 서버 진입점 생성. 기존 `app/api/analyze.py`의 `router`를 등록함.
   - `/health`: 서버가 떠 있는지만 확인.
   - `/ready`: 저장된 모델을 실제로 불러올 수 있는지 확인 후 200/503 반환.

2. **`analyzeApi.ts`의 mock 제거, 진짜 서버 호출로 교체**
   - 기존엔 1초 기다렸다가 랜덤 점수를 돌려주는 가짜 함수였음.
   - 이제 `.env`의 `WXT_API_BASE_URL`(없으면 `http://127.0.0.1:8001` 기본값)로 실제 FastAPI 서버에 `fetch`로 `{title, body}`를 보내고, 응답을 그대로 화면에 반영.
   - 주소를 코드에 하드코딩하지 않고 `.env`/`.env.example`로 뺌 → 나중에 배포 주소 바뀌어도 코드 수정 없이 `.env`만 고치면 됨.

3. **`shared/types.ts`의 `AnalyzeResult` 확장**
   - 서버가 실제로 주는 필드(`classification`, `titleBodySimilarity`, `evidence`)를 타입에 추가.

4. **`popup/main.ts` 결과 화면 갱신**
   - 낚시성 점수 외에 제목·본문 유사도(%), 본문에 없는 제목 표현(근거)도 같이 표시하도록 수정.

5. **`wxt.config.ts`에 로컬 서버 접근 권한 추가**
   - `.env`에서 `WXT_API_BASE_URL`을 읽어(없으면 기본값) `host_permissions`에 자동으로 추가하도록 수정. 이게 없으면 popup이 로컬 서버로 fetch를 못 함(권한 오류).

6. **`@types/chrome` 설치**
   - devDependencies에 추가해서 `chrome.*` API 관련 타입 에러 해결.

### 실제 확인한 것

- `npm run build`로 프로덕션 빌드 성공, `manifest.json`에 새 권한 반영 확인.
- 실제 크롬에 `.output/chrome-mv3` 압축해제 로드 → 네이버 기사 페이지에서 아이콘 클릭 → 추출 → "분석하기" 클릭까지 전체 흐름을 눈으로 확인.
- 개발자 도구 Network 탭에서 `/analyze` 요청이 진짜로 서버에 도달해 **503**(모델 파일 없음) 응답을 받는 것까지 확인함. 즉 "네트워크 연결 실패"가 아니라 "서버는 받았는데 모델이 없어서 정직하게 실패 응답"인 상태 — 배선 자체는 정상.

### 알아둘 것 / 남은 일

- **모델 파일 없음**: `artifacts/baseline-full/tfidf_logistic_regression.joblib`이 이 컴퓨터엔 없어서(Git 제외 대상) 아직 진짜 낚시성 점수는 못 봄. `/ready`, `/analyze` 모두 503을 반환하는 게 정상이며, 이 파일이 생기기 전까진 계속 이럴 것.
- **포트 8000 → 8001로 변경**: 이 컴퓨터에서 Windows가 8000번 포트를 예약된 범위로 잡고 있어서(`WinError 10013`) 8001번으로 서버를 띄움. `analyzeApi.ts`의 `API_BASE_URL`과 `wxt.config.ts`의 `host_permissions`가 둘 다 8001로 맞춰져 있음. 나중에 다른 포트나 실제 배포 주소로 바뀌면 이 두 곳을 같이 고쳐야 함.
- **`app/main.py`는 정적 빌드(`chrome-mv3`)로만 테스트함**: `chrome-mv3-dev` 폴더는 `npm run dev` 서버가 켜져 있어야 동작하는 별개의 빌드라 헷갈리지 않도록 주의.
- **API 주소는 `.env`로 관리**: 실제 값은 `apps/extension/.env`(Git 제외)에 두고, `.env.example`만 커밋함. 새로 셋업할 때는 `.env.example`을 복사해서 `.env` 만들면 됨.