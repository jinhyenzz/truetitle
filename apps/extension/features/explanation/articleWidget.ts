import {
  clampPercent,
  meterAriaLabel,
  scoreSubLabel,
  signalClass,
  SIGNAL_COLORS_DARK,
  SIGNAL_COLORS_LIGHT,
} from '@/shared/resultView';
import type { AnalyzeErrorInfo, AnalyzeResult } from '@/shared/types';

// SIGNAL_COLORS_LIGHT/DARK(shared/resultView.ts)를 "--tt-sig-1: #.. ; --tt-sig-2: #.. ; ..."
// 형태의 CSS 변수 선언으로 바꾼다. 색상 값 자체는 그 파일 한 곳에서만 관리한다.
function signalColorVars(colors: readonly string[]): string {
  return colors.map((color, index) => `--tt-sig-${index + 1}: ${color};`).join('\n    ');
}

// 위젯의 4가지 상태. content.ts가 setState로 넘기면 버튼/패널이 통째로 갱신된다.
export type WidgetState =
  | { kind: 'idle' } // 대기 중 (패널 접힘)
  | { kind: 'loading' } // 분석 요청 중 (버튼 비활성화 + 스피너)
  | { kind: 'result'; result: AnalyzeResult } // 분석 성공
  | { kind: 'error'; error: AnalyzeErrorInfo }; // 분석 실패

export interface ArticleWidgetHandle {
  root: HTMLElement; // 페이지에 삽입할 최상위 엘리먼트 (Shadow DOM 호스트)
  setState(state: WidgetState): void;
}

// 기사당 위젯 중복 생성을 막기 위한 id.
const WIDGET_ROOT_ID = 'truetitle-inline-widget';

// Shadow DOM 전용 스타일. `:host { all: initial }`로 페이지 전역 스타일과 격리한다.
// 색상 토큰/레이아웃은 popup(entrypoints/popup/style.css)의 결과 카드 디자인과 통일한다.
const STYLE = `
  :host { all: initial; }
  .tt-wrap {
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Apple SD Gothic Neo',
      'Malgun Gothic', sans-serif;
    margin: 0 0 10px;
    --tt-border: #d5dbe3;
    --tt-surface: #f5f7fa;
    --tt-text: #16202c;
    --tt-text-muted: #55606d;
    --tt-primary: #1d4ed8;
    --tt-danger: #d92d20;
    --tt-track-bg: #dfe5ee;
    --tt-shadow: rgba(22, 32, 44, 0.12);
    --tt-radius: 16px;
    /* 5단계 낚시성 신호 색상 (1=매우 낮음 ~ 5=매우 높음), popup의 --meter-1..5와 동일
       (단일 출처: shared/resultView.ts의 SIGNAL_COLORS_LIGHT) */
    ${signalColorVars(SIGNAL_COLORS_LIGHT)}
  }
  @media (prefers-color-scheme: dark) {
    .tt-wrap {
      --tt-border: #2c343d;
      --tt-surface: #15191f;
      --tt-text: #eef2f7;
      --tt-text-muted: #8c97a4;
      --tt-primary: #5b8cff;
      --tt-danger: #ff6b5e;
      --tt-track-bg: #262e37;
      --tt-shadow: rgba(0, 0, 0, 0.4);
      ${signalColorVars(SIGNAL_COLORS_DARK)}
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
    border: 1px solid var(--tt-border);
    border-radius: var(--tt-radius);
    background: var(--tt-surface);
    color: var(--tt-text);
    font-size: 13px;
    overflow: hidden;
  }
  .tt-panel[hidden] { display: none; }
  .tt-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 16px;
    border-bottom: 1px solid var(--tt-border);
  }
  .tt-panel-title { font-weight: 700; font-size: 14px; margin: 0; }
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
  .tt-section { padding: 9px 16px; border-bottom: 1px solid var(--tt-border); }
  .tt-section:last-child { border-bottom: none; }
  .tt-state-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 28px 16px;
    text-align: center;
    color: var(--tt-text-muted);
  }
  .tt-loading-row { display: flex; align-items: center; gap: 8px; color: var(--tt-text-muted); }

  /* ---------- score ---------- */
  .tt-score-top { display: flex; align-items: flex-end; gap: 12px; margin-bottom: 14px; }
  .tt-score-value {
    font-size: 40px;
    font-weight: 700;
    line-height: 0.86;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
  }
  .tt-score-value.sig-1 { color: var(--tt-sig-1); }
  .tt-score-value.sig-2 { color: var(--tt-sig-2); }
  .tt-score-value.sig-3 { color: var(--tt-sig-3); }
  .tt-score-value.sig-4 { color: var(--tt-sig-4); }
  .tt-score-value.sig-5 { color: var(--tt-sig-5); }
  .tt-score-meta { display: flex; flex-direction: column; gap: 5px; padding-bottom: 2px; }
  .tt-score-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 999px;
    align-self: flex-start;
  }
  .tt-score-pill.sig-1 { background: color-mix(in srgb, var(--tt-sig-1) 18%, var(--tt-surface)); color: var(--tt-sig-1); }
  .tt-score-pill.sig-2 { background: color-mix(in srgb, var(--tt-sig-2) 18%, var(--tt-surface)); color: var(--tt-sig-2); }
  .tt-score-pill.sig-3 { background: color-mix(in srgb, var(--tt-sig-3) 18%, var(--tt-surface)); color: var(--tt-sig-3); }
  .tt-score-pill.sig-4 { background: color-mix(in srgb, var(--tt-sig-4) 18%, var(--tt-surface)); color: var(--tt-sig-4); }
  .tt-score-pill.sig-5 { background: color-mix(in srgb, var(--tt-sig-5) 18%, var(--tt-surface)); color: var(--tt-sig-5); }
  .tt-score-pill-dot { width: 6px; height: 6px; border-radius: 999px; background: currentColor; flex: 0 0 auto; }
  .tt-score-sub { font-size: 11px; color: var(--tt-text-muted); }

  /* ---------- meter ---------- */
  .tt-meter-track { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
  .tt-meter-seg { height: 8px; border-radius: 999px; }
  .tt-meter-pointer-row {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
    margin-top: 2px;
    height: 16px;
  }
  .tt-meter-pointer { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .tt-meter-caret {
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 5px solid;
  }
  .tt-meter-current-label { font-size: 10px; font-weight: 700; }
  .tt-meter-scale {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: var(--tt-text-muted);
    margin-top: 10px;
  }

  /* ---------- similarity ---------- */
  .tt-similarity-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 600;
    margin: 0 0 8px;
  }
  .tt-similarity-pct { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .tt-similarity-track { height: 8px; border-radius: 999px; overflow: hidden; background: var(--tt-track-bg); }
  .tt-similarity-fill { height: 100%; border-radius: 999px; background: var(--tt-primary); }

  /* ---------- evidence / explanation ---------- */
  .tt-evidence-title { font-size: 12px; font-weight: 600; margin: 0 0 8px; color: var(--tt-text); }
  .tt-evidence-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
  .tt-chip {
    font-size: 12px;
    font-weight: 500;
    padding: 5px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--tt-danger) 15%, var(--tt-surface));
    color: var(--tt-danger);
  }
  .tt-explanation { margin: 0; font-size: 11px; line-height: 1.6; color: var(--tt-text-muted); }
  .tt-mock-note { margin: 8px 0 0; font-size: 11px; color: var(--tt-text-muted); text-align: right; }
  .tt-error-text { color: var(--tt-danger); margin: 0; font-size: 13px; }
`;

// innerHTML = '' 대신 사용 — 외부 문자열을 실수로 HTML로 삽입하는 걸 원천 차단한다.
function clearChildren(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * 기사 제목 위에 삽입할 "분석하기" 버튼 + 결과 패널을 Shadow DOM으로 생성한다.
 * 페이지 스타일과 충돌하지 않도록 격리하고, 외부 문자열은 항상 textContent로만 반영한다.
 */
export function createArticleWidget(onAnalyze: () => void): ArticleWidgetHandle {
  // 호스트에 Shadow DOM을 붙여 내부 스타일/구조를 페이지와 완전히 분리한다.
  const host = document.createElement('div');
  host.id = WIDGET_ROOT_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLE;
  shadow.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'tt-wrap';
  shadow.appendChild(wrap);

  // "🎣 분석하기" 버튼. aria-expanded/aria-controls로 결과 패널과의 관계를 스크린리더에 알림.
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

  // 로딩 중(disabled) 클릭은 무시해 중복 요청을 막는다.
  button.addEventListener('click', () => {
    if (button.disabled) return;
    onAnalyze();
  });

  // 위젯 안에 포커스가 있을 때 Esc를 누르면 패널을 접고 버튼으로 포커스를 되돌린다.
  // wrap에 달아서 위젯 밖 요소에 포커스가 있을 때는 반응하지 않게 범위를 좁힌다.
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

  // 패널 상단 제목 + "닫기" 버튼. 닫기를 누르면 idle로 돌아가 패널이 접힌다.
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

    const section = document.createElement('div');
    section.className = 'tt-section';
    const row = document.createElement('div');
    row.className = 'tt-loading-row';
    const spinner = document.createElement('span');
    spinner.className = 'tt-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    row.append(spinner, '기사를 분석하고 있어요...');
    section.appendChild(row);
    panel.appendChild(section);
  }

  // 분석 결과 패널. 기사/API 응답 문자열은 전부 textContent로만 채운다.
  // 레이아웃/색상은 popup의 결과 카드(entrypoints/popup/main.ts renderAnalyzeResult)와 동일하게 맞춘다.
  function renderResultPanel(result: AnalyzeResult) {
    clearChildren(panel);
    panel.appendChild(buildPanelHeader('분석 결과'));

    // 등급은 클라이언트가 재계산하지 않고 서버가 내려준 5단계 값을 그대로 쓴다.
    const level = result.clickbaitSignalLevel;
    const sigClass = signalClass(level);

    const scoreSection = document.createElement('div');
    scoreSection.className = 'tt-section';

    const scoreTop = document.createElement('div');
    scoreTop.className = 'tt-score-top';

    const scoreValue = document.createElement('div');
    scoreValue.className = `tt-score-value ${sigClass}`;
    scoreValue.textContent = String(result.clickbaitScore);
    scoreTop.appendChild(scoreValue);

    const scoreMeta = document.createElement('div');
    scoreMeta.className = 'tt-score-meta';

    const pill = document.createElement('div');
    pill.className = `tt-score-pill ${sigClass}`;
    const pillDot = document.createElement('span');
    pillDot.className = 'tt-score-pill-dot';
    const pillLabel = document.createElement('span');
    pillLabel.textContent = result.clickbaitSignalLabel;
    pill.append(pillDot, pillLabel);
    scoreMeta.appendChild(pill);

    const scoreSub = document.createElement('div');
    scoreSub.className = 'tt-score-sub';
    scoreSub.textContent = scoreSubLabel(level);
    scoreMeta.appendChild(scoreSub);

    scoreTop.appendChild(scoreMeta);
    scoreSection.appendChild(scoreTop);

    // 5단계 게이지: 항상 5색을 모두 보여주되(안전→위험), 현재 단계만 진하게 강조하고
    // 그 아래 화살표+"현재" 라벨을 붙인다.
    const meterTrack = document.createElement('div');
    meterTrack.className = 'tt-meter-track';
    meterTrack.setAttribute('role', 'img');
    meterTrack.setAttribute('aria-label', meterAriaLabel(level, result.clickbaitSignalLabel));
    for (let i = 1; i <= 5; i += 1) {
      const seg = document.createElement('div');
      seg.className = 'tt-meter-seg';
      seg.style.background = `var(--tt-sig-${i})`;
      if (i === level) {
        seg.style.boxShadow = `0 0 0 3px color-mix(in srgb, var(--tt-sig-${i}) 25%, var(--tt-surface))`;
      } else {
        seg.style.opacity = '0.35';
      }
      meterTrack.appendChild(seg);
    }
    scoreSection.appendChild(meterTrack);

    // grid-template-columns: repeat(5, 1fr)인 pointer-row 위에서, 채울 칸 수만큼 빈
    // div를 만드는 대신 포인터 하나만 만들고 gridColumnStart로 위치를 지정한다.
    const pointerRow = document.createElement('div');
    pointerRow.className = 'tt-meter-pointer-row';
    const pointer = document.createElement('div');
    pointer.className = 'tt-meter-pointer';
    pointer.style.gridColumnStart = String(level);
    const caret = document.createElement('div');
    caret.className = 'tt-meter-caret';
    caret.style.borderBottomColor = `var(--tt-sig-${level})`;
    const currentLabel = document.createElement('div');
    currentLabel.className = 'tt-meter-current-label';
    currentLabel.style.color = `var(--tt-sig-${level})`;
    currentLabel.textContent = '현재';
    pointer.append(caret, currentLabel);
    pointerRow.appendChild(pointer);
    scoreSection.appendChild(pointerRow);

    const scale = document.createElement('div');
    scale.className = 'tt-meter-scale';
    for (const text of ['안전', '주의', '위험']) {
      const span = document.createElement('span');
      span.textContent = text;
      scale.appendChild(span);
    }
    scoreSection.appendChild(scale);
    panel.appendChild(scoreSection);

    const similaritySection = document.createElement('div');
    similaritySection.className = 'tt-section';

    const simLabel = document.createElement('div');
    simLabel.className = 'tt-similarity-label';
    const simLeft = document.createElement('span');
    simLeft.textContent = '제목·본문 유사도';
    const simRight = document.createElement('span');
    simRight.className = 'tt-similarity-pct';
    simRight.textContent = `${result.titleBodySimilarity}%`;
    simLabel.append(simLeft, simRight);
    similaritySection.appendChild(simLabel);

    const track = document.createElement('div');
    track.className = 'tt-similarity-track';
    const fill = document.createElement('div');
    fill.className = 'tt-similarity-fill';
    fill.style.width = `${clampPercent(result.titleBodySimilarity)}%`;
    track.appendChild(fill);
    similaritySection.appendChild(track);
    panel.appendChild(similaritySection);

    const bottomSection = document.createElement('div');
    bottomSection.className = 'tt-section';

    if (result.evidence.length > 0) {
      const evidenceTitle = document.createElement('p');
      evidenceTitle.className = 'tt-evidence-title';
      evidenceTitle.textContent = '본문에서 찾지 못한 제목 표현';
      bottomSection.appendChild(evidenceTitle);

      const chips = document.createElement('div');
      chips.className = 'tt-evidence-chips';
      for (const item of result.evidence) {
        const chip = document.createElement('span');
        chip.className = 'tt-chip';
        chip.textContent = item;
        chips.appendChild(chip);
      }
      bottomSection.appendChild(chips);
    }

    const explanation = document.createElement('p');
    explanation.className = 'tt-explanation';
    explanation.textContent = result.explanation;
    bottomSection.appendChild(explanation);

    if (result.isMock) {
      const mockNote = document.createElement('p');
      mockNote.className = 'tt-mock-note';
      mockNote.textContent = '* 예시 데이터로 표시된 결과입니다';
      bottomSection.appendChild(mockNote);
    }

    panel.appendChild(bottomSection);
  }

  function renderErrorPanel(error: AnalyzeErrorInfo) {
    clearChildren(panel);
    panel.appendChild(buildPanelHeader('분석 실패'));

    const section = document.createElement('div');
    section.className = 'tt-section tt-state-center';
    const icon = document.createElement('span');
    icon.textContent = '⚠️';
    const text = document.createElement('p');
    text.className = 'tt-error-text';
    text.textContent = error.message;
    section.append(icon, text);
    panel.appendChild(section);
  }

  // 위젯의 유일한 갱신 통로. content.ts는 이 함수만 호출해 버튼/패널을 함께 바꾼다.
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
