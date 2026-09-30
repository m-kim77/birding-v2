// 워크릿 파일의 주소. 작은 파일이라 그냥 두면 Vite가 코드 안에 data: 주소로 넣는다 — 워크릿을 그런 주소에서 읽지 못하는 브라우저가 있어 파일로 내보내게 한다 (no-inline)
import workletUrl from './pcmWorklet.js?url&no-inline'
import { MODEL_RATE } from './windows'

/**
 * 마이크 열기. 소리는 조각(Float32Array)으로 `onChunk`에 넘어가고 **어디에도 저장하거나 보내지 않는다** —
 * 녹음 파일을 만들지 않고, 스피커로도 내지 않는다. 듣기를 멈추면 마이크를 놓는다 (브라우저의 마이크 표시가 꺼진다).
 */

export interface Mic {
  /** 조각의 표본율. 48kHz로 열지 못한 브라우저에서는 기기의 표본율이다 — 받는 쪽이 창마다 바꾼다 (windows.ts toModelRate) */
  rate: number
  /** 마이크를 놓고 오디오 장치를 닫는다. 두 번 불러도 된다 */
  stop(): void
}

/** 마이크 권한·장치 오류를 사용자에게 보여 줄 한국어로 */
function micError(e: unknown): Error {
  const name = e instanceof DOMException ? e.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return new Error('마이크를 쓸 수 없습니다. 브라우저의 사이트 설정에서 마이크를 허용해 주세요.')
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new Error('마이크를 찾지 못했습니다.')
  if (name === 'NotReadableError') return new Error('마이크를 다른 앱이 쓰고 있습니다. 그 앱을 닫고 다시 해 주세요.')
  return new Error('마이크를 열지 못했습니다.')
}

/**
 * 마이크를 48kHz로 잇는다. 파이어폭스는 마이크와 표본율이 다른 오디오 장치에 잇지 못하고 던진다 —
 * 그때는 기기의 표본율로 다시 연다 (작업 31 확인).
 */
function connect(stream: MediaStream): { ctx: AudioContext; source: MediaStreamAudioSourceNode } {
  let ctx = new AudioContext({ sampleRate: MODEL_RATE })
  try {
    return { ctx, source: ctx.createMediaStreamSource(stream) }
  } catch {
    void ctx.close()
    ctx = new AudioContext()
    return { ctx, source: ctx.createMediaStreamSource(stream) }
  }
}

/**
 * 마이크를 열고 소리 조각을 흘려보내기 시작한다. `onEnded`는 마이크가 저절로 끊겼을 때 (장치를 뽑음·권한을 거둠).
 * 마이크가 없거나 권한이 없거나 이 브라우저가 못 하면 한국어 Error — 그때 잡고 있던 것은 모두 놓는다.
 * 목소리용 손질(울림 없애기·소음 줄이기·크기 맞추기)은 끈다 — 사람 목소리가 아닌 소리를 지우는 장치라 새소리가 깎인다.
 */
export async function openMic(onChunk: (samples: Float32Array) => void, onEnded: () => void): Promise<Mic> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
    throw new Error('이 브라우저에서는 마이크로 들을 수 없습니다. 소리 파일을 골라 주세요.')
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
  } catch (e) {
    throw micError(e)
  }
  let ctx: AudioContext | null = null
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    for (const track of stream.getTracks()) track.stop()
    void ctx?.close().catch(() => undefined)
  }
  try {
    const wired = connect(stream)
    ctx = wired.ctx
    await ctx.audioWorklet.addModule(workletUrl)
    const node = new AudioWorkletNode(ctx, 'pcm-collector')
    node.port.onmessage = (e: MessageEvent<Float32Array>) => { if (!stopped) onChunk(e.data) }
    // 출력까지 이어야 브라우저가 이 마디를 돌린다. 소리 크기 0을 거쳐 스피커로는 아무것도 나가지 않는다
    const mute = ctx.createGain()
    mute.gain.value = 0
    wired.source.connect(node).connect(mute).connect(ctx.destination)
    // 누른 뒤 권한을 묻는 사이에 멈춘 채로 만들어졌을 수 있다 (아이폰)
    if (ctx.state === 'suspended') await ctx.resume()
    stream.getAudioTracks()[0]?.addEventListener('ended', () => { if (!stopped) { stop(); onEnded() } })
    return { rate: ctx.sampleRate, stop }
  } catch {
    stop()
    throw new Error('마이크를 열지 못했습니다.')
  }
}
