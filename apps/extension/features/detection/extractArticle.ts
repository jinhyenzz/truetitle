import { isDaumArticle, extractDaumArticle } from '@/sites/daum';
import { extractGenericArticle } from '@/sites/generic';
import { isNaverArticle, extractNaverArticle } from '@/sites/naver';
import type { ExtractResult } from '@/shared/types';

// 전용 어댑터가 있는 사이트를 먼저 시도하고, 어느 것도 맞지 않으면(=사용자가 권한을
// 허용한 그 외 언론사) 구조화 데이터 기반 범용 추출기를 마지막으로 시도한다.
// 이 파일은 URL만으로 사이트를 가리기 위한 곳이 아니다 — 콘텐츠 스크립트 자체가
// 정적 매치 또는 사용자가 허용한 도메인에만 주입되므로, 범용 추출기는 항상 시도해도
// 안전하고, 실제 기사 여부는 extractGenericArticle 내부의 구조화 데이터 검사가 가린다.
const extractors = [
  { match: isNaverArticle, extract: extractNaverArticle },
  { match: isDaumArticle, extract: extractDaumArticle },
];

export function extractCurrentArticle(url: string, doc: Document): ExtractResult {
  const extractor = extractors.find((e) => e.match(url));
  if (extractor) return extractor.extract(doc);
  return extractGenericArticle(doc);
}