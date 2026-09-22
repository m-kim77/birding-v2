// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { localParts, zonedParts, type ZonedParts } from '../lib/format.ts'
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

/** 'YYYY-MM-DD' */
function fileDate(p: ZonedParts): string {
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}

/**
 * 파일 이름에 넣는 촬영 날짜 'YYYY-MM-DD' — **촬영지 날짜**다.
 * `capturedAt.slice(0, 10)`은 UTC라 한국의 새벽 사진이 전날 날짜로 나간다.
 */
export function fileDateOf(s: Pick<Sighting, 'capturedAt' | 'capturedAtOffset'>): string {
  return fileDate(partsOf(s))
}

/** 파일 이름에 넣는 오늘 날짜 'YYYY-MM-DD' — 브라우저 시간대 기준 (백업 파일 이름) */
export function fileDateToday(now = new Date()): string {
  return fileDate(localParts(now))
}

/**
 * 어떤 시각이 얼마나 지났는지. '오늘' · '어제' · 'N일 전'. 날짜 경계는 브라우저 시간대다.
 * 빈 문자열이나 못 읽는 값이면 null (부르는 쪽이 "한 번도 없음"으로 쓴다). 미래 시각(기기 시계가 뒤로 간 경우)은 '오늘'로 둔다.
 */
export function daysAgoOf(iso: string, now = new Date()): string | null {
  const then = new Date(iso)
  if (!iso || Number.isNaN(then.getTime())) return null
  const a = localParts(then)
  const b = localParts(now)
  const days = Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000)
  if (days <= 0) return '오늘'
  if (days === 1) return '어제'
  return `${days}일 전`
}
