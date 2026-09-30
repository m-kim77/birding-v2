import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CLEARED_FILE, clearDecision, clearedAtOf, decodeMonth, digestOf, encodeMonth, groupByMonth, localMonthsOf, monthFileName, monthKeyOf,
  monthTags, planDownload, planUpload, remoteMonthOf, type LocalMonth, type RemoteMonth,
} from '../src/data/syncTracksPlan.ts'
import { mergeSorted, pointKey, type TrackPoint } from '../src/lib/tracklog/points.ts'

// 점은 모두 식으로 만든 가짜다 — 위도·경도 0 근처(바다 한가운데)라 실제 장소일 수 없다. 실제 타임라인·픽스처는 쓰지 않는다.
const T0 = Date.UTC(2026, 0, 1)
const HOUR = 3_600_000
/** i번째 가짜 점 — 12시간 간격이라 i = 0~61은 1월, 62~ 는 2월 */
const pt = (i: number, accuracy: number | null = 5): TrackPoint => ({ t: T0 + i * 12 * HOUR, source: 'GPS', lat: i * 0.0001, lng: i * 0.0001, accuracy })
const range = (from: number, to: number, accuracy?: number | null) => Array.from({ length: to - from }, (_, k) => pt(from + k, accuracy))
const keysOf = (points: TrackPoint[]) => points.map(pointKey).sort()
const rm = (month: string, digest: string, fileId = `f-${month}`): RemoteMonth => ({ month, fileId, digest, count: 1, importedAt: '2026-03-01T00:00:00.000Z' })

test('monthKeyOf: UTC 달 경계 — 말일 23:59:59.999는 그달, 1일 00:00은 다음 달', () => {
  assert.equal(monthKeyOf(Date.UTC(2026, 0, 31, 23, 59, 59, 999)), '2026-01')
  assert.equal(monthKeyOf(Date.UTC(2026, 1, 1)), '2026-02')
  assert.equal(monthKeyOf(Date.UTC(2025, 11, 31, 23, 59, 59, 999)), '2025-12')
  assert.equal(monthFileName('2026-02'), '2026-02.json')
})

test('groupByMonth: UTC 달로 묶고, 묶음 안의 순서는 넣은 그대로', () => {
  const groups = groupByMonth([pt(70), pt(0), pt(61), pt(62)])
  assert.deepEqual([...groups.keys()], ['2026-02', '2026-01'])
  assert.deepEqual(groups.get('2026-01')?.map((p) => p.t), [pt(0).t, pt(61).t])
  assert.deepEqual(groups.get('2026-02')?.map((p) => p.t), [pt(70).t, pt(62).t])
})

test('digestOf: 순서를 바꿔도 · 정확도만 달라도 · 같은 점이 두 번 있어도 같고, 점 하나가 더 있으면 다르다', async () => {
  const base = await digestOf(range(0, 10))
  assert.match(base, /^[0-9a-f]{32}$/)
  assert.equal(await digestOf(range(0, 10).reverse()), base)
  assert.equal(await digestOf(range(0, 10, 40)), base, '정확도는 지문에 들지 않는다 — 두 기기가 서로 덮어쓰지 않게')
  assert.equal(await digestOf(range(0, 10, null)), base)
  assert.equal(await digestOf([...range(0, 10), pt(3)]), base)
  assert.notEqual(await digestOf(range(0, 11)), base)
  assert.notEqual(await digestOf([...range(0, 9), { ...pt(9), source: 'WIFI' }]), base, 'source는 지문에 든다 (pointKey)')
})

test('localMonthsOf: 달마다 점과 지문', async () => {
  const months = await localMonthsOf(range(0, 70))
  assert.deepEqual([...months.keys()], ['2026-01', '2026-02'])
  assert.equal(months.get('2026-01')?.points.length, 62)
  assert.equal(months.get('2026-01')?.digest, await digestOf(range(0, 62)))
})

test('remoteMonthOf: 이름이 YYYY-MM.json이고 꼬리표(digest·importedAt)가 있어야 달 파일이다', () => {
  const tags = monthTags('abc', 62, '2026-03-01T00:00:00.000Z')
  assert.deepEqual(tags, { digest: 'abc', count: '62', importedAt: '2026-03-01T00:00:00.000Z' })
  assert.deepEqual(remoteMonthOf({ id: 'x', name: '2026-01.json', appProperties: tags }), { month: '2026-01', fileId: 'x', digest: 'abc', count: 62, importedAt: '2026-03-01T00:00:00.000Z' })
  assert.equal(remoteMonthOf({ id: 'x', name: '2026-13.json', appProperties: tags }), null)
  assert.equal(remoteMonthOf({ id: 'x', name: '2026-01.json.bak', appProperties: tags }), null)
  assert.equal(remoteMonthOf({ id: 'x', name: CLEARED_FILE, appProperties: { clearedAt: '2026-03-01T00:00:00.000Z' } }), null)
  assert.equal(remoteMonthOf({ id: 'x', name: '2026-01.json' }), null, '꼬리표가 없으면 사람이 넣은 파일로 보고 무시한다')
  assert.equal(remoteMonthOf({ id: 'x', name: '2026-01.json', appProperties: { ...tags, importedAt: 'garbage' } }), null)
  assert.equal(remoteMonthOf({ id: 'x', name: '2026-01.json', appProperties: { ...tags, count: 'x' } })?.count, 0)
})

test('encodeMonth ↔ decodeMonth: 왕복하면 같은 점 (정렬된 채로), 같은 점들이면 어느 순서로 넣어도 같은 글', () => {
  const points = range(0, 62)
  const text = encodeMonth('2026-01', [...points].reverse())
  assert.equal(text, encodeMonth('2026-01', points))
  assert.deepEqual(decodeMonth(text, '2026-01'), points)
  const withNull = [pt(1, null)]
  assert.deepEqual(decodeMonth(encodeMonth('2026-01', withNull), '2026-01'), withNull)
})

test('decodeMonth: 모양 틀린 줄·숫자 아닌 값·범위 밖 위도/경도·다른 달의 시각은 빠지고, 나머지는 남는다', () => {
  const good = [pt(1).t, 'GPS', 0.0001, 0.0001, 5]
  const rows = [
    good,
    [pt(2).t, 'GPS', 0.0002, 0.0002], // 칸이 모자람
    'not-a-row',
    [String(pt(3).t), 'GPS', 0.0003, 0.0003, 5], // 시각이 글자
    [pt(4).t, 'GPS', null, 0.0004, 5], // JSON의 NaN은 null로 온다
    [pt(5).t, 'GPS', 91, 0.0005, 5],
    [pt(6).t, 'GPS', 0.0006, -180.5, 5],
    [pt(70).t, 'GPS', 0.007, 0.007, 5], // 2월의 시각
    [pt(7).t, '', 0.0007, 0.0007, 5],
    [pt(8).t, 'GPS', 0.0008, 0.0008, -1],
    [8.64e15 + 1, 'GPS', 0, 0, 5], // Date가 나타낼 수 없는 시각 — 던지지 않고 빠진다
  ]
  assert.deepEqual(decodeMonth(JSON.stringify({ v: 1, month: '2026-01', points: rows }), '2026-01'), [pt(1)])
})

test('decodeMonth: JSON이 아니거나 모양이 틀리면 빈 결과, v가 1보다 크면 null (읽지 못하는 새 모양 — 덮지 않는다)', () => {
  assert.deepEqual(decodeMonth('{깨진', '2026-01'), [])
  assert.deepEqual(decodeMonth('null', '2026-01'), [])
  assert.deepEqual(decodeMonth(JSON.stringify({ v: 1, points: 'x' }), '2026-01'), [])
  assert.deepEqual(decodeMonth(JSON.stringify({ points: [] }), '2026-01'), [])
  assert.equal(decodeMonth(JSON.stringify({ v: 2, points: [] }), '2026-01'), null)
})

test('planDownload / planUpload: 지문이 같으면 받을 것도 올릴 것도 없다', () => {
  const local = new Map([['2026-01', 'd1'], ['2026-02', 'd2']])
  const remote = [rm('2026-01', 'd1'), rm('2026-02', 'd2')]
  assert.deepEqual(planDownload(local, remote), [])
  assert.deepEqual(planUpload(local, remote), [])
})

test('planDownload / planUpload: 드라이브에만 있으면 받고, 기기에만 있으면 새로 만들고, 다르면 받은 뒤 덮는다', () => {
  const local = new Map([['2026-01', 'd1'], ['2026-03', 'mine']])
  const remote = [rm('2026-02', 'theirs'), rm('2026-01', 'old')]
  assert.deepEqual(planDownload(local, remote).map((r) => r.month), ['2026-01', '2026-02'], '달 순서로')
  assert.deepEqual(planUpload(local, remote), [
    { month: '2026-01', upload: true, fileId: 'f-2026-01', remove: [] },
    { month: '2026-03', upload: true, fileId: undefined, remove: [] },
  ], '드라이브에만 있는 2월은 올릴 것이 없다')
})

test('planUpload: 같은 달 파일이 둘이면(두 기기가 동시에 처음 올림) 하나에 합쳐 올리고 나머지를 지운다', () => {
  const twins = [rm('2026-01', 'a', 'f-a'), rm('2026-01', 'b', 'f-b')]
  assert.deepEqual(planDownload(new Map([['2026-01', 'a']]), twins).map((r) => r.fileId), ['f-b'], '지문이 같은 쪽은 받지 않는다')
  assert.deepEqual(planUpload(new Map([['2026-01', 'ab']]), twins), [{ month: '2026-01', upload: true, fileId: 'f-a', remove: ['f-b'] }])
  // 합친 결과가 한쪽과 같으면 올리지 않고 남는 쪽만 지운다
  assert.deepEqual(planUpload(new Map([['2026-01', 'b']]), twins), [{ month: '2026-01', upload: false, fileId: 'f-b', remove: ['f-a'] }])
})

test('planUpload: keep의 달(읽지 못한 새 모양의 파일)은 건드리지 않는다', () => {
  assert.deepEqual(planUpload(new Map([['2026-01', 'mine']]), [rm('2026-01', 'newer')], new Set(['2026-01'])), [])
})

test('clearedAtOf: 표시 파일의 clearedAt, 없으면 빈 값, 둘이면 글자로 뒤의 것', () => {
  assert.equal(clearedAtOf([{ id: '1', name: '2026-01.json', appProperties: { clearedAt: 'x' } }]), '')
  assert.equal(clearedAtOf([{ id: '1', name: CLEARED_FILE, appProperties: { clearedAt: '2026-03-01T00:00:00.000Z' } }]), '2026-03-01T00:00:00.000Z')
  assert.equal(clearedAtOf([
    { id: '1', name: CLEARED_FILE, appProperties: { clearedAt: '2026-03-01T00:00:00.000Z' } },
    { id: '2', name: CLEARED_FILE, appProperties: { clearedAt: '2026-03-02T00:00:00.000Z' } },
  ]), '2026-03-02T00:00:00.000Z')
  assert.equal(clearedAtOf([{ id: '1', name: CLEARED_FILE }]), '')
})

test('clearDecision: 켠 뒤 처음이면 지금 값을 받아들이고, 켠 뒤에 새로 지웠으면 멈추고, 그 밖에는 이어 간다', () => {
  assert.equal(clearDecision(null, ''), 'adopt')
  assert.equal(clearDecision(null, '2026-03-01T00:00:00.000Z'), 'adopt')
  assert.equal(clearDecision('', ''), 'go')
  assert.equal(clearDecision('2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'), 'go')
  assert.equal(clearDecision('', '2026-03-01T00:00:00.000Z'), 'stop')
  assert.equal(clearDecision('2026-03-01T00:00:00.000Z', '2026-03-02T00:00:00.000Z'), 'stop')
  assert.equal(clearDecision('2026-03-01T00:00:00.000Z', ''), 'go', '표시가 없어진 것은 새로 지운 것이 아니다')
})

// ── 두 기기 흉내: 메모리 안의 가짜 드라이브 ─────────────────────────────
// syncTracks.ts의 한 바퀴(목록 → 받을 것 받아 합치기 → 다시 지문 → 올리기·남는 파일 지우기)를 같은 규칙 함수로 따라 한다.
type FakeFile = { name: string; appProperties: Record<string, string>; text: string }
type Device = { points: TrackPoint[] }
let nextId = 1

/** 기기 하나가 한 바퀴 돈다. 받은 파일 수와 올린 파일 수를 준다 */
async function round(device: Device, drive: Map<string, FakeFile>): Promise<{ got: number; put: number }> {
  const remote = [...drive].flatMap(([id, f]) => remoteMonthOf({ id, ...f }) ?? [])
  const digests = (m: Map<string, LocalMonth>) => new Map([...m].map(([k, v]) => [k, v.digest]))
  const toGet = planDownload(digests(await localMonthsOf(device.points)), remote)
  const keep = new Set<string>()
  for (const r of toGet) {
    const got = decodeMonth(drive.get(r.fileId)!.text, r.month)
    if (got === null) keep.add(r.month)
    else device.points = mergeSorted(device.points, got).points
  }
  const months = await localMonthsOf(device.points)
  const steps = planUpload(digests(months), remote, keep)
  for (const s of steps) {
    const m = months.get(s.month)!
    if (s.upload) drive.set(s.fileId ?? `id-${nextId++}`, { name: monthFileName(s.month), appProperties: monthTags(m.digest, m.points.length, '2026-03-01T00:00:00.000Z'), text: encodeMonth(s.month, m.points) })
    for (const id of s.remove) drive.delete(id)
  }
  return { got: toGet.length, put: steps.filter((s) => s.upload).length }
}

test('두 기기: A = {1,2}, B = {2,3} → 한 바퀴씩 돌면 둘 다 {1,2,3}, 다음 바퀴에는 받을 것·올릴 것이 0', async () => {
  const drive = new Map<string, FakeFile>()
  // A는 1월 초 ~ 2월 초, B는 1월 말 ~ 3월 초 — 기간이 절반쯤 겹친다
  const a: Device = { points: range(0, 80) }
  const b: Device = { points: range(40, 140) }
  assert.deepEqual(await round(a, drive), { got: 0, put: 2 })
  // B는 1월(A의 1월이 B의 1월을 다 품는다)과 2월을 받아 합치고, 늘어난 2월과 새 3월만 올린다
  assert.deepEqual(await round(b, drive), { got: 2, put: 2 })
  assert.deepEqual(await round(a, drive), { got: 2, put: 0 })
  const union = keysOf(range(0, 140))
  assert.deepEqual(keysOf(a.points), union)
  assert.deepEqual(keysOf(b.points), union)
  assert.deepEqual(await round(b, drive), { got: 0, put: 0 })
  assert.deepEqual(await round(a, drive), { got: 0, put: 0 })
  assert.equal(drive.size, 3, '달마다 파일 하나')
})

test('두 기기: 겹치는 점의 정확도가 기기마다 달라도 서로 덮어쓰지 않는다 (지문에 정확도가 없다)', async () => {
  const drive = new Map<string, FakeFile>()
  const a: Device = { points: range(0, 80, 5) }
  const b: Device = { points: [...range(40, 80, 30), ...range(80, 140, 5)] }
  await round(a, drive)
  await round(b, drive)
  await round(a, drive)
  assert.deepEqual(await round(b, drive), { got: 0, put: 0 })
  assert.deepEqual(await round(a, drive), { got: 0, put: 0 })
  assert.deepEqual(keysOf(a.points), keysOf(b.points))
})

test('두 기기: 같은 달 파일이 둘 생겨도(동시에 처음 올림) 다음 바퀴에 하나로 합쳐진다', async () => {
  const drive = new Map<string, FakeFile>()
  const a: Device = { points: range(0, 30) }
  const b: Device = { points: range(20, 50) }
  // 둘이 드라이브를 같은 순간에 읽었다 — 서로의 파일을 모른 채 각자 새로 만든다
  const empty = new Map<string, FakeFile>()
  await round(a, empty)
  await round(b, drive)
  for (const [id, f] of empty) drive.set(id, f)
  assert.equal(drive.size, 2)
  await round(a, drive)
  assert.equal(drive.size, 1, '하나에 합쳐 올리고 남는 파일을 지웠다')
  await round(b, drive)
  assert.deepEqual(keysOf(a.points), keysOf(range(0, 50)))
  assert.deepEqual(keysOf(b.points), keysOf(range(0, 50)))
  assert.deepEqual(await round(a, drive), { got: 0, put: 0 })
})
