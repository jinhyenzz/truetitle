import { AnalyzeApiError, analyzeArticle } from '@/features/explanation/analyzeApi';
import { getAnalysisBlockedReason, getSettings } from '@/settings/settings';
import type {
  AnalyzeArticleMessage,
  BackgroundRequestMessage,
  BackgroundResponseMessage,
} from '@/shared/types';

// 비정상적으로 긴 문자열(예: 오동작으로 페이지 전체가 딸려온 경우)을 그대로 서버로 보내지 않기 위한 상한.
// services/api/app/schemas/analysis.py의 AnalyzeRequest(title max_length=300, body max_length=50000)와
// 반드시 같은 값을 유지해야 한다 (서버가 어차피 거절할 입력을 통과시키지 않기 위함).
const MAX_TITLE_LENGTH = 300;
const MAX_BODY_LENGTH = 50_000;

// 외부 웹페이지가 아니라 우리 확장(content script/popup)이 보낸, 우리가 아는 형태의
// 메시지인지 검증하는 타입가드. 이 검사를 통과 못하면 아예 처리하지 않고 무시한다.
// (background에는 우리가 정의한 인터페이스 외의 메시지 핸들러를 추가하지 않는다.)
function isAnalyzeArticleMessage(message: unknown): message is AnalyzeArticleMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as Record<string, unknown>;
  if (candidate.type !== 'ANALYZE_ARTICLE') return false;
  const payload = candidate.payload as Record<string, unknown> | undefined;
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof payload.title === 'string' &&
    typeof payload.body === 'string'
  );
}

// 실제 분석 요청을 처리하는 핵심 함수.
// UI(팝업/버튼)가 어떤 상태였든 상관없이, 여기서 다시 한 번 동의/ON-OFF와 입력값을 검증한 뒤에만
// 실제 서버 호출(analyzeArticle)로 넘어간다 = "요청 처리 단계에서도 전송 차단".
async function handleAnalyzeArticle(
  message: AnalyzeArticleMessage,
): Promise<BackgroundResponseMessage> {
  // 1) 동의/ON-OFF 확인. 둘 중 하나라도 아니면 서버에 아무것도 보내지 않고 바로 반환.
  const settings = await getSettings();
  const blockedReason = getAnalysisBlockedReason(settings);
  if (blockedReason) {
    return { ok: false, error: blockedReason };
  }

  // 2) 입력값 검증 (빈 문자열, 지나치게 긴 문자열 방지).
  const title = message.payload.title.trim();
  const body = message.payload.body.trim();
  if (!title || !body || title.length > MAX_TITLE_LENGTH || body.length > MAX_BODY_LENGTH) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: '제목 또는 본문을 확인할 수 없습니다.' },
    };
  }

  // 3) 실제 분석 서버 호출. 실패하면 AnalyzeApiError의 code를 그대로 UI에 전달.
  try {
    const result = await analyzeArticle({ url: message.payload.url ?? '', title, body });
    return { ok: true, result };
  } catch (e) {
    if (e instanceof AnalyzeApiError) {
      return { ok: false, error: { code: e.code, message: e.message } };
    }
    return { ok: false, error: { code: 'UNKNOWN', message: '알 수 없는 오류가 발생했습니다.' } };
  }
}

export default defineBackground(() => {
  // content script(chrome.runtime.sendMessage) / popup에서 오는 메시지를 받는 단일 진입점.
  // 외부 웹페이지가 호출할 수 있는 별도 인터페이스는 만들지 않는다.
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isAnalyzeArticleMessage(message)) return undefined; // 모르는 메시지는 무시

    const request: BackgroundRequestMessage = message;
    handleAnalyzeArticle(request)
      .then(sendResponse)
      .catch(() => {
        // getSettings() 등 try/catch 밖의 호출이 reject해도(예: 확장 컨텍스트 무효화)
        // sendResponse를 반드시 호출해서 호출자가 무한정 대기하지 않게 한다.
        sendResponse({ ok: false, error: { code: 'UNKNOWN', message: '알 수 없는 오류가 발생했습니다.' } });
      });
    return true; // 비동기로 sendResponse를 호출할 것임을 Chrome에 알림
  });
});
