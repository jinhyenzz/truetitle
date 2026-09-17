import { extractCurrentArticle } from '@/features/detection/extractArticle';
import { createArticleWidget, WIDGET_ROOT_ID } from '@/features/explanation/articleWidget';
import { findNaverTitleContainer, isNaverArticle } from '@/sites/naver';
import type { AnalyzeErrorInfo, BackgroundResponseMessage, ExtractResult } from '@/shared/types';

// 이 시간(ms) 동안만 제목이 늦게 렌더링되는지 지켜보고, 지나면 관찰을 포기한다.
// (페이지 전체를 무한정 감시하지 않기 위함)
const TITLE_WAIT_TIMEOUT_MS = 10000;

// container(제목 블록) 바로 위에 위젯(버튼+결과패널)을 한 번만 만들어 붙인다.
function insertWidget(container: HTMLElement) {
  if (document.getElementById(WIDGET_ROOT_ID)) return; // 기사당 한 세트만 생성

  // 클릭할 때마다 값을 올려서, "지금 화면에 보여줘야 할 응답이 어떤 요청의 것인지" 구분하는 용도.
  let requestToken = 0;

  const widget = createArticleWidget(() => {
    void handleAnalyzeClick();
  });

  // 제목 요소 바로 앞(위쪽 줄)에 위젯을 삽입 -> "[🎣 분석하기] 기사 제목" 레이아웃.
  container.insertAdjacentElement('beforebegin', widget.root);

  async function handleAnalyzeClick() {
    // 이 클릭 시점의 토큰을 기억해두고, 응답이 왔을 때 여전히 최신 요청인지 비교한다.
    // (사용자가 재시도를 연타하거나 짧은 시간에 다른 기사로 이동한 경우, 늦게 도착한
    //  이전 요청의 응답으로 화면이 잘못 덮어써지는 것을 막기 위함)
    const token = ++requestToken;

    // 클릭 시점에 항상 새로 추출한다 (버튼 노출 시점의 캐시된 값을 쓰지 않음).
    const article: ExtractResult = extractCurrentArticle(location.href, document);
    if (!article.isArticle || !article.title || !article.body) {
      widget.setState({
        kind: 'error',
        error: { code: 'INVALID_INPUT', message: '기사 제목/본문을 읽을 수 없습니다.' },
      });
      return;
    }

    widget.setState({ kind: 'loading' }); // 버튼 비활성화 + 스피너 표시

    let response: BackgroundResponseMessage;
    try {
      // 실제 서버 호출은 하지 않고, background service worker에 위임만 한다.
      // background가 동의/ON-OFF 검증 + 고정된 /analyze 호출을 담당한다.
      response = await chrome.runtime.sendMessage({
        type: 'ANALYZE_ARTICLE',
        payload: { title: article.title, body: article.body, url: location.href },
      });
    } catch {
      const error: AnalyzeErrorInfo = {
        code: 'NETWORK_ERROR',
        message: '확장 프로그램 내부 통신에 실패했습니다.',
      };
      response = { ok: false, error };
    }

    if (token !== requestToken) return; // 이 응답을 기다리는 동안 더 최신 요청이 시작됨 -> 무시

    if (response.ok) {
      widget.setState({ kind: 'result', result: response.result });
    } else {
      widget.setState({ kind: 'error', error: response.error });
    }
  }
}

// 네이버 기사 페이지인지 확인하고, 제목 영역을 찾을 수 있을 때만 위젯을 삽입한다.
function tryInsertNaverWidget() {
  if (!isNaverArticle(location.href)) return;

  // 제목 컨테이너 + 실제 추출 가능 여부(본문 포함)까지 확인된 경우에만 true.
  // 둘 다 확인해야 "엉뚱한 위치에 버튼만 덩그러니 삽입"되는 상황을 막을 수 있다.
  const insertIfReady = (): boolean => {
    const container = findNaverTitleContainer(document);
    if (!container) return false;
    if (!extractCurrentArticle(location.href, document).isArticle) return false;
    insertWidget(container);
    return true;
  };

  if (insertIfReady()) return; // 이미 렌더링되어 있으면 바로 삽입

  // 제목이 늦게 렌더링되는 경우를 대비해 제한 시간 동안만 DOM 변경을 감지한다.
  // document.body 전체를 보긴 하지만, 찾으면 즉시 disconnect하고
  // TITLE_WAIT_TIMEOUT_MS가 지나면 못 찾아도 강제로 disconnect해서
  // 지원하지 않는 페이지에서 계속 감시하는 일이 없게 한다.
  const observer = new MutationObserver(() => {
    if (insertIfReady()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), TITLE_WAIT_TIMEOUT_MS);
}

export default defineContentScript({
  matches: ['https://n.news.naver.com/*'],
  main() {
    // 팝업이 "지금 탭의 기사 내용을 줘"라고 요청할 때 응답하는 기존 경로 (그대로 유지).
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type !== 'EXTRACT_ARTICLE') return undefined; // 다른 메시지 타입은 처리하지 않음
      sendResponse(extractCurrentArticle(location.href, document));
      return true; // 비동기 응답 대비
    });

    // 제목 옆(위) 인라인 분석 버튼 삽입 시도.
    tryInsertNaverWidget();
  },
});
