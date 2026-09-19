import type { AnalyzeErrorInfo, AnalyzeResult } from '@/shared/types';

// 위젯이 가질 수 있는 4가지 상태. content.ts가 이 중 하나를 골라 setState로 넘겨주면
// 버튼 라벨/활성화 여부와 패널 내용이 통째로 갱신된다.
export type WidgetState =
  | { kind: 'idle' } // 대기 중 (패널 접힘)
  | { kind: 'loading' } // 분석 요청 중 (버튼 비활성화 + 스피너)
  | { kind: 'result'; result: AnalyzeResult } // 분석 성공
  | { kind: 'error'; error: AnalyzeErrorInfo }; // 분석 실패

export interface ArticleWidgetHandle {
  root: HTMLElement; // 페이지에 삽입할 최상위 엘리먼트 (Shadow DOM 호스트)
  setState(state: WidgetState): void;
}

// 기사당 위젯이 중복 생성되지 않도록 확인할 때 쓰는 id.
const WIDGET_ROOT_ID = 'truetitle-inline-widget';

// Shadow DOM 안에서만 적용되는 스타일. `:host { all: initial }`로 네이버 페이지의
// 전역 스타일을 초기화해서 페이지 스타일과 서로 영향을 주고받지 않게 한다.
const STYLE = `
  :host { all: initial; }
  .tt-wrap {
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Apple SD Gothic Neo',
      'Malgun Gothic', sans-serif;
    margin: 0 0 10px;
    --tt-border: #e5e5e8;
    --tt-surface: #ffffff;
    --tt-text: #18181b;
    --tt-text-muted: #71717a;
    --tt-primary: #2563eb;
    --tt-primary-hover: #1d4ed8;
    --tt-danger: #ef4444;
    --tt-danger-bg: #fef2f2;
    --tt-chip-bg: #f4f4f5;
    --tt-chip-text: #3f3f46;
    --tt-safe: #16a34a;
    --tt-safe-bg: #f0fdf4;
    --tt-warn: #f59e0b;
    --tt-warn-bg: #fffbeb;
    /* 5단계 낚시성 신호 색상 (1=매우 낮음 ~ 5=매우 높음) */
    --tt-sig-1: #16a34a;
    --tt-sig-2: #84cc16;
    --tt-sig-3: #f59e0b;
    --tt-sig-4: #f97316;
    --tt-sig-5: #ef4444;
  }
  @media (prefers-color-scheme: dark) {
    .tt-wrap {
      --tt-border: #33333a;
      --tt-surface: #232326;
      --tt-text: #f4f4f5;
      --tt-text-muted: #a1a1aa;
      --tt-primary: #3b82f6;
      --tt-primary-hover: #60a5fa;
      --tt-danger: #f87171;
      --tt-danger-bg: #2a1515;
      --tt-chip-bg: #2c2c30;
      --tt-chip-text: #d4d4d8;
      --tt-safe: #4ade80;
      --tt-safe-bg: #12241a;
      --tt-warn: #fbbf24;
      --tt-warn-bg: #2a2110;
      --tt-sig-1: #4ade80;
      --tt-sig-2: #a3e635;
      --tt-sig-3: #fbbf24;
      --tt-sig-4: #fb923c;
      --tt-sig-5: #f87171;
    }
  }
  * { box-sizing: border-box; }
  .tt-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--tt-border);
    border-radius: 999px;
    background: var(--tt-surface);
    color: var(--tt-text);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
    cursor: pointer;
  }
  .tt-btn:hover:not(:disabled) { border-color: var(--tt-primary); color: var(--tt-primary); }
  .tt-btn:focus-visible { outline: 2px solid var(--tt-primary); outline-offset: 2px; }
  .tt-btn:disabled { cursor: default; opacity: 0.7; }
  .tt-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--tt-border);
    border-top-color: var(--tt-primary);
    border-radius: 50%;
    animation: tt-spin 0.7s linear infinite;
  }
  @keyframes tt-spin { to { transform: rotate(360deg); } }
  .tt-panel {
    margin-top: 8px;
    padding: 12px;
    border: 1px solid var(--tt-border);
    border-radius: 10px;
    background: var(--tt-surface);
    color: var(--tt-text);
    font-size: 13px;
  }
  .tt-panel[hidden] { display: none; }
  .tt-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .tt-panel-title { font-weight: 600; font-size: 13px; margin: 0; }
  .tt-close-btn {
    border: none;
    background: transparent;
    color: var(--tt-text-muted);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 4px;
  }
  .tt-close-btn:hover { color: var(--tt-text); }
  .tt-close-btn:focus-visible { outline: 2px solid var(--tt-primary); outline-offset: 2px; }
  .tt-loading-row { display: flex; align-items: center; gap: 8px; color: var(--tt-text-muted); }
  .tt-score-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .tt-score-badge {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
  }
  .tt-score-badge.sig-1 { background: color-mix(in srgb, var(--tt-sig-1) 15%, transparent); color: var(--tt-sig-1); }
  .tt-score-badge.sig-2 { background: color-mix(in srgb, var(--tt-sig-2) 15%, transparent); color: var(--tt-sig-2); }
  .tt-score-badge.sig-3 { background: color-mix(in srgb, var(--tt-sig-3) 15%, transparent); color: var(--tt-sig-3); }
  .tt-score-badge.sig-4 { background: color-mix(in srgb, var(--tt-sig-4) 15%, transparent); color: var(--tt-sig-4); }
  .tt-score-badge.sig-5 { background: color-mix(in srgb, var(--tt-sig-5) 15%, transparent); color: var(--tt-sig-5); }
  .tt-score-label { font-weight: 600; font-size: 13px; }
  .tt-score-label.sig-1 { color: var(--tt-sig-1); }
  .tt-score-label.sig-2 { color: var(--tt-sig-2); }
  .tt-score-label.sig-3 { color: var(--tt-sig-3); }
  .tt-score-label.sig-4 { color: var(--tt-sig-4); }
  .tt-score-label.sig-5 { color: var(--tt-sig-5); }
  .tt-score-sub { font-size: 12px; color: var(--tt-text-muted); }
  .tt-level-meter { display: flex; gap: 4px; margin: 2px 0 10px; }
  .tt-level-dot { flex: 1; height: 6px; border-radius: 999px; background: var(--tt-chip-bg); }
  .tt-level-dot.filled.sig-1 { background: var(--tt-sig-1); }
  .tt-level-dot.filled.sig-2 { background: var(--tt-sig-2); }
  .tt-level-dot.filled.sig-3 { background: var(--tt-sig-3); }
  .tt-level-dot.filled.sig-4 { background: var(--tt-sig-4); }
  .tt-level-dot.filled.sig-5 { background: var(--tt-sig-5); }
  .tt-similarity-label {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--tt-text-muted);
    margin-bottom: 4px;
  }
  .tt-similarity-track { height: 6px; border-radius: 999px; background: var(--tt-chip-bg); overflow: hidden; }
  .tt-similarity-fill { height: 100%; border-radius: 999px; background: var(--tt-primary); }
  .tt-evidence { margin: 10px 0 0; }
  .tt-evidence-title { font-size: 12px; color: var(--tt-text-muted); margin: 0 0 6px; }
  .tt-evidence-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .tt-chip { background: var(--tt-chip-bg); color: var(--tt-chip-text); font-size: 12px; padding: 3px 8px; border-radius: 999px; }
  .tt-explanation {
    margin: 10px 0 0;
    font-size: 12px;
    color: var(--tt-text);
    background: var(--tt-chip-bg);
    border-radius: 8px;
    padding: 8px 10px;
  }
  .tt-error-text { color: var(--tt-danger); margin: 0; font-size: 13px; }
`;

// innerHTML = '' 대신 사용. 매번 새로 element를 만들어 붙이는 방식이라
// 굳이 innerHTML을 쓸 이유가 없고, 실수로 외부 문자열을 HTML로 삽입하는 걸 원천 차단한다.
function clearChildren(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * 기사 제목 위/앞에 삽입할 "분석하기" 버튼 + 결과 패널을 Shadow DOM으로 생성한다.
 * 네이버 페이지 스타일과 충돌하지 않도록 스타일을 격리하고, 기사 텍스트/API 응답 문자열은
 * 항상 textContent로만 반영한다.
 */
export function createArticleWidget(onAnalyze: () => void): ArticleWidgetHandle {
  // 호스트 엘리먼트에 Shadow DOM을 붙여서 내부 스타일/구조가 네이버 페이지와 완전히 분리되게 한다.
  const host = document.createElement('div');
  host.id = WIDGET_ROOT_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLE;
  shadow.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'tt-wrap';
  shadow.appendChild(wrap);

  // "🎣 분석하기" 버튼. aria-expanded/aria-controls로 아래 결과 패널과의 관계를 스크린리더에 알림.
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tt-btn';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'tt-panel');
  wrap.appendChild(button);

  // 결과/로딩/에러를 보여줄 패널. 기본은 접힌 상태(hidden).
  const panel = document.createElement('div');
  panel.className = 'tt-panel';
  panel.id = 'tt-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-live', 'polite'); // 상태가 바뀌면 스크린리더가 읽어줌
  wrap.appendChild(panel);

  // disabled 상태(로딩 중)에서는 클릭이 씹히도록 해서 중복 요청을 막는다.
  // <button disabled>는 키보드 포커스/Enter도 함께 막아주므로 별도 처리가 필요 없다.
  button.addEventListener('click', () => {
    if (button.disabled) return;
    onAnalyze();
  });

  // 위젯 안(버튼 또는 패널)에 포커스가 있을 때 Esc를 누르면 패널을 접고 버튼으로 포커스를 되돌린다.
  // keydown은 composed 이벤트라 Shadow DOM 경계를 넘어 bubbling되지만, wrap에 달아서
  // 위젯 밖(페이지의 다른 요소)에 포커스가 있을 때는 반응하지 않도록 범위를 좁힌다.
  wrap.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.hidden) return;
    event.stopPropagation();
    setState({ kind: 'idle' });
    button.focus();
  });

  function setButtonIdle(label: string) {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    clearChildren(button);
    button.append(`🎣 ${label}`);
  }

  function setButtonLoading() {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    clearChildren(button);
    const spinner = document.createElement('span');
    spinner.className = 'tt-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    button.append(spinner, '분석 중...');
  }

  // 패널 상단의 제목 + "닫기" 버튼. 닫기를 누르면 idle 상태로 돌아가 패널이 접힌다.
  function buildPanelHeader(title: string): HTMLDivElement {
    const head = document.createElement('div');
    head.className = 'tt-panel-head';

    const heading = document.createElement('p');
    heading.className = 'tt-panel-title';
    heading.textContent = title;
    head.appendChild(heading);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'tt-close-btn';
    closeBtn.setAttribute('aria-label', '분석 결과 닫기');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => setState({ kind: 'idle' }));
    head.appendChild(closeBtn);

    return head;
  }

  function renderLoadingPanel() {
    clearChildren(panel);
    panel.appendChild(buildPanelHeader('분석 중'));
    const row = document.createElement('div');
    row.className = 'tt-loading-row';
    const spinner = document.createElement('span');
    spinner.className = 'tt-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    row.append(spinner, '기사를 분석하고 있어요...');
    panel.appendChild(row);
  }

  // 분석 결과 패널을 구성한다. 기사 텍스트/API 응답 문자열은 전부 textContent로만
  // 채워서 <,>,& 같은 문자가 HTML로 해석되지 않고 그대로 화면에 보이게 한다.
  function renderResultPanel(result: AnalyzeResult) {
    clearChildren(panel);
    panel.appendChild(buildPanelHeader('분석 결과'));

    // 등급/문구는 클라이언트가 다시 계산하지 않고 서버가 내려준 5단계 값을 그대로 쓴다.
    const sigClass = `sig-${result.clickbaitSignalLevel}`;

    const scoreRow = document.createElement('div');
    scoreRow.className = 'tt-score-row';

    const badge = document.createElement('div');
    badge.className = `tt-score-badge ${sigClass}`;
    badge.textContent = String(result.clickbaitScore);
    scoreRow.appendChild(badge);

    const info = document.createElement('div');
    const label = document.createElement('div');
    label.className = `tt-score-label ${sigClass}`;
    label.textContent = result.clickbaitSignalLabel;
    const sub = document.createElement('div');
    sub.className = 'tt-score-sub';
    sub.textContent = `낚시성 점수 ${result.clickbaitScore}점`;
    info.append(label, sub);
    scoreRow.appendChild(info);
    panel.appendChild(scoreRow);

    // 1~5단계를 막대 5개로 시각화 (현재 단계까지만 색을 채움).
    const meter = document.createElement('div');
    meter.className = 'tt-level-meter';
    meter.setAttribute('role', 'img');
    meter.setAttribute('aria-label', `낚시성 신호 5단계 중 ${result.clickbaitSignalLevel}단계: ${result.clickbaitSignalLabel}`);
    for (let i = 1; i <= 5; i += 1) {
      const dot = document.createElement('span');
      dot.className = i <= result.clickbaitSignalLevel ? `tt-level-dot filled ${sigClass}` : 'tt-level-dot';
      meter.appendChild(dot);
    }
    panel.appendChild(meter);

    const simLabel = document.createElement('div');
    simLabel.className = 'tt-similarity-label';
    const simLeft = document.createElement('span');
    simLeft.textContent = '제목·본문 유사도';
    const simRight = document.createElement('span');
    simRight.textContent = `${result.titleBodySimilarity}%`;
    simLabel.append(simLeft, simRight);
    panel.appendChild(simLabel);

    const track = document.createElement('div');
    track.className = 'tt-similarity-track';
    const fill = document.createElement('div');
    fill.className = 'tt-similarity-fill';
    fill.style.width = `${Math.max(0, Math.min(100, result.titleBodySimilarity))}%`;
    track.appendChild(fill);
    panel.appendChild(track);

    if (result.evidence.length > 0) {
      const evidenceBlock = document.createElement('div');
      evidenceBlock.className = 'tt-evidence';
      const evidenceTitle = document.createElement('p');
      evidenceTitle.className = 'tt-evidence-title';
      evidenceTitle.textContent = '본문에서 찾지 못한 제목 표현 (참고용, 확정적 근거 아님)';
      evidenceBlock.appendChild(evidenceTitle);

      const chips = document.createElement('div');
      chips.className = 'tt-evidence-chips';
      for (const item of result.evidence) {
        const chip = document.createElement('span');
        chip.className = 'tt-chip';
        chip.textContent = item;
        chips.appendChild(chip);
      }
      evidenceBlock.appendChild(chips);
      panel.appendChild(evidenceBlock);
    }

    const explanation = document.createElement('p');
    explanation.className = 'tt-explanation';
    explanation.textContent = result.explanation;
    panel.appendChild(explanation);
  }

  function renderErrorPanel(error: AnalyzeErrorInfo) {
    clearChildren(panel);
    panel.appendChild(buildPanelHeader('분석 실패'));
    const text = document.createElement('p');
    text.className = 'tt-error-text';
    text.textContent = error.message;
    panel.appendChild(text);
  }

  // 위젯의 유일한 갱신 통로. content.ts는 이 함수만 호출해서 버튼/패널을 한 번에 바꾼다.
  function setState(state: WidgetState) {
    switch (state.kind) {
      case 'idle':
        setButtonIdle('분석하기');
        panel.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        break;
      case 'loading':
        setButtonLoading();
        renderLoadingPanel();
        panel.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        break;
      case 'result':
        setButtonIdle('다시 분석하기');
        renderResultPanel(state.result);
        panel.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        break;
      case 'error':
        setButtonIdle('다시 분석하기');
        renderErrorPanel(state.error);
        panel.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        break;
    }
  }

  setState({ kind: 'idle' });

  return { root: host, setState };
}

export { WIDGET_ROOT_ID };
