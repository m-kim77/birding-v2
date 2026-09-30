import test from 'node:test'
import assert from 'node:assert/strict'
import { disconnectedText, statusLine, type StatusInput } from '../src/features/settings/driveText.ts'

/** 지금 — 날짜 경계는 브라우저(여기서는 node) 시간대라 로컬 시각으로 만든다 (when.test.ts와 같다) */
const NOW = new Date(2026, 8, 22, 18, 0)

/** 상태 줄이 읽는 다섯 칸만 만든다 — SyncStatus의 다른 칸이 늘어도 이 테스트는 그대로다 */
function status(over: Partial<StatusInput> = {}): StatusInput {
  return { phase: 'idle', pending: 0, stuck: 0, lastSyncAt: '', message: '', ...over }
}

test('동기화하는 중이면 다른 칸이 무엇이든 그 말만 (가장 앞선다)', () => {
  const busy = status({ phase: 'syncing', pending: 4, stuck: 2, message: '지난 실패' })
  assert.deepEqual(statusLine(busy, NOW), { tone: 'ok', text: '동기화하는 중…' })
})

test('로그인이 풀렸으면 멈춘 기록·올릴 기록보다 앞선다 — 다시 로그인하라고만', () => {
  const line = statusLine(status({ phase: 'disconnected', pending: 3, stuck: 1, message: '401' }), NOW)
  assert.equal(line.tone, 'warn')
  assert.equal(line.text, '구글 로그인이 풀렸습니다. 다시 로그인하면 못 올린 기록부터 이어서 올립니다.')
})

test('인터넷이 끊겼으면 멈춘 기록보다 앞선다 — 올릴 기록이 있을 때만 그 수를 적는다', () => {
  assert.equal(statusLine(status({ phase: 'offline' }), NOW).text, '인터넷이 끊겨 있습니다.')
  const withPending = statusLine(status({ phase: 'offline', pending: 3, stuck: 2 }), NOW)
  assert.equal(withPending.tone, 'warn')
  assert.equal(withPending.text, '인터넷이 끊겨 있습니다 — 올릴 기록 3건은 연결되면 올립니다.')
})

test('여러 번 올리지 못해 멈춘 기록이 있으면 phase가 error여도 그 말이 앞선다 — 이유가 있으면 괄호로 붙인다', () => {
  const plain = statusLine(status({ phase: 'error', stuck: 2, pending: 5, message: '' }), NOW)
  assert.equal(plain.text, '2건을 여러 번 올리지 못해 멈췄습니다. "지금 동기화"를 눌러 다시 해 보세요.')
  const withReason = statusLine(status({ stuck: 1, message: '용량 부족' }), NOW)
  assert.equal(withReason.tone, 'warn')
  assert.equal(withReason.text, '1건을 여러 번 올리지 못해 멈췄습니다. "지금 동기화"를 눌러 다시 해 보세요. (용량 부족)')
})

test('그 밖의 실패는 이유를 그대로, 이유가 비면 일반 문구 — 올릴 기록보다 앞선다', () => {
  assert.equal(statusLine(status({ phase: 'error', message: '드라이브 응답 오류', pending: 2 }), NOW).text, '드라이브 응답 오류')
  const blank = statusLine(status({ phase: 'error', pending: 2 }), NOW)
  assert.equal(blank.tone, 'warn')
  assert.equal(blank.text, '동기화하지 못했습니다. 잠시 뒤 다시 합니다.')
})

test('쉬는 중인데 아직 못 올린 기록이 있으면 그 수를 적는다 (경고)', () => {
  const line = statusLine(status({ pending: 6, lastSyncAt: new Date(2026, 8, 22, 15, 20).toISOString() }), NOW)
  assert.deepEqual(line, { tone: 'warn', text: '드라이브에 아직 안 올라간 기록 6건' })
})

test('다 올라갔으면 마지막 동기화 시각과 함께 알린다 (정상)', () => {
  const line = statusLine(status({ lastSyncAt: new Date(2026, 8, 22, 15, 20).toISOString() }), NOW)
  assert.deepEqual(line, { tone: 'ok', text: '모든 기록이 드라이브에 있습니다 · 마지막 동기화 오늘 오후 3:20' })
  const yesterday = statusLine(status({ lastSyncAt: new Date(2026, 8, 21, 9, 5).toISOString() }), NOW)
  assert.equal(yesterday.text, '모든 기록이 드라이브에 있습니다 · 마지막 동기화 어제 오전 9:05')
})

test('마지막 동기화 시각이 없거나 못 읽으면 "연결됨"만 적는다', () => {
  assert.deepEqual(statusLine(status(), NOW), { tone: 'ok', text: '연결됨' })
  assert.deepEqual(statusLine(status({ lastSyncAt: 'garbage' }), NOW), { tone: 'ok', text: '연결됨' })
})

test('일곱 갈래의 말이 서로 다르다 — 우선순위가 겹쳐 같은 문구가 되지 않는다', () => {
  const texts = [
    statusLine(status({ phase: 'syncing' }), NOW),
    statusLine(status({ phase: 'disconnected' }), NOW),
    statusLine(status({ phase: 'offline' }), NOW),
    statusLine(status({ stuck: 1 }), NOW),
    statusLine(status({ phase: 'error' }), NOW),
    statusLine(status({ pending: 1 }), NOW),
    statusLine(status(), NOW),
  ].map((m) => m.text)
  assert.equal(new Set(texts).size, 7)
})

test('연결 끊기 결과: 이동 기록 올리기를 켜 두었으면 그것도 꺼졌다고 더하고, 꺼져 있었으면 더하지 않는다', () => {
  const plain = disconnectedText(false)
  assert.deepEqual(plain, { tone: 'ok', text: '연결을 끊었습니다. 드라이브의 사본과 이 기기의 기록은 그대로 있습니다.' })
  const withTracks = disconnectedText(true)
  assert.equal(withTracks.tone, 'ok')
  assert.ok(withTracks.text.startsWith(plain.text), '기록 쪽 말은 그대로 앞에 둔다')
  assert.match(withTracks.text, /이동 기록 올리기도 껐습니다/)
  assert.doesNotMatch(plain.text, /이동 기록/)
})
