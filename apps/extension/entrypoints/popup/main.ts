import './style.css';
import { getAnalysisBlockedReason, getSettings, resetSettings, setSettings } from '@/settings/settings';
import type {
  AnalyzeErrorInfo,
  AnalyzeResult,
  BackgroundResponseMessage,
  ExtractResult,
  Settings,
} from '@/shared/types';

const app = document.querySelector<HTMLDivElement>('#app')!;

const BODY_PREVIEW_LENGTH = 200;

function header(): string {
  return `
    <div class="app-header">
      <span class="icon">🎣</span>
      <h1>낚시성 제목 탐지기</h1>
    </div>
  `;
}

// consented가 false일 때만 보여주는 최초 1회 동의 화면.
// 동의를 누르면 consented+enabled를 함께 true로 저장하고 init()을 다시 실행해 본화면으로 전환한다.
function renderConsent() {
  app.innerHTML = `
    ${header()}
    <div class="card">
      <p class="consent-text">
        이 확장 프로그램은 지원하는 뉴스 기사 페이지에서 "분석하기"를 눌렀을 때만
        기사 제목과 본문을 분석 서버로 전송합니다. URL, 쿠키, 검색어, 방문 기록은 전송하지 않습니다.
      </p>
      <button id="consent-btn" class="btn btn-primary">동의하고 사용하기</button>
    </div>
  `;
  document.querySelector('#consent-btn')!.addEventListener('click', async () => {
    await setSettings({ consented: true, enabled: true });
    init();
  });
}

// 동의 완료 후 화면 상단에 항상 보이는 ON/OFF 토글 + 초기화 버튼.
// 여기 값을 바꾸면 곧바로 init()을 다시 불러서 화면 전체(분석 버튼 활성/비활성 등)를 최신 설정에 맞춘다.
function renderSettingsBar(settings: Settings): HTMLDivElement {
  const bar = document.createElement('div');
  bar.className = 'settings-bar';
  bar.innerHTML = `
    <label class="toggle-row">
      <input type="checkbox" id="enabled-toggle" ${settings.enabled ? 'checked' : ''} />
      <span>분석 기능 사용 (${settings.enabled ? 'ON' : 'OFF'})</span>
    </label>
    <button id="reset-settings-btn" class="link-btn">초기화</button>
  `;

  bar.querySelector('#enabled-toggle')!.addEventListener('change', async (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    await setSettings({ enabled: checked });
    init();
  });

  bar.querySelector('#reset-settings-btn')!.addEventListener('click', async () => {
    const confirmed = window.confirm('동의 상태와 ON/OFF 설정을 초기화할까요?');
    if (!confirmed) return;
    await resetSettings();
    init();
  });

  return bar;
}

function renderLoading() {
  app.innerHTML = `
    ${header()}
    <div class="card state-center">
      <div class="spinner"></div>
      <p>기사 정보를 불러오는 중...</p>
    </div>
  `;
}

function renderNotArticle() {
  app.innerHTML = `
    ${header()}
    <div class="card state-center">
      <span class="state-icon">📄</span>
      <p>기사 페이지가 아니거나 본문을 읽을 수 없어요.</p>
    </div>
  `;
}

// 현재 탭이 지원하는 기사일 때 보여주는 카드. settings.enabled가 꺼져 있으면
// 분석 버튼을 비활성화하고 안내 문구만 보여준다 (버튼 자체를 숨기지는 않음).
function renderArticle(result: ExtractResult, settings: Settings) {
  const preview =
    result.body!.slice(0, BODY_PREVIEW_LENGTH) + (result.body!.length > BODY_PREVIEW_LENGTH ? '...' : '');

  app.innerHTML = `
    ${header()}
    <div class="card">
      <h2 class="article-title"></h2>
      <p class="article-preview"></p>
      <p class="article-meta">전체 글자 수: ${result.body!.length}자</p>
      <button id="analyze-btn" class="btn btn-primary" ${settings.enabled ? '' : 'disabled'}>분석하기</button>
      ${settings.enabled ? '' : '<p class="disabled-note">분석 기능이 꺼져 있어요. 위 설정에서 켜주세요.</p>'}
      <div id="analyze-result"></div>
    </div>
  `;

  // 기사 제목/본문은 외부 페이지에서 가져온 문자열이므로 innerHTML이 아닌 textContent로만 채운다.
  (app.querySelector('.article-title') as HTMLElement).textContent = result.title!;
  (app.querySelector('.article-preview') as HTMLElement).textContent = preview;

  document.querySelector('#analyze-btn')?.addEventListener('click', () => {
    handleAnalyze(result);
  });
}

function renderAnalyzing() {
  const resultBox = document.querySelector('#analyze-result')!;
  resultBox.innerHTML = `
    <div class="state-center">
      <div class="spinner"></div>
      <p>분석 중...</p>
    </div>
  `;
}

// 분석 성공 결과를 카드로 렌더링. evidence/explanation은 API가 내려준 자유 텍스트라
// 아래에서 별도로 textContent를 채워 넣어(innerHTML에 직접 넣지 않음) 이스케이프한다.
function renderAnalyzeResult(result: AnalyzeResult) {
  const resultBox = document.querySelector('#analyze-result')!;
  // 등급/문구는 클라이언트가 다시 계산하지 않고 서버가 내려준 5단계 값을 그대로 쓴다.
  const sigClass = `sig-${result.clickbaitSignalLevel}`;
  const levelDots = Array.from({ length: 5 }, (_, i) => i + 1)
    .map((i) => `<span class="level-dot${i <= result.clickbaitSignalLevel ? ` filled ${sigClass}` : ''}"></span>`)
    .join('');

  resultBox.innerHTML = `
    <div class="result-card">
      <div class="score-row">
        <div class="score-badge ${sigClass}">${result.clickbaitScore}</div>
        <div class="score-info">
          <div class="score-label ${sigClass}"></div>
          <div class="score-sub">낚시성 점수 ${result.clickbaitScore}점</div>
        </div>
      </div>
      <div class="level-meter" role="img" aria-label="낚시성 신호 5단계 중 ${result.clickbaitSignalLevel}단계">${levelDots}</div>
      <div class="similarity-row">
        <div class="similarity-label">
          <span>제목·본문 유사도</span>
          <span>${result.titleBodySimilarity}%</span>
        </div>
        <div class="similarity-track">
          <div class="similarity-fill" style="width: ${result.titleBodySimilarity}%"></div>
        </div>
      </div>
      <div class="evidence-block"></div>
      <p class="explanation"></p>
      ${result.isMock ? '<p class="mock-note">* 예시 데이터로 표시된 결과입니다</p>' : ''}
    </div>
  `;

  // clickbaitSignalLabel은 서버(API)가 내려준 문자열이므로 innerHTML이 아닌 textContent로만 채운다.
  (resultBox.querySelector('.score-label') as HTMLElement).textContent = result.clickbaitSignalLabel;

  if (result.evidence.length > 0) {
    const evidenceBlock = resultBox.querySelector('.evidence-block') as HTMLDivElement;
    evidenceBlock.innerHTML = `
      <p class="evidence-title">본문에서 찾지 못한 제목 표현 (참고용, 확정적 근거 아님)</p>
      <div class="evidence-chips"></div>
    `;
    const chips = evidenceBlock.querySelector('.evidence-chips')!;
    for (const item of result.evidence) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = item;
      chips.appendChild(chip);
    }
  }

  const explanation = resultBox.querySelector('.explanation') as HTMLElement;
  explanation.textContent = result.explanation;
}

// 분석 실패 시 에러 문구 + 재시도 버튼. error.message는 background/analyzeApi가
// 만든 안내 문구이지만 그대로 신뢰하지 않고 textContent로만 반영한다.
function renderAnalyzeError(error: AnalyzeErrorInfo, article: ExtractResult) {
  const resultBox = document.querySelector('#analyze-result')!;
  resultBox.innerHTML = `
    <div class="state-center">
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

// 현재 활성 탭에 EXTRACT_ARTICLE 메시지를 보내 제목/본문을 가져온다 (content.ts의 기존 리스너 재사용).
async function loadArticle(settings: Settings) {
  renderLoading();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return renderNotArticle();

  const result: ExtractResult = await chrome.tabs
    .sendMessage(tab.id, { type: 'EXTRACT_ARTICLE' })
    .catch(() => ({ isArticle: false }));

  if (!result.isArticle) return renderNotArticle();
  renderArticle(result, settings);
}

// 팝업이 열릴 때마다(그리고 설정이 바뀔 때마다) 처음부터 다시 그린다.
// 동의 전이면 동의 화면만, 동의 후면 설정바 + 기사 카드를 같이 보여준다.
async function init() {
  const settings = await getSettings();

  if (!settings.consented) {
    renderConsent();
    return;
  }

  await loadArticle(settings); // 먼저 기사 카드를 그리고
  app.insertBefore(renderSettingsBar(settings), app.firstChild); // 그 위에 설정바를 얹는다
}

init();
