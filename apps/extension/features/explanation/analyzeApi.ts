import type { AnalyzeRequest, AnalyzeResult } from '@/shared/types';

// .env의 WXT_API_BASE_URL로 설정. 없으면 로컬 개발 서버로 기본값 사용.
const API_BASE_URL = import.meta.env.WXT_API_BASE_URL ?? 'http://127.0.0.1:8001';

interface AnalyzeApiResponse {
  clickbait_score: number;
  classification: 'clickbait' | 'non_clickbait';
  title_body_similarity: number;
  evidence: string[];
  note: string;
}

export async function analyzeArticle(req: AnalyzeRequest): Promise<AnalyzeResult> {
  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: req.title, body: req.body }),
  });

  if (!response.ok) {
    throw new Error(`분석 서버 오류: ${response.status}`);
  }

  const data: AnalyzeApiResponse = await response.json();
  return {
    clickbaitScore: data.clickbait_score,
    classification: data.classification,
    titleBodySimilarity: data.title_body_similarity,
    evidence: data.evidence,
    explanation: data.note,
    isMock: false,
  };
}