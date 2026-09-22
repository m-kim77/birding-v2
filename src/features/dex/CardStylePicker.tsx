import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useJournal } from '../../data/journal'
import { getBestPhoto } from '../../data/photos'
import Icon from '../../ui/Icon'
import type { CardStyle, Sighting } from '../../types'
import { accentFromImage } from './accentFromPhoto'
import { CARD_PRESETS, isHexColor, readableAccent, styleOf } from './cardStyle'
import './stylePicker.css'

interface Props {
  sighting: Sighting
  /**
   * 함께 바꿀 다른 기록의 id. 도감의 종 시트에서는 그 종의 모든 기록에 같은 색을 준다 —
   * 대표 카드(가장 최근 기록)가 바뀌어도 고른 색이 도감에서 사라지지 않게. 없으면 이 기록만.
   */
  alsoIds?: string[]
}

/**
 * 카드의 색과 효과를 고른다. 카드가 크게 보이는 세 곳(저장 직후 · 기록 상세 · 도감)에서 카드 아래에 붙는다.
 * 고르면 바로 저장된다 — "적용" 버튼이 없다. 되돌리려면 다른 색을 고르면 된다.
 * 없으면 카드 색을 정할 길이 없다 (BUTTONS.md). 추천 색 · 사진에서 뽑기 · 직접 고르기 · 차분하게/빛나게.
 */
export default function CardStylePicker({ sighting, alsoIds = [] }: Props) {
  const { update } = useJournal()
  const style = styleOf(sighting)
  // 미룬 저장(직접 고르기)이 터질 때 그 사이 바뀐 다른 값(빛나게 등)을 되돌리지 않도록, 늘 최신 스타일을 본다
  const latest = useRef(style)
  latest.current = style
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  // 직접 고르기의 미룬 저장. 화면을 떠날 때 남아 있으면 그 자리에서 저장한다 — 고른 색이 사라지면 안 된다
  const pending = useRef<{ timer: number; flush: () => void } | null>(null)
  useEffect(() => () => { if (pending.current) { window.clearTimeout(pending.current.timer); pending.current.flush() } }, [])

  /** 일부만 바꿔 저장한다 (같이 바꿀 기록이 있으면 그것도). 저장소 오류는 화면에 적는다 — 조용히 실패하지 않는다 */
  function apply(patch: Partial<CardStyle>) {
    const cardStyle = { ...latest.current, ...patch }
    Promise.all([sighting.id, ...alsoIds].map((id) => update(id, { cardStyle })))
      .catch((e: unknown) => setNote(e instanceof Error ? e.message : '저장하지 못했습니다.'))
  }

  /** 색 입력은 끌고 있는 동안 계속 바뀐다 — 손을 뗄 즈음 한 번만 저장한다. 어두운 색은 카드에서 보이도록 밝게 고치고 그 사실을 알린다 */
  function pickCustom(hex: string) {
    if (!isHexColor(hex)) return
    if (pending.current) window.clearTimeout(pending.current.timer)
    const flush = () => {
      pending.current = null
      const accent = readableAccent(hex)
      setNote(accent === hex.toUpperCase() ? '' : '어두운 색은 카드에서 보이도록 밝게 고쳤습니다.')
      apply({ accent })
    }
    pending.current = { timer: window.setTimeout(flush, 250), flush }
  }

  /** 사진에서 다시 뽑는다 (잘라낸 판이 있으면 그것). 못 뽑거나 못 읽으면 그대로 두고 알린다 */
  async function fromPhoto() {
    setBusy(true)
    setNote('')
    try {
      const blob = await getBestPhoto(sighting.id, 'full')
      const accent = blob ? await accentFromImage(blob) : null
      if (accent) apply({ accent }); else setNote('사진에서 색을 뽑지 못했습니다.')
    } catch (e) {
      setNote(e instanceof Error ? e.message : '사진을 읽지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const picked = CARD_PRESETS.find((p) => p.accent === style.accent)
  return (
    <div className="style-picker" role="group" aria-label="카드 색">
      <p className="hint">카드 색 · {picked ? picked.ko : '직접 고른 색'}{alsoIds.length > 0 ? ` · 이 종의 기록 ${alsoIds.length + 1}건에 함께` : ''} — 고르면 바로 저장됩니다</p>
      <div className="swatches">
        {CARD_PRESETS.map((p) => (
          <button key={p.id} type="button" className={`swatch${style.accent === p.accent ? ' is-on' : ''}`} style={{ '--swatch': p.accent } as CSSProperties}
            aria-label={p.ko} aria-pressed={style.accent === p.accent} title={p.ko} onClick={() => apply({ accent: p.accent })} />
        ))}
        {/* 직접 고르기: 추천에 없는 색. 제어 입력으로 두면 끌고 있는 동안 React가 값을 되돌린다 — 비제어로 두고 저장된 색이 바뀌면 다시 붙인다(key) */}
        <label className="swatch swatch-custom" title="직접 고르기">
          <input key={style.accent} type="color" defaultValue={style.accent.toLowerCase()} aria-label="직접 고르기" onChange={(e) => pickCustom(e.target.value)} />
        </label>
        {/* 사진에서: 저장할 때 뽑은 색으로 되돌리거나, 옛 기록에 처음 색을 준다 */}
        <button type="button" className="swatch swatch-photo" aria-label="사진에서 뽑기" title="사진에서 뽑기" disabled={busy} onClick={() => void fromPhoto()}>
          <Icon name="camera" size={18} />
        </button>
      </div>
      <div className="chips">
        <button type="button" className={`chip${style.glow ? '' : ' is-on'}`} aria-pressed={!style.glow} onClick={() => apply({ glow: false })}>차분하게</button>
        <button type="button" className={`chip${style.glow ? ' is-on' : ''}`} aria-pressed={style.glow} onClick={() => apply({ glow: true })}>빛나게</button>
      </div>
      {note && <p className="hint">{note}</p>}
    </div>
  )
}
