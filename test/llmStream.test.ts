import test from 'node:test'
import assert from 'node:assert/strict'
import { relayStream, STALL_EVENT, TOO_LONG_EVENT } from '../api/_lib/llmStream.ts'

const encoder = new TextEncoder()
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** 시간을 재는 시험의 제한 — 마감이 고장 나도 `npm run check`가 영영 멈추지 않고 실패하게 */
const TIMED = { timeout: 5_000 }
/** 한 턴 마감이 걸리지 않을 만큼 먼 시각 */
const later = () => Date.now() + 60_000

/** 손으로 조각을 넣는 가짜 LLM 스트림. 끊겼는지(cancel)를 적어 둔다 */
function fakeUpstream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    start(c) { controller = c },
    cancel() { cancelled = true },
  })
  return {
    body,
    push: (text: string) => controller.enqueue(encoder.encode(text)),
    end: () => controller.close(),
    fail: () => controller.error(new Error('연결 끊김')),
    cancelled: () => cancelled,
  }
}

test('relayStream: 조각을 그대로 흘려보내고 끝나면 닫는다', TIMED, async () => {
  const up = fakeUpstream()
  up.push('a')
  const out = await relayStream(up.body, { idleMs: 200, endAt: later() })
  setTimeout(() => { up.push('b'); up.end() }, 50)
  assert.equal(await new Response(out).text(), 'ab')
})

test('relayStream: 첫 조각 뒤 조각 사이 마감이 지나면 LLM 쪽을 끊고 STALL_EVENT로 닫는다', TIMED, async () => {
  const up = fakeUpstream()
  up.push('a')
  const out = await relayStream(up.body, { idleMs: 100, endAt: later() })
  assert.equal(await new Response(out).text(), 'a' + STALL_EVENT)
  assert.equal(up.cancelled(), true, 'LLM 서버 쪽을 끊어야 맥이 그 일을 버린다')
})

test('relayStream: 느려도 조각이 마감 안에 계속 오면 끊지 않는다 — 마감은 조각마다 다시 잰다', TIMED, async () => {
  const up = fakeUpstream()
  up.push('0')
  const out = await relayStream(up.body, { idleMs: 150, endAt: later() })
  ;(async () => {
    for (const piece of ['1', '2', '3', '4']) { await wait(80); up.push(piece) }
    up.end()
  })()
  assert.equal(await new Response(out).text(), '01234')
})

test('relayStream: 첫 조각 뒤 LLM 쪽 연결이 끊기면 던지지 않고 STALL_EVENT로 닫는다', TIMED, async () => {
  const up = fakeUpstream()
  up.push('a')
  const out = await relayStream(up.body, { idleMs: 1000, endAt: later() })
  setTimeout(() => up.fail(), 20)
  assert.equal(await new Response(out).text(), 'a' + STALL_EVENT)
})

test('relayStream: 브라우저가 끊으면 LLM 쪽 스트림도 끊는다', TIMED, async () => {
  const up = fakeUpstream()
  up.push('a')
  const out = await relayStream(up.body, { idleMs: 1000, endAt: later() })
  const reader = out.getReader()
  await reader.read()
  await reader.cancel('떠남')
  assert.equal(up.cancelled(), true)
})

test('relayStream: 첫 조각을 기다리는 동안 끊기면 던진다 — 부르는 쪽이 오류 번호로 답한다', async () => {
  const up = fakeUpstream()
  up.fail()
  await assert.rejects(relayStream(up.body, { idleMs: 1000, endAt: later() }))
})

test('relayStream: 조각이 계속 와도 한 턴 마감에 닿으면 LLM 쪽을 끊고 TOO_LONG_EVENT로 닫는다', TIMED, async () => {
  const up = fakeUpstream()
  up.push('0')
  const out = await relayStream(up.body, { idleMs: 1000, endAt: Date.now() + 200 })
  const feeding = setInterval(() => { try { up.push('.') } catch { clearInterval(feeding) } }, 30)
  const text = await new Response(out).text()
  clearInterval(feeding)
  assert.ok(text.startsWith('0.'))
  assert.ok(text.endsWith(TOO_LONG_EVENT))
  assert.equal(up.cancelled(), true)
})

test('relayStream: 어느 길로 끝나든 onEnd를 한 번 부르고, 브라우저에 끝을 알리기 전에 기다린다', TIMED, async () => {
  for (const ending of ['done', 'idle', 'broken', 'cancel'] as const) {
    const up = fakeUpstream()
    up.push('a')
    const log: string[] = []
    const out = await relayStream(up.body, { idleMs: 50, endAt: later(), onEnd: async () => { await wait(20); log.push('끝 적음') } })
    if (ending === 'done') setTimeout(() => up.end(), 10)
    if (ending === 'broken') setTimeout(() => up.fail(), 10)
    if (ending === 'cancel') {
      const reader = out.getReader()
      await reader.read()
      await reader.cancel('떠남')
    } else {
      await new Response(out).text()
      log.push('브라우저가 끝을 받음')
    }
    assert.deepEqual(log, ending === 'cancel' ? ['끝 적음'] : ['끝 적음', '브라우저가 끝을 받음'], ending)
  }
})
