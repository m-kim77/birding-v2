import { useRef, type CSSProperties } from 'react'
import SightingPhoto from '../../ui/SightingPhoto'
import Icon from '../../ui/Icon'
import { dayOf } from '../../ui/when'
import type { Sighting } from '../../types'
import { CARD_LOOKS, frameCss } from './cardLook'
import { TIER_LABELS } from './cardTier'
import { useCardTilt } from './useCardTilt'
import './card.css'

/** 카드에 적는 장소. 보호가 필요한 종은 시·군까지만 남긴다 (place가 이미 그렇게 저장돼 있다) */
export function cardPlace(s: Sighting): string {
  return s.sensitive ? `${s.place} · 상세 위치 비공개` : s.place
}

/**
 * 새 카드. 기록 한 건에서 자동으로 만들어진다 — 사용자가 꾸밀 것이 없다.
 *
 * **카드 디자인은 앱 테마를 따르지 않는다.** 색은 cardLook.ts에서 오고, 내보내는 이미지·영상(cardCanvas.ts)과 같은 값을 쓴다.
 * 큰 카드는 손가락을 따라 살짝 기울고 빛이 지나간다. 도감 격자의 작은 카드는 가만히 있다 — 수십 장이 함께 움직이면 어지럽다.
 */
export default function BirdCard({ sighting, small }: { sighting: Sighting; small?: boolean }) {
  const s = sighting
  const look = CARD_LOOKS[s.tier]
  const name = s.speciesKo || '이름 미정'
  const ref = useRef<HTMLElement>(null)
  useCardTilt(ref, !small)

  const vars = { '--c-frame': frameCss(look), '--c-paper': look.paper, '--c-ink': look.ink, '--c-sub': look.sub, '--c-tier': look.tierInk } as CSSProperties
  return (
    <article ref={ref} className={`bird-card${small ? ' is-small' : ''}${look.shine ? ' has-shine' : ''}`} style={vars} aria-label={`${name} 카드`}>
      <div className="bird-card-inner">
        {/* 작은 카드는 작은 판으로 충분하다 (작은 판은 잘라낸 사진에서 만든다 — record/savePhotos.ts) */}
        <SightingPhoto id={s.id} kind={small ? 'thumb' : 'full'} preferCrop={!small} alt={name} ratio="1 / 1" sound={s.fromSound} />
        <div className="bird-card-text">
          {/* 작은 카드에서 1단계 라벨("다시 만남")은 뺀다 — 격자의 대부분이 같은 글자로 채워지면 소음이다 */}
          {(!small || s.tier > 1) && <p className="bird-card-tier">{TIER_LABELS[s.tier]}</p>}
          <h3>{name}</h3>
          {s.latin && <p className="bird-card-latin">{s.latin}</p>}
          {!small && (
            <p className="bird-card-meta">
              {[dayOf(s), s.place].filter(Boolean).join(' · ')}
              {s.sensitive && <span className="bird-card-lock"><Icon name="lock" size={12} /> 상세 위치 비공개</span>}
            </p>
          )}
        </div>
        {!small && s.stamps.length > 0 && (
          <div className="bird-card-stamps">{s.stamps.map((st) => <span key={st}>{st}</span>)}</div>
        )}
      </div>
    </article>
  )
}
