// wxt가 빌드하는 콘텐츠 스크립트 산출물 경로. entrypoints/content.ts와 항상 같은 값을 가리켜야
// chrome.scripting으로 등록/주입하는 스크립트가 실제 콘텐츠 스크립트와 일치한다.
const CONTENT_SCRIPT_FILE = 'content-scripts/content.js';
const DYNAMIC_SCRIPT_ID_PREFIX = 'truetitle-site';

function originPatternFor(url: string): string {
  return `${new URL(url).origin}/*`;
}

/**
 * 이 URL의 origin에 대해 이미 권한이 있는지 확인한다. 네이버/다음처럼 매니페스트에
 * 고정으로 들어있는 도메인이든, 사용자가 이전에 "허용"을 눌러 받은 도메인이든 모두 true.
 * 팝업이 "이 사이트 허용" 버튼을 다시 보여줄지 판단할 때 쓴다.
 */
export async function hasSitePermission(url: string): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: [originPatternFor(url)] });
  } catch {
    return false;
  }
}

/**
 * 이 도메인용 콘텐츠 스크립트가 앞으로의 방문에서도 자동 주입되도록 등록(또는 갱신)한다.
 * 권한이 이미 있다고 가정한다 — 호출 전에 permissions.request/contains로 확인해야 한다.
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
    // 같은 도메인을 다시 허용하는 등 이미 등록된 id면 registerContentScripts가
    // 실패한다 — 이때는 updateContentScripts로 같은 내용으로 갱신을 시도한다.
    // 등록 자체가 (id 충돌이 아닌 다른 이유로) 실패했는데 조용히 넘어가면, 지금
    // 탭에서는 executeScript로 당장은 동작하는 것처럼 보이지만 새로고침하거나
    // 나중에 이 사이트에 다시 들어오면 콘텐츠 스크립트가 전혀 안 붙는 상태가 된다.
    try {
      await chrome.scripting.updateContentScripts([script]);
    } catch (updateError) {
      console.error('[TrueTitle] 콘텐츠 스크립트 등록 실패', registerError, updateError);
      throw updateError;
    }
  }
}

/**
 * 사용자가 "이 사이트 허용" 버튼을 눌렀을 때만 호출한다. chrome.permissions.request는
 * 사용자 동작(클릭 핸들러) 안에서 곧바로 호출해야 브라우저가 권한 요청을 정상 처리한다 —
 * background로 메시지를 보내 대신 호출하게 하면 안 된다.
 *
 * 승인되면 이후 방문부터 콘텐츠 스크립트가 자동 주입되도록 이 도메인을 동적으로 등록해둔다
 * (optional_host_permissions로 선언된 범위 안에서만 요청/등록되며, 다른 도메인에는 영향이 없다).
 */
export async function requestSitePermission(url: string): Promise<boolean> {
  const granted = await chrome.permissions.request({ origins: [originPatternFor(url)] });
  if (!granted) return false;

  await ensureContentScriptRegistered(url);
  return true;
}

/**
 * 권한은 이미 있는데(hasSitePermission 참) 콘텐츠 스크립트가 응답하지 않을 때 쓴다 —
 * 예: 이전에 등록이 실패했지만 권한만 남아있는 경우, 브라우저 재시작 등. 등록을
 * 다시 시도해서 이후 방문(그리고 인라인 버튼)이 정상화되도록 한다. 실패해도 조용히
 * 넘어간다 — 호출부(extractFromTab)가 executeScript로 지금 탭은 어차피 복구하며,
 * 등록 자체는 다음에 다시 기회가 있다.
 */
export async function repairContentScriptRegistration(url: string): Promise<void> {
  await ensureContentScriptRegistered(url).catch(() => {});
}

/**
 * 방금 권한을 받은 탭에는 콘텐츠 스크립트가 아직 없다(동적 등록은 다음 페이지 로드부터
 * 적용됨). 새로고침 없이 바로 쓸 수 있도록 지금 탭에 즉시 주입한다.
 */
export async function injectContentScriptIntoTab(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT_FILE] });
}
