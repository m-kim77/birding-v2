import test from 'node:test'
import assert from 'node:assert/strict'
import { readShotForm, shotFact, shotFormOf, shotPatch, type ShotField } from '../src/features/records/shotEdit.ts'
import type { ShotInfo, Sighting } from '../src/types.ts'

/** 촬영 정보 여섯이 다 든 기록 하나. 카메라·렌즈 이름은 지어낸 것이다. 셔터 0.769초는 표기('1/1.3s')를 되읽으면 달라지는 값이다 */
const SHOT: ShotInfo = { cameraModel: 'CAM', lensModel: 'LENS', focalLength: 400, fNumber: 6.3, exposureTime: 0.769, iso: 1000 }

/** 촬영 정보 말고는 이 테스트와 상관없는 기록 */
function sighting(over: Partial<Sighting> = {}): Sighting {
  return {
    id: 'a', speciesKo: '박새', latin: 'Parus minor',
    capturedAt: '2026-09-21T21:48:17.250Z', capturedAtOffset: '+09:00',
    createdAt: '2026-09-22T10:00:00.000Z', updatedAt: '2026-09-22T10:00:00.000Z',
    place: '', lat: null, lng: null, locationSource: 'none',
    shot: { ...SHOT }, note: '', cropBox: null, detectorModel: null, tier: 1, stamps: [], sensitive: false,
    identify: 'done', fromSound: false,
    ...over,
  }
}

test('shotFormOf: 칸은 지금 값 — 셔터는 카메라 표기, 나머지 숫자는 그대로, 없는 항목은 빈칸', () => {
  assert.deepEqual(shotFormOf(SHOT), { camera: 'CAM', lens: 'LENS', focal: '400', fNumber: '6.3', exposure: '1/1.3s', iso: '1000' })
  assert.deepEqual(shotFormOf({}), { camera: '', lens: '', focal: '', fNumber: '', exposure: '', iso: '' })
})

test('아무것도 안 바꾸면 빈 변경 — 되읽으면 달라지는 셔터(0.769초 → 1/1.3s)에서도', () => {
  const s = sighting()
  assert.deepEqual(shotPatch(s, shotFormOf(s.shot)), {})
  // 빈 기록과 이미 고친 기록도 같다 — 건드리지 않는다
  const empty = sighting({ shot: {} })
  assert.deepEqual(shotPatch(empty, shotFormOf(empty.shot)), {})
  const edited = sighting({ shotEdited: true })
  assert.deepEqual(shotPatch(edited, shotFormOf(edited.shot)), {})
})

test('렌즈만 고치면 셔터·조리개 숫자는 저장된 그대로 (비트까지)', () => {
  const s = sighting()
  const patch = shotPatch(s, { ...shotFormOf(s.shot), lens: ' NEW LENS ' })
  assert.deepEqual(patch, { shot: { ...SHOT, lensModel: 'NEW LENS' }, shotEdited: true })
  assert.ok(Object.is(patch!.shot!.exposureTime, 0.769))
  assert.ok(Object.is(patch!.shot!.fNumber, 6.3))
  // 변경은 새 객체다 — 저장된 기록의 shot을 고쳐 쓰지 않는다
  assert.notEqual(patch!.shot, s.shot)
  assert.deepEqual(s.shot, SHOT)
})

test('셔터: 카메라 표기와 초를 받아 초 단위로 저장한다', () => {
  const s = sighting()
  const read = (exposure: string) => shotPatch(s, { ...shotFormOf(s.shot), exposure })!.shot!.exposureTime
  assert.equal(read('1/250'), 0.004)
  assert.equal(read('1/250s'), 0.004)
  assert.equal(read('2"'), 2)
  assert.equal(read('0.5'), 0.5)
})

test('셔터: 끝의 s만 지우거나 같은 표기를 다시 적으면 변경이 없다 — 저장된 숫자 그대로', () => {
  const s = sighting()
  assert.deepEqual(shotPatch(s, { ...shotFormOf(s.shot), exposure: '1/1.3' }), {})
  assert.deepEqual(shotPatch(s, { ...shotFormOf(s.shot), exposure: ' 1/1.3s ' }), {})
})

test('칸을 비우면 그 항목의 키가 없어진다 — undefined 값을 남기지 않는다', () => {
  const s = sighting()
  const patch = shotPatch(s, { ...shotFormOf(s.shot), iso: '', camera: '   ' })!
  assert.ok(!('iso' in patch.shot!) && !('cameraModel' in patch.shot!))
  assert.ok(Object.values(patch.shot!).every((v) => v !== undefined))
  assert.equal(patch.shotEdited, true)
  // 다 비우면 빈 촬영 정보
  const cleared = shotPatch(s, { camera: '', lens: '', focal: '', fNumber: '', exposure: '', iso: '' })!
  assert.deepEqual(cleared.shot, {})
})

test('읽을 수 없는 칸이 있으면 null — 어느 칸인지 bad에 적는다', () => {
  const s = sighting()
  const cases: Array<[ShotField, string]> = [
    ['exposure', 'abc'], ['exposure', '0'], ['exposure', '-1'], ['exposure', '1/0'],
    ['iso', '100.5'], ['iso', '0'], ['iso', '많이'],
    ['focal', 'abc'], ['focal', '-400'], ['focal', '1e3'],
    ['fNumber', '0'], ['fNumber', 'f/'],
  ]
  for (const [field, text] of cases) {
    const form = { ...shotFormOf(s.shot), [field]: text }
    assert.equal(shotPatch(s, form), null, `${field}: ${text}`)
    assert.deepEqual(readShotForm(s.shot, form).bad, [field], `${field}: ${text}`)
  }
  // 여러 칸이면 화면의 칸 순서대로
  assert.deepEqual(readShotForm(s.shot, { ...shotFormOf(s.shot), iso: 'x', focal: 'x' }).bad, ['focal', 'iso'])
})

test('화면 표기의 단위를 붙여 적어도 읽는다 — 400mm · f/6.3 · ISO 1000', () => {
  const empty = sighting({ shot: {} })
  const patch = shotPatch(empty, { camera: '', lens: '', focal: '400mm', fNumber: 'f/6.3', exposure: '1/200s', iso: 'ISO 1000' })
  assert.deepEqual(patch, { shot: { focalLength: 400, fNumber: 6.3, exposureTime: 0.005, iso: 1000 }, shotEdited: true })
})

test('카메라·렌즈는 앞뒤 공백만 다르면 바뀐 것이 아니다', () => {
  const s = sighting()
  assert.deepEqual(shotPatch(s, { ...shotFormOf(s.shot), camera: '  CAM ', lens: 'LENS\t' }), {})
})

test('빈 촬영 정보에 값을 넣으면 그 값과 직접 고친 표시', () => {
  const empty = sighting({ shot: {} })
  assert.deepEqual(shotPatch(empty, { ...shotFormOf({}), camera: 'CAM', lens: 'LENS' }), { shot: { cameraModel: 'CAM', lensModel: 'LENS' }, shotEdited: true })
})

test('고쳤다가 같은 값으로 되돌리면 빈 변경', () => {
  const s = sighting()
  assert.deepEqual(shotPatch(s, { ...shotFormOf(s.shot), focal: '400.0', fNumber: '6.30' }), {})
})

test('저장된 값이 틀린 모양(ISO 0)이어도 손대지 않았으면 저장을 막지 않고 그대로 둔다', () => {
  const s = sighting({ shot: { iso: 0, exposureTime: -1 } })
  const patch = shotPatch(s, { ...shotFormOf(s.shot), lens: 'LENS' })
  assert.deepEqual(patch, { shot: { lensModel: 'LENS', iso: 0, exposureTime: -1 }, shotEdited: true })
})

test('shotFact: 윗줄은 카메라와 숫자, 아랫줄은 렌즈 이름', () => {
  assert.deepEqual(shotFact({ shot: SHOT }), { main: 'CAM · 400mm · f/6.3 · 1/1.3s · ISO 1000', sub: 'LENS' })
  assert.deepEqual(shotFact({ shot: SHOT, shotEdited: true }), { main: 'CAM · 400mm · f/6.3 · 1/1.3s · ISO 1000', sub: 'LENS · 직접 고친 촬영 정보입니다' })
})

test('shotFact: 카메라만·렌즈만 있어도 줄이 있다 — 렌즈만이면 렌즈 이름이 윗줄로', () => {
  assert.deepEqual(shotFact({ shot: { cameraModel: 'CAM' } }), { main: 'CAM', sub: '' })
  assert.deepEqual(shotFact({ shot: { lensModel: 'LENS' } }), { main: 'LENS', sub: '' })
  assert.deepEqual(shotFact({ shot: { lensModel: 'LENS' }, shotEdited: true }), { main: 'LENS', sub: '직접 고친 촬영 정보입니다' })
})

test('shotFact: 보일 것이 없으면 null — 고친 표시만 있거나 틀린 숫자(0)만 있어도', () => {
  assert.equal(shotFact({ shot: {} }), null)
  assert.equal(shotFact({ shot: {}, shotEdited: true }), null)
  assert.equal(shotFact({ shot: { iso: 0, cameraModel: '  ' } }), null)
})
