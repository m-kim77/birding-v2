import { localParts, zonedParts, type ZonedParts } from '../lib/format'
import type { Sighting } from '../types'

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * 기록의 촬영 시각을 **촬영지 시간대**로 푼다. 서울에서 찍은 사진은 어디서 열어도 서울 시각으로 보여야 한다.
 * 오프셋을 모르는 기록(사진에 시간대가 없었다)은 지금 브라우저의 시간대로 푼다.
 */
function partsOf(s: Pick<Sighting, 'capturedAt' | 'capturedAtOffset'>): ZonedParts {
  return zonedParts(s.capturedAt, s.capturedAtOffset) ?? localParts(new Date(s.capturedAt))
}

/** '9월 15일' */
export function dayOf(s: Pick<Sighting, 'capturedAt' | 'capturedAtOffset'>): string {
  const p = partsOf(s)
  return `${p.month}월 ${p.day}일`
}

/** '2026. 09. 15. 06:48' */
export function dateTimeOf(s: Pick<Sighting, 'capturedAt' | 'capturedAtOffset'>): string {
  const p = partsOf(s)
  return `${p.year}. ${pad2(p.month)}. ${pad2(p.day)}. ${pad2(p.hour)}:${pad2(p.minute)}`
}

/** 목록을 묶는 달 제목. '2026년 9월' */
export function monthOf(s: Pick<Sighting, 'capturedAt' | 'capturedAtOffset'>): string {
  const p = partsOf(s)
  return `${p.year}년 ${p.month}월`
}

/** 카드에 쓰는 날짜. '09 · 22 · 2026' (Card Reveal 디자인의 표기) */
export function dotDateOf(s: Pick<Sighting, 'capturedAt' | 'capturedAtOffset'>): string {
  const p = partsOf(s)
  return `${pad2(p.month)} · ${pad2(p.day)} · ${p.year}`
}
