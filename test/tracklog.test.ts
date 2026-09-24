import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { detectShape, extractPoints, parseCoord, parseTimelineText } from '../src/lib/tracklog/parse.ts'
import { explainMiss, matchTrackPoint, tierOf, TIER1_SOURCES, type TrackMatch } from '../src/lib/tracklog/match.ts'
import { comparePoints, dayKeyOf, groupByDay, mergeSorted, rangeOf } from '../src/lib/tracklog/points.ts'
import { fixture } from './helpers.ts'

// 픽스처는 v1 조각의 좌표를 옮긴 가짜다. 시각·출처·정확도는 v1 그대로라 간격·tier·deltaSec 기대값이 v1과 같다.
// 옮긴 양과 실제 좌표는 적지 않는다 — 둘 중 하나라도 있으면 가짜 조각을 실제 이동 경로로 되돌릴 수 있다 (WORK_ORDERS.md 작업 4).
const SLICE = readFileSync(fixture('timeline-slice.json'), 'utf8')
const PARSED = parseTimelineText(SLICE)
const POINTS = mergeSorted([], PARSED).points
const at = (iso: string) => matchTrackPoint(POINTS, Date.parse(iso))

type Matched = Extract<TrackMatch, { matched: true }>
/** matched:true를 단언하고 좁힌 결과를 돌려준다 (union이라 그냥은 lat에 못 닿는다) */
function hit(m: TrackMatch, label?: string): Matched {
  assert.equal(m.matched, true, label)
  return m as Matched
}

// ── 1. parseCoord ────────────────────────────────────────────────────────
test('parseCoord — 정상·음수·공백 변형·깨진 문자열', () => {
  assert.deepEqual(parseCoord('37.5665000°, 126.9780000°'), { lat: 37.5665, lng: 126.978 })
  assert.deepEqual(parseCoord('-33.8688°,151.2093°'), { lat: -33.8688, lng: 151.2093 })
  assert.deepEqual(parseCoord('  37.48 °  ,  126.88 °  '), { lat: 37.48, lng: 126.88 })
  assert.equal(parseCoord('37.48, 126.88'), null, '도 기호가 없으면 형식이 아니다')
  assert.equal(parseCoord('깨진 값'), null)
  assert.equal(parseCoord(null), null)
  assert.equal(parseCoord(undefined), null)
})

// ── 2. detectShape / extractPoints ───────────────────────────────────────
test('detectShape — 최상위 배열은 아이폰, rawSignals/semanticSegments 배열은 안드로이드, 그 밖은 unknown', () => {
  assert.equal(detectShape([]), 'iphone')
  assert.equal(detectShape([{ placeID: 'x' }]), 'iphone')
  assert.equal(detectShape({ rawSignals: [] }), 'android')
  assert.equal(detectShape({ semanticSegments: [] }), 'android')
  assert.equal(detectShape({}), 'unknown')
  assert.equal(detectShape({ rawSignals: null }), 'unknown', '배열이 아니면 안드로이드 모양이 아니다')
  assert.equal(detectShape(null), 'unknown')
  assert.equal(detectShape('문자열'), 'unknown')
})

test('extractPoints — 아이폰 모양(최상위 배열)은 "아직 읽지 못한다"고 던진다', () => {
  assert.throws(() => extractPoints([{ placeID: 'x' }]), /아이폰/)
  assert.throws(() => extractPoints([]), /아이폰/)
})

test('extractPoints — 두 배열이 다 없으면 실제 최상위 키를 담아 던진다', () => {
  assert.throws(() => extractPoints({ Records: [], foo: 1 }), /최상위 키: Records, foo/)
  assert.throws(() => extractPoints({}), /최상위 키: \(없음\)/)
  assert.throws(() => extractPoints(null), /최상위 키: \(없음\)/)
})

test('extractPoints — 배열은 있는데 좌표가 0개면 조용히 성공하지 않는다', () => {
  assert.throws(() => extractPoints({ rawSignals: [{ activity: {} }] }), /좌표를 한 점도 찾지 못했습니다/)
})

test('extractPoints — 한쪽만 있어도 처리한다', () => {
  const only = extractPoints({
    semanticSegments: [{ timelinePath: [{ point: '37.0°, 127.0°', time: '2026-05-22T14:02:00.000+09:00' }] }],
  })
  assert.equal(only.length, 1)
  assert.equal(only[0].source, 'PATH')
  assert.equal(only[0].accuracy, null, 'timelinePath에는 정확도가 없다')
  assert.equal(only[0].t, Date.parse('2026-05-22T05:02:00Z'), '오프셋이 붙은 시각도 Date.parse로 epoch ms가 된다 — 시간대 변환 없음')
})

test('extractPoints — position 없는 신호와 timelinePath 없는 구간은 건너뛰고, 형식이 어긋난 점만 빠진다', () => {
  const pts = extractPoints({
    rawSignals: [
      { wifiScan: {} },
      { activityRecord: {} },
      { position: { LatLng: '깨진 값', timestamp: '2026-05-22T05:00:00Z', source: 'GPS', accuracyMeters: 5 } },
      { position: { LatLng: '1.0°, 2.0°', timestamp: '깨진 시각', source: 'GPS', accuracyMeters: 5 } },
      { position: { LatLng: '1.0°, 2.0°', timestamp: '2026-05-22T05:00:00Z', source: 'WIFI', accuracyMeters: 12.6 } },
      { position: { LatLng: '1.0°, 2.0°', timestamp: '2026-05-22T05:01:00Z', accuracyMeters: 'abc' } },
    ],
    semanticSegments: [{ visit: {} }, { activity: {} }],
  })
  assert.equal(pts.length, 2)
  assert.deepEqual(pts[0], { t: Date.parse('2026-05-22T05:00:00Z'), source: 'WIFI', lat: 1, lng: 2, accuracy: 13 }, '정확도는 반올림')
  assert.equal(pts[1].source, 'UNKNOWN', 'source가 없으면 UNKNOWN')
  assert.equal(pts[1].accuracy, null, '정확도가 숫자가 아니면 null')
})

test('extractPoints — 픽스처에 섞인 가짜 신호(wifiScan·activityRecord)·구간(visit·activity)을 건너뛰고도 504점이다', () => {
  const json = JSON.parse(SLICE) as { rawSignals: Array<Record<string, unknown>>; semanticSegments: Array<Record<string, unknown>> }
  assert.ok(json.rawSignals.some((s) => !s.position), '픽스처에 position 없는 신호가 있어야 건너뛰기를 검증한다')
  assert.ok(json.semanticSegments.some((s) => !Array.isArray(s.timelinePath)), '픽스처에 timelinePath 없는 구간이 있어야 한다')
  assert.equal(PARSED.length, 504)
})

test('parseTimelineText — JSON이 아니면 한국어로 던지고, JSON이면 extractPoints와 같다', () => {
  assert.throws(() => parseTimelineText('{'), /JSON 형식이 아닙니다/)
  assert.throws(() => parseTimelineText(''), /JSON 형식이 아닙니다/)
  assert.throws(() => parseTimelineText('[]'), /아이폰/)
  assert.deepEqual(parseTimelineText(SLICE), extractPoints(JSON.parse(SLICE)))
})

// ── 3·4. 합치기 ──────────────────────────────────────────────────────────
test('AC12(축약본) — 첫 임포트는 전부 새로 들어간다', () => {
  const r = mergeSorted([], PARSED)
  assert.equal(r.added, 504)
  assert.equal(r.points.length, 504)
})

test('AC11 — 재업로드해도 점이 늘지 않는다', () => {
  const r = mergeSorted(POINTS, PARSED)
  assert.equal(r.added, 0)
  assert.equal(r.points.length, POINTS.length)
})

// ── 5~10. 매칭 앵커 (v1 기대값 그대로) ───────────────────────────────────
test('AC13e 양성 — Tier 1 완전한 쌍', () => {
  const m = hit(at('2026-08-02T02:47:39.734Z'))
  assert.equal(m.tier, 1)
  assert.equal(m.gapMin, 2.6)
  // v1의 실측 기대 좌표를 픽스처와 같은 양만큼 옮긴 값. ±0.0005° ≈ 50m
  const dLat = Math.abs(m.lat - 7.546962)
  const dLng = Math.abs(m.lng - -28.99732)
  assert.ok(dLat < 0.0005 && dLng < 0.0005, `기대값에서 lat ${dLat.toFixed(6)}°, lng ${dLng.toFixed(6)}° 벗어남`)
  assert.deepEqual(m.before, { source: 'WIFI', accuracy: 34, deltaSec: -151 })
  assert.deepEqual(m.after, { source: 'WIFI', accuracy: 30, deltaSec: 4 })
  assert.ok(m.spanM >= 0 && Number.isFinite(m.spanM))
})

test('AC13f 폴백 — Tier 1 보관 구간 밖은 PATH로 매칭된다 (no_track이 아니다)', () => {
  for (const [iso, gapMin] of [
    ['2026-05-22T05:03:00Z', 4.0],
    ['2026-05-27T04:22:00Z', 2.0],
    ['2026-05-30T02:18:00Z', 10.0],
  ] as const) {
    const m = hit(at(iso), iso)
    assert.equal(m.tier, 2, iso)
    assert.equal(m.gapMin, gapMin, iso)
  }
})

test('AC13f2 — 윈도우 실효성: Tier 1이 0.3분 전에 있어도 쌍이 안 되면 PATH로 폴백한다', () => {
  // ⚠️ C1 회귀의 유일한 센서다. 윈도우 폭을 넓히면 Tier 1의 +62.1분 점이 잡혀
  // tier:1로 바뀌고, v1 rev2의 Tier 2 사문화가 다른 테스트는 전부 통과한 채로 되살아난다.
  const center = Date.parse('2026-07-24T15:52:00Z')
  const tier1 = POINTS.filter((p) => tierOf(p) === 1)
  const t1before = tier1.filter((p) => p.t < center).at(-1)
  const t1after = tier1.find((p) => p.t >= center)
  assert.ok(t1before && t1after)
  assert.equal(((t1before.t - center) / 60000).toFixed(1), '-0.3', 'Tier 1 앞쪽은 윈도우 안에 있다')
  assert.equal(((t1after.t - center) / 60000).toFixed(1), '62.1', 'Tier 1 뒤쪽은 윈도우(30분) 밖이다')

  const m = hit(at('2026-07-24T15:52:00Z'))
  assert.equal(m.tier, 2, 'Tier 1 끝점이 하나 있어도 쌍이 아니면 버리고 Tier 2로 간다')
  assert.equal(m.gapMin, 11.0)
})

test('AC13g 윈도우 경계 — ±17.5분은 안, ±116분은 밖', () => {
  const inside = hit(at('2026-05-22T10:18:30Z'))
  assert.equal(inside.tier, 2)
  assert.equal(inside.gapMin, 35.0, 'span 35분이어도 양끝이 윈도우 안이면 매칭된다')

  const outside = at('2026-05-22T07:52:00Z')
  assert.equal(outside.matched, false)
  assert.equal(!outside.matched && outside.reason, 'no_track')
})

test('AC13a2 — reason은 no_track과 one_sided 2종뿐이고 gap_too_large는 없다', () => {
  for (const iso of ['2026-07-25T08:45:00Z', '2026-07-21T09:06:00Z']) {
    const m = at(iso)
    assert.equal(m.matched, false, iso)
    assert.equal(!m.matched && m.reason, 'one_sided', iso)
  }
  // gapMin이 판정에 쓰였다면 AC13g inside(35분)가 실패했을 것이다
  const inside = at('2026-05-22T10:18:30Z')
  assert.equal(inside.matched, true)
  assert.equal(JSON.stringify(inside).includes('gap_too_large'), false)
})

test('AC13b — 한쪽 이웃만 있으면 최근접으로 스냅하지 않는다', () => {
  const m = at('2026-07-25T08:45:00Z')
  assert.equal(m.matched, false)
  assert.equal('lat' in m, false, '보간은 두 점을 전제한다 — 좌표를 내놓으면 안 된다')
  assert.equal('lng' in m, false)
})

// ── 11·12. tier 경계 ─────────────────────────────────────────────────────
test('Tier 경계 — accuracy가 정확히 100이면 Tier 1이 아니다', () => {
  const isT1Source = (s: string) => TIER1_SOURCES.includes(s)
  const strict = POINTS.filter((p) => isT1Source(p.source) && p.accuracy !== null && p.accuracy < 100).length
  const loose = POINTS.filter((p) => isT1Source(p.source) && p.accuracy !== null && p.accuracy <= 100).length
  const exactly100 = POINTS.filter((p) => p.accuracy === 100).length
  assert.ok(exactly100 > 0, '경계를 검증할 표본이 픽스처에 있어야 한다')
  assert.ok(loose > strict, '<= 로 바꾸면 Tier 1이 넓어진다 — 이 경계는 load-bearing이다')
  assert.equal(POINTS.filter((p) => tierOf(p) === 1).length, strict)
})

test('CELL·UNKNOWN·정확도 100 이상은 어느 tier에도 들지 않는다', () => {
  const excluded = POINTS.filter((p) => tierOf(p) === null)
  assert.ok(excluded.length > 0, '배제 대상 표본이 픽스처에 있어야 한다')
  for (const p of excluded) {
    assert.notEqual(p.source, 'PATH', 'PATH는 항상 Tier 2다')
    assert.ok(
      !TIER1_SOURCES.includes(p.source) || p.accuracy === null || p.accuracy >= 100,
      `${p.source}/${p.accuracy}는 Tier 1이어야 한다`,
    )
  }
  const tier1 = POINTS.filter((p) => tierOf(p) === 1).length
  const tier2 = POINTS.filter((p) => tierOf(p) === 2).length
  assert.equal(tier1 + tier2 + excluded.length, POINTS.length, 'tier 소속과 배제가 전체를 정확히 나눈다')
  assert.ok(excluded.some((p) => p.source === 'CELL') && excluded.some((p) => p.source === 'UNKNOWN'))
})

// ── 13·14. 옵션 ──────────────────────────────────────────────────────────
test('AC13c — 카메라 시계 오프셋이 윈도우 중심을 옮긴다', () => {
  // 기본(0분)으로는 no_track인 시각을, 오프셋으로 AC13e 시각까지 끌어오면 같은 답이 나온다
  const shifted = Date.parse('2026-08-02T02:37:39.734Z')
  assert.equal(hit(matchTrackPoint(POINTS, shifted, { offsetMin: 10 })).lat, hit(at('2026-08-02T02:47:39.734Z')).lat)
  assert.deepEqual(matchTrackPoint(POINTS, shifted, { offsetMin: 0 }), at('2026-08-02T02:37:39.734Z'))
})

test('maxGapMin — 윈도우를 좁히면 AC13g inside가 떨어져 나간다', () => {
  const t = Date.parse('2026-05-22T10:18:30Z')
  assert.equal(matchTrackPoint(POINTS, t, { maxGapMin: 10 }).matched, false)
  assert.equal(matchTrackPoint(POINTS, t, { maxGapMin: 30 }).matched, true)
})

// ── 15. 결정성 ───────────────────────────────────────────────────────────
test('AC13h 결정성 — 순서를 바꿔 다시 넣어도 AC13e 결과가 동일하다', () => {
  const first = at('2026-08-02T02:47:39.734Z')
  const parsed = JSON.parse(SLICE) as {
    rawSignals: unknown[]
    semanticSegments: Array<{ timelinePath?: unknown[] }>
  }
  parsed.rawSignals.reverse()
  parsed.semanticSegments.reverse()
  for (const seg of parsed.semanticSegments) seg.timelinePath?.reverse()
  const reversed = mergeSorted([], extractPoints(parsed)).points
  assert.equal(reversed.length, POINTS.length)
  assert.deepEqual(matchTrackPoint(reversed, Date.parse('2026-08-02T02:47:39.734Z')), first, 'comparePoints에 source가 빠지면 여기서 흔들린다')
  // 배열 자체도 같아야 한다 — 정렬이 결정적이다
  assert.deepEqual(reversed, POINTS)
})

// ── 16. 기본값 함정 ──────────────────────────────────────────────────────
test('maxGapMin: 0 이 기본값 30으로 삼켜지지 않는다', () => {
  // `|| 30`으로 쓰면 "윈도우 없음"이 조용히 30분으로 바뀐다
  const t = Date.parse('2026-05-22T10:18:30Z')
  assert.equal(matchTrackPoint(POINTS, t, { maxGapMin: 0 }).matched, false)
  assert.equal(matchTrackPoint(POINTS, t, { maxGapMin: 30 }).matched, true)
  // 숫자가 아닌 값·빈 문자열·undefined는 기본값으로 떨어진다
  assert.equal(matchTrackPoint(POINTS, t, { maxGapMin: NaN }).matched, true)
  assert.equal(matchTrackPoint(POINTS, t, { maxGapMin: '' }).matched, true)
  assert.equal(matchTrackPoint(POINTS, t, { maxGapMin: undefined }).matched, true)
  assert.equal(matchTrackPoint(POINTS, t, { maxGapMin: '30' }).matched, true, '문자열 숫자는 숫자로')
})

// ── 17. 같은 t 함정 ──────────────────────────────────────────────────────
test('촬영 시각과 정확히 같은 t의 포인트가 쌍 행세를 하지 않는다', () => {
  // before/after를 둘 다 포함으로 두면 같은 점 하나가 뽑혀 span 0 → ratio 0/0 → lat/lng가 NaN인데
  // matched:true로 나간다. 좌표는 항상 유한해야 한다.
  for (const iso of ['2026-07-24T15:52:00Z', '2026-07-25T08:45:00Z', '2026-07-21T09:06:00Z']) {
    const m = at(iso)
    if (m.matched) {
      assert.ok(Number.isFinite(m.lat) && Number.isFinite(m.lng), `${iso}: 좌표가 유한해야 한다`)
      assert.ok(m.gapMin > 0, `${iso}: 같은 점 둘로 만든 가짜 쌍이면 gapMin이 0이 된다`)
    }
  }
  // 점과 정확히 같은 시각을 직접 찍어도 그 점이 after(포함)로만 잡혀 ratio 1이 된다
  const p = POINTS.find((q) => tierOf(q) === 2)
  assert.ok(p)
  const m = matchTrackPoint(POINTS, p.t)
  if (m.matched) {
    assert.ok(Number.isFinite(m.lat) && Number.isFinite(m.lng))
    assert.ok(m.gapMin > 0)
    assert.equal(m.after.deltaSec, 0)
  }
})

// ── 18. explainMiss ──────────────────────────────────────────────────────
test('explainMiss — 범위 뒤·앞·안 세 갈래', () => {
  const range = { start: Date.parse('2026-05-22T00:00:00Z'), end: Date.parse('2026-08-02T00:00:00Z') }
  assert.equal(explainMiss(range.end + 1, range), 'after-end')
  assert.equal(explainMiss(range.start - 1, range), 'before-start')
  assert.equal(explainMiss(Date.parse('2026-06-15T00:00:00Z'), range), 'gap')
  assert.equal(explainMiss(range.start, range), 'gap', '경계값은 범위 안')
  assert.equal(explainMiss(range.end, range), 'gap', '경계값은 범위 안')
})

// ── 19. points.ts 한 번씩 ────────────────────────────────────────────────
test('mergeSorted 결과는 comparePoints 순이고, groupByDay는 UTC 날짜로 묶고, rangeOf는 픽스처 범위를 준다', () => {
  for (let i = 1; i < POINTS.length; i++) {
    assert.ok(comparePoints(POINTS[i - 1], POINTS[i]) <= 0, `${i}번째에서 순서가 깨졌다`)
  }
  const days = groupByDay(POINTS)
  let n = 0
  for (const [day, list] of days) {
    assert.match(day, /^\d{4}-\d{2}-\d{2}$/)
    for (const p of list) assert.equal(dayKeyOf(p.t), day)
    n += list.length
  }
  assert.equal(n, POINTS.length)
  const range = rangeOf(POINTS)
  assert.ok(range)
  assert.equal(dayKeyOf(range.start), '2026-05-22')
  assert.equal(dayKeyOf(range.end), '2026-08-02')
  assert.equal(rangeOf([]), null)
})
