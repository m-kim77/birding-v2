/**
 * LLM 서버의 답(SSE 스트림)을 브라우저로 흘려보내는 중계. `api/llm.ts`가 쓴다 (`test/llmStream.test.ts`).
 * 첫 조각을 받은 뒤로는 **조각 사이가 너무 길면** 끊는다 — 맥이 잠들거나 와이파이가 끊겨 연결이 반쯤 열린 채 멈추면,
 * 끊지 않는 한 함수가 최대 실행 시간까지 붙잡혀 Vercel Hobby의 한 달 함수 시간을 먹고 사용자는 멈춘 화면만 본다.
 * 생각하는 모델도 생각을 조각으로 끊임없이 보내므로(실측) 정상인 답은 이 마감에 걸리지 않는다.
 */

/**
 * 중간에 끊었을 때 브라우저에 보내는 마지막 조각. 브라우저(`identify/llmClient.ts readStream`)가 `error`가 든 줄을
 * "잠시 뒤 다시 하면 되는 실패"로 바꿔 이 안내를 보여 준다. 오류 번호는 이미 200으로 나갔으므로 스트림 안에 적을 수밖에 없다.
 */
export const STALL_EVENT = `data: ${JSON.stringify({ error: { message: '판정 서버가 쉬는 중입니다 — 답을 보내다 멈췄습니다. 잠시 뒤 다시 물어봐 주세요.' } })}\n\n`

export interface RelayOptions {
  /** 첫 조각 뒤, 조각 사이에 이만큼(ms) 아무것도 오지 않으면 끊는다 */
  idleMs: number
}

/** 아직 남은 조각을 기다리다 마감이 지났다는 표시 (reader.read()와 겨룬다) */
const IDLE = Symbol('idle')

/**
 * 조각 하나를 `ms` 안에 받는다. 마감이 먼저 오면 IDLE. 타이머는 어느 쪽이든 치운다 — 남기면 함수가 그만큼 더 산다.
 * 읽기가 실패하면(연결이 끊김·LLM 요청이 중단됨) 그대로 던진다.
 */
async function readWithin(reader: ReadableStreamDefaultReader<Uint8Array>, ms: number): Promise<ReadableStreamReadResult<Uint8Array> | typeof IDLE> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const idle = new Promise<typeof IDLE>((resolve) => { timer = setTimeout(() => resolve(IDLE), ms) })
  try {
    return await Promise.race([reader.read(), idle])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 스트림의 첫 조각을 받은 뒤, 그 조각부터 끝까지 흘려보내는 새 스트림을 준다.
 * 첫 조각을 기다리는 동안 요청이 끊기면(첫 응답 마감·브라우저가 떠남) 던진다 — 부르는 쪽이 오류 번호로 답한다. 첫 조각 전에 끝나면 빈 스트림.
 * 첫 조각 뒤에 조각 사이 마감이 지나거나 LLM 서버 쪽 연결이 끊기면, LLM 서버 쪽 스트림을 끊고 `STALL_EVENT`를 보낸 뒤 닫는다 (던지지 않는다).
 * 받는 쪽(브라우저)이 끊으면 LLM 서버 쪽 스트림도 끊는다 — 그래야 맥이 그 일을 버린다.
 */
export async function relayStream(body: ReadableStream<Uint8Array>, options: RelayOptions): Promise<ReadableStream<Uint8Array>> {
  const reader = body.getReader()
  const first = await reader.read()
  const stall = new TextEncoder().encode(STALL_EVENT)
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.done) controller.close(); else controller.enqueue(first.value)
    },
    async pull(controller) {
      let next: Awaited<ReturnType<typeof readWithin>>
      try {
        next = await readWithin(reader, options.idleMs)
      } catch {
        next = IDLE
      }
      if (next === IDLE) reader.cancel('조각 사이 마감').catch(() => { /* 이미 끊긴 연결 */ })
      // 브라우저가 이미 떠나 이 스트림이 닫혔으면 넣을 곳이 없다 — 그때는 조용히 끝낸다
      try {
        if (next === IDLE) { controller.enqueue(stall); controller.close() } else if (next.done) controller.close(); else controller.enqueue(next.value)
      } catch { /* 닫힌 스트림 */ }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}
