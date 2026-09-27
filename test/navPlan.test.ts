import test from 'node:test'
import assert from 'node:assert/strict'
import { HOME, NAV_MARK, planLeave, planOpen, planReplace, planTab, readEntry, screenEntry } from '../src/app/navPlan.ts'
import { isRoute } from '../src/app/routes.ts'

const records = screenEntry(HOME, 0)
const dex = screenEntry({ name: 'dex' }, 1)
const detailOnRecords = screenEntry({ name: 'detail', id: 'a' }, 1)
const detailOnDex = screenEntry({ name: 'detail', id: 'a' }, 2)

test('isRoute: 아는 화면만, 상세는 id가 있어야', () => {
  assert.equal(isRoute({ name: 'records' }), true)
  assert.equal(isRoute({ name: 'detail', id: 'x1' }), true)
  assert.equal(isRoute({ name: 'detail' }), false, 'id 없는 상세')
  assert.equal(isRoute({ name: 'detail', id: '' }), false)
  assert.equal(isRoute({ name: 'sound' }), false, '없는 화면 (옛 판·새 판)')
  assert.equal(isRoute(null), false)
  assert.equal(isRoute('records'), false)
})

test('readEntry: 이 앱이 쓴 칸만 읽고, 모양이 틀리면 null', () => {
  assert.deepEqual(readEntry(detailOnDex), detailOnDex)
  assert.equal(readEntry(null), null, '처음 연 칸 (state 없음)')
  assert.equal(readEntry({ route: HOME, depth: 0 }), null, '표시 없음 — 다른 페이지의 값')
  assert.equal(readEntry({ mark: NAV_MARK, route: { name: 'nope' }, depth: 0 }), null)
  assert.equal(readEntry({ mark: NAV_MARK, route: HOME, depth: -1 }), null)
  assert.equal(readEntry({ mark: NAV_MARK, route: HOME, depth: 1.5 }), null)
  assert.equal(readEntry({ mark: NAV_MARK, route: HOME }), null, 'depth 없음')
})

test('readEntry: 모르는 키는 떨군다 — 칸에서 읽은 값을 그대로 믿지 않는다', () => {
  assert.deepEqual(readEntry({ ...dex, extra: 1 }), dex)
})

test('planOpen: 화면을 열면 한 칸 쌓는다', () => {
  assert.deepEqual(planOpen(records, { name: 'detail', id: 'a' }), { kind: 'push', entry: detailOnRecords })
  assert.deepEqual(planOpen(dex, { name: 'detail', id: 'a' }), { kind: 'push', entry: detailOnDex })
})

test('planReplace: 저장 직후 완료 — 기록하기 칸을 상세로 바꿔 끼운다 (칸 수 그대로)', () => {
  const recordFlow = screenEntry({ name: 'record' }, 2)
  assert.deepEqual(planReplace(recordFlow, { name: 'detail', id: 'a' }), { kind: 'replace', entry: screenEntry({ name: 'detail', id: 'a' }, 2) })
})

test('planLeave: 한 칸 뒤로, 맨 아래 일지에서는 할 일 없음', () => {
  assert.deepEqual(planLeave(detailOnDex), { kind: 'go', delta: -1 })
  assert.deepEqual(planLeave(records), { kind: 'none' })
})

test('planLeave: 맨 아래가 일지가 아니면(정상 흐름엔 없다) 일지로 바꿔 끼운다 — 뒤로가 먹통이 되지 않게', () => {
  assert.deepEqual(planLeave(screenEntry({ name: 'detail', id: 'a' }, 0)), { kind: 'replace', entry: records })
})

test('planTab: 일지 위에 탭은 하나만 — 쌓기 / 바꿔 끼우기 / 그대로', () => {
  assert.deepEqual(planTab(records, 'dex'), { kind: 'push', entry: dex })
  assert.deepEqual(planTab(dex, 'map'), { kind: 'replace', entry: screenEntry({ name: 'map' }, 1) })
  assert.deepEqual(planTab(dex, 'dex'), { kind: 'none' }, '이미 그 탭')
  assert.deepEqual(planTab(detailOnRecords, 'settings'), { kind: 'replace', entry: screenEntry({ name: 'settings' }, 1) }, '일지에서 연 상세 → 탭')
})

test('planTab: 더 위에서 누르면 depth 1까지 걷고 다시 계획한다', () => {
  assert.deepEqual(planTab(detailOnDex, 'map'), { kind: 'go', delta: -1, again: true })
  assert.deepEqual(planTab(screenEntry({ name: 'settings' }, 4), 'dex'), { kind: 'go', delta: -3, again: true })
  // 도착한 칸(depth 1)에서 다시 계획하면 바꿔 끼운다
  assert.deepEqual(planTab(dex, 'map').kind, 'replace')
})

test('planTab: 일지 탭은 맨 아래 칸까지 걷는다 — 거기서 뒤로 한 번이면 앱을 떠난다', () => {
  assert.deepEqual(planTab(detailOnDex, 'records'), { kind: 'go', delta: -2 })
  assert.deepEqual(planTab(records, 'records'), { kind: 'none' })
})
