import { getBestPhoto } from '../../data/photos'
import type { Sighting } from '../../types'
import { CARD_H, CARD_W, PLATE, drawCardBack, drawCardFront, drawPlate, loadCardFonts } from './cardCanvas'
import { CARD_BASE, CARD_LOOKS } from './cardLook'

/**
 * 영상의 시간표(초). Card Reveal 디자인의 네 박자 — 스캔 → 생성 → 플립 → 공개 — 에 마지막 멈춘 장면을 더했다.
 * 화면 안의 등장 연출(reveal.css)도 같은 박자다.
 */
const T = { scanEnd: 0.9, flipStart: 1.5, revealStart: 2.2, revealEnd: 3.0, hold: 3.6 }

/** 카드에 넣을 사진을 로컬 DB에서 읽는다 (잘라낸 판이 있으면 그것). 없거나 못 열면 null — 카드는 사진 없이도 그려진다 */
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

/** 카드를 PNG로 만든다. 모서리 바깥은 투명하다. 인코딩에 실패하면 한국어 Error */
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

/** 숲 빛깔의 어두운 무대 */
function drawStage(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(CARD_W / 2, CARD_H * 0.45, 0, CARD_W / 2, CARD_H * 0.45, CARD_H * 0.75)
  g.addColorStop(0, CARD_BASE.stageIn)
  g.addColorStop(0.6, CARD_BASE.stageMid)
  g.addColorStop(1, CARD_BASE.stageOut)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, CARD_W, CARD_H)
}

/** 카드를 가운데 기준으로 줄이고(scale) 가로로 눌러(squeeze) 그린다 — 뒤집힘을 흉내 낸다 */
function withCard(ctx: CanvasRenderingContext2D, scale: number, squeeze: number, alpha: number, draw: () => void): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(CARD_W / 2, CARD_H / 2)
  ctx.scale(scale * Math.max(0.02, squeeze), scale)
  ctx.translate(-CARD_W / 2, -CARD_H / 2)
  draw()
  ctx.restore()
}

/** 영상의 한 장면. `sec`는 시작부터 흐른 초 */
function drawFrame(ctx: CanvasRenderingContext2D, s: Sighting, img: ImageBitmap | null, sec: number): void {
  const accent = CARD_LOOKS[s.tier].accent
  drawStage(ctx)
  if (sec < T.scanEnd) {
    // 01 스캔 — 사진판만 떠 있고 빛 줄이 위에서 아래로 훑는다
    const p = sec / T.scanEnd
    withCard(ctx, 0.88, 1, 1, () => {
      drawPlate(ctx, img, accent)
      ctx.fillStyle = accent
      ctx.shadowColor = accent
      ctx.shadowBlur = 30
      ctx.fillRect(PLATE.x, PLATE.y + PLATE.h * p - 3, PLATE.w, 6)
    })
  } else if (sec < T.flipStart) {
    // 02 생성 — 카드 뒷면이 자라나며 또렷해진다
    const p = (sec - T.scanEnd) / (T.flipStart - T.scanEnd)
    withCard(ctx, 0.7 + 0.18 * p, 1, p, () => drawCardBack(ctx, accent))
  } else if (sec < T.revealStart) {
    // 03 플립 — 가로로 눌렸다 펴지며 앞면으로 바뀐다
    const p = (sec - T.flipStart) / (T.revealStart - T.flipStart)
    withCard(ctx, 0.88 + 0.04 * Math.sin(p * Math.PI), Math.abs(Math.cos(p * Math.PI)), 1, () => (p < 0.5 ? drawCardBack(ctx, accent) : drawCardFront(ctx, s, img, null)))
  } else {
    // 04 공개 — 등급색 빛이 번지고 빛 줄기가 지나간다
    const p = Math.min(1, (sec - T.revealStart) / (T.revealEnd - T.revealStart))
    ctx.save()
    ctx.globalAlpha = 0.55 * (1 - p)
    ctx.shadowColor = accent
    ctx.shadowBlur = 160
    ctx.fillStyle = accent
    ctx.fillRect(CARD_W * 0.12, CARD_H * 0.12, CARD_W * 0.76, CARD_H * 0.76)
    ctx.restore()
    withCard(ctx, 0.88, 1, 1, () => drawCardFront(ctx, s, img, p))
  }
}

/**
 * 카드가 나타나는 영상을 만든다 (약 3.6초). 녹화를 지원하지 않는 브라우저에서는 Error를 던진다 — 부르는 쪽이 사용자에게 알린다.
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
      const sec = (now - started) / 1000
      drawFrame(ctx, s, img, Math.min(sec, T.hold))
      if (sec < T.hold) requestAnimationFrame(tick); else resolve()
    }
    requestAnimationFrame(tick)
  })
  recorder.stop()
  await stopped
  return { blob: new Blob(chunks, { type: type.mime.split(';')[0] }), ext: type.ext }
}
