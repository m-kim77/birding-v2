import { useEffect, useRef, useState } from 'react'
import { SOUND_HITS, SOUND_SECONDS } from '../../mock/data'
import type { Scenario, SoundHit } from '../../types'

export type SoundPhase = 'idle' | 'downloading' | 'recording' | 'analyzing' | 'results'

/** 이 신뢰도 이상인 종만 처음부터 골라 둔다. 낮은 후보는 사용자가 직접 골라야 기록된다 */
const AUTO_PICK = 0.7

/**
 * 새소리 화면의 상태와 동작. 실제 녹음·분석은 없고 타이머로 흉내 낸다.
 * 화면을 떠나면 타이머를 멈춘다 (녹음 중에 뒤로 가도 새지 않는다).
 */
export function useSoundSession(scenario: Scenario) {
  const [phase, setPhase] = useState<SoundPhase>('idle')
  const [hasModel, setHasModel] = useState(scenario !== 'no-model')
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [picked, setPicked] = useState<string[]>([])
  /** 분석 결과. '사진에서 새를 못 찾음' 상황에서는 소리에서도 아무것도 못 찾은 것으로 본다 */
  const hits: SoundHit[] = scenario === 'no-bird' ? [] : SOUND_HITS
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const timer = useRef<number | null>(null)

  /** 돌고 있는 타이머를 멈춘다 */
  function stopTimer() {
    if (timer.current !== null) window.clearInterval(timer.current)
    timer.current = null
  }
  useEffect(() => stopTimer, [])

  /** 분석을 끝내고 결과를 보여 준다. 확실한 종은 미리 골라 둔다 */
  function finish() {
    stopTimer()
    setPhase('analyzing')
    window.setTimeout(() => {
      setElapsed(SOUND_SECONDS)
      setPicked(hits.filter((h) => h.confidence >= AUTO_PICK).map((h) => h.speciesKo))
      setPhase('results')
    }, 900)
  }

  /** 녹음을 시작한다. 가짜 녹음은 정해진 길이에서 저절로 끝난다 */
  function startRecording() {
    setElapsed(0)
    setPhase('recording')
    timer.current = window.setInterval(() => {
      setElapsed((t) => { if (t + 0.25 >= SOUND_SECONDS) { finish(); return SOUND_SECONDS } return t + 0.25 })
    }, 125)
  }

  /** 모델을 받고, 끝나면 바로 녹음을 시작한다 — 받기를 누른 목적이 녹음이기 때문이다 */
  function downloadModel() {
    setPhase('downloading')
    timer.current = window.setInterval(() => {
      setProgress((p) => {
        if (p + 0.08 < 1) return p + 0.08
        stopTimer(); setHasModel(true); startRecording()
        return 1
      })
    }, 180)
  }

  /** 재생·일시정지. 끝까지 가면 처음으로 돌아가 멈춘다 */
  function togglePlay() {
    if (playing) { stopTimer(); setPlaying(false); return }
    setPlaying(true)
    timer.current = window.setInterval(() => {
      setPlayhead((t) => { if (t + 0.1 >= SOUND_SECONDS) { stopTimer(); setPlaying(false); return 0 } return t + 0.1 })
    }, 100)
  }

  /** 종을 고르거나 뺀다 */
  function togglePick(hit: SoundHit) {
    setPicked((list) => (list.includes(hit.speciesKo) ? list.filter((n) => n !== hit.speciesKo) : [...list, hit.speciesKo]))
  }

  /** 결과를 버리고 처음으로. 새소리를 못 찾았을 때 다시 녹음하려고 쓴다 */
  function reset() {
    stopTimer()
    setPlaying(false)
    setPhase('idle')
  }

  return { hits, reset, phase, hasModel, progress, elapsed, picked, playing, playhead, startRecording, finish, downloadModel, togglePlay, togglePick, setPlayhead }
}
