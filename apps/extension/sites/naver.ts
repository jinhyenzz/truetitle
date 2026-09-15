import type { ExtractResult } from '@/shared/types';

export function isNaverArticle(url: string): boolean {
  return /^https:\/\/n\.news\.naver\.com\//.test(url);
}

export function extractNaverArticle(doc: Document): ExtractResult {
  const titleEl = doc.querySelector('#title_area span, .media_end_head_headline');
  const bodyEl = doc.querySelector('#dic_area, #articleBodyContents');

  if (!titleEl || !bodyEl) return { isArticle: false };

  const title = titleEl.textContent?.trim() ?? '';

  const bodyClone = bodyEl.cloneNode(true) as HTMLElement;
  bodyClone
    .querySelectorAll('script, style, .end_photo_org, .ad_area, em.img_desc')
    .forEach((el) => el.remove());

  const body = bodyClone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  if (!body) return { isArticle: false };

  return { isArticle: true, title, body };
}