import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'wxt';

// wxt.config.ts는 WXT가 .env를 로드하기 전에 평가되므로 여기선 직접 읽는다.
// analyzeApi.ts의 import.meta.env.WXT_API_BASE_URL과 같은 값을 가리켜야 한다.
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8001';

function readApiBaseUrl(): string {
  if (!existsSync('.env')) return DEFAULT_API_BASE_URL;
  const parsed = parseEnv(readFileSync('.env', 'utf-8'));
  return parsed.WXT_API_BASE_URL || DEFAULT_API_BASE_URL;
}

const apiBaseUrl = readApiBaseUrl();

export default defineConfig({
  manifest: {
    name: '낚시성 제목 탐지기',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: ['https://n.news.naver.com/*', `${apiBaseUrl}/*`],
  },
});