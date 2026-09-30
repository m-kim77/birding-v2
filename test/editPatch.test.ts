import test from 'node:test'
import assert from 'node:assert/strict'
import { editPatch, formOf, placeBefore, placeOf } from '../src/features/records/editPatch.ts'
import { browserOffsetFor } from '../src/lib/exif.ts'
import type { Sighting } from '../src/types.ts'

/** 수정한 시각 — 이름을 바꾸면 이름이 붙은 시각이 된다 */
const NOW = new Date('2026-09-27T03:00:00.000Z')

/** 이름·판정·위치·초 단위 시각이 다 든 기록 하나. 좌표는 서울 도심의 공개 지점이다 (실제 촬영지 아님) */
function sighting(over: Partial<Sighting> = {}): Sighting {
  return {
    id: 'a', speciesKo: '박새', latin: 'Parus minor',
    // 2026-09-22 06:48:17.250 KST
    capturedAt: '2026-09-21T21:48:17.250Z', capturedAtOffset: '+09:00',
    createdAt: '2026-09-22T10:00:00.000Z', updatedAt: '2026-09-22T10:00:00.000Z',
    place: '서울특별시 중구', lat: 37.5665, lng: 126.978, locationSource: 'exif',
    shot: {}, note: '두 마리', cropBox: null, detectorModel: null, tier: 1, stamps: [], sensitive: false,
    identify: 'done', fromSound: false, namedAt: '2026-09-22T10:00:00.000Z',
    verdict: { kind: '확정', speciesKo: '박새', latin: 'Parus minor', summary: '', evidence: [], others: [], model: 'm' },
    ...over,
  }
}

test('아무것도 안 바꾸면 빈 변경 — 저장된 초·오프셋·출처를 건드리지 않는다', () => {
  const s = sighting()
  assert.equal(formOf(s).time, '2026-09-22T06:48')
  assert.deepEqual(editPatch(s, formOf(s), NOW), {})
  // 오프셋을 모르는 기록도 같다 — 처음 값 그대로면 오프셋을 새로 붙이지 않는다
  const unknown = sighting({ capturedAtOffset: null })
  assert.deepEqual(editPatch(unknown, formOf(unknown), NOW), {})
})

test('메모만 고치면 메모만 — 입력한 글 그대로', () => {
  const s = sighting()
  assert.deepEqual(editPatch(s, { ...formOf(s), note: ' 세 마리 ' }, NOW), { note: ' 세 마리 ' })
})

test('이름을 바꾸면 학명은 표에서, AI 근거는 떼고, 이름이 붙은 시각은 지금으로 (도감 순서)', () => {
  const s = sighting()
  const patch = editPatch(s, { ...formOf(s), name: ' 쇠박새 ' }, NOW)
  assert.deepEqual(patch, { speciesKo: '쇠박새', latin: 'Poecile palustris', verdict: undefined, identify: 'done', namedAt: NOW.toISOString() })
  // 근거를 떼는 것은 키를 undefined로 덮어서다 — 저장소가 {...기록, ...변경}으로 합친다
  assert.ok(patch && 'verdict' in patch)
})

test('앞뒤 공백만 다르면 이름을 바꾼 것이 아니다 — 근거가 남는다', () => {
  const s = sighting()
  assert.deepEqual(editPatch(s, { ...formOf(s), name: ' 박새 ' }, NOW), {})
})

test('이름을 비우면 이름 미정으로 돌아간다', () => {
  const s = sighting()
  assert.deepEqual(editPatch(s, { ...formOf(s), name: '' }, NOW), { speciesKo: '', latin: '', verdict: undefined, identify: 'none', namedAt: undefined })
})

test('시각을 고치면 기록의 오프셋 그대로 다시 계산한다', () => {
  const s = sighting()
  assert.deepEqual(editPatch(s, { ...formOf(s), time: '2026-08-15T07:05' }, NOW), { capturedAt: '2026-08-14T22:05:00.000Z', capturedAtOffset: '+09:00' })
  // 해외 기록은 그곳 시각으로 읽는다
  const ny = sighting({ capturedAt: '2026-08-02T15:47:39.734Z', capturedAtOffset: '-04:00' })
  assert.deepEqual(editPatch(ny, { ...formOf(ny), time: '2026-08-02T12:00' }, NOW), { capturedAt: '2026-08-02T16:00:00.000Z', capturedAtOffset: '-04:00' })
})

test('오프셋을 모르는 기록의 시각을 고치면 그날의 브라우저 오프셋을 붙인다', () => {
  const s = sighting({ capturedAtOffset: null })
  const patch = editPatch(s, { ...formOf(s), time: '2026-08-15T07:05' }, NOW)
  assert.equal(patch?.capturedAtOffset, browserOffsetFor(2026, 8, 15))
})

test('시각을 읽을 수 없으면 null — 다른 칸을 고쳤어도 저장하지 않는다', () => {
  const s = sighting()
  assert.equal(editPatch(s, { ...formOf(s), note: '고침', time: '' }, NOW), null)
  assert.equal(editPatch(s, { ...formOf(s), time: '2026-02-30T10:00' }, NOW), null)
})

test('위치를 고치면 좌표·이름·출처를 함께 — 이름만 늦게 와도 바뀐 것이다', () => {
  const s = sighting()
  const picked = { lat: 35.1796, lng: 129.0756, name: '', source: 'manual' as const }
  assert.deepEqual(editPatch(s, { ...formOf(s), place: picked }, NOW), { place: '', lat: 35.1796, lng: 129.0756, locationSource: 'manual' })
  assert.deepEqual(editPatch(s, { ...formOf(s), place: { ...placeOf(s), name: '서울특별시 중구 명동' } }, NOW),
    { place: '서울특별시 중구 명동', lat: 37.5665, lng: 126.978, locationSource: 'exif' })
  // 위치 없던 기록에 위치를 넣는다
  const none = sighting({ place: '', lat: null, lng: null, locationSource: 'none' })
  assert.deepEqual(editPatch(none, { ...formOf(none), place: picked }, NOW), { place: '', lat: 35.1796, lng: 129.0756, locationSource: 'manual' })
})

test('placeBefore: 이 기록보다 먼저(같은 순간 포함) 찍은 기록 중 가장 늦은 것 — 자기와 위치 없는 기록은 뺀다', () => {
  const at = (id: string, capturedAt: string, over: Partial<Sighting> = {}) => sighting({ id, capturedAt, place: id, ...over })
  const list = [
    at('self', '2026-09-22T00:00:00.000Z'),
    at('older', '2026-09-20T00:00:00.000Z'),
    at('closest', '2026-09-21T00:00:00.000Z'),
    at('no-place', '2026-09-21T12:00:00.000Z', { lat: null, lng: null }),
    at('later', '2026-09-23T00:00:00.000Z'),
    // 같은 순간을 '+09:00' 글자로 적은 옛 백업 기록 — 글자로 견주면 순서가 틀린다
    at('same-moment', '2026-09-22T09:00:00+09:00'),
  ]
  assert.deepEqual(placeBefore(list, 'self', '2026-09-22T00:00:00.000Z'), { lat: 37.5665, lng: 126.978, name: 'same-moment', source: 'manual' })
  assert.equal(placeBefore(list.slice(0, 5), 'self', '2026-09-22T00:00:00.000Z')?.name, 'closest')
  // 고치는 중인 시각을 기준으로 — 시각을 앞으로 옮기면 그 앞의 기록
  assert.equal(placeBefore(list, 'self', '2026-09-20T12:00:00.000Z')?.name, 'older')
  assert.equal(placeBefore(list, 'self', '2026-09-19T00:00:00.000Z'), null)
  assert.equal(placeBefore(list, 'self', 'garbage'), null)
})

test('개체 수: 안 건드리면 빈 변경(세지 않은 기록 포함), 고치면 그 수만, 비우면 떼어 낸다 (작업 39)', () => {
  const none = sighting()
  assert.equal(formOf(none).count, '')
  assert.deepEqual(editPatch(none, formOf(none), NOW), {}, '빈칸과 키 없음은 같은 것 — 저장만 눌러도 updatedAt이 바뀌면 안 된다')
  assert.deepEqual(editPatch(none, { ...formOf(none), count: '4' }, NOW), { count: 4 })
  const three = sighting({ count: 3 })
  assert.equal(formOf(three).count, '3')
  assert.deepEqual(editPatch(three, formOf(three), NOW), {})
  assert.deepEqual(editPatch(three, { ...formOf(three), count: ' 3 ' }, NOW), {}, '앞뒤 공백만 달라도 같은 수')
  assert.deepEqual(editPatch(three, { ...formOf(three), count: '12' }, NOW), { count: 12 })
  const cleared = editPatch(three, { ...formOf(three), count: '' }, NOW)
  assert.deepEqual(cleared, { count: undefined })
  // 떼는 것은 키를 undefined로 덮어서다 — 저장소가 {...기록, ...변경}으로 합친다
  assert.ok(cleared && 'count' in cleared)
  assert.deepEqual(editPatch(three, { ...formOf(three), count: '2.5' }, NOW), { count: undefined }, '개체 수로 읽히지 않으면 세지 않음')
})
