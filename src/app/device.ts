/**
 * 기기·설치 상태 판별. 화면은 이것으로 "홈 화면에 추가" 안내를 띄울지 정한다.
 * 전부 추정이다 — 브라우저는 "아이폰 사파리 탭"이라고 말해 주지 않는다. 틀려도 안내 한 줄이 더 뜨거나 안 뜰 뿐이다.
 */

/** 터치가 주 입력인 기기 (폰·태블릿) */
export function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches
}

/** 홈 화면에 추가해서 앱처럼 열렸는지 (안드로이드는 display-mode, 아이폰은 navigator.standalone) */
export function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

/** 아이폰·아이패드 (아이패드는 데스크톱 사파리인 척하므로 터치점 수로 가른다) */
export function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

const DISMISS_KEY = 'bird-journal:install-hint-dismissed'

/**
 * "홈 화면에 추가" 안내를 띄울지. 아이폰 사파리 탭으로 열었고 아직 닫은 적이 없을 때만.
 * 아이폰 사파리는 7일 동안 안 쓴 사이트의 저장소를 지우는데, 홈 화면에 추가하면 예외다 — 이 앱의 기록이 통째로 걸린 문제라 한 번은 말해야 한다.
 */
export function needsInstallHint(): boolean {
  if (!isIos() || isInstalled()) return false
  try { return localStorage.getItem(DISMISS_KEY) === null } catch { return true }
}

/** 안내를 닫았다고 기억한다. localStorage가 막혀 있으면 다음에 또 뜬다 (그 환경은 저장소도 못 믿으니 오히려 맞다) */
export function dismissInstallHint(): void {
  try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* 위 설명 */ }
}
