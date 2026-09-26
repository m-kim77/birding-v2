import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSighting, normalizeStored } from '../src/data/normalizeSighting.ts'
import { BACKUP_FORMAT, buildJournal, parseJournal } from '../src/data/backupFormat.ts'
import type { Sighting } from '../src/types.ts'

/** 앱이 만드는 모양 그대로의 온전한 기록 */
const FULL: Sighting = {
  id: 'a', speciesKo: '물총새', latin: 'Alcedo atthis',
  capturedAt: '2026-08-02T02:47:00.000Z', capturedAtOffset: '+09:00',
  createdAt: '2026-08-02T03:00:00.000Z', updatedAt: '2026-08-03T00:00:00.000Z',
  place: '어느 개울', lat: 37.1, lng: 127.2, locationSource: 'exif',
  shot: { cameraModel: 'CAM', focalLength: 400, fNumber: 6.3, exposureTime: 0.005, iso: 1000 },
  note: '메모', cropBox: { x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.6 }, detectorModel: 'manual',
  tier: 1, cardStyle: { accent: '#3a7bd5', glow: true }, stamps: ['천연기념물'], sensitive: false,
  identify: 'done', dexNo: 2, fromSound: false,
  verdict: { kind: '확정', speciesKo: '물총새', latin: 'Alcedo atthis', summary: '요약', evidence: [{ text: '근거', source: '위키' }], others: [], model: 'm', references: [{ title: '물총새', url: 'https://ko.wikipedia.org/wiki/물총새' }] },
}

test('normalizeSighting: 온전한 기록은 그대로 (왕복)', () => {
  assert.deepEqual(normalizeSighting(structuredClone(FULL)), FULL)
})

test('normalizeSighting: 빈 칸은 기본값으로 채운다', () => {
  const s = normalizeSighting({ id: 'b', capturedAt: '2026-08-02T02:47:00.000Z' })!
  assert.equal(s.speciesKo, '')
  assert.equal(s.note, '')
  assert.deepEqual(s.shot, {})
  assert.deepEqual(s.stamps, [])
  assert.equal(s.sensitive, false)
  assert.equal(s.fromSound, false)
  assert.equal(s.lat, null)
  assert.equal(s.lng, null)
  assert.equal(s.locationSource, 'none')
  assert.equal(s.identify, 'none')
  assert.equal(s.tier, 1)
  assert.equal(s.createdAt, s.capturedAt)
  assert.equal(s.updatedAt, s.capturedAt)
  assert.ok(!('verdict' in s) && !('cardStyle' in s) && !('dexNo' in s))
})

test('normalizeSighting: id나 읽을 수 있는 시각이 없으면 버린다', () => {
  assert.equal(normalizeSighting({ capturedAt: '2026-08-02T02:47:00.000Z' }), null)
  assert.equal(normalizeSighting({ id: 'c' }), null)
  assert.equal(normalizeSighting({ id: 'c', capturedAt: '어제' }), null)
  assert.equal(normalizeSighting(null), null)
  assert.equal(normalizeSighting([1]), null)
})

test('normalizeSighting: 촬영 시각이 없으면 기록한 시각으로', () => {
  assert.equal(normalizeSighting({ id: 'd', createdAt: '2026-08-02T03:00:00.000Z' })!.capturedAt, '2026-08-02T03:00:00.000Z')
})

test('normalizeSighting: 모양이 틀린 선택 필드는 뗀다', () => {
  const s = normalizeSighting({ ...FULL, verdict: { kind: '아마도', speciesKo: '물총새' }, cardStyle: { accent: 'blue' }, cropBox: { x1: 2 }, dexNo: -1, lat: 37, lng: '127' })!
  assert.ok(!('verdict' in s) && !('cardStyle' in s) && !('dexNo' in s))
  assert.equal(s.cropBox, null)
  assert.equal(s.lat, null)
  assert.equal(s.lng, null)
})

test('normalizeSighting: 판정의 근거·후보는 모양이 맞는 것만, references가 없던 옛 판정은 없는 채로', () => {
  const v = normalizeSighting({ ...FULL, verdict: { kind: '좁힘', latin: 'Alcedo atthis', evidence: [{ text: '근거' }, 'x', { source: '글 없음' }], others: ['물총새', 3] } })!.verdict!
  assert.deepEqual(v.evidence, [{ text: '근거', source: '' }])
  assert.deepEqual(v.others, ['물총새'])
  assert.ok(!('references' in v))
})

test('normalizeSighting: 모르는 키는 남긴다 (가산 확장)', () => {
  assert.equal((normalizeSighting({ ...FULL, futureKey: 1 }) as unknown as Record<string, unknown>).futureKey, 1)
})

test('normalizeStored: 시각이 하나도 없는 기기 기록도 버리지 않는다', () => {
  const s = normalizeStored({ id: 'e', speciesKo: '참새' })!
  assert.equal(s.speciesKo, '참새')
  assert.equal(s.capturedAt, '1970-01-01T00:00:00.000Z')
  assert.equal(normalizeStored('깨짐'), null)
})

test('parseJournal: 깨진 기록만 건너뛰고 수를 준다, 같은 id는 한 번만', () => {
  const j = { format: BACKUP_FORMAT, version: 1, exportedAt: 'x', sightings: [FULL, { id: 'no-time' }, { ...FULL, id: 'b' }, 'x', FULL] }
  const parsed = parseJournal(JSON.stringify(j))
  assert.deepEqual(parsed.sightings.map((s) => s.id), ['a', 'b'])
  assert.equal(parsed.skipped, 3)
})

test('parseJournal: 옛 백업 모양(cardStyle·dexNo·references 없음, tier만)도 읽는다', () => {
  const { cardStyle: _c, dexNo: _d, ...old } = FULL
  const oldV = { ...old, tier: 3, verdict: { ...FULL.verdict!, references: undefined } }
  const parsed = parseJournal(JSON.stringify(buildJournal([oldV as Sighting], new Date('2026-09-01T00:00:00Z'))))
  assert.equal(parsed.skipped, 0)
  assert.equal(parsed.sightings[0].tier, 3)
  assert.ok(!('references' in parsed.sightings[0].verdict!))
})
