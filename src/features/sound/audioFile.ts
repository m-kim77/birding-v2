import { MODEL_RATE } from './windows'

/**
 * 소리 파일 읽기. 파일은 이 브라우저 안에서만 풀어 판정기로 넘긴다 — 올리지 않고 저장하지 않는다.
 * 녹음기나 폰의 음성 메모로 미리 녹음해 둔 소리를 쓰는 길이다.
 */

/** 이보다 큰 파일은 열지 않는다. 풀면 몇 배로 커져 폰의 메모리가 모자란다 */
const MAX_FILE_MB = 200
/** 이보다 긴 소리는 앞부분만 판정한다 (10분). 48kHz 실수로 10분이면 115MB다 */
export const MAX_FILE_SECONDS = 600

export interface DecodedSound {
  /** 48kHz 한 채널 */
  samples: Float32Array
  /** 파일 전체의 길이(초) — 잘랐어도 원래 길이다 */
  seconds: number
  /** 너무 길어서 앞의 MAX_FILE_SECONDS만 남겼는지 */
  cut: boolean
}

/** 여러 채널을 하나로 섞는다 (평균). 한 채널이면 그대로 */
function mixDown(buffer: AudioBuffer, length: number): Float32Array {
  const out = new Float32Array(length)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) out[i] += channel[i] / buffer.numberOfChannels
  }
  return out
}

/**
 * 소리 파일을 48kHz 한 채널로 푼다. 브라우저가 못 읽는 형식이거나 너무 크면 한국어 Error.
 * 읽을 수 있는 형식은 브라우저마다 다르다 (WAV·MP3·M4A는 대부분 된다). 표본율은 브라우저가 풀면서 48kHz로 바꿔 준다.
 */
export async function decodeSoundFile(file: File): Promise<DecodedSound> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`소리 파일이 너무 큽니다 (${MAX_FILE_MB}MB까지).`)
  // 사파리의 옛 판은 접두사가 붙은 이름만 있다
  const Offline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  if (!Offline) throw new Error('이 브라우저에서는 소리 파일을 읽을 수 없습니다.')
  let buffer: AudioBuffer
  try {
    buffer = await new Offline(1, 1, MODEL_RATE).decodeAudioData(await file.arrayBuffer())
  } catch {
    throw new Error('이 소리 파일은 열 수 없습니다. WAV·MP3·M4A 같은 소리 파일인지 확인해 주세요.')
  }
  const keep = Math.min(buffer.length, MAX_FILE_SECONDS * MODEL_RATE)
  return { samples: mixDown(buffer, keep), seconds: buffer.duration, cut: keep < buffer.length }
}
