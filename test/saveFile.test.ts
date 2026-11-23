import test from 'node:test'
import assert from 'node:assert/strict'

/** 브라우저 전역 흉내. 이 파일에서만 쓴다 — 케이스마다 값을 바꿔 끼운다 */
const env = {
  touch: true,
  /** undefined면 그 브라우저에 navigator.canShare가 없다 (안드로이드 Firefox 등) */
  canShare: undefined as boolean | undefined,
  /** 공유 창이 던질 오류의 이름. null이면 공유가 끝난다 */
  shareError: null as string | null,
  shares: 0,
  clicks: 0,
}
;(globalThis as { window?: unknown }).window = {
  matchMedia: () => ({ matches: env.touch }),
  // 주소 해제는 10초 뒤라 시험에서는 돌리지 않는다
  setTimeout: () => 0,
}
// node에는 navigator가 getter 전용 전역으로 이미 있다 — 대입은 안 되고 defineProperty로 덮는다
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    get canShare() { return env.canShare === undefined ? undefined : () => env.canShare },
    share: async () => {
      env.shares += 1
      if (env.shareError) throw Object.assign(new Error('share'), { name: env.shareError })
    },
  },
})
;(globalThis as { document?: unknown }).document = {
  createElement: () => ({ click: () => { env.clicks += 1 } }),
}
const { saveFile } = await import('../src/features/dex/saveFile.ts')

const png = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })

/** 케이스마다 기기 모양을 정하고 센 값을 비운다 */
function device(o: { touch: boolean; canShare: boolean | undefined; shareError?: string | null }) {
  Object.assign(env, { shareError: null, shares: 0, clicks: 0 }, o)
}

test('saveFile: 파일 공유가 없는 터치 브라우저는 처음부터 내려받기 — 공유가 실패한 것이 아니다', async () => {
  device({ touch: true, canShare: undefined })
  assert.equal(await saveFile(png(), 'a.png'), 'downloaded')
  device({ touch: true, canShare: false })
  assert.equal(await saveFile(png(), 'a.png'), 'downloaded')
  assert.equal(env.shares, 0)
  assert.equal(env.clicks, 1)
})

test('saveFile: PC는 공유 창을 열지 않고 내려받기', async () => {
  device({ touch: false, canShare: true })
  assert.equal(await saveFile(png(), 'a.png'), 'downloaded')
  assert.equal(env.shares, 0)
})

test('saveFile: 공유 창이 거절되면(누름의 유효 시간이 지남) 내려받기로 떨어진 것을 따로 알린다', async () => {
  device({ touch: true, canShare: true, shareError: 'NotAllowedError' })
  assert.equal(await saveFile(png(), 'a.png'), 'downloaded-after-share')
  assert.equal(env.shares, 1)
  assert.equal(env.clicks, 1)
})

test('saveFile: 공유 창을 닫으면 cancelled, 끝나면 shared — 내려받지 않는다', async () => {
  device({ touch: true, canShare: true, shareError: 'AbortError' })
  assert.equal(await saveFile(png(), 'a.png'), 'cancelled')
  device({ touch: true, canShare: true })
  assert.equal(await saveFile(png(), 'a.png'), 'shared')
  assert.equal(env.clicks, 0)
})
