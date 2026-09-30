import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { dropListening, EMPTY_VIEW, readSoundFile, startMic, stopListening, type Listener, type ListenView } from './listening'
import { soundClassifier } from './soundModel'

/**
 * 새소리 듣기를 화면 상태와 잇는다. 동작은 listening.ts에 있고, 여기는 그 결과를 React 상태로 옮기기만 한다.
 * 들린 종 목록은 이 상태에만 있다 — **화면을 떠나면(언마운트) 마이크를 놓고 돌던 판정을 버리고, 목록도 사라진다.**
 * `ensureModel`은 모델을 준비하는 함수 (useSoundModel).
 */
export function useListening(ensureModel: () => Promise<boolean>) {
  const [view, setView] = useState<ListenView>(EMPTY_VIEW)
  const listener = useRef<Listener>(null)
  listener.current ??= {
    run: 0, live: null, ensureModel,
    classify: (samples) => soundClassifier.classify(samples),
    show: (part, fresh) => setView((v) => ({ ...(fresh ? EMPTY_VIEW : v), ...part })),
  }
  const l = listener.current
  // 부모가 그릴 때마다 새 함수를 넘겨도 늘 마지막 것을 쓴다
  useLayoutEffect(() => { l.ensureModel = ensureModel })
  useEffect(() => () => dropListening(l), [l])

  return {
    ...view,
    startMic: () => void startMic(l),
    stop: () => void stopListening(l),
    readFile: (file: File) => void readSoundFile(l, file),
  }
}
