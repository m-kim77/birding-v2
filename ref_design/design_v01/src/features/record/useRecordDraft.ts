import { useEffect, useRef, useState } from 'react'
import { DETECT_BOXES, IDENTIFY_STEPS, VERDICT } from '../../mock/data'
import { runSteps } from '../../mock/simulate'
import type { DetectBox, Scenario, Verdict } from '../../types'

/** 새 찾기 모델이 이 기기에 있는지 */
export type ModelState = 'ready' | 'missing' | 'downloading'
/** 자를 영역을 어떻게 정했는지. 숫자는 고른 탐지 상자의 번호 */
export type CropChoice = number | 'manual' | null
export type AskState = 'idle' | 'running' | 'done' | 'server-down'

/**
 * 기록하기 화면의 상태와 동작. 화면 컴포넌트는 이 훅이 주는 값만 그린다.
 * 실제 추론은 없고 타이머로 흉내 낸다 — 제품에서는 이 훅의 안쪽만 진짜 구현으로 바뀐다.
 * 화면을 떠나면 돌고 있던 타이머를 모두 멈춘다.
 */
export function useRecordDraft(scenario: Scenario) {
  const [hasPhoto, setHasPhoto] = useState(false)
  const [model, setModel] = useState<ModelState>(scenario === 'no-model' ? 'missing' : 'ready')
  const [download, setDownload] = useState(0)
  /** null이면 아직 찾는 중, 빈 배열이면 못 찾음 */
  const [boxes, setBoxes] = useState<DetectBox[] | null>(null)
  const [crop, setCrop] = useState<CropChoice>(null)
  const [name, setName] = useState('')
  const [latin, setLatin] = useState('')
  const [note, setNote] = useState('')
  const [ask, setAsk] = useState<AskState>('idle')
  const [askStep, setAskStep] = useState(0)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const stops = useRef<Array<() => void>>([])

  useEffect(() => () => stops.current.forEach((stop) => stop()), [])

  /** 새 찾기를 돌린다. 모델이 있을 때 사진을 고르면 자동으로 불린다 — 기기 안에서 도는 공짜 작업이라 버튼이 필요 없다 */
  function detect() {
    setBoxes(null)
    stops.current.push(runSteps(1, 900, () => {
      const found = scenario === 'no-bird' ? [] : DETECT_BOXES
      setBoxes(found)
      // 한 마리뿐이면 고를 것이 없으니 바로 그 상자를 쓴다
      setCrop(found.length === 1 ? 0 : null)
    }))
  }

  /** 사진을 고른 직후. 모델이 없으면 새 찾기는 미뤄 두고 사용자가 받을지 정하게 한다 */
  function pickPhoto() {
    setHasPhoto(true)
    if (model === 'ready') detect()
  }

  /** 모델을 받는다 (수십 MB라 사용자의 동의가 필요하다). 끝나면 곧바로 새 찾기를 돌린다 */
  function downloadModel() {
    setModel('downloading')
    stops.current.push(runSteps(10, 220, (done) => {
      setDownload(done / 10)
      if (done === 10) { setModel('ready'); detect() }
    }))
  }

  /** AI 판정을 시작한다. 오래 걸리고 서버 자원을 쓰므로 자동으로 돌리지 않는다 */
  function askAI() {
    if (scenario === 'server-down') { setAsk('server-down'); return }
    setAsk('running')
    setAskStep(0)
    stops.current.push(runSteps(IDENTIFY_STEPS.length, 1100, (done) => {
      setAskStep(done)
      if (done === IDENTIFY_STEPS.length) { setVerdict(VERDICT); setAsk('done') }
    }))
  }

  /** 진행 중인 판정을 멈춘다. 몇 분씩 걸릴 수 있어 빠져나올 길이 있어야 한다 */
  function cancelAsk() {
    stops.current.forEach((stop) => stop())
    stops.current = []
    setAsk('idle')
  }

  /** 판정 결과의 이름을 이름 칸에 넣는다. 사용자가 이미 적은 이름을 말없이 덮어쓰지 않으려고 자동으로 하지 않는다 */
  function applyVerdict() {
    if (!verdict) return
    setName(verdict.speciesKo)
    setLatin(verdict.latin)
  }

  return {
    hasPhoto, model, download, boxes, crop, name, latin, note, ask, askStep, verdict,
    pickPhoto, downloadModel, setCrop, setName, setNote, askAI, cancelAsk, applyVerdict,
  }
}

export type RecordDraft = ReturnType<typeof useRecordDraft>
