import { dotDateOf } from '../../ui/when'
import type { Sighting } from '../../types'
import { dexLabel, shotLine } from './cardText'
import { CARD_BASE, CARD_FONTS, CARD_LOOKS, MAX_STARS } from './cardLook'
import { TIER_REASONS } from './cardTier'

/** 내보내는 카드의 크기. 인스타그램 세로(4:5) 기준 */
export const CARD_W = 1080
export const CARD_H = 1350

const PAD = 46
const RADIUS = 58
/** 사진판 아래 글자 영역의 높이 */
const TEXT_H = 392
/** 사진판의 자리 — 영상의 스캔 장면도 같은 자리를 쓴다 */
export const PLATE = { x: PAD, y: 104, w: CARD_W - PAD * 2, h: CARD_H - 104 - TEXT_H }

/** 고정폭 라벨을 그린다 (자간을 넓게). letterSpacing을 모르는 브라우저에서는 자간 없이 그려진다 */
function mono(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', spacing = '0.2em', weight = 500): void {
  ctx.font = `${weight} ${size}px ${CARD_FONTS.mono}`
  ;(ctx as unknown as { letterSpacing: string }).letterSpacing = spacing
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.fillText(text, x, y)
  ;(ctx as unknown as { letterSpacing: string }).letterSpacing = '0px'
  ctx.textAlign = 'left'
}

/** 사진을 상자에 꽉 차게(넘치는 쪽은 잘라) 그린다. 사진이 없으면 바탕만 */
export function drawPlate(ctx: CanvasRenderingContext2D, img: ImageBitmap | null, accent: string): void {
  const { x, y, w, h } = PLATE
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 30)
  ctx.clip()
  ctx.fillStyle = '#0a0e0c'
  ctx.fillRect(x, y, w, h)
  if (img) {
    const scale = Math.max(w / img.width, h / img.height)
    const sw = w / scale, sh = h / scale
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
  }
  ctx.restore()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 30)
  ctx.lineWidth = 3
  ctx.strokeStyle = accent + '66'
  ctx.stroke()
}

/**
 * 카드 앞면을 그린다. 화면의 BirdCard와 같은 배치·같은 값(cardLook.ts)이다.
 * `shine`은 빛 줄기의 위치(0~1), null이면 그리지 않는다. 글꼴은 부르는 쪽이 미리 불러 둔다 (loadCardFonts).
 */
export function drawCardFront(ctx: CanvasRenderingContext2D, s: Sighting, img: ImageBitmap | null, shine: number | null): void {
  const look = CARD_LOOKS[s.tier]
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H)
  bg.addColorStop(0, CARD_BASE.bgTop)
  bg.addColorStop(1, CARD_BASE.bgBottom)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(0, 0, CARD_W, CARD_H, RADIUS)
  ctx.clip()
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  mono(ctx, dexLabel(s.dexNo).toUpperCase(), PAD, 70, 34, CARD_BASE.sub)
  mono(ctx, look.en, CARD_W - PAD, 70, 34, look.accent, 'right', '0.2em', 700)
  drawPlate(ctx, img, look.accent)
  s.stamps.forEach((stamp, i) => drawStamp(ctx, stamp, look.accent, PLATE.x + PLATE.w - 26, PLATE.y + 56 + i * 70))

  let y = PLATE.y + PLATE.h + 62
  ctx.font = `400 40px ${CARD_FONTS.mono}`
  ctx.fillStyle = look.accent
  ctx.fillText('★'.repeat(look.stars), PAD, y)
  ctx.globalAlpha = 0.22
  ctx.fillText('★'.repeat(MAX_STARS - look.stars), PAD + ctx.measureText('★'.repeat(look.stars)).width, y)
  ctx.globalAlpha = 1
  mono(ctx, TIER_REASONS[s.tier], CARD_W - PAD, y - 4, 30, CARD_BASE.sub, 'right', '0.14em')

  y += 92
  ctx.fillStyle = CARD_BASE.ink
  ctx.font = `600 82px ${CARD_FONTS.name}`
  ctx.fillText(s.speciesKo || '이름 미정', PAD, y)
  if (s.latin) { y += 58; ctx.fillStyle = CARD_BASE.sub; ctx.font = `italic 400 50px ${CARD_FONTS.latin}`; ctx.fillText(s.latin, PAD, y) }

  const lineY = CARD_H - 124
  ctx.fillStyle = CARD_BASE.hair
  ctx.fillRect(PAD, lineY, CARD_W - PAD * 2, 2)
  mono(ctx, dotDateOf(s), PAD, lineY + 52, 32, CARD_BASE.sub, 'left', '0.12em')
  // 보호가 필요한 종은 장소를 적지 않는다 — 카드는 SNS로 퍼지는 물건이다
  ctx.font = `400 34px 'Noto Sans KR', sans-serif`
  ctx.textAlign = 'right'
  ctx.fillText(s.sensitive ? '위치 비공개' : s.place, CARD_W - PAD, lineY + 52, CARD_W / 2)
  ctx.textAlign = 'left'
  const shot = shotLine(s)
  if (shot) { ctx.globalAlpha = 0.75; mono(ctx, shot, PAD, lineY + 98, 28, CARD_BASE.sub, 'left', '0.12em'); ctx.globalAlpha = 1 }

  if (shine !== null && look.glow) drawShine(ctx, shine, look.accent)
  ctx.restore()
  ctx.beginPath()
  ctx.roundRect(3, 3, CARD_W - 6, CARD_H - 6, RADIUS - 3)
  ctx.lineWidth = 6
  ctx.strokeStyle = look.accent + 'B3'
  ctx.stroke()
}

/** 사진판 위의 사실 도장 (오른쪽 끝 기준 정렬) */
function drawStamp(ctx: CanvasRenderingContext2D, text: string, accent: string, right: number, cy: number): void {
  ctx.font = `700 30px ${CARD_FONTS.mono}`
  const w = ctx.measureText(text).width + 40
  ctx.beginPath()
  ctx.roundRect(right - w, cy - 28, w, 56, 12)
  ctx.fillStyle = 'rgba(5,6,5,0.72)'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = accent
  ctx.stroke()
  ctx.fillStyle = accent
  ctx.textAlign = 'center'
  ctx.fillText(text, right - w / 2, cy + 11)
  ctx.textAlign = 'left'
}

/** 대각선으로 지나가는 빛 줄기. `pos` 0은 왼쪽 밖, 1은 오른쪽 밖 */
function drawShine(ctx: CanvasRenderingContext2D, pos: number, accent: string): void {
  const cx = -CARD_W * 0.4 + pos * CARD_W * 1.8
  const g = ctx.createLinearGradient(cx - 240, 0, cx + 240, CARD_H * 0.5)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.5, accent + '55')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.globalCompositeOperation = 'screen'
  ctx.fillStyle = g
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.globalCompositeOperation = 'source-over'
}

/** 카드 뒷면. 영상에서 카드가 뒤집히기 전의 장면으로만 쓴다. 등급색 테두리만 앞면과 같다 */
export function drawCardBack(ctx: CanvasRenderingContext2D, accent: string): void {
  ctx.beginPath()
  ctx.roundRect(3, 3, CARD_W - 6, CARD_H - 6, RADIUS - 3)
  ctx.fillStyle = CARD_BASE.bgBottom
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = accent + 'B3'
  ctx.stroke()
  ctx.beginPath()
  ctx.roundRect(PAD, PAD, CARD_W - PAD * 2, CARD_H - PAD * 2, 34)
  ctx.lineWidth = 2
  ctx.strokeStyle = CARD_BASE.hair
  ctx.stroke()
  ctx.fillStyle = CARD_BASE.ink
  ctx.textAlign = 'center'
  ctx.font = `600 92px ${CARD_FONTS.name}`
  ctx.fillText('탐조일지', CARD_W / 2, CARD_H / 2 + 20)
  ctx.textAlign = 'left'
  mono(ctx, 'FIELD CARD', CARD_W / 2, CARD_H / 2 + 92, 28, CARD_BASE.sub, 'center', '0.32em')
}

/**
 * 카드에 쓰는 글꼴이 준비될 때까지 기다린다. 캔버스는 아직 안 불러온 웹 글꼴을 기다려 주지 않고 대체 글꼴로 그려 버린다.
 * 글꼴을 끝내 못 불러와도(오프라인) 그대로 진행한다 — 대체 글꼴로라도 저장되는 편이 낫다.
 */
export async function loadCardFonts(sample: string): Promise<void> {
  const wanted = [`600 82px ${CARD_FONTS.name}`, `italic 400 50px ${CARD_FONTS.latin}`, `500 34px ${CARD_FONTS.mono}`, `700 34px ${CARD_FONTS.mono}`]
  try { await Promise.all(wanted.map((font) => document.fonts.load(font, `${sample} No. COMMON ★`))) } catch { /* 대체 글꼴로 진행 */ }
}
