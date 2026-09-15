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
  explanation: string;
  isMock: boolean;
}