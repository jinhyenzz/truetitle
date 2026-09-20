import './style.css';
import {
  hasSitePermission,
  injectContentScriptIntoTab,
  repairContentScriptRegistration,
  requestSitePermission,
} from '@/features/permissions/sitePermissions';
import { getAnalysisBlockedReason, getSettings, resetSettings, setSettings } from '@/settings/settings';
import { isDaumArticle } from '@/sites/daum';
import { isNaverArticle } from '@/sites/naver';
import type {
  AnalyzeErrorInfo,
  AnalyzeResult,
  BackgroundResponseMessage,
  ExtractResult,
  Settings,
} from '@/shared/types';

const app = document.querySelector<HTMLDivElement>('#app')!;

const BODY_PREVIEW_LENGTH = 200;

// public/icon-48.png (낚시대 아이콘)를 헤더 배지로 그대로 쓴다. 확장 빌드 결과물마다
// 실제 경로가 달라질 수 있어 하드코딩 대신 runtime.getURL로 절대 URL을 구한다.
const HEADER_ICON_URL = chrome.runtime.getURL('icon-48.png');

// settings가 주어지면(=동의 완료 후 화면들) 헤더 오른쪽에 초기화 버튼을 같이 그린다.
// 동의 전 화면(renderConsent)에는 초기화할 대상이 없으므로 settings=null로 호출한다.
function header(settings: Settings | null): string {
  return `
    <div class="app-header">
      <div class="header-left">
        <img class="header-icon" src="${HEADER_ICON_URL}" alt="" />
        <h1>TrueTitle - 낚시성 제목 탐지기</h1>
      </div>
      ${settings ? '<button id="reset-settings-btn" class="reset-btn" type="button">초기화</button>' : ''}
    </div>
  `;
}

// header()가 초기화 버튼을 그렸다면 클릭 핸들러를 연결한다. 모든 동의-후 화면에서
// 같은 id를 재사용하므로, 화면이 다시 그려질 때마다 한 번만 호출하면 된다.
function bindResetButton() {
  document.querySelector('#reset-settings-btn')?.addEventListener('click', async () => {
    const confirmed = window.confirm('동의 상태를 초기화할까요? 다시 사용하려면 동의 화면부터 진행해야 해요.');
    if (!confirmed) return;
    await resetSettings();
    init();
  });
}

// consented가 false일 때만 보여주는 최초 1회 동의 화면.
// 동의를 누르면 consented+enabled를 함께 true로 저장하고 init()을 다시 실행해 본화면으로 전환한다.
function renderConsent() {
  app.innerHTML = `
    ${header(null)}
    <div class="card">
      <div class="card-section">
        <p class="consent-text">
          이 확장 프로그램은 지원하는 뉴스 기사 페이지에서 "분석하기"를 눌렀을 때만
          기사 제목과 본문을 분석 서버로 전송합니다. URL, 쿠키, 검색어, 방문 기록은 전송하지 않습니다.
        </p>
        <button id="consent-btn" class="btn btn-primary">동의하고 사용하기</button>
      </div>
    </div>
  `;
  document.querySelector('#consent-btn')!.addEventListener('click', async () => {
    await setSettings({ consented: true, enabled: true });
    init();
  });
}

function renderLoading(settings: Settings) {
  app.innerHTML = `
    ${header(settings)}
    <div class="card state-center">
      <div class="spinner"></div>
      <p>기사 정보를 불러오는 중...</p>
    </div>
  `;
  bindResetButton();
}

function renderNotArticle(settings: Settings) {
  app.innerHTML = `
    ${header(settings)}
    <div class="card state-center">
      <span class="state-icon">📄</span>
      <p>기사 페이지가 아니거나<br />본문을 읽을 수 없어요.</p>
    </div>
  `;
  bindResetButton();
}

// 네이버·다음처럼 매니페스트에 고정으로 들어있지 않고, 사용자가 아직 허용하지 않은
// 사이트에서 팝업을 열었을 때 보여준다. onAllow는 "이 사이트 허용" 클릭 시 실행된다.
function renderPermissionPrompt(url: string, settings: Settings, onAllow: () => void) {
  app.innerHTML = `
    ${header(settings)}
    <div class="card state-center">
      <span class="state-icon">🔍</span>
      <p><span class="permission-host"></span>은(는)<br />아직 지원 목록에 없어요.</p>
      <p class="disabled-note">허용하면 이 사이트의 기사 페이지에서만<br />분석 버튼이 표시돼요.</p>
      <button id="allow-site-btn" class="btn btn-primary">이 사이트 허용</button>
    </div>
  `;
  // hostname은 URL 파서가 만든 값이라 안전하지만, 다른 곳과 일관되게 textContent로 채운다.
  (app.querySelector('.permission-host') as HTMLElement).textContent = new URL(url).hostname;
  document.querySelector('#allow-site-btn')!.addEventListener('click', onAllow);
  bindResetButton();
}

// 현재 탭이 지원하는 기사일 때 보여주는 카드. settings.enabled가 꺼져 있으면
// 분석 버튼을 비활성화하고 안내 문구만 보여준다 (버튼 자체를 숨기지는 않음).
// tabUrl은 "검사한 기사" 메타 행에 출처 도메인을 보여주기 위한 것으로, 서버로는 전송하지 않는다.
function renderArticle(result: ExtractResult, settings: Settings, tabUrl: string) {
  const preview =
    result.body!.slice(0, BODY_PREVIEW_LENGTH) + (result.body!.length > BODY_PREVIEW_LENGTH ? '...' : '');

  let hostname = '';
  try {
    hostname = new URL(tabUrl).hostname;
  } catch {
    hostname = '';
  }

  app.innerHTML = `
    ${header(settings)}
    <div class="card">
      <div class="card-section">
        <p class="article-label">검사한 기사</p>
        <h2 class="article-title"></h2>
        <p class="article-preview"></p>
        <div class="article-meta">
          <span>본문 ${result.body!.length}자</span>
          ${hostname ? '<span class="article-host"></span>' : ''}
        </div>
      </div>
      <div class="card-section no-divider">
        <button id="analyze-btn" class="btn btn-primary" ${settings.enabled ? '' : 'disabled'}>분석하기</button>
        ${settings.enabled ? '' : '<p class="disabled-note">분석 기능이 꺼져 있어요. 초기화 후 다시 동의해주세요.</p>'}
      </div>
      <div id="analyze-result"></div>
    </div>
  `;

  // 기사 제목/본문/출처는 외부 페이지에서 가져온 문자열이므로 innerHTML이 아닌 textContent로만 채운다.
  (app.querySelector('.article-title') as HTMLElement).textContent = result.title!;
  (app.querySelector('.article-preview') as HTMLElement).textContent = preview;
  if (hostname) {
    (app.querySelector('.article-host') as HTMLElement).textContent = hostname;
  }

  document.querySelector('#analyze-btn')?.addEventListener('click', () => {
    handleAnalyze(result);
  });
  bindResetButton();
}

function renderAnalyzing() {
  const resultBox = document.querySelector('#analyze-result')!;
  resultBox.innerHTML = `
    <div class="result-block state-center">
      <div class="spinner"></div>
      <p>분석 중...</p>
    </div>
  `;
}

// 분석 성공 결과를 카드로 렌더링. evidence/explanation은 API가 내려준 자유 텍스트라
// 아래에서 별도로 textContent를 채워 넣어(innerHTML에 직접 넣지 않음) 이스케이프한다.
// 근거(evidence/explanation)는 별도 "근거 보기" 버튼 없이 유사도 섹션 바로 아래에 항상 표시한다.
function renderAnalyzeResult(result: AnalyzeResult) {
  const resultBox = document.querySelector('#analyze-result')!;
  // 등급/문구는 클라이언트가 다시 계산하지 않고 서버가 내려준 5단계 값을 그대로 쓴다.
  const sigClass = `sig-${result.clickbaitSignalLevel}`;

  // 5단계 게이지: 항상 5색을 모두 보여주되(안전→위험), 현재 단계만 진하게 강조하고
  // 그 아래 화살표+"현재" 라벨을 붙인다.
  const meterSegments = Array.from({ length: 5 }, (_, i) => i + 1)
    .map((i) => {
      const active = i === result.clickbaitSignalLevel;
      const style = active
        ? `background: var(--meter-${i}); box-shadow: 0 0 0 3px color-mix(in srgb, var(--meter-${i}) 25%, var(--card-bg));`
        : `background: var(--meter-${i}); opacity: 0.35;`;
      return `<div class="meter-seg" style="${style}"></div>`;
    })
    .join('');
  const meterPointers = Array.from({ length: 5 }, (_, i) => i + 1)
    .map((i) => {
      if (i !== result.clickbaitSignalLevel) return '<div></div>';
      return `
        <div class="meter-pointer">
          <div class="meter-caret" style="border-bottom-color: var(--meter-${i});"></div>
          <div class="meter-current-label" style="color: var(--meter-${i});">현재</div>
        </div>
      `;
    })
    .join('');

  resultBox.innerHTML = `
    <div class="result-block">
      <div class="card-section">
        <div class="score-top">
          <div class="score-value ${sigClass}">${result.clickbaitScore}</div>
          <div class="score-meta">
            <div class="score-pill ${sigClass}">
              <span class="score-pill-dot"></span>
              <span class="score-pill-label"></span>
            </div>
            <div class="score-sub">100점 기준 · 5단계 중 ${result.clickbaitSignalLevel}단계</div>
          </div>
        </div>
        <div class="meter-track" role="img" aria-label="낚시성 신호 5단계 중 ${result.clickbaitSignalLevel}단계: ${result.clickbaitSignalLabel}">${meterSegments}</div>
        <div class="meter-pointer-row">${meterPointers}</div>
        <div class="meter-scale">
          <span>안전</span>
          <span>주의</span>
          <span>위험</span>
        </div>
      </div>
      <div class="card-section">
        <div class="similarity-label">
          <span>제목·본문 유사도</span>
          <span class="similarity-pct">${result.titleBodySimilarity}%</span>
        </div>
        <div class="similarity-track">
          <div class="similarity-fill" style="width: ${result.titleBodySimilarity}%"></div>
        </div>
      </div>
      <div class="card-section evidence-block">
        ${result.isMock ? '<p class="mock-note">* 예시 데이터로 표시된 결과입니다</p>' : ''}
      </div>
    </div>
  `;

  // clickbaitSignalLabel은 서버(API)가 내려준 문자열이므로 innerHTML이 아닌 textContent로만 채운다.
  (resultBox.querySelector('.score-pill-label') as HTMLElement).textContent = result.clickbaitSignalLabel;

  const evidenceBlock = resultBox.querySelector('.evidence-block') as HTMLDivElement;
  if (result.evidence.length > 0) {
    const title = document.createElement('p');
    title.className = 'evidence-title';
    title.textContent = '본문에서 찾지 못한 제목 표현';
    evidenceBlock.prepend(title);

    const chips = document.createElement('div');
    chips.className = 'evidence-chips';
    for (const item of result.evidence) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = item;
      chips.appendChild(chip);
    }
    title.after(chips);
  }

  // 근거 문구(해석 주의사항)는 유사도 섹션 바로 아래, 표현 칩 밑에 항상 표시한다.
  const explanation = document.createElement('p');
  explanation.className = 'explanation';
  explanation.textContent = result.explanation;
  evidenceBlock.insertBefore(explanation, evidenceBlock.querySelector('.mock-note'));

  // 다시 분석할 수 있음을 알 수 있도록 상단 분석 버튼 라벨을 갱신한다.
  const analyzeBtn = document.querySelector('#analyze-btn');
  if (analyzeBtn) analyzeBtn.textContent = '다시 분석하기';
}

// 분석 실패 시 에러 문구 + 재시도 버튼. error.message는 background/analyzeApi가
// 만든 안내 문구이지만 그대로 신뢰하지 않고 textContent로만 반영한다.
function renderAnalyzeError(error: AnalyzeErrorInfo, article: ExtractResult) {
  const resultBox = document.querySelector('#analyze-result')!;
  resultBox.innerHTML = `
    <div class="result-block state-center">
      <span class="state-icon">⚠️</span>
      <p class="error-text"></p>
      <button id="retry-btn" class="btn btn-secondary">다시 시도</button>
    </div>
  `;
  (resultBox.querySelector('.error-text') as HTMLElement).textContent = error.message;
  document.querySelector('#retry-btn')?.addEventListener('click', () => handleAnalyze(article));
}

// "분석하기" 버튼 클릭 시 실행. 실제 서버 호출은 content.ts와 똑같이 background에
// chrome.runtime.sendMessage로 위임한다 (분석 로직을 팝업용으로 따로 복제하지 않음).
async function handleAnalyze(article: ExtractResult) {
  renderAnalyzing();

  // 버튼이 눌리는 시점 기준으로 한 번 더 확인 (팝업을 열어둔 채로 다른 곳에서 OFF했을 수도 있음).
  const settings = await getSettings();
  const blockedReason = getAnalysisBlockedReason(settings);
  if (blockedReason) {
    renderAnalyzeError(blockedReason, article);
    return;
  }

  try {
    const activeTab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    const response: BackgroundResponseMessage = await chrome.runtime.sendMessage({
      type: 'ANALYZE_ARTICLE',
      payload: { title: article.title!, body: article.body!, url: activeTab?.url ?? '' },
    });

    if (response.ok) {
      renderAnalyzeResult(response.result);
    } else {
      renderAnalyzeError(response.error, article);
    }
  } catch {
    renderAnalyzeError(
      { code: 'NETWORK_ERROR', message: '확장 프로그램 내부 통신에 실패했습니다.' },
      article,
    );
  }
}

// 구글 검색·구글 뉴스는 기사 목록·요약문이지 기사 본문이 아니므로 분석 대상에서 제외한다.
// (실제로 이 도메인들엔 기사용 구조화 데이터가 없어 extractGenericArticle이 알아서
// 거르지만, 애초에 "이 사이트 허용" 프롬프트조차 보여주지 않도록 명시적으로 막아둔다.)
const GENERIC_SUPPORT_EXCLUDED_HOSTNAMES = ['google.com', 'www.google.com', 'news.google.com'];

function isExcludedFromGenericSupport(url: string): boolean {
  try {
    return GENERIC_SUPPORT_EXCLUDED_HOSTNAMES.includes(new URL(url).hostname);
  } catch {
    return true;
  }
}

// requestSitePermission/injectContentScriptIntoTab이 실패했을 때 보여준다. 이 오류는
// 팝업 자신의 콘솔(페이지가 아니라 팝업을 우클릭 → 검사)에만 찍혀서 놓치기 쉬우므로,
// 화면에도 원인 문구를 그대로 보여준다.
function renderPermissionError(message: string, settings: Settings) {
  app.innerHTML = `
    ${header(settings)}
    <div class="card state-center">
      <span class="state-icon">⚠️</span>
      <p>사이트를 허용하는 중 문제가 발생했어요.</p>
      <p class="error-text"></p>
    </div>
  `;
  (app.querySelector('.error-text') as HTMLElement).textContent = message;
  bindResetButton();
}

// "이 사이트 허용" 클릭 시 실행. 승인되면 지금 탭에 콘텐츠 스크립트를 바로 주입하고
// (동적 등록은 다음 페이지 로드부터 적용되므로 새로고침 없이 쓰려면 필요) 처음부터 다시 그린다.
async function handleAllowSite(url: string, tabId: number, settings: Settings) {
  try {
    const granted = await requestSitePermission(url);
    if (!granted) {
      renderNotArticle(settings); // 사용자가 권한 요청을 거부함
      return;
    }
    await injectContentScriptIntoTab(tabId);
  } catch (error) {
    renderPermissionError(error instanceof Error ? error.message : String(error), settings);
    return;
  }
  init();
}

// EXTRACT_ARTICLE을 보내보고, 응답이 없으면(콘텐츠 스크립트가 그 탭에 아직 없는 상태 —
// 예: 이전에 사이트를 허용했을 때 registerContentScripts가 등록에는 실패했지만 권한
// 자체는 남아있는 경우, 브라우저 재시작 등) 지금 탭에 스크립트를 직접 주입한 뒤 한 번만
// 더 시도한다. 동시에 도메인 등록도 다시 시도해서, 이 탭뿐 아니라 이후 방문(그리고
// 인라인 버튼)도 같이 복구되게 한다. 매번 이렇게 스스로 복구하도록 해서, "권한은
// 있는데 스크립트는 없는" 상태에 계속 묶여있지 않게 한다.
async function extractFromTab(tabId: number, url: string): Promise<ExtractResult> {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_ARTICLE' });
  } catch {
    try {
      await Promise.all([injectContentScriptIntoTab(tabId), repairContentScriptRegistration(url)]);
      return await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_ARTICLE' });
    } catch {
      return { isArticle: false };
    }
  }
}

// 현재 활성 탭에 EXTRACT_ARTICLE 메시지를 보내 제목/본문을 가져온다 (content.ts의 기존 리스너 재사용).
// 네이버·다음 외의 사이트는 사용자가 먼저 허용해야 콘텐츠 스크립트가 주입되므로,
// 권한이 없으면 메시지를 보내기 전에 허용 화면부터 보여준다.
async function loadArticle(settings: Settings) {
  renderLoading(settings);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url) return renderNotArticle(settings);

  if (!isNaverArticle(tab.url) && !isDaumArticle(tab.url)) {
    if (isExcludedFromGenericSupport(tab.url)) return renderNotArticle(settings);
    if (!(await hasSitePermission(tab.url))) {
      const { id, url } = tab;
      renderPermissionPrompt(url, settings, () => handleAllowSite(url, id, settings));
      return;
    }
  }

  const result = await extractFromTab(tab.id, tab.url);

  if (!result.isArticle) return renderNotArticle(settings);
  renderArticle(result, settings, tab.url);
}

// 팝업이 열릴 때마다(그리고 설정이 바뀔 때마다) 처음부터 다시 그린다.
// 동의 전이면 동의 화면만, 동의 후면 헤더의 초기화 버튼 + 기사 카드를 같이 보여준다.
async function init() {
  const settings = await getSettings();

  if (!settings.consented) {
    renderConsent();
    return;
  }

  await loadArticle(settings);
}

init();
