import { extractCurrentArticle } from '@/features/detection/extractArticle';

export default defineContentScript({
  matches: ['https://n.news.naver.com/*'],
  main() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'EXTRACT_ARTICLE') {
        sendResponse(extractCurrentArticle(location.href, document));
      }
      return true; // 비동기 응답 대비
    });
  },
});