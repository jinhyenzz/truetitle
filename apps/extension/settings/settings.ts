import type { Settings } from '@/shared/types';

// chrome.storage.local에 저장할 때 쓰는 키. 하나의 객체로 묶어서 저장한다.
const STORAGE_KEY = 'trueTitleSettings';

// 확장을 처음 설치했을 때의 기본값. 동의 전 + OFF 상태이므로 이 상태에서는
// background가 어떤 분석 요청도 서버로 보내지 않는다.
const DEFAULT_SETTINGS: Settings = { consented: false, enabled: false };

// storage에서 읽어온 값은 타입이 unknown이라 그대로 믿지 않고,
// boolean이 아닌 값(undefined, 다른 타입 등)이 섞여 있어도 항상 안전한 Settings로 맞춰준다.
function normalize(value: unknown): Settings {
  const partial = (value ?? {}) as Partial<Settings>;
  return {
    consented: partial.consented === true,
    enabled: partial.enabled === true,
  };
}

// 현재 동의/ON-OFF 상태를 읽는다. 저장된 값이 없으면 기본값(둘 다 false)을 준다.
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

// 실제로 분석 요청을 진행해도 되는지 판단하는 단일 기준.
// popup과 background 양쪽에서 이 함수 하나로만 판단해서 기준이 어긋나지 않게 한다.
export function isAnalysisAllowed(settings: Settings): boolean {
  return settings.consented && settings.enabled;
}
