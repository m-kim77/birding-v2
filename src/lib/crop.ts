/**
 * 검출 상자대로 원본 해상도에서 사진을 잘라낸다.
 *
 * **순수 좌표 계산(위쪽)과 브라우저 API(아래쪽)를 일부러 갈라 둔다** — node --test에는 canvas도
 * createImageBitmap도 없는데, 실제로 틀리는 건 언제나 좌표 쪽이다. 위쪽만으로 테스트가 선다.
 *
 * 좌표 규칙은 하나뿐이다: 상자는 **EXIF 회전을 적용한 원본 프레임 기준 [0,1] 정규화 좌표**다.
 * 픽셀로 바꾸는 건 실제로 잘라내는 순간뿐이다.
 */

import type { Dimensions, NormalizedBox } from '../types'

/**
 * 상자 둘레에 덧대는 여백 비율 (축마다 상자 자신의 크기에 비례).
 * birdbench의 crop-containment 지표(`detection_test/src/birdbench/geometry.py:24` padded_box)와
 * 같은 0.15여야 한다 — 값이 어긋나면 벤치마크에서 "새가 다 들어간다"고 측정한 상자가 앱에서는 잘린다.
 */
export const CROP_PAD_FRAC = 0.15

/**
 * 잘라낸 사진의 긴 변 상한(px).
 * 이 크롭은 카드에 들어가고 종 판별에도 넘어간다. 판별 쪽은 어차피 1024로 다시 줄인다
 * (`features/identify/loop.ts` IDENTIFY_MAX_EDGE). 2048이면 카드(1080폭)에 여유가 충분하다.
 */
export const CROP_MAX_EDGE = 2048

/** JPEG 품질. 종 판별이 볼 그림이라 압축 흔적을 남기지 않을 만큼은 높게 둔다 */
export const CROP_QUALITY = 0.9

/** 원본 프레임 안의 정수 픽셀 사각형 (좌상단 기준) */
export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/**
 * 프레임 크기가 픽셀 계산에 쓸 수 있는 값인지 확인한다.
 * 0·음수·NaN이면 던진다 — 이런 값으로 나눗셈을 계속하면 NaN 좌표가 조용히 번져서
 * 엉뚱한 영역을 잘라 놓고도 아무도 모른다.
 */
function assertDimensions(source: Dimensions): void {
  if (!Number.isFinite(source.width) || !Number.isFinite(source.height) ||
      source.width < 1 || source.height < 1) {
    throw new Error(`원본 크기가 올바르지 않습니다 (${source.width}×${source.height}).`)
  }
}

/**
 * 정규화 상자를 원본 프레임 안의 정수 픽셀 사각형으로 바꾼다.
 *
 * - 좌우/상하가 뒤집힌 상자도 받아 정렬한다 (모델도 UI도 순서를 바꿔 보낼 수 있다).
 * - 여백은 축마다 상자 **자신의** 크기에 비례해 더하고, 프레임을 벗어나면 그 자리에서 자른다.
 *   반대쪽으로 밀지 않는다 — 밀면 상자가 피사체를 벗어나 새가 크롭 밖으로 나간다.
 * - 각 변은 Math.round로 정수화한다 (0.5는 큰 쪽). 그래서 폭·높이는 반올림한 두 변의 차다.
 * - 넓이가 0으로 무너진 상자(면적 0 검출, 1px 미만)도 최소 1×1은 돌려준다.
 *
 * 프레임 크기나 좌표가 유한한 수가 아니면 던진다 — 조용히 틀린 사각형을 내놓지 않는다.
 */
export function cropRect(
  box: NormalizedBox,
  source: Dimensions,
  padFrac: number = CROP_PAD_FRAC,
): PixelRect {
  assertDimensions(source)
  const W = source.width
  const H = source.height
  if (![box.x1, box.y1, box.x2, box.y2].every(Number.isFinite)) {
    throw new Error('상자 좌표가 올바르지 않습니다.')
  }

  let left = Math.min(box.x1, box.x2) * W
  let right = Math.max(box.x1, box.x2) * W
  let top = Math.min(box.y1, box.y2) * H
  let bottom = Math.max(box.y1, box.y2) * H

  const pad = Number.isFinite(padFrac) ? Math.max(0, padFrac) : 0
  const dx = (right - left) * pad
  const dy = (bottom - top) * pad
  left = clamp(left - dx, 0, W)
  right = clamp(right + dx, 0, W)
  top = clamp(top - dy, 0, H)
  bottom = clamp(bottom + dy, 0, H)

  let x = Math.round(left)
  let y = Math.round(top)
  let width = Math.round(right) - x
  let height = Math.round(bottom) - y
  // 최소 1px은 확보하되 프레임 밖으로는 못 나간다 (W·H가 1 이상인 건 위에서 보장했다)
  if (width < 1) {
    width = 1
    if (x + width > W) x = W - 1
  }
  if (height < 1) {
    height = 1
    if (y + height > H) y = H - 1
  }
  return { x, y, width, height }
}

/**
 * 픽셀 사각형을 다시 정규화 좌표로 되돌린다. DB에 저장할 crop_box를 만들 때 쓴다.
 * 픽셀로 저장하면 사진을 다시 내보내거나 교체하는 순간 의미를 잃기 때문에, 경계를 넘는 값은
 * 언제나 정규화 좌표여야 한다. 프레임 크기가 올바르지 않으면 던진다.
 */
export function normalizeRect(rect: PixelRect, source: Dimensions): NormalizedBox {
  assertDimensions(source)
  return {
    x1: rect.x / source.width,
    y1: rect.y / source.height,
    x2: (rect.x + rect.width) / source.width,
    y2: (rect.y + rect.height) / source.height,
  }
}

/**
 * 긴 변이 cap을 넘지 않도록 출력 크기를 줄인다.
 * **키우지는 않는다** — 작은 크롭을 확대해 봐야 없던 정보가 생긴 것처럼 보이고 파일만 커진다.
 * 결과는 최소 1×1의 정수이며, 가로세로 비는 반올림 오차(1px 미만) 안에서 유지된다.
 */
export function fitLongEdge(
  width: number,
  height: number,
  cap: number = CROP_MAX_EDGE,
): Dimensions {
  const long = Math.max(width, height)
  if (!Number.isFinite(long) || long <= 0) {
    throw new Error(`잘라낼 크기가 올바르지 않습니다 (${width}×${height}).`)
  }
  const limit = Number.isFinite(cap) && cap >= 1 ? cap : long
  const scale = Math.min(1, limit / long)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * data URL 을 업로드용 Blob 으로 바꾼다.
 *
 * data URL 이 아니거나 base64 가 깨졌으면 한국어 Error 를 던진다 — **짧은 Blob 을 만들어
 * 돌려주지 않는다.** `'data:,'` 는 명시적으로 거부한다: `canvas.toDataURL` 은 인코딩에
 * 실패해도 던지지 않고 그 값을 돌려주는데(아래 cropFromFile 참고), 걸러 내지 않으면
 * 0바이트 본문이 사이드카로 올라가 원인을 알 수 없는 413 으로 되돌아온다.
 *
 * `server/index.js` 의 saveDataUrl 과 같은 형태를 받아들인다 — 클라이언트와 서버가
 * "올바른 data URL" 에 대해 다른 말을 하면 저장은 되는데 판정은 안 되는 조합이 생긴다.
 *
 * atob·Blob 은 node 에도 있으므로 이 함수는 브라우저 API 구역이 아니라 순수 구역에 둔다.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:(image\/[a-zA-Z0-9+]+);base64,(.+)$/.exec(dataUrl)
  if (!m) throw new Error('올바른 이미지 data URL 이 아닙니다.')
  let binary: string
  try {
    binary = atob(m[2])
  } catch {
    throw new Error('잘라낸 사진의 base64 를 해독하지 못했습니다.')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: m[1] })
}

/**
 * 브라우저가 디코드한 사진 크기가 사이드카가 보고한 `source`와 다를 때 던지는 오류.
 * 이 경우 둘이 EXIF 회전을 다르게 해석한 것이므로, 좌표를 그대로 쓰면 **엉뚱한 영역이 잘린다**.
 * 조용히 자르는 대신 이 타입으로 올려서 호출부가 사용자에게 알릴 수 있게 한다.
 */
export class CropSourceMismatchError extends Error {
  // 생성자 파라미터 프로퍼티(readonly x: T)를 쓰지 않는다 — node --test 의 타입 제거 모드가
  // 그 문법을 지원하지 않아, 이 모듈을 import 하는 테스트가 통째로 실행되지 못한다.
  readonly decoded: Dimensions
  readonly reported: Dimensions

  constructor(decoded: Dimensions, reported: Dimensions) {
    super(
      `사진 방향 해석이 서버와 다릅니다 (브라우저 ${decoded.width}×${decoded.height}, ` +
        `검출 ${reported.width}×${reported.height}). 잘못된 영역을 자르지 않기 위해 중단했습니다.`,
    )
    this.decoded = decoded
    this.reported = reported
    this.name = 'CropSourceMismatchError'
  }
}

/** cropFromFile 결과 — 저장에 필요한 것만 담는다 */
export interface CropOutput {
  /** data URL (data:image/jpeg;base64,...) — photo_base64와 같은 형식이라 그대로 올릴 수 있다 */
  dataUrl: string
  /** 실제로 잘라낸 원본 픽셀 사각형 (여백 포함) */
  rect: PixelRect
  /** 저장용 정규화 좌표 — rect를 source로 되나눈 값이라 여백까지 반영돼 있다 */
  box: NormalizedBox
  /** 인코딩한 이미지 폭 (긴 변 상한 적용 후) */
  width: number
  /** 인코딩한 이미지 높이 */
  height: number
}

/**
 * 원본 File에서 상자 영역을 잘라 JPEG data URL로 만든다.
 *
 * 성공하거나 던지거나 둘 중 하나다 — **틀린 크롭을 반환하는 경우는 없어야 한다.**
 * 디코드 실패·캔버스 없음·인코딩 실패는 한국어 Error로, 브라우저와 사이드카의 방향 해석이
 * 어긋난 경우는 CropSourceMismatchError로 던진다. 호출부는 이걸 붙잡아 조용한 안내만 띄우고
 * 저장 자체는 막지 말아야 한다 (검출은 저장을 가로막지 않는다).
 */
export async function cropFromFile(
  file: Blob,
  box: NormalizedBox,
  source: Dimensions,
  opts: { padFrac?: number; maxEdge?: number } = {},
): Promise<CropOutput> {
  const rect = cropRect(box, source, opts.padFrac ?? CROP_PAD_FRAC)

  let bitmap: ImageBitmap
  try {
    // imageOrientation:'from-image' — 사이드카는 EXIF 회전을 적용한 프레임 기준으로 좌표를 주므로
    // 브라우저도 같은 방향으로 디코드해야 좌표계가 맞는다 (기본값은 브라우저마다 다르다).
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('사진을 디코드하지 못했습니다.')
  }

  try {
    // 방향 해석이 어긋났는지는 크기로만 알 수 있다. 여기서 멈추지 않으면 orientation 6/8 사진에서
    // 가로·세로가 뒤바뀐 좌표로 잘라 낸 뒤에도 아무 신호가 없다.
    if (bitmap.width !== source.width || bitmap.height !== source.height) {
      throw new CropSourceMismatchError(
        { width: bitmap.width, height: bitmap.height },
        source,
      )
    }

    const out = fitLongEdge(rect.width, rect.height, opts.maxEdge ?? CROP_MAX_EDGE)
    const canvas = document.createElement('canvas')
    canvas.width = out.width
    canvas.height = out.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('캔버스를 만들지 못했습니다.')

    // 9인자 drawImage로 잘라낸다.
    // **createImageBitmap(file, sx, sy, sw, sh) 5인자 잘라내기를 쓰면 안 된다** — EXIF
    // orientation 6/8 사진에서 회전을 적용하기 **전** 좌표계로 잘라내 정반대 영역이 조용히 나온다.
    // 같은 이유로 CSS image-orientation도 어디에도 걸지 않는다 (그리면 캔버스는 CSS를 안 본다).
    ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, out.width, out.height)

    const dataUrl = canvas.toDataURL('image/jpeg', CROP_QUALITY)
    // toDataURL은 실패해도 던지지 않고 'data:,'를 돌려준다 — 빈 문자열을 서버로 올리지 않도록 막는다
    if (!dataUrl.startsWith('data:image/jpeg')) {
      throw new Error('잘라낸 사진을 JPEG로 인코드하지 못했습니다.')
    }

    return { dataUrl, rect, box: normalizeRect(rect, source), width: out.width, height: out.height }
  } finally {
    // 원본 한 장이 수천만 픽셀이다. 예외로 빠져나갈 때도 반드시 놓아준다
    bitmap.close()
  }
}
