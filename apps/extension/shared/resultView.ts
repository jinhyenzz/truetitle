import type { ClickbaitSignalLevel } from '@/shared/types';

// 5단계 낚시성 신호 색상 (1=매우 낮음 ~ 5=매우 높음). popup(entrypoints/popup/style.css의
// --meter-1..5)과 인라인 위젯(features/explanation/articleWidget.ts의 --tt-sig-1..5) 양쪽이
// 같은 값을 써야 하므로 여기를 단일 출처로 둔다. articleWidget.ts는 이 값을 직접 읽어 Shadow
// DOM 스타일을 생성하고, style.css는 별도 파일이라 이 값을 그대로 옮겨 적되 값이 바뀌면
// 여기부터 맞춰야 한다.
export const SIGNAL_COLORS_LIGHT: readonly string[] = [
  '#17a05e',
  '#7cb342',
  '#e8a117',
  '#ef6c1a',
  '#d92d20',
];

export const SIGNAL_COLORS_DARK: readonly string[] = [
  '#3ecf8e',
  '#8fd14f',
  '#ffc44d',
  '#ff9245',
  '#ff6b5e',
];

// 결과 카드의 "sig-N" CSS 클래스 이름. 등급별 색상 클래스를 고를 때 popup/articleWidget이
// 각자 문자열을 조합하지 않고 이 함수로 통일한다.
export function signalClass(level: ClickbaitSignalLevel): string {
  return `sig-${level}`;
}

// 점수 아래 보조 문구. "100점 기준 · 5단계 중 N단계"
export function scoreSubLabel(level: ClickbaitSignalLevel): string {
  return `100점 기준 · 5단계 중 ${level}단계`;
}

// 5단계 게이지의 aria-label.
export function meterAriaLabel(level: ClickbaitSignalLevel, signalLabel: string): string {
  return `낚시성 신호 5단계 중 ${level}단계: ${signalLabel}`;
}

// 서버 값이 0~100을 벗어나 오더라도(방어적으로) 진행률 바 너비가 범위를 넘지 않게 한다.
export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
