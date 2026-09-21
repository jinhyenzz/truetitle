import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'wxt';
import { DAUM_ARTICLE_MATCH_PATTERN } from './sites/daum';
import { NAVER_ARTICLE_MATCH_PATTERN } from './sites/naver';

// wxt.config.ts는 WXT가 .env를 로드하기 전에 평가되므로 여기선 직접 읽는다.
// analyzeApi.ts의 import.meta.env.WXT_API_BASE_URL과 같은 값을 가리켜야 한다.
const DEFAULT_API_BASE_URL = 'https://truetitle-production.up.railway.app';

function readApiBaseUrl(): string {
  if (!existsSync('.env')) return DEFAULT_API_BASE_URL;
  const parsed = parseEnv(readFileSync('.env', 'utf-8'));
  return parsed.WXT_API_BASE_URL || DEFAULT_API_BASE_URL;
}

const apiBaseUrl = readApiBaseUrl();

export default defineConfig({
  manifest: {
    name: 'TrueTitle',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: [NAVER_ARTICLE_MATCH_PATTERN, DAUM_ARTICLE_MATCH_PATTERN, `${apiBaseUrl}/*`],
    // 기본 권한에는 넣지 않고, 사용자가 팝업에서 "이 사이트 허용"을 눌렀을 때만
    // features/permissions/sitePermissions.ts가 해당 origin 하나만 요청한다.
    // 모든 사이트를 처음부터 열어주지 않기 위한 선택 권한 선언.
    optional_host_permissions: ['https://*/*'],
  },
  // wxt dev 실행 시 about:blank 브라우저 창이 자동으로 뜨는 걸 막는다.
  // 확장 프로그램은 chrome://extensions에서 .output/chrome-mv3-dev를 직접 "압축해제된 확장 프로그램 로드"로 불러와야 한다.
  webExt: {
    disabled: true,
  },
});