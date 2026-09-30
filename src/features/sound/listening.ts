import { decodeSoundFile } from './audioFile'
import type { SoundGuess } from './classifier'
import type { HeardSpecies } from './heard'
import { openMic, type Mic } from './micSource'
import { makeSession, type ListenSession } from './session'
import { loudness, meterLevel, MODEL_RATE } from './windows'

/**
 * 새소리 듣기의 동작 — 마이크로 듣기, 소리 파일 판정, 그만두기. 화면 상태는 `show`로만 알린다 (React를 모른다 — useListening.ts가 잇는다).
 * **아무것도 저장하지 않는다.** 소리는 판정기로만 가고, 들린 종 목록은 화면 상태에만 있다 — 기록·백업·드라이브를 건드리지 않는다.
 * 이 파일에 저장(DB·파일 쓰기)이나 바깥으로 보내는 요청을 더하지 말 것 — 더하면 설정의 "무엇이 어디로 가나요"가 거짓이 된다.
 */

/** idle: 시작 전 · starting: 모델·마이크(또는 파일)를 여는 중 · listening: 마이크로 듣는 중 · reading: 파일을 판정하는 중 · done: 끝남 */
export type ListenPhase = 'idle' | 'starting' | 'listening' | 'reading' | 'done'

/** 화면이 그리는 값. 전부 메모리에만 있다 — 화면을 떠나면 사라진다 */
export interface ListenView {
  phase: ListenPhase
  heard: HeardSpecies[]
  /** 마이크: 들은 길이 · 파일: 판정을 마친 길이 (초) */
  seconds: number
  /** 파일일 때 판정할 전체 길이(초). 마이크면 0 */
  total: number
  /** 마이크 소리의 크기 막대 0~1. 마이크가 살아 있는지 눈으로 보는 값 */
  level: number
  /** 파일을 골랐으면 그 이름 */
  fileName: string
  error: string
  /** 막지는 않는 알림 (긴 파일을 잘랐다 · 판정이 밀려 건너뛰었다 · 도중에 그만두었다) */
  notice: string
}

export const EMPTY_VIEW: ListenView = { phase: 'idle', heard: [], seconds: 0, total: 0, level: 0, fileName: '', error: '', notice: '' }

/** 파일 소리를 판정기에 넣을 때 한 번에 넣는 길이(초) — 창 열 개. 다 판정한 뒤 다음을 넣는다 */
const FILE_STEP_SECONDS = 15
/** 마이크 조각 몇 개마다 화면(시계·크기 막대)을 고칠지. 넷이면 약 0.3초 — 조각마다 고치면 목록까지 1초에 열두 번 다시 그린다 */
const SHOW_EVERY = 4

/** 듣기 하나가 쥐고 있는 것 */
interface Live {
  session: ListenSession
  /** 파일이면 null */
  mic: Mic | null
  /** 화면 잠금 막기를 푼다 */
  release: () => void
}

/** 듣기 화면 하나가 들고 다니는 것 (useListening이 만들어 넘긴다) */
export interface Listener {
  /** 지금 듣기의 번호. 새로 시작하거나 버릴 때마다 오른다 — 늦게 끝난 옛 듣기가 화면을 고치지 못하게 */
  run: number
  live: Live | null
  /** 모델을 (없으면 받아서) 준비한다. 안 되면 false — 이유는 모델 쪽이 보여 준다 (useSoundModel) */
  ensureModel: () => Promise<boolean>
  classify: (samples: Float32Array) => Promise<SoundGuess[]>
  /** 화면 상태의 일부를 고친다. `fresh`면 처음 상태에서 시작한다 */
  show: (part: Partial<ListenView>, fresh?: boolean) => void
}

/** 듣는 동안 폰 화면이 꺼지지 않게 한다 (꺼지면 마이크도 멈춘다). 못 하는 브라우저에서는 아무 일도 없다. 돌려주는 함수가 놓는다 */
async function keepAwake(): Promise<() => void> {
  try {
    const lock = await navigator.wakeLock.request('screen')
    return () => { void lock.release().catch(() => undefined) }
  } catch {
    return () => undefined
  }
}

/** 돌고 있는 듣기를 버린다: 마이크를 놓고, 밀린 판정을 비우고, 화면 잠금 막기를 푼다. 화면 상태는 건드리지 않는다 */
export function dropListening(l: Listener): void {
  l.run++
  l.live?.mic?.stop()
  l.live?.session.cancel()
  l.live?.release()
  l.live = null
}

/** 새 판정 줄을 연다. 판정이 실패하면 듣기를 버리고 이유와 함께 결과 화면으로 간다 (그때까지 들린 종은 남긴다) */
function openSession(l: Listener, rate: number, isLive: boolean): ListenSession {
  const id = l.run
  return makeSession({
    classify: l.classify, rate, live: isLive,
    onUpdate: (heard, judged) => { if (l.run === id) l.show(isLive ? { heard } : { heard, seconds: judged }) },
    onError: (error) => { if (l.run === id) { dropListening(l); l.show({ phase: 'done', error, level: 0 }) } },
  })
}

/** 마이크로 듣기 시작. 모델이 없으면 받고, 권한을 물은 뒤 듣는다. 실패하면 이유를 보여 주고 시작 전으로 */
export async function startMic(l: Listener): Promise<void> {
  dropListening(l)
  const id = l.run
  l.show({ phase: 'starting' }, true)
  try {
    if (!(await l.ensureModel()) || l.run !== id) { if (l.run === id) l.show({ phase: 'idle' }); return }
    let chunks = 0
    const mic = await openMic(
      (samples) => {
        if (l.run !== id || !l.live) return
        l.live.session.push(samples)
        if (chunks++ % SHOW_EVERY === 0) l.show({ seconds: l.live.session.seconds(), level: meterLevel(loudness(samples)) })
      },
      () => { if (l.run === id) void stopListening(l, '마이크가 끊겼습니다.') },
    )
    // 권한을 묻는 사이에 화면을 떠났으면 방금 연 마이크를 바로 놓는다
    if (l.run !== id) { mic.stop(); return }
    l.live = { session: openSession(l, mic.rate, true), mic, release: () => undefined }
    l.show({ phase: 'listening' })
    const release = await keepAwake()
    if (l.run === id && l.live) l.live.release = release
    else release()
  } catch (e) {
    if (l.run !== id) return
    dropListening(l)
    l.show({ phase: 'idle', error: e instanceof Error ? e.message : '듣기를 시작하지 못했습니다.' })
  }
}

/**
 * 듣기를 끝내고 결과 화면으로. 마이크는 놓고 남은 소리까지 판정한다. 파일은 남은 부분을 판정하지 않고 거기서 멈춘다.
 * `error`가 있으면 같이 보여 준다 (마이크가 끊겼을 때). 돌고 있는 듣기가 없으면 아무 일도 하지 않는다.
 */
export async function stopListening(l: Listener, error = ''): Promise<void> {
  const now = l.live
  if (!now) return
  if (!now.mic) {
    dropListening(l)
    l.show({ phase: 'done', error, notice: '도중에 그만두었습니다 — 여기까지 들린 종입니다.' })
    return
  }
  const id = l.run
  now.mic.stop()
  now.release()
  l.show({ level: 0, seconds: now.session.seconds() })
  await now.session.finish()
  if (l.run !== id) return
  l.live = null
  const skipped = now.session.dropped()
  l.show({ phase: 'done', error, notice: skipped ? `기기가 판정을 따라가지 못해 ${skipped}번(약 ${Math.round(skipped * 1.5)}초)을 건너뛰었습니다.` : '' })
}

/** 소리 파일을 판정한다. 읽지 못하면 이유를 보여 주고 시작 전으로. 도중에 그만두기·화면 떠나기로 멈출 수 있다 */
export async function readSoundFile(l: Listener, file: File): Promise<void> {
  dropListening(l)
  const id = l.run
  l.show({ phase: 'starting', fileName: file.name }, true)
  try {
    if (!(await l.ensureModel()) || l.run !== id) { if (l.run === id) l.show({ phase: 'idle' }); return }
    const sound = await decodeSoundFile(file)
    if (l.run !== id) return
    const session = openSession(l, MODEL_RATE, false)
    l.live = { session, mic: null, release: () => undefined }
    const total = sound.samples.length / MODEL_RATE
    l.show({ phase: 'reading', total, notice: sound.cut ? `긴 소리라 앞의 ${Math.round(total / 60)}분만 판정합니다 (전체 ${Math.round(sound.seconds / 60)}분).` : '' })
    const step = FILE_STEP_SECONDS * MODEL_RATE
    for (let at = 0; at < sound.samples.length && l.run === id; at += step) {
      session.push(sound.samples.subarray(at, at + step))
      // 넣은 만큼 판정이 끝난 뒤 다음을 넣는다 — 한꺼번에 넣으면 창 수백 개(하나에 0.5MB)가 줄을 선다
      await session.idle()
    }
    if (l.run !== id) return
    await session.finish()
    if (l.run !== id) return
    l.live = null
    l.show({ phase: 'done', seconds: total })
  } catch (e) {
    if (l.run !== id) return
    dropListening(l)
    l.show({ phase: 'idle', error: e instanceof Error ? e.message : '소리 파일을 판정하지 못했습니다.' })
  }
}
