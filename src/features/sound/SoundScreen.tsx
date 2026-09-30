import { useRef } from 'react'
import { Banner, Progress, ScreenHead } from '../../ui/bits'
import Button from '../../ui/Button'
import Icon from '../../ui/Icon'
import { clockOf } from './heard'
import HeardList from './HeardList'
import { soundEntryOn } from './soundModel'
import { useListening } from './useListening'
import { useSoundModel } from './useSoundModel'
import './sound.css'

type Model = ReturnType<typeof useSoundModel>
type Listen = ReturnType<typeof useListening>

/** 모델을 받거나 준비하는 동안의 한 줄. 그 밖에는 아무것도 그리지 않는다 */
function ModelStatus({ model }: { model: Model }) {
  if (model.state === 'downloading') {
    return <div className="status-line" role="status"><span>새소리 모델 받는 중 · {Math.round(model.progress * 100)}%</span><Progress value={model.progress} label="모델 다운로드" /></div>
  }
  if (model.state === 'preparing') return <p className="status-line" role="status">판정을 준비하는 중…</p>
  return null
}

/** 시작 전. 새는 기다려 주지 않으므로 큰 버튼 하나만 크게 둔다 */
function StartPanel({ model, onMic, onFile }: { model: Model; onMic: () => void; onFile: () => void }) {
  const missing = model.state === 'missing'
  return (
    <div className="sound-start">
      {/* 수십 MB를 말없이 받지 않는다 — 누르기 전에 크기를 알린다 */}
      {missing && <Banner tone="info" icon="download">새소리 모델({model.sizeMb}MB)을 한 번 받아야 합니다. 와이파이에서 받기를 권합니다.</Banner>}
      <button type="button" className="rec-button" onClick={onMic} aria-label={missing ? '모델 받고 듣기 시작' : '듣기 시작'}><Icon name="mic" size={44} /></button>
      <p className="display">{missing ? '모델 받고 듣기 시작' : '눌러서 듣기 시작'}</p>
      <ModelStatus model={model} />
      {/* 소리 파일 고르기: 녹음기나 폰의 음성 메모로 미리 녹음해 둔 소리를 판정하는 길 */}
      <Button variant="quiet" icon="upload" onClick={onFile}>소리 파일 고르기</Button>
      <p className="hint">소리는 이 기기 안에서만 판정하고 저장하지 않습니다. 들린 새 목록도 이 화면을 떠나면 사라집니다.</p>
    </div>
  )
}

/** 듣는 중·파일을 판정하는 중. 목록은 창 하나(3초)를 판정할 때마다 자란다 */
function RunningPanel({ listen }: { listen: Listen }) {
  const live = listen.phase === 'listening'
  return (
    <>
      <div className="sound-live">
        {live
          ? <div className="meter" role="img" aria-label="마이크 소리 크기"><div className="meter-fill" style={{ width: `${Math.round(listen.level * 100)}%` }} /></div>
          : <Progress value={listen.total ? listen.seconds / listen.total : 0} label="소리 파일 판정" />}
        <p className="rec-clock">{live ? clockOf(listen.seconds) : `${clockOf(listen.seconds)} / ${clockOf(listen.total)}`}</p>
        <p className="hint">{live ? '듣는 중' : `${listen.fileName} 판정하는 중`}</p>
        {/* 그만 듣기: 마이크를 놓는 유일한 길 (화면을 떠나도 놓는다). 파일은 남은 부분을 판정하지 않고 멈춘다 */}
        <Button variant="primary" icon="stop" onClick={listen.stop}>{live ? '그만 듣기' : '그만두기'}</Button>
      </div>
      {listen.notice && <p className="hint">{listen.notice}</p>}
      {listen.heard.length === 0 && <p className="hint">아직 들린 새가 없습니다. 첫 결과는 3초쯤 뒤에 나옵니다.</p>}
      <HeardList heard={listen.heard} seconds={listen.seconds} live={live} />
    </>
  )
}

/** 듣기가 끝난 뒤. 목록은 화면을 떠나거나 다시 시작할 때까지 남는다 */
function DonePanel({ listen, onMic, onFile }: { listen: Listen; onMic: () => void; onFile: () => void }) {
  const from = listen.fileName ? `${listen.fileName} · ${clockOf(listen.seconds)}` : `${clockOf(listen.seconds)} 들음`
  return (
    <>
      <p className="sound-summary">{from} · {listen.heard.length}종</p>
      {listen.notice && <p className="hint">{listen.notice}</p>}
      {listen.heard.length === 0 && <Banner tone="warn" icon="alert">새소리를 찾지 못했습니다. 새에게 더 가까이 가거나 바람이 덜한 곳에서 다시 들어 보세요.</Banner>}
      <HeardList heard={listen.heard} seconds={listen.seconds} live={false} />
      {listen.heard.length > 0 && <p className="hint">확실하지 않은 종은 직접 들어 보고 판단하세요. 이 목록은 저장되지 않습니다.</p>}
      <div className="row-actions">
        {/* 다시 듣기: 끝난 뒤에 새로 듣는 길. 지금 목록은 지워진다 */}
        <Button variant="primary" icon="mic" onClick={onMic}>다시 듣기</Button>
        <Button variant="quiet" icon="upload" onClick={onFile}>소리 파일 고르기</Button>
      </div>
    </>
  )
}

/**
 * 새소리 듣기 (작업 32). 마이크로 듣거나 소리 파일을 골라, 기기 안에서 판정한 "들린 새 목록"을 보여 준다.
 * **판정만 한다** — 기록을 만들지 않고 아무것도 저장하지 않는다. 화면을 떠나면 목록이 사라지고 마이크를 놓는다.
 * 들어오는 길: 새 기록 첫 화면의 '새소리 듣기' (record/PhotoStart). 판정기가 시험용 가짜인 동안은 그 사실을 맨 위에 알린다.
 */
export default function SoundScreen({ onBack }: { onBack: () => void }) {
  const model = useSoundModel()
  const listen = useListening(model.ensure)
  const fileInput = useRef<HTMLInputElement>(null)
  const pickFile = () => fileInput.current?.click()
  const error = listen.error || model.error

  // 닫아 둔 판(가짜 판정기 + 배포판)에 옛 방문 기록으로 들어온 경우 — 가짜 답을 보여 주지 않는다
  if (!soundEntryOn) return <div className="screen"><ScreenHead title="새소리 듣기" onBack={onBack} /><p className="hint">아직 준비 중인 기능입니다.</p></div>

  return (
    <div className="screen screen-sound">
      <ScreenHead title="새소리 듣기" onBack={onBack} />
      <input ref={fileInput} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) listen.readFile(f); e.target.value = '' }} />
      {model.demo && <Banner tone="warn" icon="alert">시험용 가짜 판정기입니다. 소리를 판정하지 않고, 소리가 나면 정해 둔 새 이름을 차례로 보여 줍니다. 모델 받기도 흉내입니다.</Banner>}
      {error && <Banner tone="err" icon="alert">{error}</Banner>}
      {listen.phase === 'idle' && <StartPanel model={model} onMic={listen.startMic} onFile={pickFile} />}
      {listen.phase === 'starting' && (
        <div className="sound-live">
          <ModelStatus model={model} />
          {model.state === 'ready' && <p className="status-line" role="status">{listen.fileName ? '소리 파일을 읽는 중…' : '마이크를 여는 중…'}</p>}
        </div>
      )}
      {(listen.phase === 'listening' || listen.phase === 'reading') && <RunningPanel listen={listen} />}
      {listen.phase === 'done' && <DonePanel listen={listen} onMic={listen.startMic} onFile={pickFile} />}
    </div>
  )
}
