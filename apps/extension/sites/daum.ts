import type { ExtractResult } from '@/shared/types';

// 지원 범위: v.daum.net 기사 뷰어 페이지만 (다음뉴스 목록/검색은 제외).
// content.ts의 매니페스트 matches, wxt.config.ts의 host_permissions가 전부
// 이 상수 하나에서 나와야 세 곳이 서로 어긋나지 않는다.
const DAUM_ARTICLE_ORIGIN = 'https://v.daum.net';
export const DAUM_ARTICLE_MATCH_PATTERN = `${DAUM_ARTICLE_ORIGIN}/*`;

export function isDaumArticle(url: string): boolean {
  return url.startsWith(`${DAUM_ARTICLE_ORIGIN}/`);
}

/** 제목 버튼을 삽입할 기준 요소. */
export function findDaumTitleContainer(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('h3.tit_view');
}

// 다음뉴스 기사 페이지에서 제목/본문 텍스트만 뽑아낸다.
// 광고(ad-newsview-middle 등)·공감·관련기사·댓글은 모두 .article_view의 형제 요소라
// .article_view만 스코프로 잡으면 별도 제외 목록 없이도 섞이지 않는다.
export function extractDaumArticle(doc: Document): ExtractResult {
  const titleEl = findDaumTitleContainer(doc);
  const bodyEl = doc.querySelector('.article_view');

  if (!titleEl || !bodyEl) return { isArticle: false };

  const title = titleEl.textContent?.trim() ?? '';
  if (!title) return { isArticle: false };

  // 원본 DOM을 건드리지 않도록 복제본에서 사진/캡션 등 본문이 아닌 요소를 제거.
  const bodyClone = bodyEl.cloneNode(true) as HTMLElement;
  bodyClone.querySelectorAll('script, style, figure, figcaption').forEach((el) => el.remove());

  const body = bodyClone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  if (!body) return { isArticle: false };

  return { isArticle: true, title, body };
}
