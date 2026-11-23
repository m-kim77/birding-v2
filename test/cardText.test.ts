import test from 'node:test'
import assert from 'node:assert/strict'
import { CARD_BACK_TITLE, cardFontText, cardName, cardPlace, dexLabel, shotLine } from '../src/features/dex/cardText.ts'
import type { Sighting } from '../src/types.ts'

/** 글자 계산에 쓰는 칸만 든 기록. 장소 이름은 지어낸 것 */
const rec = (p: Partial<Sighting>) => ({ speciesKo: '', place: '', sensitive: false, shot: {}, ...p }) as Sighting

test('cardName: 이름이 있으면 그대로, 비어 있으면 "이름 미정" (화면 카드와 내보낸 카드가 같은 말)', () => {
  assert.equal(cardName(rec({ speciesKo: '딱새' })), '딱새')
  assert.equal(cardName(rec({ speciesKo: '' })), '이름 미정')
  assert.equal(cardName({ speciesKo: undefined as unknown as string }), '이름 미정')
})

test('cardPlace: 위치를 숨긴 기록은 장소가 있어도 "위치 비공개"', () => {
  assert.equal(cardPlace(rec({ place: '가상 숲 둥지', sensitive: true })), '위치 비공개')
  assert.equal(cardPlace(rec({ place: '', sensitive: true })), '위치 비공개')
})

test('cardPlace: 숨기지 않은 기록은 장소 그대로 — 장소가 없으면 빈 글자, 옛 기록(sensitive 없음)도 숨기지 않은 것', () => {
  assert.equal(cardPlace(rec({ place: '가상 갯벌 공원' })), '가상 갯벌 공원')
  assert.equal(cardPlace(rec({ place: '' })), '')
  assert.equal(cardPlace({ place: '가상 호숫가', sensitive: undefined as unknown as boolean }), '가상 호숫가')
})

test('dexLabel: 번호는 세 자리로 채우고, 번호가 없으면 "No. —"', () => {
  assert.equal(dexLabel(3), 'No. 003')
  assert.equal(dexLabel(120), 'No. 120')
  assert.equal(dexLabel(undefined), 'No. —')
  assert.equal(dexLabel(0), 'No. —')
})

test('shotLine: 촬영 정보를 한 줄 대문자로, 없으면 빈 글자', () => {
  assert.equal(shotLine(rec({ shot: { focalLength: 400, fNumber: 6.3, exposureTime: 0.005, iso: 1000 } })), '400MM · F/6.3 · 1/200S · ISO 1000')
  assert.equal(shotLine(rec({ shot: { focalLength: 400, iso: 1000 } })), '400MM · ISO 1000')
  assert.equal(shotLine(rec({ shot: {} })), '')
})

test('cardFontText: 장소 줄은 본문 글꼴(Pretendard)의 글에 든다 — 빠지면 한글 조각을 기다리지 않아 장소가 대체 글꼴로 그려진다', () => {
  const s = rec({ speciesKo: '딱새', place: '가상 갯벌 공원', latin: 'Phoenicurus auroreus', capturedAt: '2026-05-03T06:30:00+09:00', capturedAtOffset: '+09:00', stamps: [], shot: { focalLength: 400, iso: 1000 } })
  const t = cardFontText(s, 3)
  assert.equal(t.body, '가상 갯벌 공원')
  // 이름 글꼴에는 앞면의 이름과 영상 뒷면의 글이 함께 든다
  assert.ok(t.name.includes('딱새') && t.name.includes(CARD_BACK_TITLE))
  assert.equal(t.latin, 'Phoenicurus auroreus')
  for (const part of ['NO. 003', 'FIELD CARD', '05 · 03 · 2026', '400MM · ISO 1000']) assert.ok(t.mono.includes(part), part)
})

test('cardFontText: 위치를 숨긴 기록은 "위치 비공개"를, 그리지 않는 글꼴은 빈 글자를 준다 (그 글꼴은 기다리지 않는다)', () => {
  const t = cardFontText(rec({ speciesKo: '', place: '가상 둥지', sensitive: true, latin: '', capturedAt: '2026-05-03T06:30:00+09:00', capturedAtOffset: '+09:00', stamps: [] }), undefined)
  assert.equal(t.body, '위치 비공개')
  assert.equal(t.latin, '')
  assert.ok(t.name.includes('이름 미정'))
  assert.equal(cardFontText(rec({ place: '', capturedAt: '2026-05-03T06:30:00+09:00', capturedAtOffset: null, stamps: [] }), 1).body, '')
})
