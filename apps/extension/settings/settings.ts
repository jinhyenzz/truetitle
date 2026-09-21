import type { AnalyzeErrorInfo, Settings } from '@/shared/types';

// chrome.storage.local에 하나의 객체로 묶어 저장할 때 쓰는 키.
const STORAGE_KEY = 'trueTitleSettings';

// 최초 설치 시 기본값. 동의 전 + OFF 상태라 background가 어떤 요청도 서버로 보내지 않는다.
const DEFAULT_SETTINGS: Settings = { consented: false, enabled: false };

// storage 값은 타입이 unknown이라, boolean이 아닌 값이 섞여 있어도 안전한 Settings로 맞춘다.
function normalize(value: unknown): Settings {
  const partial = (value ?? {}) as Partial<Settings>;
  return {
    consented: partial.consented === true,
    enabled: partial.enabled === true,
  };
}

// 현재 동의/ON-OFF 상태를 읽는다. 저장된 값이 없으면 기본값을 준다.
export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return normalize(stored[STORAGE_KEY]);
}

// 기존 설정에 일부 값만 덮어써서 저장한다. (예: enabled만 토글)
export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = normalize({ ...current, ...patch });
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

/** 초기화: OFF 및 재동의 필요 상태로 되돌린다. */
export async function resetSettings(): Promise<Settings> {
  await chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS };
}

// 분석 요청을 진행해도 되는지 판단하는 단일 기준. popup/background가 공용으로 쓴다.
export function isAnalysisAllowed(settings: Settings): boolean {
  return settings.consented && settings.enabled;
}

// 분석이 막혀 있으면 이유(code+문구)를, 허용되면 null을 돌려준다.
// isAnalysisAllowed와 기준을 공유해 popup/background가 다른 문구를 보여주지 않게 한다.
export function getAnalysisBlockedReason(settings: Settings): AnalyzeErrorInfo | null {
  if (isAnalysisAllowed(settings)) return null;
  return {
    code: settings.consented ? 'DISABLED' : 'NOT_CONSENTED',
    message: settings.consented
      ? '분석 기능이 꺼져 있습니다.'
      : '분석 기능 사용에 먼저 동의해주세요.',
  };
}
