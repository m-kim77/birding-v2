/**
 * 타임라인 파일 하나를 이동 기록 저장소에 넣는 흐름: 워커에서 읽기·파싱(parseWorker.ts) → 주 스레드에서 날짜별로 합쳐 저장(data/tracks.ts).
 * 진행은 세 단계(reading·parsing·saving)로 알린다. 어떤 실패도 한국어 Error로 던진다 — 화면(settings/TracksSection)이 그대로 보여 준다.
 * 파일은 브라우저 안에서만 읽는다: 서버로 보내지 않고, 원본은 남기지 않고, 좌표를 console에 찍지 않는다.
 */
import { mergeTracks, type TracksMeta } from '../../data/tracks'
import { unpack, type PackedPoint, type TrackPoint } from '../../lib/tracklog/points'
import { parseTimelineText } from '../../lib/tracklog/parse'
import type { WorkerOut } from './parseWorker'

export type ImportStage = 'reading' | 'parsing' | 'saving'
/** 진행 알림. `done`·`total`은 saving일 때만 (쓴 날짜 수 / 전체 날짜 수) */
export interface ImportProgress { stage: ImportStage; done?: number; total?: number }
/** 넣기 결과. `total`은 파일에서 나온 점 수, `added`는 그중 실제로 새로 든 수 (같은 파일을 다시 넣으면 0) */
export interface ImportResult { total: number; added: number; meta: TracksMeta }

type ParseStage = Exclude<ImportStage, 'saving'>

/**
 * 워커에서 파일을 읽어 저장용 점 배열로. 워커의 파싱 오류는 그 메시지(한국어)로, 워커 자체를 못 띄운 것은 따로 한국어 Error로.
 * 끝나면(성공·실패 모두) 워커를 내린다.
 */
function parseInWorker(file: File, onStage: (stage: ParseStage) => void): Promise<PackedPoint[]> {
  const worker = new Worker(new URL('./parseWorker.ts', import.meta.url), { type: 'module' })
  return new Promise<PackedPoint[]>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const msg = e.data
      if ('stage' in msg) { onStage(msg.stage); return }
      if (msg.ok) resolve(msg.points)
      else reject(new Error(msg.message))
    }
    // 워커 파일을 못 불러왔거나(배포·브라우저 문제) 워커 안에서 잡지 못한 예외 — 어느 쪽이든 파일 탓이 아니다
    worker.onerror = () => reject(new Error('타임라인 파일을 읽는 작업을 시작하지 못했습니다. 페이지를 새로 고친 뒤 다시 해 보세요.'))
    worker.postMessage(file)
  }).finally(() => worker.terminate())
}

/** 워커가 없는 환경(옛 브라우저)에서는 주 스레드에서 읽는다 — 큰 파일이면 화면이 잠시 멈추지만 기능은 된다 */
async function parseInline(file: File, onStage: (stage: ParseStage) => void): Promise<TrackPoint[]> {
  onStage('reading')
  const text = await file.text()
  onStage('parsing')
  return parseTimelineText(text)
}

/**
 * 한국어 메시지가 아닌 오류(IndexedDB의 DOMException — QuotaExceededError 등)를 사용자에게 보여 줄 문장으로 바꾼다.
 * 우리가 던진 오류(openDb·파서)는 이미 한국어라 그대로 둔다.
 */
function toKoreanError(e: unknown, fallback: string): Error {
  return e instanceof Error && /[가-힣]/.test(e.message) ? e : new Error(fallback)
}

/**
 * 타임라인 파일을 넣는다. 읽기·파싱은 워커에서(없으면 주 스레드에서), 저장은 날짜별로 합쳐서.
 * 실패하면 한국어 Error: 파일 형식이 아니거나(아이폰 모양 포함), 좌표가 없거나, 저장소에 못 쓰거나.
 * 저장은 한 번에 된다 — 도중에 끊기거나 실패하면 아무것도 남지 않는다 (mergeTracks). 다시 넣으면 있던 점과 중복 없이 합쳐진다.
 */
export async function importTimelineFile(file: File, onProgress: (p: ImportProgress) => void): Promise<ImportResult> {
  const onStage = (stage: ParseStage) => onProgress({ stage })
  let points: TrackPoint[]
  try {
    points = typeof Worker === 'undefined' ? await parseInline(file, onStage) : (await parseInWorker(file, onStage)).map(unpack)
  } catch (e) {
    throw toKoreanError(e, '타임라인 파일을 읽지 못했습니다.')
  }
  try {
    const { added, meta } = await mergeTracks(points, (done, total) => onProgress({ stage: 'saving', done, total }))
    return { total: points.length, added, meta }
  } catch (e) {
    throw toKoreanError(e, '이동 기록을 저장하지 못했습니다 (저장 공간이 부족할 수 있습니다).')
  }
}
