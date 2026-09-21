import { useEffect, type RefObject } from 'react'

/** 기울기의 최대 각도(도). 크면 멀미가 난다 */
const MAX_DEG = 9

/**
 * 카드를 손가락·마우스 방향으로 살짝 기울이고 빛 줄기의 위치를 옮긴다.
 * 값은 CSS 변수(--rx, --ry, --shine)로만 내보내고 실제 모양은 card.css가 정한다.
 * "움직임 줄이기"를 켠 사용자에게는 아무것도 하지 않는다. `enabled`가 false면(작은 카드) 역시 아무것도 하지 않는다.
 */
export function useCardTilt(ref: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    /** 포인터 위치를 -1~1로 바꿔 기울기와 빛 위치를 정한다 */
    function onMove(e: PointerEvent) {
      const r = el!.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width) * 2 - 1
      const y = ((e.clientY - r.top) / r.height) * 2 - 1
      el!.style.setProperty('--ry', `${(x * MAX_DEG).toFixed(2)}deg`)
      el!.style.setProperty('--rx', `${(-y * MAX_DEG).toFixed(2)}deg`)
      el!.style.setProperty('--shine', `${((x + 1) * 50).toFixed(1)}%`)
    }
    /** 손을 떼면 제자리로 */
    function onLeave() {
      el!.style.setProperty('--ry', '0deg')
      el!.style.setProperty('--rx', '0deg')
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => { el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave) }
  }, [ref, enabled])
}
