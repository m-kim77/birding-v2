// node --test가 이 파일을 직접 읽는다 — node는 확장자 없는 경로를 못 푼다
import { koOf } from '../../data/species.ts'
import type { SoundGuess } from './classifier'

/**
 * 새소리 판정 규칙 (순수). 3초 창마다 나온 모델의 답을 "들린 종 목록"으로 접는다.
 * v1 `audio_detection_test`(segments.py·verdict.py)에서 가져온 것: 3초 창 · 1.5초 간격 · 같은 종이 1.5초 안에 이어지면 한 덩어리 ·
 * 점수는 최고 신뢰도가 주(主)이고 반복은 조금만 가산 · 문턱(0.5)을 넘은 종이 못 넘은 종 아래로 가지 않는다.
 * v1과 다른 것: v1은 "이 녹음의 새 한 종"을 답하려고 창마다 1순위만 셌다. 여기는 들린 종을 모두 보여 주는 목록이라
 * 하한을 넘은 줄을 다 센다 — 숲에서는 여러 종이 같이 운다.
 */

/** 판정 창 길이(초) — BirdNET의 입력 */
export const WINDOW_SECONDS = 3
/** 창을 옮기는 간격(초). 창이 절반씩 겹친다 — 창의 경계에 걸친 울음을 놓치지 않게 */
export const HOP_SECONDS = 1.5
/** 같은 종이 이 간격(초) 안에 다시 들리면 같은 덩어리로 본다 — 겹치는 창이 한 번의 울음을 여러 번으로 부풀리지 않게 */
export const MERGE_GAP_SECONDS = 1.5
/**
 * 이 점수 미만은 목록에 올리지 않는다. **임시값이다** — 작업 31에서 실제 소리를 들어 보고 정한다.
 * 공식 앱은 코드 기본 0.15, 소개 글은 0.25. 한국에 없는 종이 낮은 점수로 많이 떠서 높은 쪽으로 시작한다
 */
export const MIN_SCORE = 0.25
/** 이 점수 이상이면 믿을 만하다. 미만은 "확실하지 않음"을 붙인다 (v1 DECIDED_THRESHOLD, BirdNET 계열의 관례) */
export const SURE_SCORE = 0.5
/** 반복 가산의 상한(+15%)과 거기 닿는 덩어리 수 (v1 SUPPORT_WEIGHT·SUPPORT_SATURATION) */
const SUPPORT_WEIGHT = 0.15
const SUPPORT_SATURATION = 8

/** 들린 종 하나 — 창 단위의 답을 종 단위로 접은 것 */
export interface HeardSpecies {
  latin: string
  /** 모델 이름표의 한국어·영어 이름. 앱의 종 표에 없는 종을 보여 줄 때 쓴다 (nameOf) */
  labelKo: string
  labelEn: string
  /** 이 종이 들린 창들 중 가장 높은 점수 (0~1). 화면의 %는 이 값이다 */
  peak: number
  /** 이 종이 하한을 넘은 창의 수 (겹치는 창 포함) */
  windows: number
  /** 끊기지 않고 이어진 덩어리들 [시작, 끝] (초, 시간순). **울음 횟수가 아니라 덩어리 수다** */
  spans: Array<[number, number]>
}

/** 앞뒤 빈칸을 떼고 낱말 사이를 빈칸 하나로 */
function tidy(text: string): string {
  return text.trim().split(/\s+/).join(' ')
}

/** 학명을 견줄 때의 열쇠 — 대소문자와 빈칸 차이를 없앤다 */
function keyOf(latin: string): string {
  return tidy(latin).toLowerCase()
}

/**
 * 이름표의 줄이 종(학명)인지. 새가 아닌 줄(Engine · Human vocal · Siren …)을 거른다 — 그런 줄은 학명 자리와 영어 이름 자리가 같은 글이다.
 * 학명 꼴(속명은 대문자로, 종소명은 소문자로 시작, 글자만, 두세 낱말)이 아닌 것도 거른다 (v1 `_binomial_or_empty`).
 * 개구리·곤충처럼 학명이 있는 다른 동물은 못 거른다 — 그것은 지역 모델이나 종 목록의 일이다.
 */
export function isSpecies(guess: SoundGuess): boolean {
  const latin = tidy(guess.latin)
  if (latin.toLowerCase() === tidy(guess.en).toLowerCase()) return false
  return /^[A-Z][a-z]+( [a-z]+){1,2}$/.test(latin)
}

/**
 * 창 하나의 답을 목록에 더한다. 받은 목록은 고치지 않고 새 목록을 돌려준다 (React 상태로 쓴다).
 * 하한(`minScore`) 미만·새가 아닌 줄·점수가 숫자가 아닌 줄은 버린다. 같은 창에 같은 종이 두 번 오면 높은 점수 하나로 센다.
 * `startSec`은 이 창의 시작(초) — 창은 시간순으로 넣는다.
 */
export function addWindow(heard: HeardSpecies[], guesses: SoundGuess[], startSec: number, minScore = MIN_SCORE): HeardSpecies[] {
  const end = startSec + WINDOW_SECONDS
  const best = new Map<string, SoundGuess>()
  for (const g of guesses) {
    if (!Number.isFinite(g.score) || g.score < minScore || !isSpecies(g)) continue
    const key = keyOf(g.latin)
    if ((best.get(key)?.score ?? -1) < g.score) best.set(key, g)
  }
  if (best.size === 0) return heard
  const next = heard.map((h) => {
    const g = best.get(keyOf(h.latin))
    if (!g) return h
    best.delete(keyOf(h.latin))
    const last = h.spans[h.spans.length - 1]
    const spans: Array<[number, number]> = startSec - last[1] <= MERGE_GAP_SECONDS
      ? [...h.spans.slice(0, -1), [last[0], Math.max(last[1], end)]]
      : [...h.spans, [startSec, end]]
    return { ...h, peak: Math.max(h.peak, Math.min(1, g.score)), windows: h.windows + 1, spans }
  })
  for (const g of best.values()) {
    next.push({ latin: tidy(g.latin), labelKo: g.ko.trim(), labelEn: g.en.trim(), peak: Math.min(1, g.score), windows: 1, spans: [[startSec, end]] })
  }
  return next
}

/** 반복해서 들린 종의 가산 배수. 한 덩어리면 1, 여덟 덩어리 이상이면 1.15 — 그 위로 오르지 않는다 (v1 `_support_multiplier`) */
export function supportMultiplier(spans: number): number {
  if (spans <= 1) return 1
  return 1 + SUPPORT_WEIGHT * Math.min(1, Math.log2(spans) / Math.log2(SUPPORT_SATURATION))
}

/**
 * 보여 줄 순서. 믿을 만한 종(SURE_SCORE 이상)이 먼저, 그 안에서 점수(최고 신뢰도 × 반복 가산) 높은 순, 같으면 먼저 들린 순.
 * 문턱으로 먼저 가르는 이유: 가산만으로는 0.49가 세 번 들리면 0.52 한 번을 이긴다 (v1 판정-읽는-법.md).
 */
export function sortHeard(heard: HeardSpecies[]): HeardSpecies[] {
  const score = (h: HeardSpecies) => h.peak * supportMultiplier(h.spans.length)
  const tier = (h: HeardSpecies) => (h.peak >= SURE_SCORE ? 0 : 1)
  return [...heard].sort((a, b) => tier(a) - tier(b) || score(b) - score(a) || b.peak - a.peak || a.spans[0][0] - b.spans[0][0])
}

/**
 * 보여 줄 이름. 국명은 앱의 종 표(`data/species.ts`) → 이름표의 한국어 → 없으면 학명을 제목으로.
 * 국명은 저장하지 않고 보여 주는 이 자리에서만 붙인다 — 종 표를 고치면 다음 화면부터 바뀐다.
 * 이름표의 한국어 자리에 한글이 없으면(영어 이름이 그대로 든 줄) 한국어 이름이 없는 것으로 본다.
 */
export function nameOf(h: Pick<HeardSpecies, 'latin' | 'labelKo' | 'labelEn'>): { title: string; sub: string } {
  const ko = koOf(h.latin) || (/[가-힣]/.test(h.labelKo) ? h.labelKo : '')
  return ko ? { title: ko, sub: h.latin } : { title: h.latin, sub: h.labelEn }
}

/** 마지막으로 들린 때(초) — 그 종의 마지막 덩어리의 끝 */
export function lastHeard(h: HeardSpecies): number {
  return h.spans[h.spans.length - 1][1]
}

/** 초를 '분:초'로 (0:07 · 12:30). 음수나 숫자가 아닌 값은 0:00 */
export function clockOf(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
