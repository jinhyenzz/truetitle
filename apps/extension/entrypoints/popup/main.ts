import './style.css';
import { analyzeArticle } from '@/features/explanation/analyzeApi';
import type { ExtractResult, AnalyzeResult } from '@/shared/types';

const app = document.querySelector<HTMLDivElement>('#app')!;

const BODY_PREVIEW_LENGTH = 200;

function scoreLevel(score: number): 'safe' | 'warn' | 'danger' {
  if (score >= 70) return 'danger';
  if (score >= 40) return 'warn';
  return 'safe';
}

function scoreLabel(level: 'safe' | 'warn' | 'danger'): string {
  switch (level) {
    case 'safe':
      return '낚시성 낮음';
    case 'warn':
      return '낚시성 의심';
    case 'danger':
      return '낚시성 높음';
  }
}

function header(): string {
  return `
    <div class="app-header">
      <span class="icon">🎣</span>
      <h1>낚시성 제목 탐지기</h1>
    </div>
  `;
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

function renderArticle(result: ExtractResult) {
  const preview = result.body!.slice(0, BODY_PREVIEW_LENGTH);
  app.innerHTML = `
    ${header()}
    <div class="card">
      <h2 class="article-title">${result.title}</h2>
      <p class="article-preview">${preview}${result.body!.length > BODY_PREVIEW_LENGTH ? '...' : ''}</p>
      <p class="article-meta">전체 글자 수: ${result.body!.length}자</p>
      <button id="analyze-btn" class="btn btn-primary">분석하기</button>
      <div id="analyze-result"></div>
    </div>
  `;

  document.querySelector('#analyze-btn')!.addEventListener('click', () => {
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

function renderAnalyzeResult(result: AnalyzeResult) {
  const resultBox = document.querySelector('#analyze-result')!;
  const level = scoreLevel(result.clickbaitScore);

  const evidenceHtml = result.evidence.length
    ? `
      <div class="evidence-block">
        <p class="evidence-title">본문에 없는 제목 표현</p>
        <div class="evidence-chips">
          ${result.evidence.map((e) => `<span class="chip">${e}</span>`).join('')}
        </div>
      </div>
    `
    : '';

  resultBox.innerHTML = `
    <div class="result-card">
      <div class="score-row">
        <div class="score-badge level-${level}">${result.clickbaitScore}</div>
        <div class="score-info">
          <div class="score-label level-${level}">${scoreLabel(level)}</div>
          <div class="score-sub">낚시성 점수 ${result.clickbaitScore}점</div>
        </div>
      </div>
      <div class="similarity-row">
        <div class="similarity-label">
          <span>제목·본문 유사도</span>
          <span>${result.titleBodySimilarity}%</span>
        </div>
        <div class="similarity-track">
          <div class="similarity-fill" style="width: ${result.titleBodySimilarity}%"></div>
        </div>
      </div>
      ${evidenceHtml}
      <p class="explanation">${result.explanation}</p>
      ${result.isMock ? '<p class="mock-note">* 예시 데이터로 표시된 결과입니다</p>' : ''}
    </div>
  `;
}

function renderAnalyzeError() {
  const resultBox = document.querySelector('#analyze-result')!;
  resultBox.innerHTML = `
    <div class="state-center">
      <span class="state-icon">⚠️</span>
      <p class="error-text">서버 연결에 실패했어요.</p>
      <button id="retry-btn" class="btn btn-secondary">다시 시도</button>
    </div>
  `;
}

async function handleAnalyze(article: ExtractResult) {
  renderAnalyzing();
  try {
    const result = await analyzeArticle({
      url: (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url ?? '',
      title: article.title!,
      body: article.body!,
    });
    renderAnalyzeResult(result);
  } catch (e) {
    renderAnalyzeError();
    document.querySelector('#retry-btn')?.addEventListener('click', () => handleAnalyze(article));
  }
}

async function init() {
  renderLoading();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return renderNotArticle();

  const result: ExtractResult = await chrome.tabs.sendMessage(tab.id, {
    type: 'EXTRACT_ARTICLE',
  }).catch(() => ({ isArticle: false }));

  if (!result.isArticle) return renderNotArticle();
  renderArticle(result);
}

init();
