import { Readability } from '@mozilla/readability';
import type { ExtractResult } from '@/shared/types';

// 본문이 이보다 짧으면 "본문 확인 불가"로 본다 (유료 안내·일부 내용만 노출된 경우 포함).
// 제목이나 텍스트 양만으로 기사라고 판단하지 않기 위한 최소한의 안전장치이며,
// 구조화 데이터(JSON-LD/itemprop) 확인을 대체하지는 않는다.
const MIN_BODY_LENGTH = 300;
// 추출된 본문에서 한글 비율이 이보다 낮으면 한국어 기사가 아닌 것으로 본다.
const MIN_KOREAN_RATIO = 0.3;

interface StructuredArticle {
  headline?: string;
  articleBody?: string;
  inLanguage?: string;
  isAccessibleForFree?: boolean;
}

// 일부 언론사 CMS는 JSON-LD 텍스트 필드를 HTML 엔티티로 한 번 더 인코딩해서 내보낸다
// (예: 실제 따옴표 대신 문자열 그대로 "&quot;"가 들어있는 경우 — 연합뉴스에서 실제로 확인됨).
// JSON.parse는 이를 그대로 남겨두므로, 화면에 실제로 보이는 텍스트(예: <h1>)와 비교하려면
// 먼저 디코딩해야 한다. <textarea>에 넣었다 꺼내는 방식은 스크립트를 실행하지 않으면서도
// 브라우저의 HTML 엔티티 디코더를 그대로 활용할 수 있어 안전하다.
function decodeHtmlEntities(doc: Document, text: string): string {
  const el = doc.createElement('textarea');
  el.innerHTML = text;
  return el.value;
}

// 일부 CMS(KBS에서 실제로 확인됨)는 템플릿 엔진이 남긴 JS 스타일 한 줄 주석(//...)을
// JSON-LD 안에 그대로 흘려보내 JSON.parse가 실패한다. 문자열 값 중간의 "https://" 같은
// 건 건드리지 않도록, 줄 전체(trim 후)가 //로 시작하는 줄만 제거하고 다시 시도한다.
function stripLineComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

// 페이지의 JSON-LD 중 NewsArticle/Article 타입만 골라 필요한 필드만 꺼낸다.
// 언론사 CMS가 직접 표시한 데이터라 DOM을 직접 뒤지는 것보다 신뢰할 수 있다.
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
        continue; // 주석 제거로도 못 고치는 수준으로 깨진 JSON-LD는 포기하고 다음 스크립트를 본다.
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

// 언론사마다 headline은 굽은따옴표(" ')로, 실제 화면 DOM은 직선따옴표(" ')로 표시하는 등
// 같은 텍스트도 부호 표기가 달라질 수 있어, 비교 전에 둘 다 직선 부호로 맞춘다.
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
  // 정상적인 ISO 639-1 언어코드는 "ko"이지만, 일부 언론사(동아일보에서 실제로 확인됨)는
  // 국가코드 KR과 헷갈려 inLanguage에 "kr"을 넣어둔다. 흔한 오타라 별도로 인정한다.
  return normalized.startsWith('ko') || normalized === 'kr';
}

// 구조화 데이터에 언어 정보가 없을 때만 쓰는 마지막 수단. 한글 비율이 낮으면
// (예: 영어 기사) 한국어 기사로 보지 않는다.
function looksKorean(text: string): boolean {
  const meaningful = text.replace(/\s+/g, '');
  if (meaningful.length < 30) return false;
  const koreanCount = (meaningful.match(/[가-힣]/g) ?? []).length;
  return koreanCount / meaningful.length >= MIN_KOREAN_RATIO;
}

// 본문 컨테이너 안의 <p> 텍스트만 모은다. 광고·관련기사·댓글 위젯은 거의 항상
// div/aside 등으로 감싸져 있어, 문단(<p>)만 모으면 별도 제외 목록 없이도 대부분 걸러진다.
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

// itemprop/<article> 조상 같은 명시적 표시가 전혀 없는 사이트를 위한 마지막 수단.
// Firefox 읽기 모드에도 쓰이는 Readability로 광고·내비게이션·댓글·관련기사를 걸러낸
// 본문 영역을 찾는다. 실제 페이지 DOM을 변형하므로 반드시 복제본에서만 실행한다.
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

// JSON-LD가 없거나(예: etnews - 마이크로데이터만 사용) JSON-LD에 헤드라인이 없을 때
// (예: KBS의 JSON-LD엔 headline은 있지만 articleBody가 없음) 쓰는 다음 우선순위 폴백.
// 셋 다 언론사 CMS가 직접 표시한 값이라 페이지 텍스트를 추측하는 것과는 다르다:
//   1. JSON-LD headline (기존)
//   2. itemprop="headline" 마이크로데이터
//   3. og:title (메타 태그) - 다만 발행 후 제목이 수정됐는데 메타는 안 바뀐 경우 실제
//      화면 텍스트와 다를 수 있어(etnews에서 실제로 확인됨), findGenericTitleContainer의
//      DOM 매칭이 실패할 수 있다. 그래도 title 값 자체는 이 문자열을 그대로 쓴다.
function resolveHeadline(doc: Document, jsonLdHeadline: string | undefined): string | undefined {
  if (jsonLdHeadline) return jsonLdHeadline;
  const microdataHeadline = doc.querySelector<HTMLElement>('[itemprop="headline"]')?.textContent?.trim();
  if (microdataHeadline) return microdataHeadline;
  const ogTitle = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content?.trim();
  return ogTitle || undefined;
}

// JSON-LD NewsArticle/Article가 전혀 없는 사이트도 있다(etnews는 마이크로데이터만,
// metroseoul은 og:type만 있음). "기사임을 언론사 스스로 표시한 신호"가 하나라도 있으면
// 통과시키고, 셋 다 없으면(=페이지 텍스트 양만으로 판단해야 하는 경우) 여전히 거른다 —
// 구조화 데이터 검사를 완전히 없애면 아무 페이지나 기사로 오판할 수 있기 때문.
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
 * JSON-LD(NewsArticle/Article) · 마이크로데이터(itemprop="articleBody"/itemtype=Article) ·
 * og:type=article 중 어느 것도 없으면 애초에 시도하지 않는다 (페이지 제목이나 텍스트
 * 양만으로 기사라고 추정하지 않기 위함 - hasStructuredArticleSignal 참고).
 *
 * 본문은 아래 순서로 시도하고, 앞 단계가 충분한 길이를 채우면 뒤 단계는 실행하지 않는다:
 *   1. JSON-LD의 articleBody 텍스트 (DOM과 무관하게 가장 확실함)
 *   2. itemprop="articleBody" 컨테이너
 *   3. 확인된 제목 요소(findGenericTitleContainer)를 감싸는 가장 가까운 <article> 조상
 *   4. Readability(Firefox 읽기 모드에도 쓰이는 라이브러리)로 광고·내비게이션·댓글·
 *      관련기사를 걸러낸 본문 추정 — 위 세 신호가 전혀 없는 사이트를 위한 마지막 수단
 * "페이지의 아무 <article>"은 3번에서도 쓰지 않는다 — 실제 언론사 페이지를 확인해보니
 * 관련기사 카드·댓글·기자 소개 위젯에도 <article> 태그를 흔히 써서, 그중 첫 번째 것을
 * 그냥 고르면 댓글·구독자 수 같은 내용이 본문에 섞여 들어갈 수 있다. "확인된 제목을
 * 감싸는 <article>"은 실제로 본문과 겹치는 경우가 많다(직접 확인함).
 *
 * 넷 다 충분한 길이를 못 채우면 기사로 보지 않는다. isAccessibleForFree=false(유료
 * 전용)여도 "본문 확인 불가"로 처리한다. 언어는 구조화 데이터의 inLanguage를 우선
 * 신뢰하고, 없을 때만 한글 비율로 추정한다.
 */
export function extractGenericArticle(doc: Document): ExtractResult {
  // 페이지 콘솔에서 "TrueTitle"로 필터링하면, 판정이 정확히 어느 단계에서
  // 실패했는지(구조화 데이터 없음/본문 너무 짧음/언어 불일치 등) 바로 보인다.
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

  let body =
    jsonLd?.articleBody?.trim() ||
    (itemPropBody ? extractParagraphText(itemPropBody) : '') ||
    (articleAncestorBody ? extractParagraphText(articleAncestorBody) : '');
  const bodySource = jsonLd?.articleBody?.trim()
    ? 'jsonLd.articleBody'
    : itemPropBody && body
      ? 'itemprop'
      : articleAncestorBody && body
        ? 'article-ancestor'
        : 'none';

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
 * 고정하지 않고, resolveHeadline이 찾은 텍스트(JSON-LD headline > itemprop="headline" >
 * og:title 순)와 실제로 일치하는 요소를 찾는다.
 * 일치하는 요소가 없으면(헤드라인 정보가 전혀 없거나, og:title이 발행 후 수정된 제목과
 * 달라 화면 텍스트와 안 맞는 경우 등) null을 돌려주고, 이 경우 버튼은 삽입하지 않는다
 * (엉뚱한 위치에 붙이지 않기 위함 - extractGenericArticle의 title 값 자체는 이 함수와
 * 별개로 resolveHeadline 결과를 그대로 쓰므로 영향받지 않는다).
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
