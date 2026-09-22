import { useRef, type CSSProperties } from 'react'
import SightingPhoto from '../../ui/SightingPhoto'
import { dotDateOf } from '../../ui/when'
import type { Sighting } from '../../types'
import { CARD_BASE, CARD_MARK } from './cardLook'
import { styleOf } from './cardStyle'
import { dexLabel, shotLine } from './cardText'
import { useCardTilt } from './useCardTilt'
import './card.css'

/**
 * 새 카드. 기록 한 건에서 자동으로 만들어진다 — 색은 사진에서 뽑고, 사용자가 바꿀 수 있다 (CardStylePicker).
 * 등급·별은 없다 — 새에 등급을 매기지 않는다.
 *
 * **카드 디자인은 앱 테마를 따르지 않는다.** 값은 cardLook.ts·cardStyle.ts에서 오고, 내보내는 이미지·영상(cardCanvas.ts)과 같은 값을 쓴다.
 * 큰 카드는 손가락을 따라 살짝 기울고 빛이 지나간다. 도감 격자의 작은 카드는 가만히 있다 — 수십 장이 함께 움직이면 어지럽다.
 * 보호가 필요한 종은 장소 대신 "위치 비공개"를 적는다 — 카드는 SNS로 퍼지는 물건이다.
 */
export default function BirdCard({ sighting, small }: { sighting: Sighting; small?: boolean }) {
  const s = sighting
  const style = styleOf(s)
  const name = s.speciesKo || '이름 미정'
  const ref = useRef<HTMLElement>(null)
  useCardTilt(ref, !small)
  const vars = { '--accent': style.accent, '--c-top': CARD_BASE.bgTop, '--c-bottom': CARD_BASE.bgBottom, '--c-ink': CARD_BASE.ink, '--c-sub': CARD_BASE.sub, '--c-hair': CARD_BASE.hair } as CSSProperties
  const shot = shotLine(s)

  return (
    <article ref={ref} className={`bird-card${small ? ' is-small' : ''}${style.glow ? ' has-glow' : ''}`} style={vars} aria-label={`${name} 카드`}>
      <header className="bc-top"><span>{dexLabel(s.dexNo)}</span><span className="bc-mark"><i />{CARD_MARK}</span></header>
      <div className="bc-plate">
        {/* 작은 카드는 작은 판으로 충분하다 (작은 판은 잘라낸 사진에서 만든다 — record/savePhotos.ts) */}
        <SightingPhoto id={s.id} kind={small ? 'thumb' : 'full'} preferCrop={!small} alt={name} ratio="auto" sound={s.fromSound} />
        {!small && s.stamps.length > 0 && <div className="bc-stamps">{s.stamps.map((st) => <span key={st}>{st}</span>)}</div>}
      </div>
      <h3>{name}</h3>
      {s.latin && <p className="bc-latin">{s.latin}</p>}
      {!small && (
        <footer className="bc-meta">
          <p><span>{dotDateOf(s)}</span><span>{s.sensitive ? '위치 비공개' : s.place}</span></p>
          {shot && <p className="bc-shot">{shot}</p>}
        </footer>
      )}
    </article>
  )
}
