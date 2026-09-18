import type { ExtractResult } from '@/shared/types';

// 초기 지원 범위: n.news.naver.com 하위 페이지만 (일반 기사 기준).
// content.ts의 매니페스트 matches, wxt.config.ts의 host_permissions가 전부
// 이 상수 하나에서 나와야 세 곳이 서로 어긋나지 않는다.
const NAVER_ARTICLE_ORIGIN = 'https://n.news.naver.com';
export const NAVER_ARTICLE_MATCH_PATTERN = `${NAVER_ARTICLE_ORIGIN}/*`;

export function isNaverArticle(url: string): boolean {
  return url.startsWith(`${NAVER_ARTICLE_ORIGIN}/`);
}

/** 제목 버튼을 삽입할 기준 요소. #title_area가 감싸는 제목 블록을 우선하고, 없으면 헤드라인 요소로 대체한다. */
export function findNaverTitleContainer(doc: Document): HTMLElement | null {
  return (
    doc.querySelector<HTMLElement>('#title_area') ??
    doc.querySelector<HTMLElement>('.media_end_head_headline')
  );
}

// 제목 컨테이너 안에서 실제 헤드라인 텍스트를 고른다.
// #title_area 안에는 "단독"/"구독" 같은 짧은 뱃지용 span이 헤드라인 span보다
// 먼저 올 수 있어서, 그냥 첫 번째 span을 고르면 뱃지 텍스트를 제목으로 오인할 수 있다.
// 텍스트가 가장 긴 span을 헤드라인으로 간주하고, span이 없으면 컨테이너 자체의 텍스트를 쓴다.
function extractHeadlineText(container: Element): string {
  const spans = Array.from(container.querySelectorAll('span'));
  if (spans.length === 0) return container.textContent?.trim() ?? '';

  const headlineSpan = spans.reduce((longest, candidate) => {
    const candidateLength = candidate.textContent?.trim().length ?? 0;
    const longestLength = longest.textContent?.trim().length ?? 0;
    return candidateLength > longestLength ? candidate : longest;
  });
  return headlineSpan.textContent?.trim() ?? '';
}

// 네이버 기사 페이지에서 제목/본문 텍스트만 뽑아낸다.
// 제목 또는 본문 요소를 못 찾으면(=지원하지 않는 페이지) isArticle:false로 반환.
export function extractNaverArticle(doc: Document): ExtractResult {
  const titleContainer = findNaverTitleContainer(doc);
  const bodyEl = doc.querySelector('#dic_area, #articleBodyContents');

  if (!titleContainer || !bodyEl) return { isArticle: false };

  // longest-span 휴리스틱은 #title_area 전용이다. .media_end_head_headline으로
  // 대체된 경우엔 그 요소 자체가 이미 헤드라인이라 안에 span이 있어도 쪼개 고르지
  // 않고 전체 텍스트를 그대로 쓴다 (기존 동작 유지).
  const title =
    titleContainer.id === 'title_area'
      ? extractHeadlineText(titleContainer)
      : (titleContainer.textContent?.trim() ?? '');

  // 원본 DOM을 건드리지 않도록 복제본에서 스크립트/광고/사진설명 등 본문이 아닌 요소를 제거.
  const bodyClone = bodyEl.cloneNode(true) as HTMLElement;
  bodyClone
    .querySelectorAll('script, style, .end_photo_org, .ad_area, em.img_desc')
    .forEach((el) => el.remove());

  const body = bodyClone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  if (!body) return { isArticle: false };

  return { isArticle: true, title, body };
}