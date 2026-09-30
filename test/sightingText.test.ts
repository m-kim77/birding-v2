import test from 'node:test'
import assert from 'node:assert/strict'
import { UNNAMED, nameText, placeText, sourceText } from '../src/ui/sightingText.ts'

test("nameText: 이름이 비어 있으면 '이름 미정', 있으면 그대로 — 화면 글자를 고정한다", () => {
  assert.equal(UNNAMED, '이름 미정')
  assert.equal(nameText(''), '이름 미정')
  assert.equal(nameText(undefined), '이름 미정')
  assert.equal(nameText('딱새'), '딱새')
})

test("placeText: 장소 이름 → 좌표(소수 4자리) → '위치 없음'", () => {
  // 좌표는 지어낸 값이다 (실제 장소가 아니다)
  assert.equal(placeText({ name: '가상 습지', lat: 20.123456, lng: 40.5 }), '가상 습지')
  assert.equal(placeText({ name: '', lat: 20.123456, lng: 40.5 }), '20.1235, 40.5000')
  assert.equal(placeText({ name: '', lat: null, lng: null }), '위치 없음')
})

test('sourceText: 출처 네 가지의 말, 위치가 없을 때는 부르는 쪽의 말 — 기본은 빈 글자', () => {
  assert.equal(sourceText('exif'), '사진 정보에서')
  assert.equal(sourceText('tracklog'), '이동 기록으로 추정')
  assert.equal(sourceText('gps'), '기록할 때의 현재 위치')
  assert.equal(sourceText('manual', '위치 없음 — 눌러서 고르기'), '지도에서 직접 고름', '출처가 있으면 둘째 인자를 쓰지 않는다')
  assert.equal(sourceText('none'), '')
  assert.equal(sourceText('none', '위치 없음 — 눌러서 고르기'), '위치 없음 — 눌러서 고르기')
})
