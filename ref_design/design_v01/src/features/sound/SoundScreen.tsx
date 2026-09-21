import { useState } from 'react'
import { useStore } from '../../app/store'
import { SOUND_HITS, SOUND_SECONDS } from '../../mock/data'
import { Banner, Progress, ScreenHead } from '../../ui/bits'
import Button from '../../ui/Button'
import Icon from '../../ui/Icon'
import { formatClock } from '../../ui/format'
import type { Sighting, SoundHit } from '../../types'
import { tierFor } from '../dex/cardTier'
import Spectrogram from './Spectrogram'
import { useSoundSession } from './useSoundSession'
import './sound.css'

interface Props {
  onCancel: () => void
  onDone: () => void
}

/**
 * 소리로 기록하기. 새는 기다려 주지 않으므로 첫 화면에는 큰 녹음 버튼 하나만 크게 둔다.
 * 결과에서는 종을 눌러 고르고 한 번에 기록한다 — 종마다 "기록" 버튼을 두지 않았다.
 */
export default function SoundScreen({ onCancel, onDone }: Props) {
  const store = useStore()
  const session = useSoundSession(store.scenario)
  const [focus, setFocus] = useState<SoundHit | null>(null)
  const { phase, picked } = session

  /** 고른 종마다 기록을 하나씩 만든다. 위치는 녹음할 때의 현재 위치다 */
  function saveAll() {
    const now = new Date().toISOString().slice(0, 19)
    SOUND_HITS.filter((h) => picked.includes(h.speciesKo)).forEach((h, i) => {
      const sighting: Sighting = {
        id: `s${Date.now()}-${i}`, speciesKo: h.speciesKo, latin: h.latin, capturedAt: now, place: '서울숲', lat: 37.544, lng: 127.037,
        locationSource: 'gps', exifLine: '', note: `소리로 기록 · 신뢰도 ${Math.round(h.confidence * 100)}%`, photo: '',
        tier: tierFor(h.speciesKo, now, [], store.sightings), stamps: [], sensitive: false, identify: 'done', fromSound: true,
      }
      store.add(sighting)
    })
    onDone()
  }

  return (
    <div className="screen screen-sound">
      <ScreenHead title="소리로 기록" onBack={onCancel} />

      {phase === 'idle' && (
        <div className="sound-start">
          {!session.hasModel && (
            <Banner tone="info" icon="download">새소리 인식 모델(48MB)을 한 번 받아야 합니다. 받은 뒤에는 인터넷 없이도 됩니다.</Banner>
          )}
          <button type="button" className="rec-button" onClick={session.hasModel ? session.startRecording : session.downloadModel}>
            <Icon name="mic" size={44} />
          </button>
          <p className="display">{session.hasModel ? '눌러서 녹음 시작' : '모델 받고 녹음 시작'}</p>
          {/* 파일 고르기: 별도 녹음기나 폰 음성 메모로 이미 녹음해 둔 소리를 쓰는 경우 */}
          <Button variant="quiet" icon="upload" onClick={session.finish} disabled={!session.hasModel}>녹음 파일 고르기</Button>
        </div>
      )}

      {phase === 'downloading' && (
        <div className="status-line"><span>새소리 인식 모델 받는 중 · {Math.round(session.progress * 100)}%</span><Progress value={session.progress} label="모델 다운로드" /></div>
      )}

      {(phase === 'recording' || phase === 'analyzing') && (
        <div className="sound-live">
          <Spectrogram seconds={SOUND_SECONDS} upTo={session.elapsed} hits={SOUND_HITS} focus={null} playhead={null} />
          <p className="rec-clock">{phase === 'recording' ? formatClock(session.elapsed) : '분석하는 중…'}</p>
          {phase === 'recording' && <Button variant="primary" icon="stop" onClick={session.finish}>녹음 끝내기</Button>}
        </div>
      )}

      {phase === 'results' && (
        <>
          <Spectrogram seconds={SOUND_SECONDS} upTo={SOUND_SECONDS} hits={SOUND_HITS} focus={focus} playhead={session.playing ? session.playhead : null} />
          {/* 재생: 결과를 귀로 확인하는 것이 판정의 마지막 단계다. 종을 고르면 그 구간이 그림에 표시된다 */}
          <Button icon={session.playing ? 'pause' : 'play'} onClick={session.togglePlay}>{session.playing ? '멈춤' : '들어 보기'} · {formatClock(SOUND_SECONDS)}</Button>
          <ul className="hit-list">
            {SOUND_HITS.map((h) => {
              const on = picked.includes(h.speciesKo)
              return (
                <li key={h.speciesKo}>
                  <button type="button" className={`hit${on ? ' is-on' : ''}`} aria-pressed={on}
                    onClick={() => { session.togglePick(h); setFocus(h) }}>
                    <span className="hit-check">{on && <Icon name="check" size={16} />}</span>
                    <span className="hit-name"><strong className="display">{h.speciesKo}</strong><em>{h.latin}</em></span>
                    <span className="hit-conf">{Math.round(h.confidence * 100)}%</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="hint">신뢰도가 낮은 종은 직접 들어 보고 고르세요.</p>
          <div className="bottom-bar">
            <Button variant="primary" icon="check" block disabled={picked.length === 0} onClick={saveAll}>
              {picked.length ? `${picked.length}종 기록하기` : '기록할 종을 고르세요'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
