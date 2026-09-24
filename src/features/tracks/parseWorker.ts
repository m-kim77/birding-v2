/**
 * 타임라인 파일을 읽어 점 배열로 바꾸는 Web Worker. 실제 파일은 53MB라 주 스레드에서 JSON.parse하면 화면이 몇 초 멈춘다.
 * 주 스레드(importTracks.ts)가 File을 보내면 단계를 두 번 알리고(reading·parsing) 결과를 저장용 모양(PackedPoint[])으로 돌려준다.
 * 좌표를 console에 찍지 않는다 — 사용자의 실제 이동 기록이다. 파싱 중 진행률은 줄 수 없다 (JSON.parse는 한 번에 끝난다).
 */
import { pack, type PackedPoint } from '../../lib/tracklog/points'
import { parseTimelineText } from '../../lib/tracklog/parse'

/** 워커 → 주 스레드. `stage`는 진행 알림, `ok`는 끝 (실패 메시지는 한국어) */
export type WorkerOut = { stage: 'reading' | 'parsing' } | { ok: true; points: PackedPoint[] } | { ok: false; message: string }

/** 모양을 맞춰 보낸다 — postMessage의 인자는 any라 잘못된 메시지를 tsc가 못 잡는다 */
function send(msg: WorkerOut): void {
  self.postMessage(msg)
}

self.onmessage = async (e: MessageEvent<File>) => {
  try {
    send({ stage: 'reading' })
    const text = await e.data.text()
    send({ stage: 'parsing' })
    const points = parseTimelineText(text)
    send({ ok: true, points: points.map(pack) })
  } catch (err) {
    send({ ok: false, message: err instanceof Error ? err.message : '타임라인 파일을 읽지 못했습니다.' })
  }
}
