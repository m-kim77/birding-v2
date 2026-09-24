import test from 'node:test'
import assert from 'node:assert/strict'
import { TRACK_REFRESH_DAYS, dismissTrackNudge, loadTrackNudgeDismissed, needsTrackRefresh } from '../src/features/tracks/refreshNudge.ts'

const NOW = new Date('2026-09-22T12:00:00.000Z')
/** NOW에서 d일 전의 UTC ISO. 음수면 미래 */
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

test('needsTrackRefresh: 60일 경계 — 59일·정확히 60일은 아직, 60일을 넘어서면 알린다', () => {
  assert.equal(needsTrackRefresh(daysAgo(59), null, NOW), false)
  assert.equal(needsTrackRefresh(daysAgo(TRACK_REFRESH_DAYS), null, NOW), false, '정확히 60일은 아직 아니다')
  assert.equal(needsTrackRefresh(new Date(NOW.getTime() - TRACK_REFRESH_DAYS * 86_400_000 - 1000).toISOString(), null, NOW), true)
  assert.equal(needsTrackRefresh(daysAgo(61), null, NOW), true)
})

test('needsTrackRefresh: 못 읽는 시각은 알리지 않는다 — 편의 기능이라 조용한 쪽이 안전', () => {
  assert.equal(needsTrackRefresh('', null, NOW), false)
  assert.equal(needsTrackRefresh('두 달 전', null, NOW), false)
})

test('needsTrackRefresh: 닫은 넣기(importedAt이 같음)는 안 뜨고, 다른 넣기에 대해 닫았던 것이면 다시 뜬다', () => {
  const at = daysAgo(90)
  assert.equal(needsTrackRefresh(at, at, NOW), false)
  assert.equal(needsTrackRefresh(at, daysAgo(200), NOW), true, '옛 넣기를 닫은 기억은 새 넣기에 안 먹는다')
  assert.equal(needsTrackRefresh(at, null, NOW), true)
  assert.equal(needsTrackRefresh(daysAgo(10), daysAgo(200), NOW), false, '닫았든 말든 60일 안쪽이면 안 뜬다')
})

test('needsTrackRefresh: 미래 시각(기기 시계가 뒤로 감)은 알리지 않는다', () => {
  assert.equal(needsTrackRefresh(daysAgo(-1), null, NOW), false)
  assert.equal(needsTrackRefresh(daysAgo(-100), null, NOW), false)
})

/** 브라우저 localStorage 흉내. blocked면 막힌 브라우저(사생활 모드 등)처럼 던진다 */
const env = { blocked: false, store: new Map<string, string>() }
// node의 localStorage는 플래그 없이는 undefined를 주는 getter라 대입 대신 defineProperty로 덮는다
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => { if (env.blocked) throw new Error('blocked'); return env.store.get(k) ?? null },
    setItem: (k: string, v: string) => { if (env.blocked) throw new Error('blocked'); env.store.set(k, v) },
  },
})

test('loadTrackNudgeDismissed/dismissTrackNudge: 닫은 넣기의 시각을 기억하고, 없으면 null', () => {
  env.store.clear(); env.blocked = false
  assert.equal(loadTrackNudgeDismissed(), null)
  const at = daysAgo(90)
  dismissTrackNudge(at)
  assert.equal(loadTrackNudgeDismissed(), at)
  assert.equal(needsTrackRefresh(at, loadTrackNudgeDismissed(), NOW), false, '닫은 뒤에는 안 뜬다')
})

test('loadTrackNudgeDismissed/dismissTrackNudge: localStorage가 막혀 있으면 던지지 않고 null — 다음에 또 뜬다', () => {
  env.store.clear(); env.blocked = true
  assert.doesNotThrow(() => dismissTrackNudge(daysAgo(90)))
  assert.equal(loadTrackNudgeDismissed(), null)
  assert.equal(needsTrackRefresh(daysAgo(90), loadTrackNudgeDismissed(), NOW), true)
})
