// node --test가 이 파일을 직접 읽는다 — node는 확장자 없는 경로를 못 푼다
import { loudness, MODEL_SAMPLES } from './windows.ts'
import type { SoundClassifier, SoundGuess } from './classifier'

/**
 * 시험용 가짜 판정기. 작업 31(BirdNET이 폰에서 도는지 시험)과 동시에 화면을 먼저 만들려고 둔 것이다 —
 * **소리를 판정하지 않는다.** 창에 소리가 있으면(조용하지 않으면) 아래 대본의 답을 차례로 돌려준다.
 * 받기·준비도 흉내다 (아무것도 받지 않는다). 받아 둔 상태는 메모리에만 있어 새로고침하면 다시 '받기'부터다.
 * 진짜 모델을 붙이면 `soundModel.ts`의 한 줄을 바꾸고, 이 파일은 화면을 시험할 때만 쓴다.
 */

/** 이보다 조용한 창은 "아무 소리도 없음"으로 본다 (RMS). 마이크의 바닥 소음보다 조금 위 */
const QUIET = 0.003

/**
 * 창마다 돌려줄 답 (여덟 창 = 12초마다 되풀이). 화면이 그려야 하는 줄을 모두 거치게 짰다:
 * 믿을 만한 종 · 확실하지 않은 종 · 끊겼다 다시 들린 종 · 앱의 종 표에 없고 이름표에만 국명이 있는 종(호반새·직박구리)
 * · 한국어 이름이 없는 종 · 새가 아닌 줄(Human vocal) · 하한에 못 미치는 줄.
 */
const SCRIPT: SoundGuess[][] = [
  [{ latin: 'Human vocal', en: 'Human vocal', ko: '', score: 0.93 }, { latin: 'Parus minor', en: 'Japanese Tit', ko: '박새', score: 0.86 }],
  [{ latin: 'Parus minor', en: 'Japanese Tit', ko: '박새', score: 0.91 }, { latin: 'Hypsipetes amaurotis', en: 'Brown-eared Bulbul', ko: '직박구리', score: 0.34 }],
  [{ latin: 'Hypsipetes amaurotis', en: 'Brown-eared Bulbul', ko: '직박구리', score: 0.72 }, { latin: 'Ramphocaenus melanurus', en: 'Long-billed Gnatwren', ko: '', score: 0.28 }],
  [{ latin: 'Poecile palustris', en: 'Marsh Tit', ko: '쇠박새', score: 0.12 }],
  [{ latin: 'Halcyon coromanda', en: 'Ruddy Kingfisher', ko: '호반새', score: 0.41 }],
  [],
  [],
  [{ latin: 'Parus minor', en: 'Japanese Tit', ko: '박새', score: 0.78 }],
]

/** ms만큼 기다린다. 0이면 기다리지 않는다 (테스트) */
function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise((done) => setTimeout(done, ms)) : Promise.resolve()
}

/**
 * 가짜 판정기를 만든다. `stepMs`는 흉내 내는 시간의 단위 — 받기는 10걸음, 준비는 6걸음, 판정은 한 번에 20ms쯤.
 * 테스트는 0을 넣어 기다리지 않는다.
 */
export function makeFakeClassifier({ stepMs = 150 }: { stepMs?: number } = {}): SoundClassifier {
  let cached = false
  let loaded = false
  let turn = 0

  return {
    id: 'fake-sound',
    label: '새소리 판정 (시험용 가짜)',
    sizeMb: 53,
    demo: true,
    isCached: async () => cached,
    clearCache: async () => { cached = false; loaded = false; turn = 0 },

    async load(onProgress) {
      if (loaded) { onProgress(1); return }
      if (!cached) {
        for (let i = 1; i <= 10; i++) { await wait(stepMs); onProgress(Math.min(0.99, i / 10)) }
        cached = true
      }
      onProgress(1)
      // 진짜 모델의 '준비 중'(첫 판정이 셰이더를 만드는 시간)을 흉내 낸다
      await wait(stepMs * 6)
      loaded = true
    },

    async classify(samples) {
      if (!loaded) throw new Error('새소리 모델이 아직 준비되지 않았습니다.')
      if (samples.length !== MODEL_SAMPLES) throw new Error(`판정 창의 길이가 맞지 않습니다 (${samples.length}).`)
      await wait(Math.min(stepMs, 20))
      if (loudness(samples) < QUIET) return []
      return SCRIPT[turn++ % SCRIPT.length]
    },
  }
}
