/**
 * 좌표 → 장소 이름. `/api/place`(Vercel 함수)를 거친다 — 이유는 그 파일 머리말 참고.
 * **실패해도 던지지 않고 빈 문자열을 준다.** 장소 이름이 없어도 기록은 저장돼야 한다.
 * 좌표를 소수 4자리(≈11m)로 뭉개서 부른다 — 같은 자리의 요청이 같은 주소가 되어 캐시에 걸린다.
 *
 * Nominatim 이용 정책(OSMF): 모든 사용자를 합쳐 초당 1회가 절대 상한이고, 어기면 막힌다 — 막히면 장소 이름이 조용히 빈칸이 된다.
 * 그래서 이 브라우저는 이번 실행 동안 찾은 좌표를 다시 묻지 않고, 서버에 묻는 요청을 한 줄로 세워 1초 간격으로 보낸다.
 * 모든 사용자의 합계는 브라우저 하나에서 지킬 수 없다 (WORK_ORDERS 작업 10).
 *
 * **규칙: 여러 기록을 한꺼번에 처리하는 기능(가져오기 등)은 기록마다 장소 이름을 찾지 않는다** — 원본에 있는 장소 이름을
 * 그대로 쓴다 (v1 가져오기는 v1에 저장된 이름). 1초 줄은 사람이 위치를 고를 때를 위한 것이고, 수백 건을 줄 세우면
 * 정책이 말하는 대량 조회다.
 */

/** 이 브라우저가 `/api/place`에 요청을 보내는 최소 간격 — 이용 정책의 "초당 1회" */
const GAP_MS = 1000

/** 장소 이름 찾기가 바깥과 닿는 곳. 테스트는 가짜 fetch·시계로 바꿔 끼운다 */
export interface PlaceDeps {
  fetch: (url: string) => Promise<Response>
  /** 밀리초. 브라우저에서는 performance.now — 기기 시계를 고쳐도 간격이 흔들리지 않는다 */
  now: () => number
  sleep: (ms: number) => Promise<void>
}

const BROWSER: PlaceDeps = {
  // 화살표로 감싼다: fetch를 객체의 메서드로 부르면 this가 window가 아니어서 브라우저가 "Illegal invocation"을 던진다
  fetch: (url) => fetch(url),
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/**
 * 장소 이름 찾기 함수를 만든다. 만든 함수마다 자기 기억과 줄을 가진다 — 앱은 아래 `lookupPlace` 하나만 쓰고, 테스트는 새로 만든다.
 * - 찾은 이름은 이번 실행 동안 기억해 다시 묻지 않는다 (줄도 서지 않고 바로 준다).
 *   **빈 이름은 기억하지 않는다** — 서버·네트워크 실패와 "이름 없는 곳"을 구별할 수 없어, 기억하면 한 번의 실패가 새로고침 전까지 간다.
 *   이름 없는 곳을 다시 물으면 서버의 하루 캐시(`api/place.ts`)가 받는다.
 * - 같은 좌표를 묻는 중에 또 물으면 새로 보내지 않고 가는 중인 요청을 같이 기다린다.
 * - 보내는 요청은 앞 요청을 **보낸** 지 1초가 지난 뒤에 보낸다. 앞 요청의 응답은 기다리지 않는다 — 느린 응답 하나가 줄을 막지 않게.
 */
export function createPlaceLookup(deps: PlaceDeps = BROWSER): (lat: number, lng: number) => Promise<string> {
  /** 찾은 이름. 키는 소수 4자리로 뭉갠 "위도,경도". 크기 제한은 없다 — 사람이 한 번 실행에 고르는 자리는 많지 않다 */
  const found = new Map<string, string>()
  /** 줄에 섰거나 가는 중인 요청 */
  const asking = new Map<string, Promise<string>>()
  /** 줄의 끝. 마지막으로 선 요청이 보낼 차례가 되면 풀린다 */
  let line: Promise<void> = Promise.resolve()
  let lastSentAt = -Infinity

  /** 줄 끝에 서서 차례를 기다린다. 앞 요청을 보낸 지 GAP_MS가 안 됐으면 남은 만큼 잔다 */
  function waitTurn(): Promise<void> {
    line = line.then(async () => {
      const wait = lastSentAt + GAP_MS - deps.now()
      if (wait > 0) await deps.sleep(wait)
      lastSentAt = deps.now()
    })
    return line
  }

  /** 차례가 오면 서버에 묻는다. 어떤 실패도 빈 이름으로 (던지지 않는다) */
  async function request(lat4: string, lng4: string): Promise<string> {
    try {
      await waitTurn()
      const res = await deps.fetch(`/api/place?lat=${lat4}&lng=${lng4}`)
      if (!res.ok) return ''
      return String(((await res.json()) as { place?: string }).place ?? '')
    } catch {
      return ''
    }
  }

  return (lat, lng) => {
    const lat4 = lat.toFixed(4)
    const lng4 = lng.toFixed(4)
    const key = `${lat4},${lng4}`
    const known = found.get(key)
    if (known) return Promise.resolve(known)
    const going = asking.get(key)
    if (going) return going
    const answer = request(lat4, lng4).then((name) => {
      asking.delete(key)
      if (name) found.set(key, name)
      return name
    })
    asking.set(key, answer)
    return answer
  }
}

/**
 * 앱이 쓰는 장소 이름 찾기 (`features/record/usePlace.ts`). 페이지에 하나라 기억과 1초 줄을 모든 화면이 함께 쓴다.
 * 실패해도 던지지 않고 빈 문자열.
 */
export const lookupPlace = createPlaceLookup()

/** 브라우저의 현재 위치. 권한을 거절했거나 위치를 못 잡으면 한국어 Error */
export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('이 기기에서는 현재 위치를 쓸 수 없습니다.')); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? '위치 권한이 꺼져 있습니다. 지도를 눌러 직접 골라 주세요.' : '현재 위치를 찾지 못했습니다.')),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  })
}
