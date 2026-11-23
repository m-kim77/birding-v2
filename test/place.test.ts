import test from 'node:test'
import assert from 'node:assert/strict'
import { formatFeature, formatPlace, GET } from '../api/place.ts'
import { createPlaceLookup, type PlaceDeps } from '../src/lib/place.ts'

/**
 * 가짜 바깥. 서버에 물은 주소와 그때의 (가짜) 시각을 적고, `names`에 있는 칸("위도,경도" 소수 3자리)이면 그 이름을 준다.
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

test('lookupPlace: 같은 칸(소수 3자리 ≈ 110m가 같으면 같은 자리)을 다시 물으면 서버에 묻지 않고, 줄도 서지 않는다', async () => {
  const w = fakeWorld({ '37.566,126.978': '서울특별시 중구' })
  const lookup = createPlaceLookup(w.deps)
  assert.equal(await lookup(37.5663, 126.9781), '서울특별시 중구')
  // 약 60m 떨어진 자리 — 소수 4자리로 묻던 때는 다른 주소였다
  assert.equal(await lookup(37.5658, 126.9776), '서울특별시 중구')
  assert.deepEqual(w.calls.map((c) => c.url), ['/api/place?lat=37.566&lng=126.978'])
  assert.equal(w.deps.now(), 0, '기억한 이름은 1초를 기다리지 않는다')
})

test('lookupPlace: 같은 좌표를 묻는 중에 또 물으면 요청은 하나', async () => {
  const w = fakeWorld({ '37.566,126.978': '서울특별시 중구' })
  const lookup = createPlaceLookup(w.deps)
  assert.deepEqual(await Promise.all([lookup(37.5663, 126.978), lookup(37.5663, 126.978)]), ['서울특별시 중구', '서울특별시 중구'])
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
  const w = fakeWorld({ '35.300,129.300': '부산광역시 기장군' })
  const answers = [() => Promise.reject(new TypeError('Failed to fetch')), () => Promise.resolve(new Response('', { status: 500 }))]
  const fake = w.deps.fetch
  const lookup = createPlaceLookup({ ...w.deps, fetch: (url) => answers.shift()?.() ?? fake(url) })
  assert.equal(await lookup(35.1, 129.1), '')
  assert.equal(await lookup(35.2, 129.2), '')
  assert.equal(await lookup(35.3, 129.3), '부산광역시 기장군')
})

test('GET /api/place: 다른 사이트가 시킨 요청(sec-fetch-site)은 Nominatim에 묻지 않고 빈 이름', async () => {
  const realFetch = globalThis.fetch
  let asked = 0
  globalThis.fetch = async () => { asked++; return Response.json({ address: { city: '서울특별시' } }) }
  try {
    const url = 'http://localhost/api/place?lat=37.5665&lng=126.9780'
    const cross = await GET(new Request(url, { headers: { 'sec-fetch-site': 'cross-site' } }))
    assert.deepEqual(await cross.json(), { place: '' })
    assert.equal(asked, 0)
    const same = await GET(new Request(url, { headers: { 'sec-fetch-site': 'same-origin' } }))
    assert.deepEqual(await same.json(), { place: '서울특별시' })
    assert.equal(asked, 1)
  } finally {
    globalThis.fetch = realFetch
  }
})

/**
 * GET /api/place를 같은 사이트의 요청으로 부르고, Nominatim에 물은 주소와 응답을 돌려준다. Nominatim은 가짜(늘 서울특별시).
 * 끝나면 진짜 fetch를 되돌린다.
 */
async function askServer(url: string): Promise<{ asked: string[]; res: Response }> {
  const realFetch = globalThis.fetch
  const asked: string[] = []
  globalThis.fetch = async (input) => { asked.push(String(input)); return Response.json({ address: { city: '서울특별시' } }) }
  try {
    const res = await GET(new Request(url, { headers: { 'sec-fetch-site': 'same-origin' } }))
    return { asked, res }
  } finally {
    globalThis.fetch = realFetch
  }
}

test('GET /api/place: 브라우저가 부르는 칸 주소의 답만 모든 사용자가 함께 쓰는 CDN 캐시에 둔다 — 브라우저와 서버의 칸 모양이 어긋나면 공유 캐시가 꺼져 Nominatim 요청이 는다', async () => {
  const w = fakeWorld()
  await createPlaceLookup(w.deps)(37.56634, 126.97812)
  const { asked, res } = await askServer(`http://localhost${w.calls[0].url}`)
  assert.match(res.headers.get('cache-control') ?? '', /^public, s-maxage=86400/)
  assert.deepEqual(await res.json(), { place: '서울특별시' })
  assert.match(asked[0], /&lat=37\.566&lon=126\.978$/)
})

test('GET /api/place: 더 촘촘한 좌표(소수 4자리 — 새 판 전에 열린 앱)로 와도 Nominatim에는 110m 칸으로 묻고, 답은 그 브라우저만 기억한다 — 공유하면 남이 같은 주소로 \'누군가 이 11m 자리를 찾았다\'를 알 수 있다', async () => {
  const { asked, res } = await askServer('http://localhost/api/place?lat=37.5663&lng=126.9781')
  assert.equal(res.headers.get('cache-control'), 'private, max-age=86400')
  assert.deepEqual(await res.json(), { place: '서울특별시' })
  assert.match(asked[0], /&lat=37\.566&lon=126\.978$/)
})
