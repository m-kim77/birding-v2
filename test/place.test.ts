import test from 'node:test'
import assert from 'node:assert/strict'
import { formatFeature, formatPlace } from '../api/place.ts'
import { createPlaceLookup, type PlaceDeps } from '../src/lib/place.ts'

/**
 * 가짜 바깥. 서버에 물은 주소와 그때의 (가짜) 시각을 적고, `names`에 있는 좌표("위도,경도" 소수 4자리)면 그 이름을 준다.
 * 잠자기는 시계만 앞으로 돌린다 — 1초 간격을 실제로 기다리지 않고 잰다. `pass`는 사람이 머뭇거린 시간.
 */
function fakeWorld(names: Record<string, string> = {}) {
  let clock = 0
  const calls: Array<{ url: string; at: number }> = []
  const deps: PlaceDeps = {
    fetch: async (url) => {
      calls.push({ url, at: clock })
      const q = new URL(url, 'http://localhost').searchParams
      return Response.json({ place: names[`${q.get('lat')},${q.get('lng')}`] ?? '' })
    },
    now: () => clock,
    sleep: async (ms) => { clock += ms },
  }
  return { deps, calls, pass: (ms: number) => { clock += ms } }
}

test('formatPlace: 큰 단위 → 작은 단위 순으로 잇고, 없는 단계는 건너뛴다', () => {
  assert.equal(formatPlace({ state: '경기도', city: '파주시', town: '문산읍' }), '경기도 파주시 문산읍')
  assert.equal(formatPlace({ city: '서울특별시', borough: '성동구', suburb: '성수동' }), '서울특별시 성동구 성수동')
})

test('formatPlace: 같은 이름이 두 단계에 겹치면 한 번만', () => {
  assert.equal(formatPlace({ city: '세종', county: '세종', town: '조치원읍' }), '세종 조치원읍')
})

test('formatPlace·formatFeature: 주소가 없으면 빈 문자열', () => {
  assert.equal(formatPlace(null), '')
  assert.equal(formatFeature(undefined), '')
})

test('formatFeature: 물·자연·공원 이름을 고른다', () => {
  assert.equal(formatFeature({ water: '주남저수지', leisure: '공원' }), '주남저수지')
})

test('lookupPlace: 같은 좌표(소수 4자리가 같으면 같은 자리)를 다시 물으면 서버에 묻지 않고, 줄도 서지 않는다', async () => {
  const w = fakeWorld({ '37.5665,126.9780': '서울특별시 중구' })
  const lookup = createPlaceLookup(w.deps)
  assert.equal(await lookup(37.5665, 126.978), '서울특별시 중구')
  assert.equal(await lookup(37.56652, 126.97804), '서울특별시 중구')
  assert.deepEqual(w.calls.map((c) => c.url), ['/api/place?lat=37.5665&lng=126.9780'])
  assert.equal(w.deps.now(), 0, '기억한 이름은 1초를 기다리지 않는다')
})

test('lookupPlace: 같은 좌표를 묻는 중에 또 물으면 요청은 하나', async () => {
  const w = fakeWorld({ '37.5665,126.9780': '서울특별시 중구' })
  const lookup = createPlaceLookup(w.deps)
  assert.deepEqual(await Promise.all([lookup(37.5665, 126.978), lookup(37.5665, 126.978)]), ['서울특별시 중구', '서울특별시 중구'])
  assert.equal(w.calls.length, 1)
})

test('lookupPlace: 서로 다른 세 좌표를 한꺼번에 물으면 1초 간격으로 줄 선다', async () => {
  const w = fakeWorld()
  const lookup = createPlaceLookup(w.deps)
  await Promise.all([lookup(35.1, 129.1), lookup(35.2, 129.2), lookup(35.3, 129.3)])
  assert.deepEqual(w.calls.map((c) => c.at), [0, 1000, 2000])
})

test('lookupPlace: 앞 요청을 보낸 지 1초가 지났으면 기다리지 않고, 덜 지났으면 남은 만큼만 기다린다', async () => {
  const w = fakeWorld()
  const lookup = createPlaceLookup(w.deps)
  await lookup(35.1, 129.1)
  w.pass(5000)
  await lookup(35.2, 129.2)
  w.pass(300)
  await lookup(35.3, 129.3)
  assert.deepEqual(w.calls.map((c) => c.at), [0, 5000, 6000])
})

test('lookupPlace: 빈 이름(실패·이름 없는 곳)은 기억하지 않아 다음에 다시 묻는다', async () => {
  const w = fakeWorld()
  const lookup = createPlaceLookup(w.deps)
  assert.equal(await lookup(35.1, 129.1), '')
  assert.equal(await lookup(35.1, 129.1), '')
  assert.equal(w.calls.length, 2)
})

test('lookupPlace: 서버 오류·네트워크 실패에도 던지지 않고 빈 이름, 줄은 계속 간다', async () => {
  const w = fakeWorld({ '35.3000,129.3000': '부산광역시 기장군' })
  const answers = [() => Promise.reject(new TypeError('Failed to fetch')), () => Promise.resolve(new Response('', { status: 500 }))]
  const fake = w.deps.fetch
  const lookup = createPlaceLookup({ ...w.deps, fetch: (url) => answers.shift()?.() ?? fake(url) })
  assert.equal(await lookup(35.1, 129.1), '')
  assert.equal(await lookup(35.2, 129.2), '')
  assert.equal(await lookup(35.3, 129.3), '부산광역시 기장군')
})
