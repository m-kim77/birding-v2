import { useRef, useState, type PointerEvent } from 'react'
import type { NormalizedBox } from '../../types'

/** 이보다 작은 상자는 실수로 찍은 점으로 보고 버린다 (사진 크기 대비 비율) */
const MIN_SIDE = 0.04

/**
 * 사진 위를 끌어서 자를 영역을 그린다. 자동으로 새를 못 찾았을 때의 대안이다.
 * 끝점은 사진 안으로 가둔다. 너무 작게 끌면 아무 일도 일어나지 않는다.
 */
export default function CropDrawer({ onDraw }: { onDraw: (box: NormalizedBox) => void }) {
  const area = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [box, setBox] = useState<NormalizedBox | null>(null)

  /** 포인터 위치를 사진 기준 0~1로 */
  function at(e: PointerEvent): { x: number; y: number } {
    const r = area.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }

  function onDown(e: PointerEvent) {
    area.current!.setPointerCapture(e.pointerId)
    setStart(at(e))
    setBox(null)
  }
  function onMove(e: PointerEvent) {
    if (!start) return
    const p = at(e)
    setBox({ x1: Math.min(start.x, p.x), y1: Math.min(start.y, p.y), x2: Math.max(start.x, p.x), y2: Math.max(start.y, p.y) })
  }
  function onUp() {
    setStart(null)
    if (box && box.x2 - box.x1 >= MIN_SIDE && box.y2 - box.y1 >= MIN_SIDE) onDraw(box); else setBox(null)
  }

  return (
    // touch-action: none — 끌 때 화면이 같이 스크롤되면 상자를 그릴 수 없다
    <div ref={area} className="crop-drawer" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} role="application" aria-label="새가 있는 부분을 끌어서 고르기">
      {box && <div className="crop-frame" style={{ left: `${box.x1 * 100}%`, top: `${box.y1 * 100}%`, width: `${(box.x2 - box.x1) * 100}%`, height: `${(box.y2 - box.y1) * 100}%` }} />}
    </div>
  )
}
