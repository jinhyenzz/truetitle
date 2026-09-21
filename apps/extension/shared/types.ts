// content script가 기사 페이지에서 뽑아낸 결과. isArticle이 false면 title/body는 없다.
export interface ExtractResult {
  isArticle: boolean;
  title?: string;
  body?: string;
}

// analyzeApi.ts가 분석 서버(/analyze)로 보내는 요청. 실제 전송 필드는 title/body뿐.
export interface AnalyzeRequest {
  url: string;
  title: string;
  body: string;
}

// 1(매우 낮음)~5(매우 높음) 5단계 낚시성 신호. 서버가 내려주는 값을 그대로 신뢰해서 표시한다.
export type ClickbaitSignalLevel = 1 | 2 | 3 | 4 | 5;

// 분석 서버 응답을 프론트에서 쓰기 좋은 camelCase로 옮겨 담은 결과.
export interface AnalyzeResult {
  clickbaitScore: number; // 0~100, 낚시성 점수 (사실 여부 판정 아님)
  clickbaitSignalLevel: ClickbaitSignalLevel; // 5단계 표시용 등급
  clickbaitSignalLabel: string; // 등급 문구 (예: "매우 낮음"~"매우 높음")
  classification: 'clickbait' | 'non_clickbait';
  titleBodySimilarity: number; // 제목·본문 표현 유사도 (%)
  evidence: string[]; // 본문에서 찾지 못한 제목 표현 (참고용)
  explanation: string; // 서버가 내려주는 note (해석 주의사항)
  isMock: boolean; // true면 실제 모델이 아닌 예시 데이터
}

/** 로컬 저장 동의/사용 설정. consented=false 또는 enabled=false면 어떤 단계에서도 서버 전송을 시작하지 않는다. */
export interface Settings {
  consented: boolean; // 최초 1회 "동의하고 사용하기"를 눌렀는지
  enabled: boolean; // 팝업에서 언제든 껐다 켤 수 있는 ON/OFF
}

// background가 실패 이유를 content script/popup에 구분해서 전달하기 위한 코드.
// UI는 이 코드를 보고 사용자에게 다른 안내 문구를 보여준다.
export type AnalyzeErrorCode =
  | 'NOT_CONSENTED' // 동의 전
  | 'DISABLED' // 동의는 했지만 OFF 상태
  | 'INVALID_INPUT' // 제목/본문이 비었거나 서버가 422를 반환
  | 'MODEL_UNAVAILABLE' // 서버가 503 (모델 준비 안 됨)
  | 'RATE_LIMITED' // 서버가 429 (요청 과다, Retry-After 헤더 포함)
  | 'TIMEOUT' // 지정 시간 내 응답 없음
  | 'NETWORK_ERROR' // fetch 자체가 실패 (서버 꺼짐 등)
  | 'UNKNOWN';

export interface AnalyzeErrorInfo {
  code: AnalyzeErrorCode;
  message: string; // 화면에 그대로 보여줄 한글 안내 문구
}

/** content script/popup -> background service worker 메시지 계약. */
export interface AnalyzeArticleMessage {
  type: 'ANALYZE_ARTICLE';
  payload: {
    title: string;
    body: string;
    url?: string; // 필요할 때만 참고용으로 포함 (서버에는 title/body만 전송)
  };
}

// 지금은 메시지 종류가 하나뿐이라 union이 아니지만, background.ts의 타입가드가 이 타입 기준으로 판단한다.
export type BackgroundRequestMessage = AnalyzeArticleMessage;

// background가 chrome.runtime.sendMessage 응답으로 돌려주는 형태.
// ok로 성공/실패를 분기해서 content script/popup이 결과 패널 or 에러 패널을 그린다.
export type BackgroundResponseMessage =
  | { ok: true; result: AnalyzeResult }
  | { ok: false; error: AnalyzeErrorInfo };
