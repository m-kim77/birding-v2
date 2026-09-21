import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { Plugin } from 'vite'

/**
 * 개발 서버에서 `api/*.ts`(Vercel 함수)를 같은 주소로 돌린다.
 * 함수들은 웹 표준 `(Request) => Response` 모양이라, 여기서는 Node의 요청/응답을 그 모양으로 바꿔 주기만 한다.
 * 배포에서는 Vercel이 같은 파일을 직접 실행한다 — 개발용 서버를 따로 두지 않으려는 장치다.
 */
export function apiPlugin(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const path = (req.url ?? '').split('?')[0]
        const match = /^\/api\/([a-z]+)$/.exec(path)
        if (!match) return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.ts`)
          const handler = mod[req.method ?? 'GET'] as ((r: Request) => Promise<Response>) | undefined
          if (!handler) { res.statusCode = 405; res.end(); return }
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method, headers: req.headers as Record<string, string>,
            body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
            // Node의 fetch는 스트림 본문에 이 값을 요구한다
            ...(hasBody ? { duplex: 'half' } : {}),
          } as RequestInit)
          const response = await handler(request)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          if (response.body) Readable.fromWeb(response.body as never).pipe(res); else res.end()
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : '개발 서버 오류' } }))
        }
      })
    },
  }
}
