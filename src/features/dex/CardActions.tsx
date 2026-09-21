import { useState } from 'react'
import Button from '../../ui/Button'
import type { Sighting } from '../../types'
import { cardImage, cardVideo } from './cardExport'
import { saveFile } from './saveFile'

/** 파일 이름에 못 쓰는 글자를 뺀다 */
function fileBase(s: Sighting): string {
  return `${s.speciesKo || '새카드'}-${s.capturedAt.slice(0, 10)}`.replace(/[\\/:*?"<>|\s]+/g, '_')
}

/**
 * 카드 저장 버튼 둘. 카드가 보이는 모든 곳(저장 직후·도감·기록 상세)에서 같은 것을 쓴다.
 *
 * - 이미지 저장: 카드는 남에게 보여 주려고 만드는 것이다.
 * - 영상 저장: 뒤집히며 나타나는 장면은 화면 안에서만 살아 있다. 밖으로 가져가려면 영상이어야 한다.
 * "공유하기"를 따로 두지 않았다 — 폰에서는 두 버튼이 공유 창을 열고(saveFile.ts), PC에서는 바로 내려받는다.
 */
export default function CardActions({ sighting, primary = true }: { sighting: Sighting; /** 같은 화면에 이미 주 버튼이 있으면 false (주 버튼은 화면마다 하나) */ primary?: boolean }) {
  const [busy, setBusy] = useState<'image' | 'video' | null>(null)
  const [error, setError] = useState('')

  /** 파일을 만들어 넘긴다. 실패하면 이유를 버튼 아래에 적는다 (조용히 실패하지 않는다) */
  async function run(kind: 'image' | 'video') {
    setBusy(kind)
    setError('')
    try {
      if (kind === 'image') await saveFile(await cardImage(sighting), `${fileBase(sighting)}.png`)
      else { const v = await cardVideo(sighting); await saveFile(v.blob, `${fileBase(sighting)}.${v.ext}`) }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card-actions">
      <div className="row-actions">
        <Button variant={primary ? 'primary' : 'secondary'} icon="download" onClick={() => run('image')} disabled={busy !== null}>{busy === 'image' ? '만드는 중…' : '이미지 저장'}</Button>
        <Button icon="play" onClick={() => run('video')} disabled={busy !== null}>{busy === 'video' ? '녹화하는 중… (3초)' : '영상 저장'}</Button>
      </div>
      {error && <p className="status-line is-warn" role="alert">{error}</p>}
    </div>
  )
}
