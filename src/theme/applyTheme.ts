import { DEFAULT_CHOICE, THEME_CHOICES, THEMES, type ThemeDef, type ThemeTokens } from './themes'

const STORAGE_KEY = 'bird-journal-design:theme'

/**
 * 토큰 키를 CSS 변수 이름으로 바꾼다. `bgCard` → `--bg-card`, `text1` → `--text-1`.
 */
export function tokenVarName(key: string): string {
  return '--' + key.replace(/([A-Z])/g, '-$1').replace(/(\d+)/g, '-$1').toLowerCase()
}

/**
 * 선택지 id와 기기의 다크 설정으로 실제 적용할 테마를 고른다.
 * 모르는 id가 오면 기본 테마로 떨어진다 (저장된 값이 옛 버전의 것일 수 있다).
 */
export function resolveTheme(choiceId: string, prefersDark: boolean): ThemeDef {
  const choice = THEME_CHOICES.find((c) => c.id === choiceId) ?? THEME_CHOICES.find((c) => c.id === DEFAULT_CHOICE)!
  const themeId = prefersDark ? choice.dark : choice.light
  return THEMES.find((t) => t.id === themeId) ?? THEMES[0]
}

/**
 * 테마의 토큰을 요소의 CSS 변수로 내려보낸다.
 * 컴포넌트는 이 변수만 읽는다 — 어떤 테마가 적용됐는지는 알지 못한다.
 */
export function applyTokens(el: HTMLElement, tokens: ThemeTokens): void {
  for (const [key, value] of Object.entries(tokens)) el.style.setProperty(tokenVarName(key), value)
}

/**
 * 저장해 둔 테마 선택을 읽는다.
 * 사생활 보호 모드 등으로 localStorage가 막혀 있으면 기본값을 돌려준다 (에러를 전파하지 않는다).
 */
export function loadChoice(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_CHOICE } catch { return DEFAULT_CHOICE }
}

/** 테마 선택을 저장한다. 저장에 실패해도 화면은 이미 바뀌었으므로 조용히 넘어간다 */
export function saveChoice(choiceId: string): void {
  try { localStorage.setItem(STORAGE_KEY, choiceId) } catch { /* 저장 못 해도 이번 세션에는 적용돼 있다 */ }
}
