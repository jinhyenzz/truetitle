import type {
  AnalyzeErrorCode,
  AnalyzeRequest,
  AnalyzeResult,
  ClickbaitSignalLevel,
} from '@/shared/types';

// .env의 WXT_API_BASE_URL로 설정. 없거나 빈 문자열이면 로컬 개발 서버로 기본값 사용.
// wxt.config.ts의 readApiBaseUrl()과 동일하게 빈 문자열도 "미설정"으로 취급해야
// host_permissions와 실제 fetch 대상이 어긋나지 않는다.
const API_BASE_URL = import.meta.env.WXT_API_BASE_URL || 'http://127.0.0.1:8001';
// 이 시간(ms) 안에 서버가 응답 안 하면 요청을 포기하고 TIMEOUT 에러로 취급한다.
const REQUEST_TIMEOUT_MS = 15000;

// 실패 원인을 code로 구분해서 던지는 커스텀 에러.
// 호출하는 쪽(background)이 이 code를 그대로 AnalyzeErrorInfo에 담아 UI에 전달한다.
export class AnalyzeApiError extends Error {
  code: AnalyzeErrorCode;

  constructor(code: AnalyzeErrorCode, message: string) {
    super(message);
    this.name = 'AnalyzeApiError';
    this.code = code;
  }
}

// 서버(/analyze)가 실제로 내려주는 응답 스키마 (snake_case). services/api 쪽 계약과 동일해야 한다.
// clickbait_signal_level/label은 5단계 표시용으로 새로 추가된 필드 (기존 필드는 그대로 유지됨).
interface AnalyzeApiResponse {
  clickbait_score: number;
  clickbait_signal_level: ClickbaitSignalLevel;
  clickbait_signal_label: string;
  classification: 'clickbait' | 'non_clickbait';
  title_body_similarity: number;
  evidence: string[];
  note: string;
}

// 분석 서버에 title/body만 보내고 결과를 받아온다.
// popup과 background(content script용) 양쪽이 이 함수 하나만 재사용한다.
export async function analyzeArticle(req: AnalyzeRequest): Promise<AnalyzeResult> {
  // AbortController로 REQUEST_TIMEOUT_MS가 지나면 강제로 fetch를 취소시킨다.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: req.title, body: req.body }), // 서버 계약상 title/body만 전송
      signal: controller.signal,
    });
  } catch (e) {
    // AbortError면 타임아웃, 그 외(fetch 자체 실패)는 서버가 꺼져있는 등 네트워크 문제.
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new AnalyzeApiError('TIMEOUT', '분석 서버 응답이 시간 내에 오지 않았습니다.');
    }
    throw new AnalyzeApiError('NETWORK_ERROR', '분석 서버에 연결할 수 없습니다.');
  } finally {
    clearTimeout(timeoutId); // 정상 응답이든 실패든 타이머는 항상 정리
  }

  if (!response.ok) {
    // services/api/app/api/analyze.py 기준: 모델 준비 안 됨=503, 입력값 검증 실패=422
    if (response.status === 503) {
      throw new AnalyzeApiError('MODEL_UNAVAILABLE', '분석 모델을 준비하지 못했습니다.');
    }
    if (response.status === 422) {
      throw new AnalyzeApiError('INVALID_INPUT', '제목 또는 본문을 확인할 수 없습니다.');
    }
    throw new AnalyzeApiError('UNKNOWN', `분석 서버 오류: ${response.status}`);
  }

  // snake_case 응답을 프론트에서 쓰는 camelCase AnalyzeResult로 변환.
  const data: AnalyzeApiResponse = await response.json();
  return {
    clickbaitScore: data.clickbait_score,
    clickbaitSignalLevel: data.clickbait_signal_level,
    clickbaitSignalLabel: data.clickbait_signal_label,
    classification: data.classification,
    titleBodySimilarity: data.title_body_similarity,
    evidence: data.evidence,
    explanation: data.note,
    isMock: false,
  };
}
