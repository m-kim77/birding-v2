import type { SoundHit } from '../../types'

/** 같은 입력에 같은 값을 주는 가짜 난수 (0~1). 다시 그려도 그림이 바뀌지 않게 한다 */
function noise(x: number, y: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return v - Math.floor(v)
}

/** 세기(0~1)를 색으로. 어두운 남색 → 청록 → 노랑. 소리 그림은 자료라서 앱 테마를 따르지 않는다 */
function heat(v: number): string {
  const t = Math.min(1, Math.max(0, v))
  const r = Math.round(20 + 235 * t ** 1.8)
  const g = Math.round(24 + 200 * t)
  const b = Math.round(60 + 90 * (1 - t) * (t > 0.15 ? 1 : 0.4))
  return `rgb(${r},${g},${b})`
}

/**
 * 가짜 소리 그림을 그린다. 실제 소리를 분석하지 않고, 새소리가 있는 구간에 그럴듯한 울음 무늬를 얹는다.
 * `upTo`초까지만 그린다 (녹음 중에는 왼쪽부터 차오른다). 캔버스 크기가 0이면 아무것도 하지 않는다.
 */
export function drawSpectrogram(ctx: CanvasRenderingContext2D, w: number, h: number, seconds: number, upTo: number, hits: SoundHit[]): void {
  if (w === 0 || h === 0) return
  ctx.fillStyle = '#0d1226'
  ctx.fillRect(0, 0, w, h)
  const cell = 4
  const maxX = (Math.min(upTo, seconds) / seconds) * w
  for (let x = 0; x < maxX; x += cell) {
    const t = (x / w) * seconds
    for (let y = 0; y < h; y += cell) {
      const freq = 1 - y / h
      // 바닥 소음: 낮은 주파수일수록 세다 (바람·차 소리)
      let v = noise(x, y) * 0.16 + (1 - freq) ** 3 * 0.35
      hits.forEach((hit, i) => {
        for (const [from, to] of hit.ranges) {
          if (t < from || t > to) continue
          // 종마다 다른 높이에서 오르내리는 울음 줄기
          const center = 0.45 + i * 0.16 + Math.sin((t - from) * (9 + i * 4)) * 0.07
          v += Math.max(0, 1 - Math.abs(freq - center) * 16) * (0.55 + hit.confidence * 0.4)
        }
      })
      ctx.fillStyle = heat(v)
      ctx.fillRect(x, y, cell, cell)
    }
  }
}
