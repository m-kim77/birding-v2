import { formatDay } from '../../ui/format'
import type { Sighting } from '../../types'
import { CARD_BACK, CARD_LOOKS } from './cardLook'
import { TIER_LABELS } from './cardTier'

/** 내보내는 카드의 크기. 인스타그램 세로(4:5) 기준 */
export const CARD_W = 1080
export const CARD_H = 1350

const FRAME = 26
const TEXT_H = 330
const SERIF = "'Noto Serif KR', 'AppleMyungjo', serif"
const SANS = "'Pretendard', -apple-system, 'Apple SD Gothic Neo', sans-serif"

/** 135도 방향 그라데이션을 색 정지점으로 만든다 */
function diagonal(ctx: CanvasRenderingContext2D, stops: string[]): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, CARD_W, CARD_H)
  stops.forEach((c, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c))
  return g
}

/** 모서리가 둥근 사각형 경로 */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** 사진을 상자에 꽉 차게(넘치는 쪽은 잘라) 그린다. 사진이 없으면 바탕만 칠한다 */
function drawPhoto(ctx: CanvasRenderingContext2D, img: CanvasImageSource | null, x: number, y: number, w: number, h: number, empty: string): void {
  ctx.fillStyle = empty
  ctx.fillRect(x, y, w, h)
  if (!img) return
  const iw = (img as HTMLImageElement).naturalWidth || (img as ImageBitmap).width
  const ih = (img as HTMLImageElement).naturalHeight || (img as ImageBitmap).height
  const scale = Math.max(w / iw, h / ih)
  const sw = w / scale, sh = h / scale
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h)
}

/**
 * 카드 앞면을 그린다. 화면의 BirdCard와 같은 배치·같은 색(cardLook.ts)이다.
 * `shine`은 빛 줄기의 위치(0~1), null이면 그리지 않는다. 글꼴은 부르는 쪽이 미리 불러 둔다 (loadCardFonts).
 */
export function drawCardFront(ctx: CanvasRenderingContext2D, s: Sighting, img: CanvasImageSource | null, shine: number | null): void {
  const look = CARD_LOOKS[s.tier]
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 44)
  ctx.fillStyle = diagonal(ctx, look.frame)
  ctx.fill()

  const [x, y, w, h] = [FRAME, FRAME, CARD_W - FRAME * 2, CARD_H - FRAME * 2]
  ctx.save()
  roundRect(ctx, x, y, w, h, 26)
  ctx.clip()
  ctx.fillStyle = look.paper
  ctx.fillRect(x, y, w, h)
  drawPhoto(ctx, img, x, y, w, h - TEXT_H, '#d9dccf')

  const tx = x + 46
  let ty = y + h - TEXT_H + 64
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = look.tierInk
  ctx.font = `700 34px ${SANS}`
  ctx.fillText(TIER_LABELS[s.tier], tx, ty)
  ty += 84
  ctx.fillStyle = look.ink
  ctx.font = `700 76px ${SERIF}`
  ctx.fillText(s.speciesKo || '이름 미정', tx, ty)
  ctx.fillStyle = look.sub
  if (s.latin) { ty += 52; ctx.font = `italic 400 38px ${SANS}`; ctx.fillText(s.latin, tx, ty) }
  ty += 62
  ctx.font = `400 34px ${SANS}`
  // 보호가 필요한 종은 place가 이미 시·군 단위다 — 여기서 좌표나 상세 지명을 더하지 않는다
  ctx.fillText(`${formatDay(s.capturedAt)} · ${s.place}${s.sensitive ? ' · 상세 위치 비공개' : ''}`, tx, ty)

  s.stamps.forEach((stamp, i) => drawStamp(ctx, stamp, x + w - 40, y + 70 + i * 78))
  if (shine !== null && look.shine) drawShine(ctx, shine)
  ctx.restore()
}

/** 오른쪽 위의 사실 도장 (오른쪽 끝 기준 정렬, 살짝 기울임) */
function drawStamp(ctx: CanvasRenderingContext2D, text: string, right: number, cy: number): void {
  ctx.save()
  ctx.font = `800 32px ${SANS}`
  const w = ctx.measureText(text).width + 40
  ctx.translate(right - w / 2, cy)
  ctx.rotate((-4 * Math.PI) / 180)
  roundRect(ctx, -w / 2, -30, w, 60, 10)
  ctx.fillStyle = 'rgba(251,250,244,0.92)'
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = '#a3271f'
  ctx.stroke()
  ctx.fillStyle = '#a3271f'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 2)
  ctx.restore()
}

/** 대각선으로 지나가는 빛 줄기. `pos` 0은 왼쪽 밖, 1은 오른쪽 밖 */
function drawShine(ctx: CanvasRenderingContext2D, pos: number): void {
  const cx = -CARD_W * 0.4 + pos * CARD_W * 1.8
  const g = ctx.createLinearGradient(cx - 260, 0, cx + 260, CARD_H * 0.5)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.globalCompositeOperation = 'soft-light'
  ctx.fillStyle = g
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.globalCompositeOperation = 'source-over'
}

/** 카드 뒷면. 영상에서 카드가 뒤집히기 전의 첫 장면으로만 쓴다 */
export function drawCardBack(ctx: CanvasRenderingContext2D): void {
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 44)
  ctx.fillStyle = CARD_BACK.fill
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = CARD_BACK.line
  roundRect(ctx, 46, 46, CARD_W - 92, CARD_H - 92, 28)
  ctx.stroke()
  ctx.fillStyle = CARD_BACK.ink
  ctx.textAlign = 'center'
  ctx.font = `700 96px ${SERIF}`
  ctx.fillText('탐조일지', CARD_W / 2, CARD_H / 2 + 30)
  ctx.textAlign = 'left'
}

/**
 * 카드에 쓰는 글꼴이 준비될 때까지 기다린다. 캔버스는 아직 안 불러온 웹 글꼴을 기다려 주지 않고 대체 글꼴로 그려 버린다.
 * 글꼴을 끝내 못 불러와도(오프라인) 그대로 진행한다 — 대체 글꼴로라도 저장되는 편이 낫다.
 */
export async function loadCardFonts(sample: string): Promise<void> {
  try {
    await Promise.all([document.fonts.load(`700 76px ${SERIF}`, sample), document.fonts.load(`700 34px ${SANS}`, sample)])
  } catch { /* 대체 글꼴로 진행 */ }
}
