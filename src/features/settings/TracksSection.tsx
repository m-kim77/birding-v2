import { useRef, useState } from 'react'
import { clearTracks, type TracksMeta } from '../../data/tracks'
import { Card, Progress } from '../../ui/bits'
import Button from '../../ui/Button'
import { daysAgoOf } from '../../ui/when'
import { importTimelineFile, type ImportProgress } from '../tracks/importTracks'
import { pointCountText, trackRangeText } from '../tracks/trackText'
import { useTracksMeta } from '../tracks/useTracksMeta'

type Message = { tone: 'ok' | 'warn'; text: string }

/**
 * 진행 단계를 막대 값과 문구로. 읽기·파싱은 워커가 진행률을 줄 수 없어 고정값(0.1·0.5)으로 "멈추지 않았다"만 보인다 — 부정확한 진행이다.
 * 저장은 날짜 수로 정확히 잰다 (done/total). total이 0이면 0.
 */
function progressOf(p: ImportProgress): { value: number; text: string } {
  if (p.stage === 'reading') return { value: 0.1, text: '파일을 읽는 중…' }
  if (p.stage === 'parsing') return { value: 0.5, text: '점을 고르는 중…' }
  const done = p.done ?? 0
  const total = p.total ?? 0
  return { value: total ? done / total : 0, text: `저장하는 중 · ${done}/${total}일` }
}

/** 상태 줄: '5월 22일 ~ 8월 20일 · 22,426점 · 넣은 날 3일 전'. 넣은 시각을 못 읽으면 그 부분만 뺀다 */
function summaryOf(meta: TracksMeta): string {
  const ago = daysAgoOf(meta.importedAt)
  return [trackRangeText(meta), pointCountText(meta.count), ago && `넣은 날 ${ago}`].filter(Boolean).join(' · ')
}

/**
 * 이동 기록(구글 타임라인). 위치 없는 카메라 사진의 위치를 촬영 시각으로 찾는 데 쓴다 (record/useTrackMatch).
 * 파일은 브라우저 안에서만 읽어 이 기기에 둔다 — 서버로 보내지 않고 백업에도 넣지 않는다 (data/tracks.ts). 다시 넣으면 있던 점과 합친다.
 * 좌표는 어디에도 보여 주지 않는다 — 범위·점 수·넣은 날만 적는다.
 */
export default function TracksSection() {
  const { meta, refresh } = useTracksMeta()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [message, setMessage] = useState<Message | null>(null)

  /** 작업을 돌리고 결과나 실패 이유를 아래 줄에 적는다 (조용히 실패하지 않는다). 끝나면 요약을 다시 읽는다 — 성공·실패 모두, 화면은 저장소가 지금 말하는 것만 보여 준다 */
  async function run(work: () => Promise<Message>) {
    setBusy(true)
    setMessage(null)
    try { setMessage(await work()) } catch (e) { setMessage({ tone: 'warn', text: e instanceof Error ? e.message : '실패했습니다.' }) } finally { setBusy(false); setProgress(null); await refresh() }
  }

  const upload = (file: File) => run(async () => {
    const { added, meta: next } = await importTimelineFile(file, setProgress)
    // 같은 파일을 다시 넣은 경우 — 잘못이 아니라 "이미 다 있다"다 (warn이 아니다)
    if (added === 0) return { tone: 'ok', text: '이미 있는 점뿐입니다 — 새로 더한 점이 없습니다.' }
    return { tone: 'ok', text: `넣었습니다 — 새 점 ${added.toLocaleString('ko-KR')}개 (전체 ${pointCountText(next.count)} · ${trackRangeText(next)})` }
  })
  const clear = () => run(async () => {
    await clearTracks()
    return { tone: 'ok', text: '이동 기록을 지웠습니다.' }
  })

  const bar = progress && progressOf(progress)
  return (
    <Card>
      <h2>이동 기록</h2>
      <p className="hint">구글 타임라인에서 내보낸 파일을 넣으면, 위치가 없는 카메라 사진의 위치를 촬영 시각으로 찾아 채웁니다.</p>
      <p className="hint">이동 기록은 이 기기 밖으로 나가지 않습니다 — 서버로 보내지 않고, 백업 파일에도 넣지 않습니다. 파일에서 쓰는 점만 골라 두므로 원본 파일은 남겨 두지 않아도 됩니다.</p>
      {/* undefined는 아직 읽는 중 — "없음"으로 잘못 보이지 않게 아무것도 그리지 않는다 */}
      {meta !== undefined && <p className="status-line">{meta ? summaryOf(meta) : '아직 넣은 파일 없음'}</p>}
      <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
      <div className="row-actions">
        {/* 타임라인 파일 넣기: 위치 없는 카메라 사진의 위치를 촬영 시각으로 찾으려면 이동 기록이 있어야 하고, 그 파일은 사용자만 줄 수 있다 (저장소·서버에 두지 않는다) */}
        <Button variant={meta ? 'secondary' : 'primary'} icon="upload" onClick={() => fileInput.current?.click()} disabled={busy}>타임라인 파일 넣기</Button>
        {/* 지우기: 이동 기록은 기록보다 민감하다 — 공용 기기에서 남기지 않을 길이 있어야 한다. 되묻지 않는다: 다시 내보내 넣으면 되는 자료다 */}
        {meta && <Button variant="quiet" icon="trash" onClick={() => void clear()} disabled={busy}>지우기</Button>}
      </div>
      {bar && <div className="status-line"><span>{bar.text}</span><Progress value={bar.value} label={bar.text} /></div>}
      {message && <p className={`status-line is-${message.tone}`} role="status">{message.text}</p>}
      {/* 내보내는 방법: 구글 앱의 메뉴 깊이가 5단계라 안 적으면 못 찾는다. 버튼이 아니라 펼침이다 — 한 번 보면 되는 내용이다 */}
      <details className="howto">
        <summary>내보내는 방법</summary>
        <ul>
          <li><strong>안드로이드</strong><small>설정 → 위치 → 위치 서비스 → 타임라인 → <strong>타임라인 데이터 내보내기</strong>. 내보낸 타임라인.json을 여기에 넣습니다.</small></li>
          <li><strong>아이폰</strong><small>구글 지도 앱 → 프로필 → 설정 → 위치 및 개인정보 보호 → 타임라인 데이터 내보내기. <strong>아이폰에서 내보낸 파일은 모양이 달라 아직 읽지 못합니다.</strong></small></li>
          <li><strong>3개월마다</strong><small>구글은 타임라인을 폰에 저장하고 <strong>3개월이 지난 기록을 지웁니다</strong> (기본 설정). 정확한 점은 최근 한 달 정도만 남아 있어, 그보다 오래된 사진은 이동 경로로만 추정합니다. <strong>3개월마다 새로 내보내 넣어 주세요 — 다시 넣으면 있던 기록과 합쳐집니다.</strong></small></li>
        </ul>
      </details>
    </Card>
  )
}
