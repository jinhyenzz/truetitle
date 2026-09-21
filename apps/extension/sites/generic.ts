import { Readability } from '@mozilla/readability';
import type { ExtractResult } from '@/shared/types';

// 본문이 이보다 짧으면 "본문 확인 불가"로 본다 (유료 안내·일부만 노출된 경우 포함).
// 구조화 데이터 확인을 대체하지는 않는 최소한의 안전장치.
const MIN_BODY_LENGTH = 300;
// 추출된 본문의 한글 비율이 이보다 낮으면 한국어 기사가 아닌 것으로 본다.
const MIN_KOREAN_RATIO = 0.3;

interface StructuredArticle {
  headline?: string;
  articleBody?: string;
  inLanguage?: string;
  isAccessibleForFree?: boolean;
}

// 일부 CMS는 JSON-LD 텍스트 필드를 HTML 엔티티로 한 번 더 인코딩해서 내보낸다
// (예: "&quot;" 그대로 — 연합뉴스에서 확인됨). 화면 텍스트와 비교하려면 먼저
// 디코딩해야 하며, <textarea>를 거치면 스크립트 실행 없이 안전하게 디코딩된다.
function decodeHtmlEntities(doc: Document, text: string): string {
  const el = doc.createElement('textarea');
  el.innerHTML = text;
  return el.value;
}

// 일부 CMS(KBS에서 확인됨)는 템플릿 엔진이 남긴 JS 한 줄 주석(//...)을 JSON-LD에
// 그대로 흘려보내 JSON.parse가 실패한다. "https://" 같은 값은 건드리지 않도록,
// 줄 전체(trim 후)가 //로 시작하는 줄만 제거하고 재시도한다.
function stripLineComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

// 페이지의 JSON-LD 중 NewsArticle/Article 타입만 골라 필요한 필드를 꺼낸다.
// CMS가 직접 표시한 데이터라 DOM을 뒤지는 것보다 신뢰할 수 있다.
function readJsonLdArticles(doc: Document): StructuredArticle[] {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  const results: StructuredArticle[] = [];

  for (const script of scripts) {
    const raw = script.textContent ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      try {
        parsed = JSON.parse(stripLineComments(raw));
      } catch {
        continue; // 주석 제거로도 못 고치는 JSON-LD는 포기하고 다음 스크립트를 본다.
      }
    }

    for (const candidate of Array.isArray(parsed) ? parsed : [parsed]) {
      if (!candidate || typeof candidate !== 'object') continue;
      const data = candidate as Record<string, unknown>;
      const type = data['@type'];
      const types = Array.isArray(type) ? type : [type];
      if (!types.some((t) => t === 'NewsArticle' || t === 'Article' || t === 'ReportageNewsArticle')) {
        continue;
      }
      results.push({
        headline: typeof data.headline === 'string' ? decodeHtmlEntities(doc, data.headline) : undefined,
        articleBody: typeof data.articleBody === 'string' ? decodeHtmlEntities(doc, data.articleBody) : undefined,
        inLanguage: typeof data.inLanguage === 'string' ? data.inLanguage : undefined,
        isAccessibleForFree: typeof data.isAccessibleForFree === 'boolean' ? data.isAccessibleForFree : undefined,
      });
    }
  }

  return results;
}

// headline과 화면 DOM이 굽은/직선 따옴표를 섞어 쓰는 등 표기가 달라질 수 있어,
// 비교 전에 둘 다 직선 부호로 맞춘다.
function normalizeForMatch(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function languageIsKorean(languageTag: string | undefined | null): boolean | null {
  if (!languageTag) return null;
  const normalized = languageTag.trim().toLowerCase();
  // 정상 언어코드는 "ko"지만, 일부 언론사(동아일보에서 확인됨)는 국가코드 KR과
  // 헷갈려 "kr"을 넣어둔다. 흔한 오타라 별도로 인정한다.
  return normalized.startsWith('ko') || normalized === 'kr';
}

// 구조화 데이터에 언어 정보가 없을 때만 쓰는 마지막 수단.
function looksKorean(text: string): boolean {
  const meaningful = text.replace(/\s+/g, '');
  if (meaningful.length < 30) return false;
  const koreanCount = (meaningful.match(/[가-힣]/g) ?? []).length;
  return koreanCount / meaningful.length >= MIN_KOREAN_RATIO;
}

// 본문 컨테이너 안의 <p> 텍스트만 모은다. 광고·댓글 위젯은 대부분 div/aside로
// 감싸져 있어, 문단만 모으면 제외 목록 없이도 대부분 걸러진다.
function extractParagraphText(container: Element): string {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, style, figure, figcaption').forEach((el) => el.remove());
  return Array.from(clone.querySelectorAll('p'))
    .map((p) => p.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// itemprop/<article> 같은 명시적 표시가 없는 사이트를 위한 마지막 수단.
// Firefox 읽기 모드에도 쓰이는 Readability로 본문을 추출한다.
// 페이지 DOM을 변형하므로 반드시 복제본에서만 실행한다.
function extractWithReadability(doc: Document): { title: string; body: string } | null {
  const clone = doc.cloneNode(true) as Document;
  let parsed;
  try {
    parsed = new Readability(clone).parse();
  } catch (error) {
    console.warn('[TrueTitle] Readability 본문 추출 실패', error);
    return null;
  }
  if (!parsed?.textContent) {
    console.warn('[TrueTitle] Readability가 본문을 찾지 못함 (parse() 결과 없음)');
    return null;
  }
  const body = parsed.textContent.replace(/\s+/g, ' ').trim();
  if (!body) return null;
  return { title: parsed.title?.trim() ?? '', body };
}

// JSON-LD가 없거나 헤드라인이 없을 때(etnews, KBS 등) 쓰는 우선순위 폴백.
// 셋 다 CMS가 직접 표시한 값이다: 1) JSON-LD headline 2) itemprop="headline"
// 3) og:title — 단, 발행 후 제목만 수정되고 메타가 안 바뀐 경우 화면 텍스트와
// 달라 findGenericTitleContainer의 DOM 매칭이 실패할 수 있다(etnews에서 확인됨).
function resolveHeadline(doc: Document, jsonLdHeadline: string | undefined): string | undefined {
  if (jsonLdHeadline) return jsonLdHeadline;
  const microdataHeadline = doc.querySelector<HTMLElement>('[itemprop="headline"]')?.textContent?.trim();
  if (microdataHeadline) return microdataHeadline;
  const ogTitle = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content?.trim();
  return ogTitle || undefined;
}

// JSON-LD가 전혀 없는 사이트도 있다(etnews는 마이크로데이터만, metroseoul은
// og:type만). "기사임을 CMS가 스스로 표시한 신호"가 하나라도 있으면 통과시키고,
// 셋 다 없으면 여전히 거른다 — 아무 페이지나 기사로 오판하지 않기 위함.
function hasStructuredArticleSignal(doc: Document, jsonLdArticles: StructuredArticle[]): boolean {
  if (jsonLdArticles.length > 0) return true;
  if (doc.querySelector('[itemprop="articleBody"]')) return true;
  if (
    doc.querySelector(
      '[itemtype*="schema.org/NewsArticle"], [itemtype*="schema.org/Article"], [itemtype*="schema.org/ReportageNewsArticle"]',
    )
  ) {
    return true;
  }
  const ogType = doc.querySelector<HTMLMetaElement>('meta[property="og:type"]')?.content?.trim().toLowerCase();
  return ogType === 'article';
}

/**
 * 임의의 언론사 페이지에서 구조화 데이터를 먼저 확인해 보수적으로 기사 여부를 판정한다.
 * hasStructuredArticleSignal(JSON-LD/마이크로데이터/og:type)가 전부 없으면 시도하지 않는다.
 *
 * 본문은 아래 순서로 시도하고, 앞 단계가 충분한 길이를 채우면 다음 단계는 건너뛴다:
 *   1. JSON-LD articleBody (DOM과 무관해 가장 확실함)
 *   2. itemprop="articleBody" 컨테이너
 *   3. 제목 요소(findGenericTitleContainer)를 감싸는 가장 가까운 <article> 조상
 *      ("페이지의 아무 <article>"이 아닌 이유: 관련기사·댓글·기자 소개 위젯도
 *      <article> 태그를 흔히 써서 섞여 들어올 수 있다)
 *   4. Readability(Firefox 읽기 모드 라이브러리) — 위 신호가 전혀 없을 때 마지막 수단
 *
 * 넷 다 길이를 못 채우면 기사로 보지 않는다. isAccessibleForFree=false(유료 전용)도
 * "본문 확인 불가"로 처리한다. 언어는 inLanguage를 우선 신뢰하고, 없을 때만 한글 비율로 추정한다.
 */
export function extractGenericArticle(doc: Document): ExtractResult {
  // 콘솔에서 "TrueTitle"로 필터링하면 판정이 어느 단계에서 실패했는지 바로 보인다.
  const reject = (reason: string, extra?: Record<string, unknown>): ExtractResult => {
    console.debug('[TrueTitle] 기사 아님으로 판정:', reason, extra ?? '');
    return { isArticle: false };
  };

  const jsonLdArticles = readJsonLdArticles(doc);
  const jsonLd = jsonLdArticles[0];

  if (!hasStructuredArticleSignal(doc, jsonLdArticles)) {
    return reject('구조화 데이터(JSON-LD/마이크로데이터/og:type) 없음');
  }
  if (jsonLd?.isAccessibleForFree === false) return reject('유료 전용(isAccessibleForFree=false)');

  const titleContainer = findGenericTitleContainer(doc);
  const itemPropBody = doc.querySelector<HTMLElement>('[itemprop="articleBody"]');
  const articleAncestorBody = titleContainer?.closest<HTMLElement>('article') ?? null;

  // 신뢰도 우선순위(JSON-LD > itemprop > article 조상)는 유지하되, 그중 실제로
  // 가장 긴 후보를 쓴다. 일부 CMS는 JSON-LD articleBody에 SEO용 요약만 넣어두는데
  // (300자를 넘는 경우도 있음), 첫 번째로 걸리는 값을 그냥 쓰면 itemprop/article
  // 조상에 있는 더 완전한 본문을 두고도 짧은 요약만 분석에 보내게 된다.
  const bodyCandidates: Array<{ source: string; text: string }> = [
    { source: 'jsonLd.articleBody', text: jsonLd?.articleBody?.trim() ?? '' },
    { source: 'itemprop', text: itemPropBody ? extractParagraphText(itemPropBody) : '' },
    { source: 'article-ancestor', text: articleAncestorBody ? extractParagraphText(articleAncestorBody) : '' },
  ];
  const bestCandidate = bodyCandidates.reduce((best, candidate) =>
    candidate.text.length > best.text.length ? candidate : best,
  );
  let body = bestCandidate.text;
  const bodySource = body ? bestCandidate.source : 'none';

  let readabilityResult: { title: string; body: string } | null = null;
  if (body.length < MIN_BODY_LENGTH) {
    readabilityResult = extractWithReadability(doc);
    if (readabilityResult && readabilityResult.body.length >= MIN_BODY_LENGTH) {
      body = readabilityResult.body;
    }
  }
  if (body.length < MIN_BODY_LENGTH) {
    return reject('본문 길이 부족', {
      bodySource,
      bodyLength: body.length,
      hasTitleContainer: !!titleContainer,
      hasItemProp: !!itemPropBody,
      hasArticleAncestor: !!articleAncestorBody,
      readabilityTried: !!readabilityResult,
      readabilityBodyLength: readabilityResult?.body.length ?? 0,
    });
  }

  const title =
    resolveHeadline(doc, jsonLd?.headline)?.trim() ||
    titleContainer?.textContent?.trim() ||
    readabilityResult?.title ||
    '';
  if (!title) return reject('제목을 찾지 못함');

  const koreanFromMetadata = languageIsKorean(jsonLd?.inLanguage) ?? languageIsKorean(doc.documentElement.lang);
  const isKoreanArticle = koreanFromMetadata ?? looksKorean(body);
  if (!isKoreanArticle) return reject('한국어 기사로 판정되지 않음', { inLanguage: jsonLd?.inLanguage, htmlLang: doc.documentElement.lang });

  console.debug('[TrueTitle] 기사로 판정됨', { bodySource: readabilityResult && body === readabilityResult.body ? 'readability' : bodySource, bodyLength: body.length });
  return { isArticle: true, title, body };
}

/**
 * 버튼을 붙일 제목 요소를 찾는다. 언론사마다 마크업이 제각각이라 태그/클래스명을
 * 고정하지 않고, resolveHeadline 텍스트와 실제로 일치하는 요소를 찾는다.
 * 일치하는 요소가 없으면 null을 돌려주고 버튼을 삽입하지 않는다 (엉뚱한 위치에
 * 붙이지 않기 위함 — extractGenericArticle의 title 값 자체는 영향받지 않는다).
 */
export function findGenericTitleContainer(doc: Document): HTMLElement | null {
  const headline = resolveHeadline(doc, readJsonLdArticles(doc)[0]?.headline);
  if (!headline) return null;
  const normalizedHeadline = normalizeForMatch(headline);
  if (!normalizedHeadline) return null;

  const selectorsByPriority = ['h1', 'h2', '[class*="headline"]', '[class*="title"]', '[itemprop="headline"]'];
  for (const selector of selectorsByPriority) {
    for (const candidate of doc.querySelectorAll<HTMLElement>(selector)) {
      const text = candidate.textContent ? normalizeForMatch(candidate.textContent) : '';
      if (text && (text === normalizedHeadline || text.includes(normalizedHeadline))) {
        return candidate;
      }
    }
  }
  return null;
}
