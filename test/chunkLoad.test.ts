import test from 'node:test'
import assert from 'node:assert/strict'
import { ChunkLoadError, RELOAD_GUARD_MS, entryScriptSrc, loadChunk, mayAutoReload, pointsToNewBuild, retryOnce, type ChunkEnv } from '../src/app/chunkLoad.ts'

/** 정해진 차례대로 실패·성공하는 가짜 import. 부른 횟수를 센다 */
function loader(results: Array<'fail' | 'ok'>) {
  let calls = 0
  const load = async () => {
    const r = results[calls] ?? 'fail'
    calls += 1
    if (r === 'fail') throw new TypeError('Failed to fetch dynamically imported module')
    return { default: 'screen' }
  }
  return { load, calls: () => calls }
}

/** 빌드된 index.html의 모양 (dist/index.html — 시작 스크립트 하나, 나머지는 link) */
const page = (entry: string) => `<!doctype html><html><head>
<link rel="manifest" href="/manifest.webmanifest" />
<script type="module" crossorigin src="${entry}"></script>
</head><body><div id="root"></div></body></html>`
const OLD = '/assets/index-ChCq_RgR.js'
const NEW = '/assets/index-Zx81aQ0p.js'

/** loadChunk가 쓰는 브라우저 값의 가짜. 무엇을 물었는지·새로 고쳤는지 센다 */
function fakeEnv(o: { online?: boolean; html?: string | null; stamp?: number | null | 'unknown'; canWrite?: boolean } = {}) {
  const seen = { asked: 0, reloads: 0, wrote: [] as number[] }
  const env: ChunkEnv = {
    online: () => o.online ?? true,
    fetchIndexHtml: async () => { seen.asked += 1; return o.html === undefined ? page(NEW) : o.html },
    currentEntry: () => OLD,
    readStamp: () => o.stamp ?? null,
    writeStamp: (at) => { if (o.canWrite === false) return false; seen.wrote.push(at); return true },
    reload: () => { seen.reloads += 1 },
    now: () => 1_000_000_000,
  }
  return { env, seen }
}

test('retryOnce: 한 번 실패하면 기다렸다가 한 번 더 받는다 — 잠깐 끊긴 신호면 화면이 열린다', async () => {
  const l = loader(['fail', 'ok'])
  assert.deepEqual(await retryOnce(l.load, 1), { default: 'screen' })
  assert.equal(l.calls(), 2)
})

test('retryOnce: 두 번 다 실패하면 ChunkLoadError — 세 번째는 하지 않는다', async () => {
  const l = loader(['fail', 'fail', 'ok'])
  await assert.rejects(retryOnce(l.load, 1), (e: unknown) => e instanceof ChunkLoadError && e.reason instanceof TypeError)
  assert.equal(l.calls(), 2)
})

test('retryOnce: 처음에 받으면 다시 받지 않는다', async () => {
  const l = loader(['ok'])
  await retryOnce(l.load, 1)
  assert.equal(l.calls(), 1)
})

test('mayAutoReload: 온라인이고 저절로 새로 고친 적이 없거나 오래됐을 때만', () => {
  const now = 1_000_000_000
  assert.equal(mayAutoReload(null, now, true), true)
  assert.equal(mayAutoReload(now - RELOAD_GUARD_MS - 1, now, true), true)
  // 방금 새로 고쳤는데도 또 못 받았다 — 다시 하면 끝없이 돈다
  assert.equal(mayAutoReload(now - 1_000, now, true), false)
  // 오프라인에서 새로 고치면 앱 자체가 안 열린다 (서비스 워커 없음)
  assert.equal(mayAutoReload(null, now, false), false)
  // 저장소가 막혀 지난 시각을 모르면 하지 않는다
  assert.equal(mayAutoReload('unknown', now, true), false)
  // 시계가 뒤로 갔으면 오래된 것으로 본다
  assert.equal(mayAutoReload(now + 60_000, now, true), true)
})

test('entryScriptSrc: 빌드된 index.html의 시작 스크립트 src를 그대로 꺼낸다', () => {
  assert.equal(entryScriptSrc(page(OLD)), OLD)
  // 개발 서버처럼 src 없는 모듈 스크립트가 앞에 있어도 src가 있는 첫 것
  assert.equal(entryScriptSrc('<script type="module">import x from "/@react-refresh"</script><script type="module" src="/src/main.tsx"></script>'), '/src/main.tsx')
  // 모듈이 아닌 스크립트는 시작 스크립트가 아니다
  assert.equal(entryScriptSrc('<script src="/old.js"></script><script type=module src=\'/a.js\'></script>'), '/a.js')
  // 와이파이 로그인 화면처럼 사이트가 아닌 글
  assert.equal(entryScriptSrc('<html><body>로그인하세요</body></html>'), null)
})

test('pointsToNewBuild: 시작 스크립트가 다를 때만 — 모르면 새 판이 아닌 것으로 본다', () => {
  assert.equal(pointsToNewBuild(page(NEW), OLD), true)
  assert.equal(pointsToNewBuild(page(OLD), OLD), false)
  assert.equal(pointsToNewBuild('<html>로그인</html>', OLD), false)
  assert.equal(pointsToNewBuild(page(NEW), null), false)
})

test('loadChunk: 첫 실패 뒤 다시 받아 열리면 사이트에 묻지도, 새로 고치지도 않는다 — 신호가 잠깐 끊긴 산', async () => {
  const l = loader(['fail', 'ok'])
  const { env, seen } = fakeEnv()
  assert.deepEqual(await loadChunk(l.load, true, env, 1), { default: 'screen' })
  assert.equal(seen.asked, 0)
  assert.equal(seen.reloads, 0)
})

test('loadChunk: 두 번 다 못 받고 사이트가 새 판을 가리키면 한 번 새로 고치고 시각을 적는다', async () => {
  const { env, seen } = fakeEnv()
  await assert.rejects(loadChunk(loader(['fail', 'fail']).load, true, env, 1), (e: unknown) => e instanceof ChunkLoadError && e.newBuild && e.reason instanceof TypeError)
  assert.equal(seen.reloads, 1)
  assert.deepEqual(seen.wrote, [1_000_000_000])
})

test('loadChunk: 사이트에 닿지 못하거나 같은 판이면 신호가 약한 것 — 새로 고치지 않는다', async () => {
  for (const html of [null, page(OLD)]) {
    const { env, seen } = fakeEnv({ html })
    await assert.rejects(loadChunk(loader(['fail', 'fail']).load, true, env, 1), (e: unknown) => e instanceof ChunkLoadError && !e.newBuild)
    assert.equal(seen.reloads, 0)
  }
})

test('loadChunk: 오프라인이면 사이트에 묻지 않고 새로 고치지 않는다', async () => {
  const { env, seen } = fakeEnv({ online: false })
  await assert.rejects(loadChunk(loader(['fail', 'fail']).load, true, env, 1), (e: unknown) => e instanceof ChunkLoadError && !e.newBuild)
  assert.equal(seen.asked, 0)
  assert.equal(seen.reloads, 0)
})

test('loadChunk: 새 판이어도 막아 둔 조각(위치 시트)·5분 안에 새로 고친 뒤·시각을 못 적으면 새로 고치지 않는다', async () => {
  const cases = [
    { mayReload: false, o: {} },
    { mayReload: true, o: { stamp: 1_000_000_000 - 1_000 } },
    { mayReload: true, o: { stamp: 'unknown' as const } },
    { mayReload: true, o: { canWrite: false } },
  ]
  for (const c of cases) {
    const { env, seen } = fakeEnv(c.o)
    await assert.rejects(loadChunk(loader(['fail', 'fail']).load, c.mayReload, env, 1), (e: unknown) => e instanceof ChunkLoadError && e.newBuild)
    assert.equal(seen.reloads, 0, JSON.stringify(c))
  }
})

test('loadChunk: 사이트에 묻다 던져도 새 판이 아닌 것으로 본다', async () => {
  const { env, seen } = fakeEnv()
  env.fetchIndexHtml = async () => { throw new TypeError('Load failed') }
  await assert.rejects(loadChunk(loader(['fail', 'fail']).load, true, env, 1), (e: unknown) => e instanceof ChunkLoadError && !e.newBuild)
  assert.equal(seen.reloads, 0)
})
