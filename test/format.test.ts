import test from 'node:test'
import assert from 'node:assert/strict'
import { formatMeta, formatShot, formatExposure, parseExposure, exposureToSave, formatCoords, zonedParts } from '../src/lib/format.ts'

const ISO = '2026-08-02T02:47:39.734Z'
const pad = (n: number) => String(n).padStart(2, '0')

test('AC7b — 오프셋이 있으면 촬영지 시각을 렌더한다 (뷰어 TZ와 무관)', () => {
  assert.equal(formatMeta(ISO, '+09:00'), '2026.08.02 11:47')
  assert.equal(formatMeta(ISO, '-04:00'), '2026.08.01 22:47')
})

test('AC7b — 뷰어가 뉴욕이어도 서울에서 찍은 사진은 서울 시각으로 보인다', () => {
  if (process.env.TZ !== 'America/New_York') return
  assert.equal(formatMeta(ISO, '+09:00'), '2026.08.02 11:47')
  // 오프셋을 안 넘기면 뷰어 시계로 떨어진다 — 이게 고치려는 버그다
  assert.equal(formatMeta(ISO, null), '2026.08.01 22:47')
})

test('formatMeta(iso, null)은 뷰어 로컬 시각이라는 기존 동작을 유지한다', () => {
  const d = new Date(ISO)
  assert.equal(
    formatMeta(ISO, null),
    `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
  )
})

test('formatMeta — 파싱 못 하는 입력은 그대로 돌려준다', () => {
  assert.equal(formatMeta('깨진 값', '+09:00'), '깨진 값')
  // 오프셋 형식이 어긋나면 뷰어 로컬로 떨어질 뿐 예외를 던지지 않는다
  assert.equal(formatMeta(ISO, '+9'), formatMeta(ISO, null))
})

test('AC7f — 인쇄용 관찰지의 날짜·시각도 촬영지 기준이다', () => {
  const p = zonedParts(ISO, '+09:00')
  assert.ok(p)
  assert.equal(`${p.year}. ${pad(p.month)}. ${pad(p.day)}.`, '2026. 08. 02.')
  assert.equal(`${pad(p.hour)}:${pad(p.minute)}`, '11:47')
  if (process.env.TZ === 'America/New_York') {
    // 오프셋 없이 렌더하면 날짜가 하루 밀린다 — AC7f가 막으려는 것
    const bad = zonedParts(ISO, null)!
    assert.equal(`${bad.year}. ${pad(bad.month)}. ${pad(bad.day)}.`, '2026. 08. 01.')
  }
})

test('AC7c — 월 버킷팅에 쓰는 month는 1~12다', () => {
  assert.equal(zonedParts(ISO, '+09:00')!.month, 8)
  // 촬영지 8월 2일 11:47이 뉴욕 뷰어에게는 8월 1일이다 — 오프셋을 쓰면 8월로 남는다
  assert.equal(zonedParts('2026-09-01T00:30:00.000Z', '+09:00')!.month, 9)
  assert.equal(zonedParts('2026-08-31T20:30:00.000Z', '+09:00')!.day, 1)
})

test('zonedParts — 파싱 실패는 null', () => {
  assert.equal(zonedParts('nope', '+09:00'), null)
})

test('AC7 — formatShot이 목업 형식을 낸다', () => {
  assert.equal(
    formatShot({ focal_length: 400, f_number: 6.3, exposure_time: 0.005, iso: 1000 }),
    '400mm · f/6.3 · 1/200s · ISO 1000',
  )
})

test('formatShot — 없는 항목은 생략하고, 전부 없으면 빈 문자열', () => {
  assert.equal(formatShot({ focal_length: 400, iso: 1000 }), '400mm · ISO 1000')
  assert.equal(formatShot({ f_number: 8 }), 'f/8')
  assert.equal(formatShot({}), '')
  assert.equal(formatShot({ focal_length: null, iso: null }), '')
})

test('formatExposure — 1초 미만은 역수, 그 이상은 초', () => {
  assert.equal(formatExposure(0.005), '1/200s')
  assert.equal(formatExposure(1 / 4000), '1/4000s')
  assert.equal(formatExposure(1), '1s')
  assert.equal(formatExposure(2), '2s')
  assert.equal(formatExposure(2.5), '2.5s')
})

test('formatCoords 회귀', () => {
  assert.equal(formatCoords(38.0692, 128.1704), '38.0692°N 128.1704°E')
  assert.equal(formatCoords(-33.8688, -151.2093), '33.8688°S 151.2093°W')
})

test('formatShot — 0·음수는 렌더하지 않는다 (사람이 고칠 수 있는 칸이라 실제로 들어온다)', () => {
  // AC5로 셔터 칸이 편집 가능해졌고 toNumber('0')은 null이 아니라 0을 준다.
  // 그대로 formatExposure에 넘기면 1/Infinity → "1/Infinitys"가 목록에 찍힌다.
  assert.equal(formatShot({ exposure_time: 0 }), '')
  assert.equal(formatShot({ exposure_time: -1 }), '')
  assert.equal(formatShot({ f_number: 0 }), '')
  assert.equal(formatShot({ focal_length: -5 }), '')
  assert.equal(formatShot({ iso: 0 }), '')
  // 유효한 값만 남기고 나머지는 뺀다
  assert.equal(formatShot({ focal_length: 400, exposure_time: 0, iso: 1000 }), '400mm · ISO 1000')
})

// ── JC-0: 셔터 표기 선재 결함 ─────────────────────────────────────────
// 예전 구현은 `1/Math.round(1/s)`라서 1초 미만을 무조건 정수 역수로 반올림했다.
// 0.4초가 1/3s(=0.333초)로, 0.7·0.8초가 **둘 다 1/1s**로 나왔다 — 값도 표기도 틀렸다.
// 기존 테스트가 왕복이 성립하는 값만 골라 써서 73개가 전부 통과했다.

test('AC-1 — formatExposure가 카메라 표기를 낸다 (1/3스톱 구간 포함)', () => {
  const expected: Array<[number, string]> = [
    [0.4, '1/2.5s'], [0.5, '1/2s'], [0.625, '1/1.6s'], [0.769, '1/1.3s'], [0.8, '1/1.25s'],
    [0.99, '0.99s'], [1, '1s'], [1.25, '1.25s'], [2, '2s'], [30, '30s'],
    [0.005, '1/200s'], [0.002, '1/500s'], [1 / 3, '1/3s'], [1 / 60, '1/60s'], [1 / 4000, '1/4000s'],
  ]
  for (const [seconds, want] of expected) {
    assert.equal(formatExposure(seconds), want, `${seconds}초`)
  }
})

test('AC-2 — 어떤 입력에도 1/1s가 나오지 않는다', () => {
  // 역수가 1에 가까운 구간이 예전 구현의 사고 지점이었다
  for (let s = 0.95; s <= 1.05001; s += 0.005) {
    assert.notEqual(formatExposure(s), '1/1s', `${s}초에서 1/1s`)
  }
  assert.equal(formatExposure(0.7), '1/1.43s')
  assert.equal(formatExposure(0.8), '1/1.25s')
})

test('AC-3 — parseExposure가 카메라 표기와 소수를 모두 받는다', () => {
  assert.equal(parseExposure('1/200'), 0.005)
  assert.equal(parseExposure('1/200s'), 0.005)
  assert.equal(parseExposure('1/2.5s'), 0.4)
  assert.equal(parseExposure('0.005'), 0.005)
  assert.equal(parseExposure('2'), 2)
  assert.equal(parseExposure('2"'), 2)
  assert.equal(parseExposure('2s'), 2)
  assert.equal(parseExposure(' 1/60 '), 1 / 60)
  // 저장하면 안 되는 값은 조용히 0으로 만들지 않고 null
  for (const bad of ['', 'abc', '1/0', '-1', '0', '1/', '/200']) {
    assert.equal(parseExposure(bad), null, JSON.stringify(bad))
  }
})

test('AC-4 — 왕복 오차가 1% 안이다 (rev2 규칙이 4%로 실패한 값 포함)', () => {
  const ladder = [0.4, 0.5, 0.625, 0.769, 0.8, 1, 1.25, 1.6, 2, 2.5, 0.005, 0.002, 1 / 4000, 1 / 3, 1 / 60]
  for (const x of ladder) {
    const back = parseExposure(formatExposure(x))
    assert.ok(back != null, `${x} 왕복 실패`)
    const err = Math.abs(back - x) / x
    assert.ok(err <= 0.01, `${x} → ${formatExposure(x)} → ${back} (오차 ${(err * 100).toFixed(2)}%)`)
  }
})

test('AC-5 — 목록 표시 회귀: 0.769는 1/1s가 아니라 1/1.3s', () => {
  assert.equal(formatShot({ exposure_time: 0.769 }), '1/1.3s')
  assert.equal(formatShot({ focal_length: 400, f_number: 6.3, exposure_time: 0.005, iso: 1000 }),
    '400mm · f/6.3 · 1/200s · ISO 1000')
})

test('AC-15 — 안 건드린 셔터 칸은 EXIF 원본이 그대로 저장된다 (무손실)', () => {
  // 화면에는 카메라 표기를 보여주므로, 그 표기를 되파싱해 저장하면 원본이 틀어진다.
  // 0.769초는 1/1.3s로 보이는데 되파싱하면 0.7692…가 되어 원본과 달라진다.
  for (const raw of [0.769, 0.005, 0.8, 0.4, 1.25, 1 / 3]) {
    const shown = formatExposure(raw)
    assert.equal(exposureToSave(raw, shown, false), raw, `${raw}초를 안 건드렸는데 값이 바뀌었다`)
  }
})

test('AC-14 — 사람이 고치면 카메라 표기와 소수를 둘 다 받는다', () => {
  assert.equal(exposureToSave(0.769, '1/200', true), 0.005)
  assert.equal(exposureToSave(0.769, '0.005', true), 0.005, '기존 소수 입력 습관도 계속 받는다')
  assert.equal(exposureToSave(0.769, '1/200s', true), 0.005)
  assert.equal(exposureToSave(0.769, '', true), null, '비우면 null')
  assert.equal(exposureToSave(null, '', false), null, '사진에 셔터 정보가 없으면 null')
})
