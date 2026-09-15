export interface ExtractResult {
  isArticle: boolean;
  title?: string;
  body?: string;
}

export interface AnalyzeRequest {
  url: string;
  title: string;
  body: string;
}

export interface AnalyzeResult {
  clickbaitScore: number;
  classification: 'clickbait' | 'non_clickbait';
  titleBodySimilarity: number;
  evidence: string[];
  explanation: string;
  isMock: boolean;
}