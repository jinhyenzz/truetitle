// wxt가 빌드하는 콘텐츠 스크립트 산출물 경로. entrypoints/content.ts와 항상 일치해야 한다.
const CONTENT_SCRIPT_FILE = 'content-scripts/content.js';
const DYNAMIC_SCRIPT_ID_PREFIX = 'truetitle-site';

function originPatternFor(url: string): string {
  return `${new URL(url).origin}/*`;
}

/**
 * 이 URL의 origin에 권한이 있는지 확인한다 (매니페스트 고정 도메인이든 사용자가
 * 허용한 도메인이든 모두 true). 팝업이 허용 버튼을 다시 보여줄지 판단할 때 쓴다.
 */
export async function hasSitePermission(url: string): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: [originPatternFor(url)] });
  } catch {
    return false;
  }
}

/**
 * 이 도메인용 콘텐츠 스크립트가 앞으로의 방문에도 자동 주입되도록 등록(또는 갱신)한다.
 * 권한이 이미 있다고 가정하므로, 호출 전에 permissions.request/contains로 확인해야 한다.
 */
async function ensureContentScriptRegistered(url: string): Promise<void> {
  const origin = originPatternFor(url);
  const script: chrome.scripting.RegisteredContentScript = {
    id: `${DYNAMIC_SCRIPT_ID_PREFIX}-${new URL(url).hostname}`,
    matches: [origin],
    js: [CONTENT_SCRIPT_FILE],
    runAt: 'document_idle',
  };

  try {
    await chrome.scripting.registerContentScripts([script]);
  } catch (registerError) {
    // 같은 도메인을 다시 허용하는 등 id가 이미 등록돼있으면 registerContentScripts가
    // 실패한다 — updateContentScripts로 갱신을 재시도한다. 여기서 실패를 삼키면
    // 이 탭은 executeScript로 당장 동작해도, 다음 방문부터 스크립트가 전혀 안 붙는다.
    try {
      await chrome.scripting.updateContentScripts([script]);
    } catch (updateError) {
      console.error('[TrueTitle] 콘텐츠 스크립트 등록 실패', registerError, updateError);
      throw updateError;
    }
  }
}

/**
 * "이 사이트 허용" 클릭 시에만 호출한다. chrome.permissions.request는 클릭 핸들러
 * 안에서 곧바로 호출해야 하므로 background로 위임하면 안 된다.
 * 승인되면 이후 방문부터 자동 주입되도록 이 도메인을 동적으로 등록해둔다.
 */
export async function requestSitePermission(url: string): Promise<boolean> {
  const granted = await chrome.permissions.request({ origins: [originPatternFor(url)] });
  if (!granted) return false;

  await ensureContentScriptRegistered(url);
  return true;
}

/**
 * 권한은 있는데(hasSitePermission 참) 콘텐츠 스크립트가 응답하지 않을 때 쓴다 —
 * 등록 재시도로 이후 방문을 복구한다. 실패해도 조용히 넘어간다 — 호출부가
 * executeScript로 지금 탭은 어차피 복구하며, 등록은 다음 기회에 다시 시도된다.
 */
export async function repairContentScriptRegistration(url: string): Promise<void> {
  await ensureContentScriptRegistered(url).catch(() => {});
}

/**
 * 방금 권한을 받은 탭엔 콘텐츠 스크립트가 아직 없다(동적 등록은 다음 로드부터 적용).
 * 새로고침 없이 쓸 수 있도록 지금 탭에 즉시 주입한다.
 */
export async function injectContentScriptIntoTab(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT_FILE] });
}
