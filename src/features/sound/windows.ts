// node --test가 이 파일을 직접 읽는다 — node는 확장자 없는 경로를 못 푼다
import { HOP_SECONDS, WINDOW_SECONDS } from './heard.ts'

/**
 * 소리를 판정 창으로 자르기 (순수). 마이크에서 흘러 들어오는 조각이든 파일에서 읽은 통소리든 같은 길로 자른다.
 * 자르는 것은 들어온 표본율 그대로 하고, 모델에 넣기 직전에 창 하나씩 48kHz로 바꾼다 (toModelRate) —
 * 흐르는 소리를 조각마다 바꾸면 조각의 경계에서 이어 붙일 상태를 들고 다녀야 한다.
 */

/** 모델이 받는 표본율과 창 하나의 길이 (BirdNET 2.4: 3초 × 48kHz = 144,000개) */
export const MODEL_RATE = 48000
export const MODEL_SAMPLES = WINDOW_SECONDS * MODEL_RATE

/** 잘라 낸 창 하나 */
export interface SoundWindow {
  /** 이 창의 시작 (초, 듣기 시작부터) */
  start: number
  /** 들어온 표본율 그대로의 소리. 길이는 늘 창 길이다 (모자라면 뒤가 0) */
  samples: Float32Array
}

/**
 * 소리 조각을 받아 3초 창을 1.5초 간격으로 잘라 내는 도구. `rate`는 들어오는 소리의 표본율.
 * - `push(조각)`: 다 찬 창들을 돌려준다 (없으면 빈 배열).
 * - `flush()`: 남은 소리를 뒤를 0으로 채워 마지막 창으로 돌려준다 (공식 구현과 같다). 남은 소리가 없거나
 *   앞의 창이 이미 다 덮었으면 null. 3초보다 짧은 소리는 여기서 창 하나가 된다.
 * - `seconds()`: 지금까지 받은 소리의 길이.
 */
export function makeCutter(rate: number) {
  const size = Math.round(WINDOW_SECONDS * rate)
  const hop = Math.round(HOP_SECONDS * rate)
  /** 아직 다음 창이 되지 못한 소리. 앞 창과 겹치는 부분(창 − 간격)이 맨 앞에 남아 있다 */
  let rest = new Float32Array(0)
  let cut = 0
  let received = 0

  return {
    push(chunk: Float32Array): SoundWindow[] {
      received += chunk.length
      const all = new Float32Array(rest.length + chunk.length)
      all.set(rest)
      all.set(chunk, rest.length)
      const out: SoundWindow[] = []
      let at = 0
      while (all.length - at >= size) {
        out.push({ start: (cut * hop) / rate, samples: all.slice(at, at + size) })
        cut++
        at += hop
      }
      rest = all.slice(at)
      return out
    },
    flush(): SoundWindow | null {
      // 창을 하나라도 잘랐으면 남은 것의 앞 (창 − 간격)만큼은 그 창이 이미 들은 소리다
      const fresh = cut === 0 ? rest.length : rest.length - (size - hop)
      if (fresh <= 0) return null
      const samples = new Float32Array(size)
      samples.set(rest)
      const out = { start: (cut * hop) / rate, samples }
      cut++
      rest = new Float32Array(0)
      return out
    },
    seconds: () => received / rate,
  }
}

/**
 * 창 하나를 모델의 표본율(48kHz)·길이(144,000개)로 맞춘다. 이미 48kHz면 길이만 맞춘다 (모자라면 뒤를 0으로, 넘치면 자른다).
 * 표본율이 다르면 이웃 두 값 사이를 곧게 이어 바꾼다 — 마이크를 48kHz로 열지 못한 브라우저(파이어폭스)의 길이다.
 * 곧게 잇는 방식은 표본율을 **낮출 때** 높은 소리가 접혀 들어올 수 있다 (96kHz 마이크 등) — 그런 기기가 나오면 거르개를 더한다.
 */
export function toModelRate(samples: Float32Array, rate: number): Float32Array {
  const out = new Float32Array(MODEL_SAMPLES)
  if (rate === MODEL_RATE) {
    out.set(samples.subarray(0, MODEL_SAMPLES))
    return out
  }
  if (!(rate > 0) || samples.length === 0) return out
  const step = rate / MODEL_RATE
  for (let i = 0; i < MODEL_SAMPLES; i++) {
    const at = i * step
    const left = Math.floor(at)
    if (left >= samples.length) break
    const right = Math.min(left + 1, samples.length - 1)
    out[i] = samples[left] + (samples[right] - samples[left]) * (at - left)
  }
  return out
}

/** 소리의 크기 (RMS, 0~1). 비어 있으면 0. 듣는 중의 크기 막대와 가짜 판정기의 "소리가 났는지"에 쓴다 */
export function loudness(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

/**
 * 소리의 크기를 막대의 길이(0~1)로. 귀가 느끼는 크기에 맞춰 데시벨로 편다 — −60dB 이하가 0, 0dB가 1.
 * 그대로 그리면 멀리서 우는 새(RMS 0.01쯤)는 막대가 거의 움직이지 않는다.
 */
export function meterLevel(rms: number): number {
  if (!(rms > 0)) return 0
  return Math.min(1, Math.max(0, (20 * Math.log10(rms) + 60) / 60))
}
