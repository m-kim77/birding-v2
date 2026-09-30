import test from 'node:test'
import assert from 'node:assert/strict'
import { backupStatusText, importResultText } from '../src/features/settings/backupText.ts'

/** 지금 — 날짜 경계는 브라우저(여기서는 node) 시간대라 로컬 시각으로 만든다 (when.test.ts와 같다) */
const NOW = new Date(2026, 8, 22, 9, 0)
/** 지금보다 n일 전 정오 (UTC ISO) */
const daysBefore = (n: number) => new Date(2026, 8, 22 - n, 12, 0).toISOString()

test('backupStatusText: 백업한 적이 없으면 안 된 기록 수와 상관없이 "아직 백업한 적 없음"', () => {
  assert.equal(backupStatusText(0, 0, '', NOW), '아직 백업한 적 없음 · 전체 0건')
  assert.equal(backupStatusText(7, 7, '', NOW), '아직 백업한 적 없음 · 전체 7건', '안 된 기록이 있어도 "백업 안 된 기록 N건"으로 바뀌지 않는다')
})

test('backupStatusText: 마지막 백업 시각을 못 읽으면 백업한 적 없는 것과 같다', () => {
  assert.equal(backupStatusText(2, 5, 'garbage', NOW), '아직 백업한 적 없음 · 전체 5건')
})

test('backupStatusText: 백업 뒤에 바뀐 기록이 없으면 "모든 기록이 백업돼 있습니다"', () => {
  assert.equal(backupStatusText(0, 12, daysBefore(0), NOW), '모든 기록이 백업돼 있습니다 · 전체 12건 · 마지막 백업 오늘')
})

test('backupStatusText: 백업 뒤에 바뀐 기록이 있으면 그 수를 먼저 적는다', () => {
  assert.equal(backupStatusText(3, 12, daysBefore(1), NOW), '백업 안 된 기록 3건 · 전체 12건 · 마지막 백업 어제')
  assert.equal(backupStatusText(1, 1, daysBefore(10), NOW), '백업 안 된 기록 1건 · 전체 1건 · 마지막 백업 10일 전')
})

test('backupStatusText: 기기 시계가 뒤로 가서 마지막 백업이 미래여도 "오늘" (daysAgoOf)', () => {
  assert.equal(backupStatusText(0, 4, daysBefore(-3), NOW), '모든 기록이 백업돼 있습니다 · 전체 4건 · 마지막 백업 오늘')
})

test('importResultText: 새 기록·갱신·그대로 둔 기록 수', () => {
  const plan = { add: [1, 2, 3], update: [1], kept: 8, skipped: 0 }
  assert.equal(importResultText(plan), '불러왔습니다 — 새 기록 3건, 갱신 1건, 그대로 둔 기록 8건')
})

test('importResultText: 건너뛴 기록이 있으면 말없이 넘기지 않고 끝에 적는다', () => {
  const plan = { add: [], update: [], kept: 5, skipped: 2 }
  assert.equal(importResultText(plan), '불러왔습니다 — 새 기록 0건, 갱신 0건, 그대로 둔 기록 5건 · 읽지 못한 기록 2건은 건너뛰었습니다')
})

test('importResultText: 건너뛴 것이 없으면 그 말은 붙이지 않는다 (0건이라고 적지 않는다)', () => {
  assert.doesNotMatch(importResultText({ add: [], update: [], kept: 0, skipped: 0 }), /건너뛰/)
})
