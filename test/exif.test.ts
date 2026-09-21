import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import exifr from 'exifr'
import { buildCapturedAt, browserOffsetFor, normalizeOffset, recomputeCapturedAt } from '../src/lib/exif.ts'
import { fixture } from './helpers.ts'
import { formatMeta } from '../src/lib/format.ts'

/** 픽스처 사진의 EXIF를 reviveValues:false로 읽는다 (parseExif가 쓰는 것과 같은 옵션) */
async function sampleTags(): Promise<Record<string, unknown>> {
  const buf = readFileSync(fixture('exif-sample.jpg'))
  const d = await exifr.parse(buf, {
    tiff: true, exif: true, xmp: true, iptc: true,
    mergeOutput: true, reviveValues: false,
  })
  assert.ok(d, '픽스처에서 EXIF를 읽지 못했습니다')
  return d as Record<string, unknown>
}

test('AC1 — 카메라·렌즈·촬영설정·날짜 태그가 전부 나온다', async () => {
  const d = await sampleTags()
  assert.equal(d.Make, 'SONY')
  assert.equal(d.Model, 'ILCE-7CR')
  assert.equal(d.LensModel, 'FE 400-800mm F6.3-8 G OSS')
  assert.equal(d.FocalLength, 400)
  assert.equal(d.FNumber, 6.3)
  assert.equal(d.ExposureTime, 0.005)
  assert.equal(d.ISO, 1000)
  // reviveValues:false — Date가 아니라 EXIF 원문 문자열이어야 한다
  assert.equal(d.DateTimeOriginal, '2026:08:02 11:47:39')
  assert.equal(d.OffsetTimeOriginal, '+09:00')
})

test('AC2 / AC3 — RawFileName과 Rating이 보존된다', async () => {
  const d = await sampleTags()
  assert.equal(d.RawFileName, 'DSC08388.ARW')
  assert.equal(d.Rating, 5)
})

test('AC1b / AC1c — 촬영 순간이 UTC 정규형으로 확정되고 런타임 TZ에 흔들리지 않는다', async () => {
  const d = await sampleTags()
  assert.deepEqual(buildCapturedAt(d), {
    capturedAt: '2026-08-02T02:47:39.734Z',
    offset: '+09:00',
    assumed: false,
  })
})

test('AC1e — DST 봄철 건너뛴 wall-clock이 밀리지 않는다', () => {
  // exifr의 reviver는 new Date(y,m,d) 후 setter로 시·분·초를 얹어 NY 02:30 → 03:30으로
  // 정규화한다. reviveValues:false + 문자열 조립은 그 구멍을 통과하지 않는다.
  assert.equal(
    buildCapturedAt({ DateTimeOriginal: '2026:03:08 02:30:00', OffsetTimeOriginal: '-05:00' }).capturedAt,
    '2026-03-08T07:30:00.000Z',
  )
  assert.equal(
    buildCapturedAt({ DateTimeOriginal: '2026:03:29 01:30:00', OffsetTimeOriginal: '+00:00' }).capturedAt,
    '2026-03-29T01:30:00.000Z',
  )
})

test('AC1d — 오프셋이 없으면 촬영일 기준 브라우저 오프셋을 가정하고 그 사실을 표시한다', async () => {
  const d = await sampleTags()
  const r = buildCapturedAt({ ...d, OffsetTimeOriginal: undefined })
  assert.equal(r.assumed, true)
  // assumed:true만 보면 부호 반전 버그(서울에서 18시간 오차)를 통과시킨다 — 문자열을 단언한다
  const expected: Record<string, string> = {
    'Asia/Seoul': '+09:00',
    UTC: '+00:00',
    'America/New_York': '-04:00', // 8월 = 여름
    'Europe/London': '+01:00',
  }
  const tz = process.env.TZ
  if (tz && tz in expected) assert.equal(r.offset, expected[tz], `TZ=${tz}`)
})

test('AC1d — browserOffsetFor는 "지금"이 아니라 "촬영일"의 오프셋을 쓴다', () => {
  const summer = browserOffsetFor(2026, 8, 2)
  const winter = browserOffsetFor(2026, 1, 2)
  if (process.env.TZ === 'America/New_York') {
    assert.equal(summer, '-04:00')
    assert.equal(winter, '-05:00')
    assert.notEqual(summer, winter, '여름·겨울이 같으면 촬영일이 아니라 고정값을 쓰는 것이다')
  }
  if (process.env.TZ === 'Asia/Seoul') {
    assert.equal(summer, '+09:00')
    assert.equal(winter, '+09:00')
  }
  if (process.env.TZ === 'UTC') assert.equal(summer, '+00:00')
})

test('normalizeOffset — basic format과 Z를 정규화하고 시간만 있는 값은 거부한다', () => {
  assert.equal(normalizeOffset('+0900'), '+09:00')
  assert.equal(normalizeOffset('-0430'), '-04:30')
  assert.equal(normalizeOffset('Z'), '+00:00')
  assert.equal(normalizeOffset('+09:00'), '+09:00')
  assert.equal(normalizeOffset('+09'), null, "'+09'는 EXIF OffsetTime 규격 위반")
  assert.equal(normalizeOffset(''), null)
  assert.equal(normalizeOffset(undefined), null)
  assert.equal(normalizeOffset('+15:00'), null, '±14:00을 넘는 오프셋은 없다')
})

test('AC4 — 날짜 태그가 없으면 예외 없이 비어서 돌아온다', () => {
  assert.deepEqual(buildCapturedAt({}), { assumed: false })
  assert.deepEqual(buildCapturedAt({ DateTimeOriginal: '깨진 값' }), { assumed: false })
})

test('SubSecTimeOriginal이 없으면 .000으로 채운다', () => {
  const r = buildCapturedAt({ DateTimeOriginal: '2026:08:02 11:47:39', OffsetTimeOriginal: '+09:00' })
  assert.equal(r.capturedAt, '2026-08-02T02:47:39.000Z')
})

/** '+09:00' → 540. 테스트에서 오프셋 차이를 분으로 재기 위한 최소 파서. */
function offsetMinutes(offset: string): number {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset)
  assert.ok(m, `오프셋 형식이 아니다: ${offset}`)
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}

test('AC1d — 오프셋을 고치면 wall-clock을 유지한 채 UTC가 다시 계산된다', () => {
  const WALL = '2026:08:02 11:47:39'
  // OffsetTimeOriginal이 없는 사진 — 브라우저 TZ에서 오프셋을 가정한다
  const assumed = buildCapturedAt({ DateTimeOriginal: WALL, SubSecTimeOriginal: '734' })
  assert.equal(assumed.assumed, true)
  assert.ok(assumed.offset && assumed.capturedAt)

  // 실행 TZ가 무엇이든 가정값과 반드시 다른 오프셋을 고른다.
  // (고정값 '-04:00'을 쓰면 TZ=America/New_York 여름에는 가정값과 같아져 단언이 무의미해진다)
  const target = ['-04:00', '+09:00', '+05:30'].find((o) => o !== assumed.offset)
  assert.ok(target)

  const corrected = recomputeCapturedAt(WALL, '734', target)
  assert.ok(corrected)
  assert.equal(corrected.offset, target)

  // ① 카메라가 가리킨 wall-clock은 오프셋을 고쳐도 그대로여야 한다 — 이게 깨진 불변식이었다
  assert.equal(formatMeta(corrected.capturedAt, corrected.offset), '2026.08.02 11:47')

  // ② UTC 순간은 두 오프셋의 차이만큼 정확히 이동해야 한다.
  //    오프셋만 갈아끼우고 capturedAt을 그대로 두면 이 차이가 0이 되어 여기서 걸린다.
  const shiftMin =
    (Date.parse(corrected.capturedAt) - Date.parse(assumed.capturedAt)) / 60_000
  assert.equal(shiftMin, offsetMinutes(assumed.offset) - offsetMinutes(target))
  assert.notEqual(shiftMin, 0, '가정값과 다른 오프셋인데 순간이 그대로면 재계산이 안 된 것이다')
})

test('AC1d — 명시적 케이스: 서울 가정(+09:00) → 뉴욕(-04:00) 정정은 13시간 이동이다', () => {
  // 리뷰에서 실측한 결함 재발 방지용 고정 케이스 (실행 TZ와 무관하게 항상 성립한다)
  const seoul = recomputeCapturedAt('2026:08:02 11:47:39', '734', '+09:00')
  const newYork = recomputeCapturedAt('2026:08:02 11:47:39', '734', '-04:00')
  assert.equal(seoul?.capturedAt, '2026-08-02T02:47:39.734Z')
  assert.equal(newYork?.capturedAt, '2026-08-02T15:47:39.734Z')
  assert.equal((Date.parse(newYork!.capturedAt) - Date.parse(seoul!.capturedAt)) / 3_600_000, 13)
  // 둘 다 촬영지 시각으로는 11:47이다
  assert.equal(formatMeta(seoul!.capturedAt, '+09:00'), '2026.08.02 11:47')
  assert.equal(formatMeta(newYork!.capturedAt, '-04:00'), '2026.08.02 11:47')
})

test('recomputeCapturedAt — 형식이 덜 된 중간 입력은 커밋하지 않는다', () => {
  for (const partial of ['+', '+0', '-', '', '+09', 'abc']) {
    assert.equal(recomputeCapturedAt('2026:08:02 11:47:39', '734', partial), null, partial)
  }
  // basic format과 Z는 정규화해서 받아들인다
  assert.equal(recomputeCapturedAt('2026:08:02 11:47:39', '734', '+0900')?.offset, '+09:00')
  assert.equal(recomputeCapturedAt('2026:08:02 11:47:39', '734', 'Z')?.capturedAt, '2026-08-02T11:47:39.734Z')
})

test('parseExif가 오프셋 재계산에 필요한 원문을 함께 돌려준다', async () => {
  const d = await sampleTags()
  // capturedWall이 없으면 폼이 오프셋을 고칠 때 UTC를 다시 계산할 방법이 없다
  assert.equal(d.DateTimeOriginal, '2026:08:02 11:47:39')
  assert.equal(d.SubSecTimeOriginal, '734')
  const round = recomputeCapturedAt(String(d.DateTimeOriginal), String(d.SubSecTimeOriginal), '+09:00')
  assert.equal(round?.capturedAt, buildCapturedAt(d).capturedAt, '원문 재계산이 최초 파싱과 같은 값을 내야 한다')
})

// ── parseExif (매핑 계층) ───────────────────────────────────────────────
// 위 테스트들은 exifr 출력과 순수 헬퍼만 본다. EXIF 태그를 ExifInfo 필드에 **꽂는 부분**은
// 지금까지 센서가 없었다: `info.fNumber = num(d.FocalLength)` 같은 오배선이 68개 테스트와
// 빌드와 모든 TZ 실행을 통과한 채로 신규 10컬럼에 조용히 틀린 값을 쓴다.
//
// exifr의 Blob 경로는 브라우저 FileReader를 쓴다 — Node에는 없어서 parseExif가 catch로 빠져
// {}를 반환해버린다(무성 통과). 최소 shim을 깔아 실제 경로를 태운다.
class FileReaderShim {
  result: ArrayBuffer | null = null
  // exifr의 readBlobAsArrayBuffer는 onload가 아니라 **onloadend**를 기다린다
  // (node_modules/exifr/src/reader.mjs:64-68). onload만 부르면 프라미스가 영영 안 풀린다.
  onloadend: (() => void) | null = null
  onerror: ((e?: unknown) => void) | null = null
  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then(
      (b) => { this.result = b; this.onloadend?.() },
      (e) => this.onerror?.(e),
    )
  }
}

test('AC1~AC4 — parseExif가 EXIF 태그를 올바른 필드에 꽂는다', async (t) => {
  const g = globalThis as Record<string, unknown>
  const had = 'FileReader' in g
  if (!had) g.FileReader = FileReaderShim
  t.after(() => { if (!had) delete g.FileReader })

  const { parseExif } = await import('../src/lib/exif.ts')
  const bytes = readFileSync(fixture('exif-sample.jpg'))
  const info = await parseExif(new File([bytes], 'exif-sample.jpg', { type: 'image/jpeg' }))

  assert.equal(info.cameraMake, 'SONY')
  assert.equal(info.cameraModel, 'ILCE-7CR')
  assert.equal(info.lensModel, 'FE 400-800mm F6.3-8 G OSS')
  assert.equal(info.focalLength, 400)
  assert.equal(info.fNumber, 6.3)
  assert.equal(info.exposureTime, 0.005)
  assert.equal(info.iso, 1000)
  assert.equal(info.rawFileName, 'DSC08388.ARW')
  assert.equal(info.rating, 5)
  assert.equal(info.capturedAt, '2026-08-02T02:47:39.734Z')
  assert.equal(info.capturedAtOffset, '+09:00')
  assert.equal(info.offsetAssumed, false)
  assert.equal(info.capturedWall, '2026:08:02 11:47:39')
  assert.equal(info.capturedSubSec, '734')

  // 값이 서로 뒤바뀌지 않았는지 — 숫자 4개가 전부 다른 값이라 오배선이면 반드시 깨진다
  assert.notEqual(info.focalLength, info.iso)
  assert.notEqual(info.fNumber, info.exposureTime)
})

test('AC4 — EXIF가 없는 이미지에도 예외 없이 {}에 가까운 결과를 준다', async (t) => {
  const g = globalThis as Record<string, unknown>
  const had = 'FileReader' in g
  if (!had) g.FileReader = FileReaderShim
  t.after(() => { if (!had) delete g.FileReader })

  const { parseExif } = await import('../src/lib/exif.ts')
  // 최소 JPEG 헤더만 — EXIF 세그먼트 없음
  const info = await parseExif(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'x.jpg', { type: 'image/jpeg' }))
  assert.equal(info.capturedAt, undefined)
  assert.equal(info.lat, undefined)
  assert.equal(info.lng, undefined)
})

test('좌표는 exifr.gps 별도 호출에서 온다 (parse 결과가 아니다)', async (t) => {
  // 커밋된 픽스처에는 GPS가 없어(실측: exifr.gps → undefined) lat/lng 매핑을 실사진으로 덮을 수 없다.
  // gps 호출을 가로채 좌표를 주고, 그 값이 그대로 info에 실리는지 본다 —
  // parse 옵션으로 gps를 끌어오는 구현으로 바뀌면 이 스텁이 호출되지 않아 깨진다.
  const g = globalThis as Record<string, unknown>
  const had = 'FileReader' in g
  if (!had) g.FileReader = FileReaderShim

  const exifr = (await import('exifr')).default as { gps: (f: unknown) => Promise<unknown> }
  const realGps = exifr.gps
  let calledWith: unknown = null
  exifr.gps = async (f: unknown) => { calledWith = f; return { latitude: 36.01175, longitude: 129.163226 } }
  t.after(() => { exifr.gps = realGps; if (!had) delete g.FileReader })

  const { parseExif } = await import('../src/lib/exif.ts')
  const file = new File([readFileSync(fixture('exif-sample.jpg'))], 'exif-sample.jpg', { type: 'image/jpeg' })
  const info = await parseExif(file)

  assert.equal(calledWith, file, 'gps에 File이 그대로 넘어가야 한다')
  assert.equal(info.lat, 36.01175)
  assert.equal(info.lng, 129.163226)
  // 같은 호출에서 EXIF 매핑도 정상이어야 한다 — gps 스텁이 나머지를 가리지 않는다
  assert.equal(info.cameraModel, 'ILCE-7CR')
})

test('픽스처에는 GPS가 없다 — location_source=\'exif\' 경로는 커밋된 픽스처로 덮을 수 없다', async () => {
  // 사실 고정: 나중에 GPS 있는 픽스처가 추가되면 이 테스트가 깨지면서 알려준다
  const exifr = (await import('exifr')).default
  assert.equal(await exifr.gps(readFileSync(fixture('exif-sample.jpg'))), undefined)
})
