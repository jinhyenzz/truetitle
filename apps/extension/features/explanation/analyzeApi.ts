import type { AnalyzeRequest, AnalyzeResult } from '@/shared/types';

export async function analyzeArticle(req: AnalyzeRequest): Promise<AnalyzeResult> {
  // TODO: 진현이랑 API 주소 확정되면 이 안만 fetch로 교체
  await new Promise((r) => setTimeout(r, 1000));
  return {
    clickbaitScore: Math.floor(Math.random() * 100),
    explanation: '개발용 예시 · 실제 AI 분석 아님',
    isMock: true,
  };
}