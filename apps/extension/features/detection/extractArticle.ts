import { isNaverArticle, extractNaverArticle } from '@/sites/naver';
import type { ExtractResult } from '@/shared/types';

const extractors = [{ match: isNaverArticle, extract: extractNaverArticle }];

export function extractCurrentArticle(url: string, doc: Document): ExtractResult {
  const extractor = extractors.find((e) => e.match(url));
  if (!extractor) return { isArticle: false };
  return extractor.extract(doc);
}