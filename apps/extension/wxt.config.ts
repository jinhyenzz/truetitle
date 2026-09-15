import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: '낚시성 제목 탐지기',
    permissions: ['activeTab', 'scripting'],
    host_permissions: ['https://n.news.naver.com/*'],
  },
});