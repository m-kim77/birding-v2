import { getBestPhoto } from '../../data/photos'
import type { Sighting } from '../../types'
import { CARD_H, CARD_W, drawCardBack, drawCardFront, loadCardFonts } from './cardCanvas'

/** 영상의 길이(ms). 뒤집힘 1.1초 + 빛 1.1초 + 멈춘 장면 0.8초 */
const VIDEO_MS = 3000
const VIDEO_BG = '#0f1613'

/**
 * 카드에 넣을 사진을 로컬 DB에서 읽는다 (잘라낸 판이 있으면 그것). 없거나 못 열면 null — 카드는 사진 없이도 그려진다.
 */
async function loadPhoto(id: string): Promise<ImageBitmap | null> {
  const blob = await getBestPhoto(id, 'full').catch(() => undefined)
  if (!blob) return null
  try { return await createImageBitmap(blob) } catch { return null }
}

/** 캔버스를 만들어 2D 문맥과 함께 돌려준다. 문맥을 못 얻으면 Error (아주 오래된 브라우저) */
function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이 브라우저에서는 카드를 그릴 수 없습니다')
  return { canvas, ctx }
}

/**
 * 카드를 PNG로 만든다. 모서리 바깥은 투명하다. 인코딩에 실패하면 한국어 Error.
 */
export async function cardImage(s: Sighting): Promise<Blob> {
  const [img] = await Promise.all([loadPhoto(s.id), loadCardFonts(s.speciesKo)])
  const { canvas, ctx } = makeCanvas()
  drawCardFront(ctx, s, img, 0.62)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('이미지를 만들지 못했습니다'))), 'image/png')
  })
}

/** 이 브라우저가 녹화할 수 있는 형식을 고른다. mp4를 먼저 본다 — 폰 사진첩과 SNS가 webm을 잘 못 받는다 */
function pickVideoType(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  const options = [{ mime: 'video/mp4;codecs=avc1', ext: 'mp4' }, { mime: 'video/mp4', ext: 'mp4' }, { mime: 'video/webm;codecs=vp9', ext: 'webm' }, { mime: 'video/webm', ext: 'webm' }]
  return options.find((o) => MediaRecorder.isTypeSupported(o.mime)) ?? null
}

/** 영상의 한 장면을 그린다. `t`는 0~1. 뒷면이 접히고 → 앞면이 펴지고 → 빛이 지나간다 */
function drawFrame(ctx: CanvasRenderingContext2D, s: Sighting, img: ImageBitmap | null, t: number): void {
  ctx.fillStyle = VIDEO_BG
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  const flip = Math.min(1, t / 0.37)
  // 가로로 눌러 뒤집힘을 흉내 낸다: 1 → 0(옆면) → 1
  const squeeze = Math.max(0.02, Math.abs(Math.cos(flip * Math.PI)))
  const scale = 0.86 + 0.08 * Math.sin(flip * Math.PI)
  ctx.save()
  ctx.translate(CARD_W / 2, CARD_H / 2)
  ctx.scale(squeeze * scale, scale)
  ctx.translate(-CARD_W / 2, -CARD_H / 2)
  if (flip < 0.5) drawCardBack(ctx)
  else drawCardFront(ctx, s, img, t < 0.37 ? null : Math.min(1, (t - 0.37) / 0.37))
  ctx.restore()
}

/**
 * 카드가 뒤집히며 나타나는 영상을 만든다 (약 3초).
 * 녹화를 지원하지 않는 브라우저에서는 Error를 던진다 — 부르는 쪽이 사용자에게 알린다.
 * 실시간으로 녹화하므로 영상 길이만큼 시간이 걸린다.
 */
export async function cardVideo(s: Sighting): Promise<{ blob: Blob; ext: string }> {
  const type = pickVideoType()
  if (!type) throw new Error('이 브라우저는 영상 저장을 지원하지 않습니다')
  const [img] = await Promise.all([loadPhoto(s.id), loadCardFonts(s.speciesKo)])
  const { canvas, ctx } = makeCanvas()
  drawFrame(ctx, s, img, 0)

  const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: type.mime, videoBitsPerSecond: 6_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
  recorder.start()

  const started = performance.now()
  await new Promise<void>((resolve) => {
    /** 한 장면을 그리고 다음 장면을 예약한다 */
    function tick(now: number) {
      const t = Math.min(1, (now - started) / VIDEO_MS)
      drawFrame(ctx, s, img, t)
      if (t < 1) requestAnimationFrame(tick); else resolve()
    }
    requestAnimationFrame(tick)
  })
  recorder.stop()
  await stopped
  return { blob: new Blob(chunks, { type: type.mime.split(';')[0] }), ext: type.ext }
}
