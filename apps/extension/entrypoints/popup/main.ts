import './style.css';
import { analyzeArticle } from '@/features/explanation/analyzeApi';
import type { ExtractResult, AnalyzeResult } from '@/shared/types';

const app = document.querySelector<HTMLDivElement>('#app')!;

const BODY_PREVIEW_LENGTH = 200;

function renderLoading() {
  app.innerHTML = `<p>기사 정보를 불러오는 중...</p>`;
}

function renderNotArticle() {
  app.innerHTML = `<p>기사 페이지가 아니거나 본문을 읽을 수 없어요.</p>`;
}

function renderArticle(result: ExtractResult) {
  const preview = result.body!.slice(0, BODY_PREVIEW_LENGTH);
  app.innerHTML = `
    <div>
      <h2>${result.title}</h2>
      <p>${preview}${result.body!.length > BODY_PREVIEW_LENGTH ? '...' : ''}</p>
      <p>전체 글자 수: ${result.body!.length}자</p>
      <button id="analyze-btn">분석하기</button>
      <div id="analyze-result"></div>
    </div>
  `;

  document.querySelector('#analyze-btn')!.addEventListener('click', () => {
    handleAnalyze(result);
  });
}

function renderAnalyzing() {
  const resultBox = document.querySelector('#analyze-result')!;
  resultBox.innerHTML = `<p>분석 중...</p>`;
}

function renderAnalyzeResult(result: AnalyzeResult) {
  const resultBox = document.querySelector('#analyze-result')!;
  resultBox.innerHTML = `
    <p><strong>낚시성 점수:</strong> ${result.clickbaitScore}점</p>
    <p>${result.explanation}</p>
  `;
}

function renderAnalyzeError() {
  const resultBox = document.querySelector('#analyze-result')!;
  resultBox.innerHTML = `
    <p>서버 연결에 실패했어요.</p>
    <button id="retry-btn">다시 시도</button>
  `;
}

async function handleAnalyze(article: ExtractResult) {
  renderAnalyzing();
  try {
    const result = await analyzeArticle({
      url: (await chrome.tabs.query({ active: true, currentWindow: true }))[0].url ?? '',
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
  if (!tab.id) return renderNotArticle();

  const result: ExtractResult = await chrome.tabs.sendMessage(tab.id, {
    type: 'EXTRACT_ARTICLE',
  }).catch(() => ({ isArticle: false }));

  if (!result.isArticle) return renderNotArticle();
  renderArticle(result);
}

init();