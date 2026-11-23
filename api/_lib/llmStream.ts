/**
 * LLM 서버의 답(SSE 스트림)을 브라우저로 흘려보내는 중계. `api/llm.ts`가 쓴다 (`test/llmStream.test.ts`).
 * 첫 조각을 받은 뒤로는 **조각 사이가 너무 길면** 끊는다 — 맥이 잠들거나 와이파이가 끊겨 연결이 반쯤 열린 채 멈추면,
 * 끊지 않는 한 함수가 최대 실행 시간까지 붙잡혀 Vercel Hobby의 한 달 함수 시간을 먹고 사용자는 멈춘 화면만 본다.
 * 생각하는 모델도 생각을 조각으로 끊임없이 보내므로(실측) 정상인 답은 이 마감에 걸리지 않는다.
 * **한 턴 전체에도 마감이 있다** (`endAt`) — 함수의 최대 실행 시간(vercel.json)에 닿기 전에 스스로 닫아야
 * 브라우저가 영문 모를 끊김 대신 안내를 받고, 끝을 적는 일(`onEnd` — 사용량 기록)이 함수가 살아 있을 때 돈다.
 */

/**
 * 중간에 끊었을 때 브라우저에 보내는 마지막 조각. 브라우저(`identify/llmClient.ts readStream`)가 `error`가 든 줄을
 * "잠시 뒤 다시 하면 되는 실패"로 바꿔 이 안내를 보여 준다. 오류 번호는 이미 200으로 나갔으므로 스트림 안에 적을 수밖에 없다.
 */
export const STALL_EVENT = `data: ${JSON.stringify({ error: { message: '판정 서버가 쉬는 중입니다 — 답을 보내다 멈췄습니다. 잠시 뒤 다시 물어봐 주세요.' } })}\n\n`
/** 한 턴 마감(`endAt`)에 닿아 끊었을 때의 마지막 조각. 받는 쪽은 `STALL_EVENT`와 같다 */
export const TOO_LONG_EVENT = `data: ${JSON.stringify({ error: { message: '판정 서버의 답이 너무 오래 걸려 끊었습니다. 잠시 뒤 다시 물어봐 주세요.' } })}\n\n`

export interface RelayOptions {
  /** 첫 조각 뒤, 조각 사이에 이만큼(ms) 아무것도 오지 않으면 끊는다 */
  idleMs: number
  /** 한 턴을 끝내야 하는 시각(`Date.now()` 기준 ms). 지나면 남은 답을 기다리지 않고 끊는다 */
  endAt: number
  /**
   * 스트림이 어떻게든 끝날 때 한 번 부른다 (다 보냄·끊음·브라우저가 떠남). 던지지 않아야 한다.
   * 브라우저에 끝을 알리기 **전에** 기다린다 — 응답이 끝나면 Vercel이 함수를 멈춰 그 뒤의 일은 돌지 않을 수 있다.
   */
  onEnd?: () => Promise<void>
}

/** 아직 남은 조각을 기다리다 마감이 지났다는 표시 (reader.read()와 겨룬다) */
const IDLE = Symbol('idle')
/** LLM 서버 쪽 읽기가 실패했다는 표시 (연결 끊김·LLM 요청 중단) */
const BROKEN = Symbol('broken')

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
 * 첫 조각 뒤에 조각 사이 마감이 지나거나 LLM 서버 쪽 연결이 끊기면 `STALL_EVENT`, 한 턴 마감에 닿으면 `TOO_LONG_EVENT`를 보내고
 * LLM 서버 쪽 스트림을 끊은 뒤 닫는다 (던지지 않는다).
 * 받는 쪽(브라우저)이 끊으면 LLM 서버 쪽 스트림도 끊는다 — 그래야 맥이 그 일을 버린다. 어느 길로 끝나든 `onEnd`를 한 번 부른다.
 * 첫 조각 전에 던질 때는 부르지 않는다 — 그때는 부르는 쪽이 끝을 적는다.
 */
export async function relayStream(body: ReadableStream<Uint8Array>, options: RelayOptions): Promise<ReadableStream<Uint8Array>> {
  const reader = body.getReader()
  const first = await reader.read()
  const encoder = new TextEncoder()
  let ended = false
  /** `onEnd`를 한 번만 부른다 */
  async function end(): Promise<void> {
    if (ended) return
    ended = true
    await options.onEnd?.()
  }
  /** 끝을 적은 뒤 닫는다. 브라우저가 이미 떠나 닫힌 스트림이면 조용히 끝낸다 */
  async function close(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
    await end()
    try { controller.close() } catch { /* 닫힌 스트림 */ }
  }
  /** 남은 답을 버리고 마지막 조각 하나로 닫는다 */
  async function endWith(controller: ReadableStreamDefaultController<Uint8Array>, event: string): Promise<void> {
    reader.cancel('마감').catch(() => { /* 이미 끊긴 연결 */ })
    try { controller.enqueue(encoder.encode(event)) } catch { /* 닫힌 스트림 */ }
    await close(controller)
  }
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      if (first.done) await close(controller); else controller.enqueue(first.value)
    },
    async pull(controller) {
      const left = options.endAt - Date.now()
      // 이번 기다림을 한 턴 마감이 자르는지 — 그러면 IDLE은 "멈춤"이 아니라 "너무 오래"다
      const byTurn = left <= options.idleMs
      let next: ReadableStreamReadResult<Uint8Array> | typeof IDLE | typeof BROKEN
      try { next = left > 0 ? await readWithin(reader, Math.min(options.idleMs, left)) : IDLE } catch { next = BROKEN }
      if (next === IDLE || next === BROKEN) return endWith(controller, next === IDLE && byTurn ? TOO_LONG_EVENT : STALL_EVENT)
      if (next.done) return close(controller)
      try { controller.enqueue(next.value) } catch { /* 닫힌 스트림 */ }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => { /* 이미 끊긴 연결 */ })
      await end()
    },
  })
}
