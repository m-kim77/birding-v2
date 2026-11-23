/**
 * 가짜 Upstash Redis REST (`/multi-exec`만). `api/_lib/llmQuota.ts`가 쓰는 명령만 안다 —
 * 모르는 명령이 오면 그 줄에 오류를 돌려줘 시험이 실패하게 한다. 실제 서버처럼 트랜잭션 안의 명령은 순서대로 한꺼번에 돈다.
 * `mode`를 바꿔 실패를 흉내 낸다: 'down'(500), 'hang'(신호가 끊을 때까지 답하지 않음), 'throw'(닿지 못함), 'cmd-error'(명령 오류).
 */
export function fakeUpstash() {
  const counters = new Map<string, number>()
  const zsets = new Map<string, Map<string, number>>()
  const ttl = new Map<string, number>()
  const calls: Array<{ url: string; auth: string | null; commands: string[][] }> = []
  const state = { mode: 'ok' as 'ok' | 'down' | 'hang' | 'throw' | 'cmd-error' }

  /** 정렬 집합 하나 (없으면 만든다) */
  const zset = (key: string) => {
    let z = zsets.get(key)
    if (!z) { z = new Map(); zsets.set(key, z) }
    return z
  }

  /** 명령 하나를 돌려 결과를 준다 */
  function run([name, key, ...args]: string[]): { result: unknown } | { error: string } {
    switch (name) {
      case 'ZREMRANGEBYSCORE': {
        const max = Number(args[1])
        let removed = 0
        for (const [member, score] of zset(key)) if (score <= max) { zset(key).delete(member); removed++ }
        return { result: removed }
      }
      case 'ZADD': zset(key).set(args[1], Number(args[0])); return { result: 1 }
      case 'ZCARD': return { result: zset(key).size }
      case 'ZREM': return { result: zset(key).delete(args[0]) ? 1 : 0 }
      case 'INCRBY': counters.set(key, (counters.get(key) ?? 0) + Number(args[0])); return { result: counters.get(key) }
      case 'DECRBY': counters.set(key, (counters.get(key) ?? 0) - Number(args[0])); return { result: counters.get(key) }
      case 'EXPIRE': ttl.set(key, Number(args[0]) * 1000); return { result: 1 }
      case 'PEXPIRE': ttl.set(key, Number(args[0])); return { result: 1 }
      default: return { error: `ERR unknown command ${name}` }
    }
  }

  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const commands = JSON.parse(String(init?.body)) as string[][]
    calls.push({ url, auth: new Headers(init?.headers).get('authorization'), commands })
    if (state.mode === 'throw') throw new TypeError('fetch failed')
    if (state.mode === 'down') return new Response('{"error":"down"}', { status: 500 })
    if (state.mode === 'hang') {
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)))
    }
    if (state.mode === 'cmd-error') return Response.json(commands.map(() => ({ error: 'ERR' })))
    if (!url.endsWith('/multi-exec')) return new Response('not found', { status: 404 })
    return Response.json(commands.map(run))
  }) as typeof globalThis.fetch

  return { fetch, counters, zsets, ttl, calls, state }
}
