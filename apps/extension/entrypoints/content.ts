import { extractCurrentArticle } from '@/features/detection/extractArticle';
import { createArticleWidget, WIDGET_ROOT_ID } from '@/features/explanation/articleWidget';
import { DAUM_ARTICLE_MATCH_PATTERN, findDaumTitleContainer, isDaumArticle } from '@/sites/daum';
import { findGenericTitleContainer } from '@/sites/generic';
import { NAVER_ARTICLE_MATCH_PATTERN, findNaverTitleContainer, isNaverArticle } from '@/sites/naver';
import type { AnalyzeErrorInfo, BackgroundResponseMessage, ExtractResult } from '@/shared/types';

// 제목이 늦게 렌더링되는 경우를 이 시간(ms)만 기다렸다가 관찰을 포기한다.
const TITLE_WAIT_TIMEOUT_MS = 10000;

// 지원 사이트 목록. match로 URL을, findTitleContainer로 버튼을 붙일 기준 요소를 찾는다.
// 전용 어댑터 사이트 추가 시 여기와 extractArticle.ts의 extractors, wxt.config.ts의
// host_permissions, 아래 defineContentScript의 matches를 함께 늘려야 한다.
// (구글 검색결과/뉴스 목록은 언론사 원문이 아니므로 제외 — 실제 도착 페이지만 대상)
const SITES = [
  { match: isNaverArticle, findTitleContainer: findNaverTitleContainer },
  { match: isDaumArticle, findTitleContainer: findDaumTitleContainer },
  // 전용 어댑터가 없는 그 외 언론사. 이 스크립트는 정적 매치(네이버/다음) 또는 사용자가
  // 직접 허용한 도메인에만 주입되므로 여기 도달한 것 자체가 허용된 사이트라는 뜻이다.
  // 실제 기사 여부는 findGenericTitleContainer/extractGenericArticle이 가린다.
  { match: () => true, findTitleContainer: findGenericTitleContainer },
];

// container(제목 블록) 바로 위에 위젯(버튼+결과패널)을 한 번만 만들어 붙인다.
function insertWidget(container: HTMLElement) {
  if (document.getElementById(WIDGET_ROOT_ID)) return; // 기사당 한 세트만 생성

  // 클릭마다 증가시켜 "이 응답이 어느 요청 것인지" 구분한다. 로딩 중 ✕로 재시도가
  // 가능하므로, 이전 요청의 늦은 응답이 최신 상태를 덮어쓰는 걸 막기 위해 필요하다.
  let requestToken = 0;

  const widget = createArticleWidget(() => {
    void handleAnalyzeClick();
  });

  // 제목 요소 바로 앞(위쪽 줄)에 위젯을 삽입 -> "[🎣 분석하기] 기사 제목" 레이아웃.
  container.insertAdjacentElement('beforebegin', widget.root);

  async function handleAnalyzeClick() {
    // 이 클릭의 토큰을 기억해두고, 응답이 왔을 때 여전히 최신 요청인지 비교한다.
    const token = ++requestToken;

    // 클릭 시점에 항상 새로 추출한다 (캐시된 값을 쓰지 않음).
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
      // 서버 호출은 background에 위임 (동의/ON-OFF 검증 + /analyze 호출을 거기서 담당).
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

    if (token !== requestToken) return; // 기다리는 동안 더 최신 요청이 시작됨 -> 무시

    if (response.ok) {
      widget.setState({ kind: 'result', result: response.result });
    } else {
      widget.setState({ kind: 'error', error: response.error });
    }
  }
}

// 지원하는 언론사 기사 페이지인지 확인하고, 제목 영역을 찾을 수 있을 때만 위젯을 삽입한다.
function tryInsertWidget() {
  const site = SITES.find((candidate) => candidate.match(location.href));
  if (!site) return;

  // 제목 컨테이너 + 실제 추출 가능 여부(본문 포함) 둘 다 확인해야 엉뚱한 위치에
  // 버튼만 삽입되는 걸 막을 수 있다.
  const insertIfReady = (): boolean => {
    const container = site.findTitleContainer(document);
    if (!container) return false;
    if (!extractCurrentArticle(location.href, document).isArticle) return false;
    insertWidget(container);
    return true;
  };

  if (insertIfReady()) return; // 이미 렌더링되어 있으면 바로 삽입

  // 제목이 늦게 렌더링되는 경우를 대비해 제한 시간 동안만 DOM 변경을 감지한다.
  // 찾으면 즉시, TITLE_WAIT_TIMEOUT_MS가 지나면 못 찾아도 disconnect한다.
  const observer = new MutationObserver(() => {
    if (insertIfReady()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), TITLE_WAIT_TIMEOUT_MS);
}

export default defineContentScript({
  matches: [NAVER_ARTICLE_MATCH_PATTERN, DAUM_ARTICLE_MATCH_PATTERN],
  main() {
    // 팝업이 "지금 탭의 기사 내용을 줘"라고 요청할 때 응답하는 경로.
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type !== 'EXTRACT_ARTICLE') return undefined; // 다른 메시지 타입은 처리하지 않음
      sendResponse(extractCurrentArticle(location.href, document));
      return true; // 비동기 응답 대비
    });

    // 제목 옆(위) 인라인 분석 버튼 삽입 시도.
    tryInsertWidget();
  },
});
