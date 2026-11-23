/**
 * 이 기기가 어느 구글 계정과 동기화해 왔는지 기억하고(계정 표지 = 드라이브 permissionId, `meta`), 다른 계정으로 로그인했으면
 * 기록을 주고받기 **전에** 동기화를 멈춘다. 멈춘 동안은 설정의 드라이브 카드가 합칠지 묻는다 (settings/DriveSection).
 * 묻지 않고 돌면 이 기기의 기록·사진(좌표 포함)이 그 계정의 드라이브에 사본으로 남고, 그 계정의 기록은 이 기기 일지에 섞인다.
 * 견주는 규칙은 syncPlan.ts accountDecision. 표지는 '연결 끊기'로도 지우지 않는다 — 끊은 뒤 다른 계정으로 로그인하는 것도 같은 일이다.
 * 표지는 이 기기에만 둔다 (백업·드라이브에 넣지 않는다). 이름·이메일은 묻지도 적지도 않는다.
 */
import { accessToken } from '../lib/google/driveAuth'
import { accountId } from '../lib/google/driveApi'
import { dbDelete, dbGet, dbPut, dbWriteAll } from './db'
import { accountDecision, askedAccountOf, type AskedAccount } from './syncPlan'
import { setTracksStatus } from './syncStatus'
import { forgetTracksOnDrive, isTracksSyncOn, setTracksSyncOn } from './syncTracks'

/** `meta`: 이 기기가 동기화해 온 구글 계정의 표지 */
const ACCOUNT_KEY = 'driveAccount'
/**
 * `meta`: 다른 계정으로 로그인해 묻는 중일 때 그 새 계정의 표지와, 묻는 단계가 이동 기록 올리기를 껐는지 (syncPlan.ts AskedAccount).
 * 있으면 동기화는 돌지 않는다. 처음 나온 판은 표지 글자만 적었다 — 읽을 때는 askedAccountOf가 둘 다 받는다.
 */
const ASK_KEY = 'driveAccountAsk'

/** 계정을 확인한 출입증 — 같은 출입증이면 드라이브에 다시 묻지 않는다 (출입증은 1시간마다·로그인할 때 바뀐다) */
let checkedToken = ''

/** 다른 계정이라 묻는 중인지. 저장소를 못 읽으면 던진다 (동기화는 오류로 멈춘다 — 확인하지 못한 채 주고받지 않는다) */
export async function isAccountAsked(): Promise<boolean> {
  return Boolean(await dbGet<unknown>('meta', ASK_KEY))
}

/**
 * 지금 출입증의 구글 계정이 이 기기가 동기화해 온 계정인지 본다 (드라이브 about.get — 출입증마다 한 번).
 * 처음이면(또는 이 확인이 생기기 전부터 연결해 둔 기기면) 그 계정을 적고 true, 같으면 true.
 * 다르면 이동 기록 올리기를 끄고 새 계정을 '묻는 중'으로 적은 뒤 false — 사용자가 정할 때까지 동기화는 돌지 않는다.
 * 연결이 풀렸으면 NotConnectedError, 드라이브·저장소 실패는 던진다 (확인한 것으로 치지 않는다 — 다음 동기화가 다시 본다).
 */
export async function checkAccount(): Promise<boolean> {
  const token = await accessToken()
  if (token === checkedToken) return true
  const [current, saved] = await Promise.all([accountId(), dbGet<unknown>('meta', ACCOUNT_KEY)])
  const decision = accountDecision(saved, current)
  if (decision === 'ask') {
    // 켜져 있었는지 먼저 읽어 둔다 — '합치지 않고 연결 끊기'의 결과 줄이 꺼졌다고 알린다 (전 계정으로 돌아와도 꺼진 채다)
    const asked: AskedAccount = { id: current, tracksWasOn: await isTracksSyncOn() }
    // 스위치를 먼저 끈다 — 묻는 표시를 적다 실패해도 이동 경로가 새 계정으로 가지 않게 (다음 동기화가 다시 묻는다)
    await setTracksSyncOn(false)
    await dbPut('meta', asked, ASK_KEY)
    return false
  }
  if (decision === 'adopt') await dbPut('meta', current, ACCOUNT_KEY)
  checkedToken = token
  return true
}

/**
 * '이 계정에 합치기': 묻던 새 계정을 이 기기의 계정으로 적고 묻기를 거둔다. 같은 트랜잭션에서 이동 기록의 드라이브 쪽 기억
 * ('드라이브에 있음' 등 — 전 계정의 드라이브를 본 것)도 거둔다 (syncTracks.ts forgetTracksOnDrive).
 * 묻던 것이 없으면(다른 탭에서 이미 정했다) 아무것도 바꾸지 않는다. 다음 동기화가 출입증의 계정을 다시 확인한다. 저장소 오류는 던진다 (아무것도 바뀌지 않는다).
 */
export async function adoptAskedAccount(): Promise<void> {
  let adopted = false
  await dbWriteAll(['meta'], (store) => {
    const meta = store('meta')
    const req = meta.get(ASK_KEY)
    // 같은 트랜잭션 안에서 읽은 뒤 쓴다 (요청 콜백 안의 요청은 트랜잭션을 이어 간다)
    req.onsuccess = () => {
      const asked = askedAccountOf(req.result)
      if (!asked) return
      meta.put(asked.id, ACCOUNT_KEY)
      meta.delete(ASK_KEY)
      forgetTracksOnDrive(meta)
      adopted = true
    }
  })
  // 커밋된 뒤에만 화면을 맞춘다 — 이동 기록 카드가 전 계정 기준의 '드라이브의 이동 기록 지우기'를 보이지 않게
  if (adopted) setTracksStatus({ on: false, onDrive: false, note: null })
  checkedToken = ''
}

/**
 * 묻는 단계가 이동 기록 올리기를 껐는지 (그때 켜져 있었다). 묻는 중이 아니거나, 옛 모양의 값이거나, 저장소를 못 읽으면 false —
 * 결과 줄에 덧말만 빠진다.
 */
export async function askedTracksWasOn(): Promise<boolean> {
  return askedAccountOf(await dbGet<unknown>('meta', ASK_KEY).catch(() => null))?.tracksWasOn === true
}

/** 묻기를 거둔다 (새로 로그인했거나 합치지 않기로 했다). 이 기기의 계정 표지는 그대로 둔다. 저장소 오류는 던진다 */
export async function forgetAskedAccount(): Promise<void> {
  await dbDelete('meta', ASK_KEY)
  checkedToken = ''
}
