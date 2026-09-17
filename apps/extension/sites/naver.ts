import type { ExtractResult } from '@/shared/types';

// 초기 지원 범위: n.news.naver.com 하위 페이지만 (일반 기사 기준).
export function isNaverArticle(url: string): boolean {
  return /^https:\/\/n\.news\.naver\.com\//.test(url);
}

/** 제목 버튼을 삽입할 기준 요소. #title_area가 감싸는 제목 블록을 우선하고, 없으면 헤드라인 요소로 대체한다. */
export function findNaverTitleContainer(doc: Document): HTMLElement | null {
  return (
    doc.querySelector<HTMLElement>('#title_area') ??
    doc.querySelector<HTMLElement>('.media_end_head_headline')
  );
}

// 네이버 기사 페이지에서 제목/본문 텍스트만 뽑아낸다.
// 제목 또는 본문 요소를 못 찾으면(=지원하지 않는 페이지) isArticle:false로 반환.
export function extractNaverArticle(doc: Document): ExtractResult {
  const titleEl = doc.querySelector('#title_area span, .media_end_head_headline');
  const bodyEl = doc.querySelector('#dic_area, #articleBodyContents');

  if (!titleEl || !bodyEl) return { isArticle: false };

  const title = titleEl.textContent?.trim() ?? '';

  // 원본 DOM을 건드리지 않도록 복제본에서 스크립트/광고/사진설명 등 본문이 아닌 요소를 제거.
  const bodyClone = bodyEl.cloneNode(true) as HTMLElement;
  bodyClone
    .querySelectorAll('script, style, .end_photo_org, .ad_area, em.img_desc')
    .forEach((el) => el.remove());

  const body = bodyClone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  if (!body) return { isArticle: false };

  return { isArticle: true, title, body };
}