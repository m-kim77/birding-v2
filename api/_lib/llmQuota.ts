/**
 * 기본 제공 AI(`api/llm.ts`)의 **모든 사용자를 합친 상한** — 하루에 쓸 함수 시간과, 동시에 열린 요청 수 (`test/llmQuota.test.ts`).
 *
 * 왜 시간인가: Vercel 요금은 요청 수가 아니라 함수가 열려 있는 시간이다 (Hobby는 2GB 고정, 한 달 360 GB-시간).
 * 넘으면 판정만이 아니라 **모든 배포가 멈추고 저절로 풀리지 않는다**. IP마다의 요청 수 제한(Firewall)은
 * 한 사람이 요청을 하나씩 이어 보내 함수를 늘 열어 두는 것을 막지 못한다 — 그래서 모두를 합친 시간을 센다.
 *
 * 숫자는 Upstash Redis에 REST(`/multi-exec`)로 둔다 — 새 패키지 없이 fetch만 쓴다. **숫자만 둔다**:
 * 하루 키(`llm:sec:날짜`)에 쓴 초, 열린 요청 목록(`llm:active`)에 무작위 id와 시작 시각. IP·사진·글은 두지 않는다.
 * - 환경변수가 없으면 상한도 없다 (데이터베이스를 붙이기 전에 배포해도 지금과 같게).
 * - 있는데 Upstash가 실패하거나 늦으면 **막는다** (503) — 판정 하나보다 사이트 전체가 멈추지 않는 것이 중요하다.
 *
 * 이 파일의 import 경로에는 `.ts`를 적는다 (`_lib/llmRequest.ts` 머리말) — 지금은 import가 없다.
 */

/** Upstash REST 주소와 토큰 */
export interface QuotaStore {
  url: string
  token: string
}

export interface QuotaLimits {
  /** 하루(한국 날짜)에 모든 요청이 열려 있을 수 있는 시간의 합(초) */
  dailySeconds: number
  /** 동시에 열려 있을 수 있는 요청 수 */
  maxConcurrent: number
  /** 이보다 오래된 '열림' 표시(ms)는 죽은 함수가 남긴 것으로 보고 버린다 — 함수의 최대 실행 시간 */
  staleMs: number
}

/** 받아들였으면 끝날 때 부를 `finish`(실제로 쓴 시간으로 고친다), 막았으면 브라우저에 줄 번호와 안내 */
export type Admission =
  | { ok: true; finish: () => Promise<void> }
  | { ok: false; status: 429 | 503; reason: 'day' | 'busy' | 'store'; message: string }

/** 바깥과 닿는 것. 시험에서 가짜로 바꾼다 */
export interface QuotaDeps {
  fetch: typeof fetch
  now: () => number
  newId: () => string
  /** Upstash 한 번에 기다리는 시간(ms) */
  timeoutMs: number
}

/** 하루 5시간 = 2GB × 5시간 = 10 GB-시간. 30일이면 300으로, 장소 이름·드라이브 몫을 남기고 한 달 360 안에 든다 */
export const DEFAULT_DAILY_SECONDS = 18_000
/** 맥의 LLM은 한 번에 한둘만 처리한다 — 셋을 넘는 요청은 어차피 첫 응답을 기다리며 함수 시간만 쓴다 */
export const DEFAULT_MAX_CONCURRENT = 3
/**
 * 받아들일 때 미리 적어 두는 초. 끝날 때 실제 시간으로 고친다 — 함수가 끝을 적지 못하고 죽어도 이만큼은 세어 둔다.
 * 판정 한 턴은 대개 이보다 짧다 (작업 21 실측: 판정 한 건 평균 53초, 여러 턴의 합).
 */
export const RESERVE_SECONDS = 30
/** 하루 키를 남겨 두는 시간(초). 날이 바뀐 뒤 끝난 요청이 어제 키를 고칠 수 있게 하루를 더 둔다 */
const DAY_TTL_SECONDS = 2 * 86_400
const ACTIVE_KEY = 'llm:active'

export const BUSY_MESSAGE = '요청이 많아 잠시 쉬어 갑니다. 몇 분 뒤 다시 물어봐 주세요.'
export const DAY_MESSAGE = '오늘 기본 제공 AI가 쓸 수 있는 시간을 다 썼습니다. 내일 다시 물어봐 주세요.'
export const STORE_MESSAGE = '판정 서버가 잠시 쉬어 갑니다. 조금 뒤 다시 물어봐 주세요.'

const defaultDeps: QuotaDeps = {
  // 부를 때마다 지금의 fetch를 쓴다 — 시험이 바꿔 끼운 fetch도 받게
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  newId: () => crypto.randomUUID(),
  timeoutMs: 2000,
}

/**
 * 환경변수에서 Upstash 주소·토큰을 고른다. `UPSTASH_REDIS_REST_*`가 하나라도 있으면 그 짝을, 아니면 `KV_REST_API_*` 짝을 쓴다
 * (Vercel Marketplace의 Upstash는 KV_ 이름으로 넣는다). 읽기 전용 토큰(`KV_REST_API_READ_ONLY_TOKEN`)은 쓰지 않는다.
 * 넷 다 없으면 null(상한 없음). 반만 있으면 빈 값을 채워 돌려준다 — 잘못 넣은 설정은 상한을 끄지 않고 막는 쪽(503)으로 간다.
 */
export function quotaStoreOf(env: Record<string, string | undefined>): QuotaStore | null {
  const upstash = { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }
  const kv = { url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN }
  const pick = upstash.url || upstash.token ? upstash : kv
  if (!pick.url && !pick.token) return null
  return { url: (pick.url ?? '').trim().replace(/\/+$/, ''), token: (pick.token ?? '').trim() }
}

/** 양수면 그 값, 비었거나 0 이하·숫자가 아니면 기본값 */
function positive(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/**
 * 환경변수(`LLM_DAILY_SECONDS`·`LLM_MAX_CONCURRENT`)에서 상한을 읽는다. 잘못 적은 값은 기본값으로 — 상한이 조용히 풀리지 않게.
 * `staleMs`는 함수의 최대 실행 시간이다 (`api/llm.ts MAX_DURATION_SECONDS`).
 */
export function quotaLimitsOf(env: Record<string, string | undefined>, staleMs: number): QuotaLimits {
  return {
    dailySeconds: positive(env.LLM_DAILY_SECONDS, DEFAULT_DAILY_SECONDS),
    maxConcurrent: Math.floor(positive(env.LLM_MAX_CONCURRENT, DEFAULT_MAX_CONCURRENT)) || DEFAULT_MAX_CONCURRENT,
    staleMs,
  }
}

/** 한국 날짜 'YYYY-MM-DD' — 하루 키의 이름. 한국은 서머타임이 없어 늘 UTC+9다 */
export function koreanDay(ms: number): string {
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10)
}

/**
 * Upstash에 명령 묶음을 트랜잭션(MULTI/EXEC) 하나로 보내고 명령마다의 결과를 준다.
 * 응답이 오류 번호·다른 모양이거나, 명령 하나라도 오류거나, `timeoutMs` 안에 끝나지 않으면 던진다.
 */
async function exec(store: QuotaStore, commands: Array<Array<string | number>>, deps: QuotaDeps): Promise<unknown[]> {
  const res = await deps.fetch(`${store.url}/multi-exec`, {
    method: 'POST',
    headers: { authorization: `Bearer ${store.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands.map((c) => c.map(String))),
    signal: AbortSignal.timeout(deps.timeoutMs),
  })
  if (!res.ok) throw new Error(`Upstash ${res.status}`)
  const body: unknown = await res.json()
  if (!Array.isArray(body) || body.length !== commands.length) throw new Error('Upstash 응답의 모양이 다릅니다')
  return body.map((r: { result?: unknown; error?: unknown } | null) => {
    if (!r || typeof r !== 'object' || 'error' in r) throw new Error('Upstash 명령 실패')
    return r.result
  })
}

/**
 * 요청 하나를 받아들일지 정한다. 받아들이면 열린 요청 목록에 올리고 하루 키에 `RESERVE_SECONDS`를 미리 더한다.
 * 막는 경우: 오늘 쓴 시간이 이미 상한 이상(429 day), 열린 요청이 상한을 넘음(429 busy), Upstash 실패·늦음(503 store).
 * 막으면 올린 것과 미리 더한 것을 되돌린다 (되돌리기가 실패해도 열림 표시는 `staleMs` 뒤에 버려진다).
 * `store`가 null이면 늘 받아들이고 아무것도 세지 않는다. `startedAt`은 요청을 받은 시각 — 끝날 때 이것부터 잰다.
 */
export async function admit(store: QuotaStore | null, limits: QuotaLimits, startedAt: number, deps: QuotaDeps = defaultDeps): Promise<Admission> {
  if (!store) return { ok: true, finish: async () => {} }
  const now = deps.now()
  const id = deps.newId()
  const dayKey = `llm:sec:${koreanDay(now)}`
  let open: number
  let usedBefore: number
  try {
    const r = await exec(store, [
      ['ZREMRANGEBYSCORE', ACTIVE_KEY, '-inf', now - limits.staleMs],
      ['ZADD', ACTIVE_KEY, now, id],
      ['ZCARD', ACTIVE_KEY],
      ['INCRBY', dayKey, RESERVE_SECONDS],
      ['EXPIRE', dayKey, DAY_TTL_SECONDS],
      // 마지막 요청이 끝나고 한참 지나면 목록 자체가 사라지게
      ['PEXPIRE', ACTIVE_KEY, limits.staleMs],
    ], deps)
    open = Number(r[2])
    usedBefore = Number(r[3]) - RESERVE_SECONDS
    if (!Number.isFinite(open) || !Number.isFinite(usedBefore)) throw new Error('Upstash 결과가 숫자가 아닙니다')
  } catch (e) {
    warn('받아들이기', e)
    return { ok: false, status: 503, reason: 'store', message: STORE_MESSAGE }
  }
  if (usedBefore >= limits.dailySeconds || open > limits.maxConcurrent) {
    await exec(store, [['ZREM', ACTIVE_KEY, id], ['DECRBY', dayKey, RESERVE_SECONDS]], deps).catch((e) => warn('되돌리기', e))
    return usedBefore >= limits.dailySeconds
      ? { ok: false, status: 429, reason: 'day', message: DAY_MESSAGE }
      : { ok: false, status: 429, reason: 'busy', message: BUSY_MESSAGE }
  }
  let finished = false
  return {
    ok: true,
    /** 열림 표시를 지우고 미리 더한 초를 실제로 쓴 초(올림)로 고친다. 두 번 불러도 한 번만 센다. 실패해도 던지지 않는다 */
    finish: async () => {
      if (finished) return
      finished = true
      const spent = Math.max(1, Math.ceil((deps.now() - startedAt) / 1000))
      await exec(store, [['ZREM', ACTIVE_KEY, id], ['INCRBY', dayKey, spent - RESERVE_SECONDS]], deps).catch((e) => warn('끝 적기', e))
    },
  }
}

/** Upstash 실패를 함수 로그에 남긴다 — 어느 단계인지와 오류 이름만 (토큰·주소·요청 내용은 찍지 않는다) */
function warn(step: string, e: unknown): void {
  console.warn(`[llm 사용량] ${step} 실패: ${e instanceof Error ? e.message : '알 수 없음'}`)
}
