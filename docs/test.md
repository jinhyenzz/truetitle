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