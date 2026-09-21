import { AnalyzeApiError, analyzeArticle } from '@/features/explanation/analyzeApi';
import { getAnalysisBlockedReason, getSettings } from '@/settings/settings';
import type {
  AnalyzeArticleMessage,
  BackgroundRequestMessage,
  BackgroundResponseMessage,
} from '@/shared/types';

// 서버(services/api/app/schemas/analysis.py의 AnalyzeRequest)와 같은 값을 유지해야 한다.
// 어차피 거절될 비정상적으로 긴 입력을 미리 차단하기 위함.
const MAX_TITLE_LENGTH = 300;
const MAX_BODY_LENGTH = 50_000;

// 우리 확장(content script/popup)이 보낸 형태가 맞는지 검증하는 타입가드.
// 통과 못하면 처리하지 않고 무시한다.
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

// UI 상태와 무관하게, 여기서 동의/ON-OFF와 입력값을 다시 검증한 뒤에만 서버로 보낸다.
async function handleAnalyzeArticle(
  message: AnalyzeArticleMessage,
): Promise<BackgroundResponseMessage> {
  const settings = await getSettings();
  const blockedReason = getAnalysisBlockedReason(settings);
  if (blockedReason) {
    return { ok: false, error: blockedReason };
  }

  const title = message.payload.title.trim();
  const body = message.payload.body.trim();
  if (!title || !body || title.length > MAX_TITLE_LENGTH || body.length > MAX_BODY_LENGTH) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: '제목 또는 본문을 확인할 수 없습니다.' },
    };
  }

  // AnalyzeApiError의 code를 그대로 UI에 전달.
  try {
    const result = await analyzeArticle({ url: message.payload.url ?? '', title, body });

    // 요청이 진행되는 동안(최대 REQUEST_TIMEOUT_MS) 사용자가 동의를 철회하거나 OFF로
    // 바꿨을 수 있으므로, 결과를 돌려주기 전에 다시 한번 확인한다.
    const latestBlockedReason = getAnalysisBlockedReason(await getSettings());
    if (latestBlockedReason) {
      return { ok: false, error: latestBlockedReason };
    }

    return { ok: true, result };
  } catch (e) {
    if (e instanceof AnalyzeApiError) {
      return { ok: false, error: { code: e.code, message: e.message } };
    }
    return { ok: false, error: { code: 'UNKNOWN', message: '알 수 없는 오류가 발생했습니다.' } };
  }
}

export default defineBackground(() => {
  // content script / popup에서 오는 메시지를 받는 단일 진입점.
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isAnalyzeArticleMessage(message)) return undefined; // 모르는 메시지는 무시

    const request: BackgroundRequestMessage = message;
    handleAnalyzeArticle(request)
      .then(sendResponse)
      .catch(() => {
        // reject되어도(예: 확장 컨텍스트 무효화) 호출자가 무한 대기하지 않도록 항상 응답한다.
        sendResponse({ ok: false, error: { code: 'UNKNOWN', message: '알 수 없는 오류가 발생했습니다.' } });
      });
    return true; // 비동기 응답을 위해 true 반환
  });
});
