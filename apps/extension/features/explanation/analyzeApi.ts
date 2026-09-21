import type {
  AnalyzeErrorCode,
  AnalyzeRequest,
  AnalyzeResult,
  ClickbaitSignalLevel,
} from '@/shared/types';

// .env의 WXT_API_BASE_URL. 미설정(빈 문자열 포함) 시 배포된 Railway API로 폴백.
// wxt.config.ts의 readApiBaseUrl()과 같은 기준이어야 host_permissions와 어긋나지 않는다.
const API_BASE_URL = import.meta.env.WXT_API_BASE_URL || 'https://truetitle-production.up.railway.app';
// 이 시간(ms) 안에 응답이 없으면 요청을 포기하고 TIMEOUT으로 처리한다.
const REQUEST_TIMEOUT_MS = 15000;

// 실패 원인을 code로 구분해서 던지는 커스텀 에러. background가 code를 그대로 UI에 전달한다.
export class AnalyzeApiError extends Error {
  code: AnalyzeErrorCode;

  constructor(code: AnalyzeErrorCode, message: string) {
    super(message);
    this.name = 'AnalyzeApiError';
    this.code = code;
  }
}

// 서버(/analyze) 응답 스키마 (snake_case). services/api 계약과 동일해야 한다.
interface AnalyzeApiResponse {
  clickbait_score: number;
  clickbait_signal_level: ClickbaitSignalLevel;
  clickbait_signal_label: string;
  classification: 'clickbait' | 'non_clickbait';
  title_body_similarity: number;
  evidence: string[];
  note: string;
}

// 분석 서버에 title/body만 보내고 결과를 받아온다. popup과 background가 공용으로 쓴다.
export async function analyzeArticle(req: AnalyzeRequest): Promise<AnalyzeResult> {
  // REQUEST_TIMEOUT_MS가 지나면 AbortController로 fetch를 강제 취소한다.
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
    // AbortError는 타임아웃, 그 외는 서버 다운 등 네트워크 문제.
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new AnalyzeApiError('TIMEOUT', '분석 서버 응답이 시간 내에 오지 않았습니다.');
    }
    throw new AnalyzeApiError('NETWORK_ERROR', '분석 서버에 연결할 수 없습니다.');
  } finally {
    clearTimeout(timeoutId); // 정상 응답이든 실패든 타이머는 항상 정리
  }

  if (!response.ok) {
    // services/api/app/api/analyze.py 기준: 모델 준비 안 됨=503, 입력값 검증 실패=422,
    // 요청 과다=429(Retry-After 헤더에 재시도까지 남은 초를 담아 보냄)
    if (response.status === 503) {
      throw new AnalyzeApiError('MODEL_UNAVAILABLE', '분석 모델을 준비하지 못했습니다.');
    }
    if (response.status === 422) {
      throw new AnalyzeApiError('INVALID_INPUT', '제목 또는 본문을 확인할 수 없습니다.');
    }
    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get('Retry-After'));
      const waitMessage = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? `${retryAfterSeconds}초 후 다시 시도해주세요.`
        : '잠시 후 다시 시도해주세요.';
      throw new AnalyzeApiError('RATE_LIMITED', `요청이 너무 많습니다. ${waitMessage}`);
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
