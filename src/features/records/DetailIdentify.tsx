import { useState } from 'react'
import { useJournal } from '../../data/journal'
import { getBestPhoto } from '../../data/photos'
import { latinOf } from '../../data/species'
import { bitmapToJpeg, blobToDataUrl } from '../../lib/resize'
import { Banner, Card } from '../../ui/bits'
import type { Sighting, Verdict } from '../../types'
import { dexNoFor } from '../dex/dexNo'
import { IDENTIFY_MAX_EDGE } from '../identify/loop'
import IdentifyPanel from '../record/IdentifyPanel'
import { useAsk } from '../record/useAsk'

interface Props {
  sighting: Sighting
  onOpenSettings: () => void
}

/**
 * 저장한 기록에서 AI에게 (다시) 묻는다. 이름 없이 저장했거나, 판정 서버가 쉬어서 못 물었거나, 답이 미심쩍을 때.
 * 보내는 그림은 저장된 잘라낸 판(없으면 큰 판) — 둘 다 캔버스에서 다시 만든 것이라 위치 EXIF가 없다 (record/savePhotos.ts).
 * '이 이름으로'를 누르면 이름·학명·근거·도감 번호를 이 기록에 넣는다. 그 전까지는 기록을 건드리지 않는다.
 */
export default function DetailIdentify({ sighting, onOpenSettings }: Props) {
  const { sightings, update } = useJournal()
  const ask = useAsk()
  const [error, setError] = useState('')

  /** 저장된 사진을 1024px로 다시 인코딩해 보낸다. 사진을 못 읽으면(지워졌거나 DB 오류) 안내만 하고 판정을 시작하지 않는다 */
  async function askAI() {
    setError('')
    let bitmap: ImageBitmap | null = null
    try {
      const blob = await getBestPhoto(sighting.id, 'full')
      if (!blob) { setError('이 기록의 사진을 찾을 수 없어 물어볼 수 없습니다.'); return }
      bitmap = await createImageBitmap(blob)
      const url = await blobToDataUrl(await bitmapToJpeg(bitmap, IDENTIFY_MAX_EDGE, 0.88))
      void ask.start(url, { capturedAt: sighting.capturedAt, place: sighting.place })
    } catch (e) {
      setError(e instanceof Error ? e.message : '사진을 읽지 못했습니다.')
    } finally {
      bitmap?.close()
    }
  }

  /** 판정 결과를 기록에 넣는다. 도감 번호는 다른 기록들을 기준으로 다시 매긴다 (처음 보는 종이면 다음 번호) */
  async function apply(v: Verdict) {
    const name = v.speciesKo || v.latin
    const others = (sightings ?? []).filter((x) => x.id !== sighting.id)
    await update(sighting.id, { speciesKo: name, latin: v.latin, verdict: v, identify: 'done', dexNo: dexNoFor(name, others) })
  }

  /** 후보 이름을 고르면 그 이름만 넣는다 — AI 근거는 그 후보에 대한 것이 아니므로 뗀다 (buildSighting과 같은 원칙) */
  async function pickName(name: string) {
    const others = (sightings ?? []).filter((x) => x.id !== sighting.id)
    await update(sighting.id, { speciesKo: name, latin: latinOf(name), verdict: undefined, identify: 'done', dexNo: dexNoFor(name, others) })
  }

  return (
    <Card>
      <h2>{sighting.verdict ? 'AI에게 다시 물어보기' : 'AI에게 물어보기'}</h2>
      <IdentifyPanel ask={ask} hasCrop={sighting.cropBox !== null} name={sighting.speciesKo}
        idleHint={sighting.cropBox ? '' : '잘라낸 영역이 없어 저장된 사진 전체를 보냅니다.'}
        onAsk={() => void askAI()} onApply={(v) => void apply(v)} onPickName={(n) => void pickName(n)} onOpenSettings={onOpenSettings} />
      {error && <Banner tone="err" icon="alert">{error}</Banner>}
    </Card>
  )
}
