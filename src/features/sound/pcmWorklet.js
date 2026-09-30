/**
 * 마이크 소리를 모아 화면 쪽으로 보내는 오디오 워크릿 (micSource.ts가 띄운다).
 * 브라우저는 소리를 128개씩 준다 — 그대로 보내면 메시지가 너무 잦아 4096개(48kHz에서 약 0.085초)씩 묶는다.
 * 소리는 이 기기 안에서 판정기로만 간다. 이 파일은 번들에 묶이지 않고 따로 받아져 오디오 스레드에서 돈다 — 그래서 import를 쓰지 않는다.
 */
class PcmCollector extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(4096)
    this.at = 0
  }

  /** 첫 채널만 모은다. 입력이 없으면(마이크가 아직 안 이어졌으면) 아무것도 보내지 않는다 */
  process(inputs) {
    const channel = inputs[0]?.[0]
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        this.buffer[this.at++] = channel[i]
        if (this.at === this.buffer.length) {
          this.port.postMessage(this.buffer.slice(0))
          this.at = 0
        }
      }
    }
    return true
  }
}

registerProcessor('pcm-collector', PcmCollector)
