import test from 'node:test'
import assert from 'node:assert/strict'
import { cardName, cardPlace, dexLabel, shotLine } from '../src/features/dex/cardText.ts'
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
