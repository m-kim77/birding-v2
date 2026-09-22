import type { CSSProperties } from 'react'
import SightingPhoto from '../../ui/SightingPhoto'
import type { Sighting } from '../../types'
import BirdCard from './BirdCard'
import { CARD_MARK } from './cardLook'
import { styleOf } from './cardStyle'
import './reveal.css'

const BEATS = ['SCANNING', 'MATERIALIZING', 'FLIP', 'REVEAL']

/**
 * 카드가 나타나는 연출. Card Reveal 디자인의 네 박자를 따른다: 01 스캔 → 02 생성 → 03 플립 → 04 공개 (약 3초).
 * 박자의 시각은 reveal.css에 있고, 내보내는 영상(cardExport.ts의 T)과 같다.
 *
 * `animate`가 false면 연출 없이 카드만 보여 준다 — 매번 나오면 세 번째부터 귀찮아진다 (처음 본 종에만 쓴다).
 * "움직임 줄이기"를 켠 사용자에게도 연출 없이 보여 준다 (reveal.css).
 */
export default function CardReveal({ sighting, animate }: { sighting: Sighting; animate: boolean }) {
  const style = { '--accent': styleOf(sighting).accent } as CSSProperties
  return (
    <div className={`reveal-stage${animate ? ' is-animated' : ''}`} style={style}>
      <div className="reveal-slot">
        {animate && (
          <div className="reveal-scan" aria-hidden="true">
            <SightingPhoto id={sighting.id} kind="full" preferCrop alt="" ratio="1 / 1" sound={sighting.fromSound} />
            <i />
          </div>
        )}
        <div className="reveal-flipper">
          {animate && <div className="reveal-back" aria-hidden="true"><strong>탐조일지</strong><span>{CARD_MARK}</span></div>}
          <div className="reveal-front"><BirdCard sighting={sighting} /></div>
        </div>
      </div>
      {animate && <ol className="reveal-beats" aria-hidden="true">{BEATS.map((b, i) => <li key={b}>0{i + 1} {b}</li>)}</ol>}
    </div>
  )
}
