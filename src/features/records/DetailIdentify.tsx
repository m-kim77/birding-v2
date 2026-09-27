import { useState } from 'react'
import { useJournal } from '../../data/journal'
import { getBestPhoto } from '../../data/photos'
import { Banner, Card } from '../../ui/bits'
import type { Sighting, Verdict } from '../../types'
import IdentifyPanel from '../record/IdentifyPanel'
import { nameFields } from '../record/nameFields'
import { blobForAI } from '../record/savePhotos'
import { useAsk } from '../record/useAsk'

interface Props {
  sighting: Sighting
  onOpenSettings: () => void
}

/** 이 판정이 지금 기록에 들어 있는지 — 값으로 견준다 (새로고침하면 DB에서 읽은 다른 객체가 된다) */
function holds(s: Sighting, v: Verdict | null): boolean {
  return v !== null && s.verdict !== undefined && JSON.stringify(s.verdict) === JSON.stringify(v)
}

/**
 * 저장한 기록에서 AI에게 (다시) 묻는다. 이름 없이 저장했거나, 판정 서버가 쉬어서 못 물었거나, 답이 미심쩍을 때.
 * 보내는 그림은 저장된 잘라낸 판(없으면 큰 판) — 둘 다 캔버스에서 다시 만든 것이라 위치 EXIF가 없다 (record/savePhotos.ts).
 * '이 이름으로'를 누르면 이름·학명·근거·도감 번호를 이 기록에 넣는다. 그 전까지는 기록을 건드리지 않는다.
 * 기록의 이름이 판정과 같아도 '이 이름으로'가 있다 — 직접 적어 저장한 이름에 AI 근거를 붙이는 길이다. 넣었는지는 기록의 판정으로 본다 (holds).
 */
export default function DetailIdentify({ sighting, onOpenSettings }: Props) {
  const { sightings, update } = useJournal()
  const ask = useAsk()
  const [error, setError] = useState('')

  /** 저장된 사진을 1024px로 다시 인코딩해 보낸다 (blobForAI). 사진을 못 읽으면(지워졌거나 DB 오류) 안내만 하고 판정을 시작하지 않는다 */
  async function askAI() {
    setError('')
    try {
      const blob = await getBestPhoto(sighting.id, 'full')
      if (!blob) { setError('이 기록의 사진을 찾을 수 없어 물어볼 수 없습니다.'); return }
      void ask.start(await blobForAI(blob), { capturedAt: sighting.capturedAt, place: sighting.place })
    } catch (e) {
      setError(e instanceof Error ? e.message : '사진을 읽지 못했습니다.')
    }
  }

  /**
   * 판정 결과를 기록에 넣는다. 도감 번호는 다른 기록들을 기준으로 다시 매긴다 (처음 보는 종이면 다음 번호).
   * 국명을 확인하지 못한 판정이면 아무것도 하지 않는다 — 학명을 이름 자리에 넣지 않는다 (작업 20. 그때는 화면에 '이 이름으로'도 없다).
   */
  async function apply(v: Verdict) {
    if (!v.speciesKo) return
    await update(sighting.id, nameFields(v.speciesKo, v, others(), sighting))
  }

  /** 후보 이름을 고르면 그 이름만 넣는다 — AI 근거는 그 후보에 대한 것이 아니므로 뗀다 (nameFields에 판정 없이) */
  async function pickName(name: string) {
    await update(sighting.id, nameFields(name, null, others(), sighting))
  }

  /** 이 기록을 뺀 기록들 — 도감 번호를 매길 때 */
  function others() {
    return (sightings ?? []).filter((x) => x.id !== sighting.id)
  }

  return (
    <Card>
      <h2>{sighting.verdict ? 'AI에게 다시 물어보기' : 'AI에게 물어보기'}</h2>
      <IdentifyPanel ask={ask} hasCrop={sighting.cropBox !== null} name={sighting.speciesKo} applied={holds(sighting, ask.verdict)} into="이 기록"
        idleHint={sighting.cropBox ? '' : '잘라낸 영역이 없어 저장된 사진 전체를 보냅니다.'}
        onAsk={() => void askAI()} onApply={(v) => void apply(v)} onPickName={(n) => void pickName(n)} onOpenSettings={onOpenSettings} />
      {error && <Banner tone="err" icon="alert">{error}</Banner>}
    </Card>
  )
}
