import test from 'node:test'
import assert from 'node:assert/strict'

/** 브라우저 전역 흉내. 이 파일에서만 쓴다 — 케이스마다 값을 바꿔 끼운다 */
const env = { ua: '', touchPoints: 0, standaloneMedia: false, standaloneNav: undefined as boolean | undefined, store: new Map<string, string>() }
;(globalThis as { window?: unknown }).window = {
  matchMedia: (q: string) => ({ matches: q.includes('display-mode') ? env.standaloneMedia : false }),
}
// node에는 navigator가 getter 전용 전역으로 이미 있다 — 대입은 안 되고 defineProperty로 덮는다
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    get userAgent() { return env.ua },
    get maxTouchPoints() { return env.touchPoints },
    get standalone() { return env.standaloneNav },
  },
})
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => env.store.get(k) ?? null,
  setItem: (k: string, v: string) => { env.store.set(k, v) },
}
const { dismissInstallHint, isInstalled, isIos, needsInstallHint } = await import('../src/app/device.ts')

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'

test('isIos: 아이폰은 UA로, 아이패드는 맥 UA + 터치점으로 가른다', () => {
  env.ua = IPHONE; env.touchPoints = 5
  assert.equal(isIos(), true)
  env.ua = IPAD_AS_MAC; env.touchPoints = 5
  assert.equal(isIos(), true)
  env.ua = IPAD_AS_MAC; env.touchPoints = 0
  assert.equal(isIos(), false, '진짜 맥은 아니다')
  env.ua = ANDROID; env.touchPoints = 5
  assert.equal(isIos(), false)
})

test('isInstalled: display-mode 또는 navigator.standalone', () => {
  env.standaloneMedia = false; env.standaloneNav = undefined
  assert.equal(isInstalled(), false)
  env.standaloneNav = true
  assert.equal(isInstalled(), true)
  env.standaloneNav = undefined; env.standaloneMedia = true
  assert.equal(isInstalled(), true)
})

test('needsInstallHint: 아이폰 사파리 탭에서만, 닫은 뒤에는 안 뜬다', () => {
  env.store.clear(); env.standaloneMedia = false; env.standaloneNav = undefined
  env.ua = ANDROID; env.touchPoints = 5
  assert.equal(needsInstallHint(), false, '안드로이드는 대상이 아니다')
  env.ua = IPHONE
  assert.equal(needsInstallHint(), true)
  env.standaloneNav = true
  assert.equal(needsInstallHint(), false, '홈 화면 앱으로 열었으면 안 뜬다')
  env.standaloneNav = undefined
  dismissInstallHint()
  assert.equal(needsInstallHint(), false, '닫으면 기억한다')
})
