import test from 'node:test'
import assert from 'node:assert/strict'
import { HOME, NAV_MARK, planDropStaleLayer, planLayer, planLeave, planOpen, planReplace, planTab, readEntry, screenEntry } from '../src/app/navPlan.ts'
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
  assert.equal(isRoute({ name: 'sound' }), true, '새소리 듣기 (작업 32)')
  assert.equal(isRoute({ name: 'quick' }), true, '사진 없이 기록 (작업 39)')
  assert.equal(isRoute({ name: 'home' }), false, '없는 화면 (옛 판·새 판)')
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

test('readEntry: 떠날 때 적어 둔 스크롤 위치를 읽고, 이상한 값은 버리기만 한다 (칸은 살린다)', () => {
  assert.deepEqual(readEntry({ ...records, scroll: 812.5 }), { ...records, scroll: 812.5 })
  assert.deepEqual(readEntry({ ...records, scroll: -3 }), records)
  assert.deepEqual(readEntry({ ...records, scroll: '812' }), records)
  assert.deepEqual(readEntry({ ...records, scroll: Number.NaN }), records)
})

test('새 칸에는 스크롤이 따라가지 않는다 — 새로 연 화면은 맨 위에서', () => {
  const scrolled = { ...records, scroll: 900 }
  const step = planOpen(scrolled, { name: 'detail', id: 'a' })
  assert.equal(step.kind === 'push' && 'scroll' in step.entry, false)
  const tab = planTab(scrolled, 'dex')
  assert.equal(tab.kind === 'push' && 'scroll' in tab.entry, false)
})

test('planOpen: 화면을 열면 한 칸 쌓는다', () => {
  assert.deepEqual(planOpen(records, { name: 'detail', id: 'a' }), { kind: 'push', entry: detailOnRecords })
  assert.deepEqual(planOpen(dex, { name: 'detail', id: 'a' }), { kind: 'push', entry: detailOnDex })
})

test('planReplace: 저장 직후 완료 — 기록하기 칸을 상세로 바꿔 끼운다 (칸 수 그대로)', () => {
  const recordFlow = screenEntry({ name: 'record' }, 2)
  assert.deepEqual(planReplace(recordFlow, { name: 'detail', id: 'a' }), { kind: 'replace', entry: screenEntry({ name: 'detail', id: 'a' }, 2) })
})

test('planReplace: 사진 없이 기록 — 새 기록 첫 화면 칸을 바꿔 끼우고, 저장 뒤 상세도 같은 칸에 (뒤로 = 기록하기를 시작한 화면)', () => {
  const recordFlow = screenEntry({ name: 'record' }, 1)
  const quick = screenEntry({ name: 'quick' }, 1)
  assert.deepEqual(planReplace(recordFlow, { name: 'quick' }), { kind: 'replace', entry: quick })
  assert.deepEqual(planReplace(quick, { name: 'detail', id: 'a' }), { kind: 'replace', entry: detailOnRecords })
  assert.deepEqual(planLeave(detailOnRecords), { kind: 'go', delta: -1 })
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

// 겹(시트·수정 모드): 도감(1) 위의 종 시트(2), 도감에서 연 상세(2) 위의 카드 시트(3)
const sheetOnDex = { ...screenEntry({ name: 'dex' }, 2), layer: 't1', base: 1 }
const sheetOnDetail = { ...screenEntry({ name: 'detail', id: 'a' }, 3), layer: 't2', base: 2 }

test('planLayer: 같은 화면의 겹 칸을 쌓는다 — 뒤로가기가 이 칸부터 걷는다', () => {
  assert.deepEqual(planLayer(dex, 't1'), { kind: 'push', entry: sheetOnDex })
  assert.deepEqual(planLayer(detailOnDex, 't2'), { kind: 'push', entry: sheetOnDetail })
})

test('readEntry: 겹 칸은 표와 밑 화면의 depth까지 읽고, 어긋나면 null', () => {
  assert.deepEqual(readEntry(sheetOnDex), sheetOnDex)
  assert.equal(readEntry({ ...sheetOnDex, base: 2 }), null, '밑 화면이 자기보다 위')
  assert.equal(readEntry({ ...sheetOnDex, base: undefined }), null, '밑 화면 모름')
  assert.equal(readEntry({ ...sheetOnDex, layer: 3 }), null)
})

test('planOpen: 겹 안에서 화면을 열면 겹 칸을 바꿔 끼운다 — 도감 시트 → 기록 → 뒤로 = 도감', () => {
  assert.deepEqual(planOpen(sheetOnDex, { name: 'detail', id: 'a' }), { kind: 'replace', entry: detailOnDex })
})

test('planLeave: 겹이 열린 채 떠나면 겹 칸까지 걷는다 — 수정 중 삭제·수정 중 뒤로 화살표', () => {
  assert.deepEqual(planLeave(sheetOnDetail), { kind: 'go', delta: -2 })
  assert.deepEqual(planLeave(sheetOnDex), { kind: 'go', delta: -2 })
  const sheetOnHome = { ...screenEntry(HOME, 1), layer: 't3', base: 0 }
  assert.deepEqual(planLeave(sheetOnHome), { kind: 'go', delta: -1 }, '일지 위의 겹은 겹만 걷는다')
})

test('planTab: 겹이 열려 있어도 탭 규칙 그대로 — 겹 칸도 함께 걷힌다', () => {
  assert.deepEqual(planTab(sheetOnDex, 'map'), { kind: 'go', delta: -1, again: true })
  assert.deepEqual(planTab(sheetOnDex, 'dex'), { kind: 'go', delta: -1, again: true }, '같은 탭을 누르면 시트가 닫힌다')
  assert.deepEqual(planTab(sheetOnDetail, 'records'), { kind: 'go', delta: -3 })
})

test('planDropStaleLayer: 새로고침 전에 열려 있던 겹의 칸은 걷는다, 화면 칸이면 할 일 없음', () => {
  assert.deepEqual(planDropStaleLayer(sheetOnDetail), { kind: 'go', delta: -1 })
  assert.deepEqual(planDropStaleLayer(detailOnDex), { kind: 'none' })
})
