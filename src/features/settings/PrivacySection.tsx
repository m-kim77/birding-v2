/**
 * 이 앱이 기기 밖과 닿는 곳 전부. 사진·위치가 언제 어디로 가는지 알아야 기본 제공 AI·장소 이름 찾기를 믿고 쓸지 사용자가 정할 수 있다.
 * **바깥으로 나가는 요청을 더하거나 보내는 값을 바꾸면 여기를 같이 고친다** (CLAUDE.md) — 안 고치면 이 안내가 거짓이 된다.
 * 2026-09-27에 코드에서 찾은 곳: `/api/place`(lib/place.ts) · `/api/llm` 또는 내 키의 주소(identify/llmClient.ts, 설정의 연결 확인)
 * · 위키백과 API와 참고 사진(identify/tools/wikipedia.ts, VerdictDetails) · 지도 타일(map/LeafletMap.tsx) · 글꼴(index.html)
 * · 새 찾기 모델과 wasm(detect/mediapipeDetector.ts) · 공유 창·내려받기(dex/saveFile.ts, 백업)
 * · 구글 드라이브 동기화(data/sync*.ts, lib/google/ — 로그인은 `/api/drive`를 거치고 기록·사진은 브라우저에서 드라이브로 곧장).
 */
const FLOWS: Array<{ where: string; what: string }> = [
  { where: '이 기기에만', what: '기록·사진·쓰던 기록·이동 기록·내 API 키. 이 사이트의 서버에 올리지 않습니다. 기기를 바꿀 때는 백업 파일이나 구글 드라이브 동기화로 옮깁니다.' },
  { where: '구글 드라이브 — 동기화를 켰을 때만', what: "'구글로 로그인'을 누른 뒤로 기록(좌표 포함)과 사진의 사본이 내 구글 드라이브의 '탐조일지 동기화' 폴더로 곧장 갑니다. 이 사이트의 서버는 로그인 열쇠만 다루고 기록·사진은 거치지 않습니다. 열쇠는 잠가서 이 브라우저의 쿠키에만 둡니다. 이동 기록·API 키는 올리지 않습니다." },
  { where: '장소 이름 찾기 — OpenStreetMap', what: '위치가 정해지면(사진의 위치 정보 · 지도에서 고름 · 현재 위치 · 이동 기록) 자동으로 좌표(약 11m 단위)가 이 사이트의 서버를 거쳐 갑니다. 돌아온 장소 이름을 기록에 적습니다.' },
  { where: 'AI 판정 — 기본 제공 AI 또는 내 API 키의 서비스', what: "'AI에게 물어보기'를 누를 때만 갑니다: 1024px로 새로 만든 사진(위치가 담긴 사진 정보는 빠집니다)과 촬영 시각·장소 이름. 좌표는 보내지 않습니다. 기본 제공 AI는 이 사이트의 서버를 거쳐 운영자의 컴퓨터로, 내 API 키를 쓰면 그 서비스로 곧장 갑니다." },
  { where: '위키백과', what: 'AI가 판정 근거를 찾을 때 새 이름·학명 같은 검색어가 갑니다. 근거의 참고 사진도 위키백과에서 받습니다.' },
  { where: '지도 그림 — OpenStreetMap', what: '지도를 볼 때 보이는 구역의 지도 그림을 받습니다. 어느 구역을 보는지 그쪽이 압니다.' },
  { where: '받기만 하는 것', what: '글꼴(Google Fonts · jsDelivr)과 새 찾기 모델(Google)을 내려받습니다. 새 찾기는 이 기기 안에서 하므로 사진은 보내지 않습니다.' },
  { where: '이동 기록', what: '파일은 이 기기 밖으로 나가지 않고 백업에도 들지 않습니다. 다만 사진의 위치를 찾으면 그 한 점은 기록의 위치가 되어 장소 이름 찾기로 갑니다.' },
  { where: '백업 파일 · 카드 이미지와 영상', what: "내가 고른 곳으로만 갑니다. 백업에는 기록(좌표 포함)과 사진이 들고, 이동 기록·API 키는 들지 않습니다. 카드에는 날짜와 장소 이름이 적힙니다 — '카드·지도에서 위치 숨기기'를 켠 기록은 '위치 비공개'로." },
]

/** 접어 둔 "무엇이 어디로 가나요". 출처(LicenseSection)와 같은 펼침이다 — 누를 것이 없는 읽을거리라 다른 화면으로 보내지 않는다 */
export default function PrivacySection() {
  return (
    <details className="flows">
      <summary>무엇이 어디로 가나요</summary>
      <p className="hint">기록과 사진은 이 기기에만 저장됩니다. 이 앱이 기기 밖으로 보내는 것은 아래가 전부입니다.</p>
      <ul>{FLOWS.map((f) => <li key={f.where}><strong>{f.where}</strong><span>{f.what}</span></li>)}</ul>
    </details>
  )
}
