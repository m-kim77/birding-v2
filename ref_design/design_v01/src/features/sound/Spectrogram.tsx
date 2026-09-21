import { useEffect, useRef } from 'react'
import type { SoundHit } from '../../types'
import { drawSpectrogram } from './drawSpectrogram'

interface Props {
  seconds: number
  /** 몇 초까지 그릴지 (녹음 중에는 흐른 시간, 끝난 뒤에는 전체 길이) */
  upTo: number
  /** 그림에 울음 무늬를 얹을 종들 */
  hits: SoundHit[]
  /** 구간 표시를 강조할 종. 없으면 구간 표시를 그리지 않는다 */
  focus: SoundHit | null
  /** 재생 위치 (초). null이면 재생선을 그리지 않는다 */
  playhead: number | null
}

/**
 * 소리 그림 + 고른 종이 들린 구간 표시.
 * 구간은 캔버스 위에 겹친 요소로 그린다 — 글자가 선명하고 스크린리더가 읽을 수 있다.
 */
export default function Spectrogram({ seconds, upTo, hits, focus, playhead }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.width = canvas.clientWidth
    canvas.height = canvas.clientHeight
    drawSpectrogram(ctx, canvas.width, canvas.height, seconds, upTo, hits)
  }, [seconds, upTo, hits])

  return (
    <div className="spectro">
      <canvas ref={ref} aria-label="소리 그림" role="img" />
      {focus?.ranges.map(([from, to]) => (
        <div key={from} className="spectro-range" style={{ left: `${(from / seconds) * 100}%`, width: `${((to - from) / seconds) * 100}%` }}>
          <span>{focus.speciesKo}</span>
        </div>
      ))}
      {playhead !== null && <div className="spectro-head" style={{ left: `${(playhead / seconds) * 100}%` }} />}
    </div>
  )
}
