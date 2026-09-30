// node --test가 이 파일을 직접 읽는다 — node는 확장자 없는 경로를 못 푼다
import { addWindow, type HeardSpecies } from './heard.ts'
import { makeCutter, toModelRate, type SoundWindow } from './windows.ts'
import type { SoundGuess } from './classifier'

/**
 * 듣기 한 번 — 소리 조각을 받아 창으로 자르고, 창을 하나씩 차례로 판정해 들린 종 목록을 키운다 (React·브라우저를 모른다).
 * 마이크든 파일이든 `push`로 소리를 넣고 `finish`로 끝낸다. useListening.ts가 화면 상태와 잇는다.
 * 아무것도 저장하지 않는다 — 목록은 이 객체와 화면 상태에만 있고, 듣기를 버리면(`cancel`) 사라진다.
 */

/** 실시간 듣기에서 판정을 기다리는 창이 이만큼 밀리면 오래된 것부터 버린다 (6초치). 느린 기기에서 목록이 점점 과거를 말하지 않게 */
const LIVE_BACKLOG = 4

export interface SessionOptions {
  /** 판정기 — 48kHz 144,000개를 받는다 */
  classify: (samples: Float32Array) => Promise<SoundGuess[]>
  /** 들어오는 소리의 표본율 */
  rate: number
  /** 실시간(마이크)이면 true — 밀린 창을 버린다. 파일은 false — 하나도 버리지 않는다 */
  live: boolean
  /** 창 하나를 판정할 때마다: 지금까지 들린 종과, 판정을 마친 소리의 끝(초) */
  onUpdate: (heard: HeardSpecies[], judgedSeconds: number) => void
  /** 판정이 실패했다 — 한 번만 부르고 듣기를 멈춘다 */
  onError: (message: string) => void
}

export interface ListenSession {
  /** 소리 조각을 넣는다. 끝났거나 버린 뒤에는 아무 일도 하지 않는다 */
  push(chunk: Float32Array): void
  /** 남은 소리를 마지막 창으로 넣고, 밀린 판정이 다 끝나면 돌아온다. 그 뒤로는 소리를 받지 않는다 */
  finish(): Promise<void>
  /** 지금 줄에 선 창의 판정이 다 끝나는 때. 파일처럼 소리를 한꺼번에 가진 쪽이 조금씩 넣으려고 기다린다 (창을 수백 개 쌓지 않게) */
  idle(): Promise<void>
  /** 듣기를 버린다 — 밀린 창을 비우고, 돌고 있던 판정의 답도 목록에 넣지 않는다 (화면을 떠날 때) */
  cancel(): void
  /** 지금까지 받은 소리의 길이(초) */
  seconds(): number
  /** 밀려서 버린 창의 수 (실시간에서만 0보다 클 수 있다) */
  dropped(): number
}

/** 듣기를 하나 연다 */
export function makeSession({ classify, rate, live, onUpdate, onError }: SessionOptions): ListenSession {
  const cutter = makeCutter(rate)
  const queue: SoundWindow[] = []
  let heard: HeardSpecies[] = []
  let state: 'open' | 'closing' | 'closed' = 'open'
  let dropped = 0
  /** 판정 줄이 돌고 있는지 — 한 번에 하나만 판정한다 (모델은 창 하나씩 받는다) */
  let busy = false
  /** 마지막으로 돌린 판정 줄이 끝나는 때. `finish`가 기다린다 */
  let tail: Promise<void> = Promise.resolve()
  /** 닫혔는지. 함수로 묻는 이유: 판정을 기다리는 사이에 바뀌는 값이라, 변수를 바로 견주면 타입 검사가 "아까 본 값"으로 굳힌다 */
  const closed = () => state === 'closed'

  /**
   * 줄에 선 창을 차례로 판정한다. 실패하면 듣기를 닫고 이유를 한 번 알린다.
   * `busy`는 줄이 비는 그 자리에서 바로 내린다 — 약속이 끝난 뒤에 내리면, 그 사이에 들어온 창이 도는 줄이 있는 줄 알고 서서 기다린다.
   */
  async function drain(): Promise<void> {
    busy = true
    try {
      while (queue.length > 0 && !closed()) {
        const win = queue.shift()!
        const guesses = await classify(toModelRate(win.samples, rate))
        // 기다리는 사이에 버려졌으면 답을 넣지 않는다
        if (closed()) return
        heard = addWindow(heard, guesses, win.start)
        onUpdate(heard, win.start + win.samples.length / rate)
      }
    } catch (e) {
      if (closed()) return
      state = 'closed'
      queue.length = 0
      onError(e instanceof Error ? e.message : '새소리를 판정하지 못했습니다.')
    } finally {
      busy = false
    }
  }

  /** 창들을 줄에 세우고, 돌고 있는 판정이 없으면 돌린다 */
  function enqueue(windows: SoundWindow[]): void {
    if (windows.length === 0) return
    queue.push(...windows)
    if (live) while (queue.length > LIVE_BACKLOG) { queue.shift(); dropped++ }
    if (!busy) tail = drain()
  }

  return {
    push(chunk) { if (state === 'open') enqueue(cutter.push(chunk)) },
    async finish() {
      if (state === 'open') {
        state = 'closing'
        const last = cutter.flush()
        if (last) enqueue([last])
      }
      await tail
      state = 'closed'
    },
    idle: () => tail,
    cancel() { state = 'closed'; queue.length = 0 },
    seconds: () => cutter.seconds(),
    dropped: () => dropped,
  }
}
