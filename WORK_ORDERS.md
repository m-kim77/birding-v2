# 작업 지시 1~4 (+ 저장 방식 결정 5)

2026-09-22, 사용자 관점 점검(읽기 전용 에이전트 15개가 7개 렌즈로 코드를 읽고, 다른 에이전트가 같은 줄을 열어 반박을 시도 — 확정 68 · 부분 32 · 반박 4)과 저장 방식·법·타임라인 조사(공식 문서 기준, 숫자마다 재확인)에서 나온 결과를 사용자가 정한 대로 작업 넷으로 나눴다.
**한 번에 하나만 한다.** 순서는 1 → 2 → 3 → 4를 권한다 — 1·3·4가 모두 `RecordFlow.tsx`를 건드린다.
[`FEATURES.md`](FEATURES.md)의 "다음에 할 순서"보다 **이 문서가 앞선다** (사용자가 이 세션에서 직접 고른 순서다). 여기 없는 기능은 FEATURES.md를 따른다.

사용자가 내린 결정:
- **카드 등급을 뺀다.** 새에 등급을 매기지 않는다. 카드의 색과 효과(차분함/빛남)는 남기고, **카드마다 색을 바꿀 수 있게** 한다.
- 사진은 **한 장씩** 기록한다. 여러 장 일괄 가져오기는 하지 않는다.
- 뒤로가기를 눌러도 **쓰던 기록이 남아야** 한다. AI 판정은 **다시 물어볼 수 있어야** 한다.
- 구글 타임라인으로 위치 찾기를 넣는다. **타임라인 파일은 저장소에 복사하지 않는다** — 사용자가 설정에서 넣는다.
- 저장 방식(구글 드라이브 vs 로그인+서버)은 **미정** → 5번.

모든 작업 공통: 끝내기 전에 `npm run check`. 함수마다 한국어 JSDoc(실패·경계 동작). 파일 상한(tsx 300 / ts 400 / 함수 80줄, 빈 줄·주석 제외) — 닿을 듯하면 **더하기 전에** 쪼갠다. 새 버튼은 `ref_design/design_v01/BUTTONS.md`에 존재 이유 한 줄. 백업에 들어가는 모양(`types.ts`)은 가산 확장만. 끝나면 이 문서의 해당 작업에 "완료(날짜)"를 적고 `README.md`의 표를 맞춘다.

---

## 작업 1 — 기록이 사라지는 길과 사실과 다른 문구 고치기

**완료 (2026-09-22).** 계획과 다르게 한 것: (1) 폰에서는 `saveFile` 결과만으로 "백업됨"을 적지 않는다 — 아이폰 공유 창은 닫아도 성공으로 답하는 보고가 있고, 홈 화면 앱의 내려받기는 조용히 죽는 보고가 있다. 그래서 폰에서는 '백업했습니다' 확인 버튼을 누른 뒤에만 적는다 (PC는 바로). (6) `persist()`는 첫 화면이 아니라 **첫 기록 저장 직후**에 한 번 요청한다 (파이어폭스는 권한 창을 띄운다). 첫 화면에서는 `persisted()`로 묻기만 한다. 거절 시 백업 알림 1건 기준은 **폰에서만**. 아이폰 안내는 **홈 화면 앱이 사파리와 저장소가 분리**된 사실(WebKit 181849)을 말한다 — 기록이 있으면 "먼저 백업하고 그 앱에서 불러오기", 없으면 "기록 만들기 전에 추가". 빈 화면에도 뜬다. (8) '사진 바꾸기'는 열기에 **성공한 뒤에만** 영역·판정을 비우고, 실패 안내를 본 화면에도 그린다. 사진을 바꿔도 지도에서 직접 고른 위치는 남는다 (`usePlace`). (9) 저장을 막는 것은 닿지 못함·키 틀림뿐 — 그 밖의 실패는 경고와 함께 저장. '저장된 키 지우기' 버튼을 더했다. (13) '판정 대기' 꼬리표는 **없앴다** — 이름 자리에 이미 "이름 미정"이 보인다. 그 밖에: `public/icon.svg`의 선 굵기(26 → 1.8)를 고쳤고(scale(16) 안이라 416px 선이 되어 덩어리였다) PNG는 브라우저 캔버스로 만들었다(`sips`는 투명 모서리를 흰색으로 채운다) + maskable 512 추가. 지도의 첫 `fitBounds`가 컨테이너 크기 0일 때 돌아 무시되던 것을 `invalidateSize` 뒤 다시 맞추게 했고, 시야 서명에 좌표를 넣어 위치 시트의 핀 이동을 따라간다. 내 키 사용자의 연결 실패 문구를 갈랐다. 서버 문구(5)의 "나중에 기록을 열어 다시 물어볼 수 있습니다"는 작업 3에서 기능과 함께 되살린다.

**왜**: 검증을 통과한 발견 중 가장 아픈 축. 전부 작고 서로 독립이며 구조를 바꾸지 않는다.

| # | 할 일 | 닿는 곳 |
|---|---|---|
| 1 | 폰에서 공유창을 그냥 닫아도 "백업됐습니다"가 나온다 (취소와 성공이 같은 void). `saveFile`의 반환을 `'shared' \| 'downloaded' \| 'cancelled'`로 바꾸고, 취소면 `markBackedUp()`을 부르지 않고 "저장을 취소했습니다 — 아직 백업되지 않았습니다"(warn). `'downloaded'`는 실제로 저장됐는지 확인할 수 없다는 점을 주석에 적는다 | `src/features/dex/saveFile.ts:11-13`, `src/features/settings/BackupSection.tsx:26`, `src/features/dex/CardActions.tsx:28-29` |
| 2 | 복원이 중간에 끊기면 같은 파일을 다시 불러와도 사진이 영영 안 들어온다 — 기록을 먼저 다 쓰고 사진을 쓰는데, 재시도 때는 전부 `kept`라 `wanted`가 빈다. 사진 복사 조건을 `wanted` 대신 "그 id·판이 DB에 없으면 넣는다"로 | `src/data/backup.ts:38-42`, `src/data/photos.ts`에 `hasPhoto(id, kind)` |
| 3 | 지도를 확대해 두고 핀을 누를 때마다 시야가 처음 범위로 돌아간다 (`pickedKey`가 markers 의존성에 있어 매번 `fitBounds`). `fitBounds/setView`는 마커 **집합**이 바뀔 때만 (지난 키 목록을 `useRef`에 두고 같으면 건너뜀) | `src/features/map/LeafletMap.tsx:52-60`, `src/features/map/MapScreen.tsx:37` |
| 4 | 없는 기능을 약속하는 문구 셋. "사진이나 녹음 하나면 됩니다" → "사진 한 장이면 됩니다. 기록과 사진은 이 브라우저에만 저장됩니다" / 매니페스트 설명에서 "소리" 빼기 / "받은 뒤에는 인터넷 없이도 됩니다" 빼기 (wasm은 매번 CDN에서 온다 — `modelCache.ts:2` 주석도 같이). 새소리가 들어오는 날 되돌린다 | `src/features/records/RecordsScreen.tsx:58`, `public/manifest.webmanifest:4`, `src/features/record/DetectView.tsx:46`, `src/features/detect/modelCache.ts:2` |
| 5 | 기본 제공 AI가 **설정조차 안 된 상태**(Vercel 환경변수 없음)도 "판정 서버가 쉬는 중"으로 나온다. `api/llm.ts:29`가 보낸 이유("기본 제공 AI가 아직 설정되지 않았습니다")를 버리지 말고 보여 준다 — `setMessage(e.message)` 뒤에 `server-down`. `IdentifyPanel`은 `ask.message`가 있으면 그것을 쓴다 | `src/features/record/useAsk.ts:48`, `src/features/record/IdentifyPanel.tsx:23-29` |
| 6 | 아이폰 Safari는 7일 안 쓰면 저장소를 지운다. `navigator.storage.persist()`는 **홈 화면 설치 여부**를 보고 승인하므로 설치 유도가 곧 저장 보장이다: `index.html`에 `apple-touch-icon`·`apple-mobile-web-app-capable`·`apple-mobile-web-app-title`, 매니페스트에 PNG 아이콘(192·512 — `public/icon.svg`에서 만든다), iOS Safari이고 `display-mode: standalone`이 아닐 때 목록 화면에 "홈 화면에 추가하면 기록이 지워지지 않습니다" 배너(닫으면 다시 안 뜸, localStorage). `persist()`가 false를 돌려주면 `journal`에 올려 5건 기준(`BACKUP_NUDGE_AT`)과 무관하게 백업 배너 | `index.html`, `public/manifest.webmanifest:10`, `public/`, `src/main.tsx:14`, `src/data/journal.tsx:10,52`, `src/features/records/RecordsScreen.tsx:67` |
| 7 | 기기를 바꾼 사람이 보는 빈 화면에 '백업 파일에서 불러오기' 부차(quiet) 버튼. `onBackup` 배선은 이미 있고(`App.tsx:33`) `BackupSection`이 설정의 첫 카드라 그대로 쓴다 | `src/features/records/RecordsScreen.tsx:53-61` |
| 8 | 사진을 잘못 고르면 바꿀 수 없다 — 기록을 통째로 버려야 한다. `DetectView` 위에 '사진 바꾸기' 조용한 버튼 (같은 `fileInput`, onChange가 이미 `setCrop(null)` 한다) | `src/features/record/RecordFlow.tsx:85-107` |
| 9 | 설정에서 라디오를 잘못 누르면 저장한 API 키가 그 자리에서 지워진다 → 기본 제공 AI로 돌아가도 키는 두고 "쓰지 않음"만 표시 (`connection.ts`에 `enabled` 플래그 또는 별도 키). `/models`를 구현하지 않은 OpenAI 호환 서비스(404)는 저장을 막지 않는다 (401·403만 막는다). fetch 실패 문구를 "주소에 닿지 못했습니다 — 주소 오타이거나, 그 서비스가 브라우저에서 직접 부르는 것을 막고 있을 수 있습니다"로 | `src/features/settings/AiSection.tsx:12-39`, `src/features/identify/connection.ts` |
| 10 | 새벽에 찍은 사진의 카드·백업 파일 이름이 하루 전 날짜로 나간다 (`capturedAt.slice(0,10)`은 UTC). `ui/when.ts`에 `fileDateOf(s)`(촬영지 오프셋으로 `YYYY-MM-DD`) | `src/features/dex/CardActions.tsx:9`, `src/features/settings/BackupSection.tsx:26`, `src/ui/when.ts` |
| 11 | "마지막 백업 N일 전"(시각은 `lastBackupAt`에 이미 있다)과 "백업에는 화면용으로 줄인 사진(긴 변 2048px)이 들어갑니다 — 원본은 따로 보관하세요" | `src/features/settings/BackupSection.tsx:39`, `src/data/journal.tsx:36` |
| 12 | 전역 ErrorBoundary — 예외 하나에 백지가 된다. "문제가 생겼습니다. 기록은 안전합니다 / 다시 열기" | `src/App.tsx`, 새 `src/app/ErrorBoundary.tsx` |
| 13 | 검색이 메모를 보지 않는다 → `matches()`에 `s.note`. '이름 미정 N건' 칩(검색줄 옆, 누르면 `!s.speciesKo`만). 도달 불가인 `identify === 'waiting'` 분기는 `!s.speciesKo` 기준으로 바꾼다 (`'waiting'`을 저장하는 코드가 없다) | `src/features/records/RecordsScreen.tsx:11-30` |

**검증**: 새 테스트 — 복원 재시도(같은 백업을 두 번 → 사진 판 수가 같음; `backup.ts`의 DB 의존을 인자로 빼서 테스트), `fileDateOf` 새벽 기록(`+09:00` 01:00 → 그날). 브라우저 — 빈 화면 문구·불러오기 버튼, 사진 바꾸기, 지도 확대 후 핀(시야 유지), `.env.local`의 `LOCAL_LLM_URL`을 비우고 판정 → 서버 문구, 백업 → 전부 지우기 → 복원 → 같은 파일 재복원, 모바일 뷰포트(375)에서 홈 화면 배너, 라디오 전환 뒤 키가 남아 있는지. **공유창 취소(1번)는 데스크톱에서 재현이 안 된다** — 분기는 단위 테스트로만 확인하고 그렇게 보고한다.

---

## 작업 2 — 카드 등급을 빼고, 카드마다 색을 고르게 하기

**왜**: 사용자 결정 ("새에 등급을 매긴다는 게 어렵기도 하고 썩 내키지 않는다"). 덤으로 점검에서 나온 세 문제 — "EPIC이 새의 희귀도로 읽힌다", "참새에 EPIC ★★★★", "이름 없이 저장한 뒤 이름을 채우면 등급이 COMMON으로 굳는다(`RecordDetail.tsx:46`이 `dexNo`는 다시 매기고 `tier`는 안 매긴다)" — 가 함께 사라진다.

**무엇이 바뀌나**
- 카드에서 **등급 이름(COMMON/RARE/EPIC/LEGENDARY)·별·"희귀/에픽"·"첫 만남" 같은 문구를 없앤다.** 어두운 숲 바탕·크림색 글자·강조색 하나·빛 효과라는 디자인 골격은 그대로 (`CARD_BASE`·`CARD_FONTS` 유지).
- 기록마다 `cardStyle?: { accent: string /* #RRGGBB */; glow: boolean }` — `Sighting`의 형제 키(가산 확장).
- **옛 기록은 모양이 말없이 바뀌지 않는다**: `cardStyle`이 없으면 옛 `tier`의 색·빛으로 읽는다 (이름·별만 안 그린다). `tier` 필드는 지우지 않는다 — 옛 백업 호환. 새 기록에는 `tier: 1`을 계속 써 넣고 `types.ts`에 "쓰지 않음(옛 백업 호환)" 주석.
- **새 기록의 기본색 = 잘라낸 사진에서 뽑은 색** (실패하면 기본 프리셋, 빛 효과는 꺼짐). 사용자는 아무것도 안 해도 카드마다 색이 다르다.
- **색 바꾸기**: 카드 시트(기록 상세 · 도감 · 저장 직후) 아래에 작은 고르개 — 추천 색 8개 안팎(지금의 회색·파랑·보라·금 + 숲초록·청록·산호·크림) + "사진에서 뽑은 색" + 직접 고르기(`<input type="color">`) + 효과 둘(차분하게 / 빛나게). 고르면 바로 `journal.update(id, { cardStyle })`. 존재 이유(BUTTONS.md): 없으면 카드 색을 정할 길이 없다.
- 직접 고른 색이 어두운 바탕에서 안 보이면 안 된다 → `readableAccent(hex)`가 `CARD_BASE.bgBottom` 대비 3:1 미만이면 밝기를 올린다.
- 저장 직후의 **등장 연출은 "처음 본 종"일 때만** (지금의 `shouldReveal(tier >= 3)` 대체). 새의 등급이 아니라 내 기록의 사실이다. 머리글은 "○○를 도감에 더했습니다" / "기록을 저장했습니다"만.
- 도감의 대표 카드: "등급이 가장 높은 기록" → **그 종의 가장 최근 기록**.
- 내보내는 PNG·MP4도 같은 색 (`cardCanvas.ts`가 같은 `styleOf(s)`를 읽는다). `card.css:11`·`cardCanvas.ts:92`의 `'Noto Sans KR'`은 `index.html`이 받지 않는 글꼴 — 이때 같이 확인.
- "카드 디자인은 앱 테마와 무관하게 하나"라는 CLAUDE.md 규칙은 그대로.

**닿는 파일**
- 새로: `src/features/dex/cardStyle.ts`(프리셋 · `styleOf(s)` · `readableAccent` · hex 검사 — 색에 관한 결정은 여기 한 곳), `src/features/dex/accentFromPhoto.ts`(픽셀 배열 → 대표색은 순수 함수로 분리해 테스트, 캔버스 읽기는 얇게), `src/features/dex/CardStylePicker.tsx`, `src/features/dex/dexNo.ts`(`dexNoFor`를 옮긴다)
- 고침: `cardLook.ts`(`en`·`ko`·`stars` 제거, 옛 tier→색 표만 남김), `BirdCard.tsx:28-39`(`.bc-tier`·`.bc-stars` 제거), `card.css`, `cardCanvas.ts`(등급 라벨·별 제거), `CardResult.tsx:18-24`(`firstMeet` prop — `RecordFlow`가 `existing`으로 계산해 넘긴다), `buildSighting.ts:47-48`, `RecordDetail.tsx:12,46`, `DexScreen.tsx:13-21`, `types.ts`
- 지움: `cardTier.ts`(`tierFor`·`TIER_REASONS`·`shouldReveal`), `test/cardTier.test.ts` → `test/dexNo.test.ts` + `test/cardStyle.test.ts`
- 문서: `README.md`("등급색, No.·별" 줄), `CLAUDE.md`(카드 규칙 줄의 "등급을 무엇으로 나누는지는 `cardTier.ts`" 삭제), `BUTTONS.md`

**검증**: 테스트 — `styleOf`(cardStyle 있음 / 옛 tier만 / 둘 다 없음), `readableAccent`(검정 → 3:1 이상), 대표색 추출. 브라우저 — 옛 백업을 불러와 카드 색이 그대로인지, 새 기록 → 사진색 카드, 색·효과 바꾸기 → 상세·도감·PNG에 같은 색, `grep -rn "EPIC\|LEGENDARY\|TIER_" src` 0건.

---

## 작업 3 — 쓰던 기록 보존 + AI에게 다시 묻기

**왜**: 사용자 결정 둘. 서버 없이 된다.

**A. 쓰던 기록이 남는다**
- 작성 중인 것을 브라우저 DB `meta` 저장소의 `'draft'` 한 칸에 둔다: 고른 사진 파일(Blob)·자른 영역·이름·메모·위치·끝난 판정 결과·저장 시각. 값이 바뀔 때마다(0.5초 모아서) 덮어쓴다.
- 새 기록을 열었을 때 7일 안쪽의 초안이 있으면 "쓰던 기록이 있습니다 (어제 오후 3:20) — 이어 쓰기 / 버리기". 저장에 성공하거나 버리면 지운다.
- 초안 저장이 실패해도(용량 등) **기록 작성은 막지 않는다** — 편의 기능이다. 돌고 있던 판정은 화면을 떠나면 지금처럼 중단되고, 끝난 판정만 초안에 남는다.
- 새로: `src/data/draft.ts`, `src/features/record/useDraft.ts`. 고침: `RecordFlow.tsx`(지금 140줄 — 배선을 더하기 **전에** 위치 줄·메모 카드를 작은 컴포넌트로 빼서 상한을 지킨다), `useAsk.ts`(`restore(verdict)`), `usePhotoPick.ts`(초안의 파일로 `pick`), `usePlace.ts`(`copyFrom` 재사용)

**B. AI에게 다시 묻기**
- 결과 화면에 '다시 물어보기' (자른 영역을 고친 뒤 다시 물을 길이 지금은 없다). 결과가 나온 뒤 영역이 바뀌면 "자른 영역이 바뀌었습니다 — 다시 물어볼 수 있습니다" 한 줄. `IdentifyPanel.tsx:49-66`
- **저장한 기록에서도 판정**: 기록 상세에 'AI에게 물어보기'. 저장된 crop 판(없으면 full 판 — 둘 다 캔버스로 다시 만든 것이라 위치 EXIF가 없다, `savePhotos.ts`)을 읽어 같은 `useAsk`로 보낸다. '이 이름으로'를 누르면 `update(id, { speciesKo, latin, verdict, identify: 'done', dexNo })`. 새로: `src/features/records/DetailIdentify.tsx`. 이것으로 "나중에 기록을 열어 다시 물어볼 수 있습니다"(`IdentifyPanel.tsx:27`)가 사실이 된다.
- '좁힘'의 남은 후보(`v.others`)를 누르면 이름 칸에 들어간다 (지금은 회색 글씨 한 줄).
- 기다리는 동안 "진행 중 · 0분 42초". 30초가 넘고 기본 제공 AI면(`loadOwnKey() === null`) "여럿이 함께 씁니다 — 앞 순서를 기다리는 중일 수 있습니다". `useAsk.ts`(시작 시각), `IdentifyPanel.tsx:34-47`
- 서버가 쉴 때 배너에 '설정에서 내 키 넣기' (초안이 남으므로 화면을 떠나도 안전하다). `App.tsx`에서 `RecordFlow`로 `onOpenSettings`.
- 도구를 한 번도 안 쓰고 나온 답(`references`가 빈 '확정', `loop.ts:60`)에는 "자료를 확인하지 않고 답했습니다" 한 줄.
- 기록 상세에서 이름을 고치면 AI 근거가 지워진다(`RecordDetail.tsx:43-46` — 다른 새에 대한 근거를 붙여 두지 않으려는 의도된 동작) → 저장 전에 "이름을 바꾸면 이 기록의 AI 판정 근거가 지워집니다" 한 줄.
- 시스템 프롬프트·도구 정의·순서는 건드리지 않는다 (KV 캐시).

**검증**: 테스트 — 초안 직렬화·만료(7일) 판단. 브라우저 — 사진·크롭·메모·판정 후 뒤로 → 새 기록 → 이어 쓰기로 전부 복원 / 버리기 / 저장 후 초안 없음 / 새로고침 뒤에도 초안 남음, 다시 물어보기, 이름 없이 저장 → 상세에서 판정 → 이름·도감 번호 반영, 후보 누르기, `LOCAL_LLM_URL` 비우고 배너의 설정 이동 → 돌아와 이어 쓰기.

---

## 작업 4 — 구글 타임라인으로 사진 위치 찾기

**왜**: 카메라 사진에는 GPS가 없다. v1에서 쓰던 기능이고 FEATURES.md 우선 1.

**원칙**
- 타임라인 파일을 **저장소·`public/`·테스트 픽스처 어디에도 넣지 않는다.** v2는 GitHub·Vercel로 나가는 폴더이고 그 파일은 몇 년치 이동 기록이다. 사용자가 설정에서 자기 파일을 고르면 **브라우저 안에서만** 읽어 기기에 둔다. 서버로 보내지 않고, 로그에 남기지 않고, **ZIP 백업에도 넣지 않는다** (다시 내보내면 되는 자료이고 기록보다 훨씬 민감하다).
- v1 `test/fixtures`의 타임라인 조각(504점)을 가져오기 전에 **실제 좌표인지 확인**한다. 실제면 좌표를 평행이동한 가짜 조각을 만들어 쓴다.

**조사로 확인한 것 (2026-09-22)**
- 사용자의 실제 파일은 53.5MB지만 쓰는 점은 22,426개 — `[t, source, lat, lng, acc]`로 줄이면 **0.8MB**(원본의 1.4%). 원본을 보관할 이유가 없다. 53MB `JSON.parse`는 **Web Worker**에서 한다.
- v1 `server/lib/tracklog.js`(245줄)의 규칙은 그대로 옮긴다: Tier 1 = `GPS·WIFI·WIFI_ONLY`이고 `accuracy < 100`, Tier 2 = `PATH`. 촬영 시각 ±30분 안에서 **앞뒤 점이 둘 다 있을 때만** 선형 보간. 다시 쓸 것은 SQLite 조회 둘(→ 정렬 배열 + 이진탐색)과 `INSERT OR IGNORE`(→ Map 키 `t|source|lat|lng`)뿐. `Buffer` → `File.text()`.
- **옮길 때 밟기 쉬운 함정** — v1 `test/tracklog.test.ts`가 센서다, 같이 옮긴다: before는 `t < center`(엄격)·after는 `t >= center`(포함) — 같게 만들면 촬영 시각과 점이 정확히 같을 때 좌표가 NaN인데 `matched: true` / `accuracy < 100`을 `<=`로 바꾸면 Tier 1이 16% 부푼다(정확히 100인 점이 2,362개 — 구글의 채움값) / 한쪽 점만 있으면(`one_sided`) **좌표를 내놓지 않는다**, 가까운 점으로 붙이지 않는다 / Tier 1이 한쪽만 있으면 Tier 2로 **넘어간다**(`continue` — `break`로 바꾸면 Tier 2가 죽는다, v1에서 실제로 있었던 버그) / 허용 간격 기본값을 `|| 30`으로 쓰지 않는다(0을 존중, 빈 문자열·NaN만 기본값).
- 시간대 변환은 필요 없다 — 타임라인의 `timestamp`도 `exif.ts`의 `capturedAt`(UTC Z)도 `Date.parse`로 epoch ms가 된다.
- 구글은 2024년부터 타임라인을 폰에 저장하고 **자동 삭제 기본이 3개월**. 실제 파일도 정확한 점(`rawSignals`)은 최근 31일, 경로(`timelinePath`)는 91일뿐 → 한 달 넘은 사진은 "경로로 추정(정확도 표시 없음)"이고, **주기적으로 새 파일을 넣어 달라고 알려야** 한다.
- 안드로이드 내보내기: 설정 → 위치 → 위치 서비스 → 타임라인 → 타임라인 데이터 내보내기. 아이폰: 지도 앱 → 프로필 → 설정 → 위치 및 개인정보 보호 → 타임라인 데이터 내보내기(`location-history.json`). **아이폰 파일은 모양이 다르다는 비공식 보고**(최상위가 배열, 좌표가 `geo:` URI, `placeID`) → 1차는 안드로이드 모양(`semanticSegments`·`rawSignals` 객체, `"37.5°, 127.0°"` 문자열)만 읽고, 아이폰 모양이면 "아이폰에서 내보낸 파일은 아직 읽지 못합니다"라고 말한다.

**동작**
- 설정 › 이동 기록: 파일 넣기(진행 표시) · "6월 22일 ~ 9월 21일 · 22,426점" · 지우기 · 접힌 "내보내는 방법". 다시 넣으면 **합친다**(중복 제거) — 3개월마다 넣어 가며 범위가 길어진다.
- 기록 화면: 사진에 촬영 시각이 있고 GPS가 없고 이동 기록이 있으면 **자동으로** 찾아 채운다 (버튼 없음 — "자동으로 할 수 있는 일에 버튼을 두지 않는다"). 출처 `'tracklog'`("이동 기록으로 추정" — `types.ts`·`usePlace.ts:16`에 이미 있다) + "앞뒤 점 간격 N분", Tier 2면 "이동 경로 기반이라 정확도가 표시되지 않습니다"(v1 문구).
- 못 찾았을 때 세 갈래로 말한다: 촬영이 기록 끝(`rangeEnd`)보다 뒤 → "이동 기록이 ○월 ○일까지입니다. 폰에서 새로 내보내 넣어 주세요" / 기록 시작보다 앞 → "그때 기록은 남아 있지 않습니다"(다시 내보내도 없다) / 범위 안인데 그날이 비었음(비행기 모드 등) → 아무 권유도 하지 않는다.
- 목록 화면: 마지막으로 넣은 지 60일이 넘었으면 "이동 기록을 새로 넣을 때가 됐습니다 (구글은 3개월이 지나면 지웁니다)" 한 번.
- 카메라 시계 보정(FEATURES.md "타임라인과 함께")은 BUTTONS.md가 정한 대로 **위치 시트 안**에 둔다 — 이번에 넣을지는 작업 시작 때 정한다.

**닿는 파일**
- 새로: `src/lib/tracklog/parse.ts`·`match.ts`(순수), `src/features/tracks/parseWorker.ts`, `src/data/tracks.ts`(UTC 날짜별 점 배열 + `meta`에 범위·넣은 시각 — 매칭은 촬영일 ±1일 세 키만 읽는다), `src/features/record/useTrackMatch.ts`, `src/features/settings/TracksSection.tsx`, `test/tracklog.test.ts`
- 고침: `src/data/db.ts`(저장소 `tracks` 추가, `DB_VERSION` 1→2, "없으면 만든다"만), `usePlace.ts`(`setCoords(lat, lng, 'tracklog')` 입구), `RecordFlow.tsx`, `SettingsScreen.tsx`, `RecordsScreen.tsx`(60일 알림), `LicenseSection.tsx` 또는 개인정보 안내에 "이동 기록은 이 기기 밖으로 나가지 않습니다", `README.md`·`FEATURES.md`

**검증**: v1 테스트의 기대값(간격 2.6분 / Tier 2 11.0분 / 35분 초과 실패 / 시각이 점과 정확히 같을 때 NaN 아님 / 한쪽만 있을 때 좌표 없음)이 그대로 통과. 브라우저 — 실제 파일을 설정에서 넣고(파일은 저장소 밖 `../bird_app v1/server/data/tracks/`에 그대로 둔다) GPS 없는 카메라 사진으로 위치가 채워지는지, 범위 밖 사진의 안내, 다시 넣기로 범위 합쳐지기, 지우기, 아이폰 모양 가짜 파일의 안내, DB 버전을 올린 뒤 기존 기록이 그대로인지. **`git status`에 타임라인 파일이 없는지 확인.**

---

## 작업 5 — 저장 방식 (결정 대기: 구글 드라이브 vs 로그인+서버)

**"구글 드라이브 방식이 Vercel에 올렸을 때 되나?" → 된다.** Vercel은 앱 파일만 내려 주고, 드라이브와의 통신은 사용자의 브라우저 ↔ 구글 사이에서 직접 일어난다. 서버 코드가 없다. 필요한 것은 Google Cloud에서 OAuth 클라이언트를 만들어 **Vercel 배포 주소와 `http://localhost:5173`을 "승인된 JavaScript 원본"에 등록**하고, 동의 화면을 **"프로덕션"으로 게시**하는 것뿐이다. `drive.file`·`drive.appdata`는 구글 분류상 비민감 권한이라 앱 심사·100명 제한이 없다. "테스트" 상태로 두면 7일마다 로그인이 풀린다. 코드에서 요청하는 권한이 동의 화면 설정과 다르면 "미인증 앱" 경고가 뜬다. Vercel 프리뷰 주소는 배포마다 바뀌어 로그인이 안 된다 — 프로덕션 주소만.

| | 구글 드라이브 백업 | 로그인 + 서버 (Supabase + Cloudflare R2) |
|---|---|---|
| 운영비 | 0원 (사용자 자기 드라이브 15GB. 연 2000건이면 4~5년에 찬다 → 사용자가 Google One) | 1명 무료 · 100명이 1년 쌓아도 월 $1 안팎 (R2 10GB 무료·전송 무료·초과 GB당 $0.015). Supabase 무료는 **7일 조용하면 프로젝트가 멈춘다**(대시보드에서 수동 재개, 1년 안) → 깨우는 예약 작업이 필요하거나 Pro 월 $25 |
| 만드는 양 | 구글 로그인 + 올리기/받기 + 합치기(지금의 `planMerge` 재사용). 서버 코드 없음 | 로그인 + DB 표·권한 규칙(RLS) + 서명 주소 발급 API + R2 CORS(오리진 정확히 일치) + 동기화·충돌 처리 + 기존 기록 옮기기 |
| 어려운 점 | 로그인이 **1시간마다 풀린다** — 브라우저 전용은 조용한 갱신이 없다(구글 문서: 사용자 조작에서 다시 요청하라) → 올릴 것을 IndexedDB 큐에 두고 401이면 '다시 로그인' 버튼 클릭에 갱신을 묶는다. **아이폰 홈 화면 앱에서 로그인 팝업이 안 돌아온다는 보고**(공식 확인 못 함) → standalone이면 리다이렉트 방식. 사진은 `appDataFolder`가 아니라 **보이는 폴더**에 (숨김 폴더는 사용자가 "앱 데이터 삭제"로 통째로 날릴 수 있다). `<img src>`에 드라이브 주소를 못 쓴다 → fetch + Cache Storage | **법** (법률 자문 아님): 로그인을 받아 남의 사진·촬영 위치를 내 서버에 모으면 개인정보 보호법(처리방침·동의·안전조치·유출 72시간 통지·국외 이전 고지)과 위치정보법이 걸린다. 방통위 해설서는 위치기반서비스사업의 "사업 목적에 제한이 없어 영리·비영리를 불문"이라 적고, 미신고는 3년 이하 징역/3천만원 이하 벌금, 개인위치정보는 **최대 1년 보유**(시행령 26조의2). 사진 EXIF GPS가 "위치정보"인지는 확정 해석·판례를 못 찾았다. 해설서의 신고 면제 사유 "단말기에서만 활용하고 사업자 시스템으로 전송하지 않는 경우"가 지금 구조다 |
| 남의 데이터 | 내 서버에 오지 않는다 | 내가 보관·책임진다 |
| CLAUDE.md·FEATURES.md | 그대로 | "서버에 저장하지 않는다"·"계정·로그인은 넣지 않는다"를 고쳐야 한다 |

Vercel Blob은 후보에서 뺀다 — Hobby 한도(저장 1GB · 월 업로드 2,000회 = 전체 합쳐 월 666건)를 넘으면 **과금이 아니라 30일간 차단**되고, 공개 저장소는 주소만 알면 누구나 본다(비공개는 서명 주소로만).

**권고**: 드라이브를 먼저 **이틀짜리 시험**으로 확인한다 — Vercel 주소에서 구글 로그인 → 파일 하나 올리고 받기 → 아이폰 홈 화면 앱에서도 되는지. 되면 드라이브로 간다. 안 되면 서버로 가되, **만들기 전에 위치정보지원센터(02-588-0185)에 "사용자가 올린 사진의 촬영 좌표를 계정과 함께 저장하는 무료 개인 서비스가 신고 대상인지"를 먼저 묻는다.** 절충안: **나만 서버 동기화, 다른 사용자는 로컬+ZIP** (해설서: "위치정보를 개인적인 용도로 확인하는 경우는 해당되지 않는다").
어느 쪽이든 작업 1·3(손실 막기·초안 보존)은 그대로 필요하다 — 로컬이 원본이고 드라이브/서버는 사본인 구조가 전파 없는 현장에서도 안전하다.

---

## 부록 — 점검에서 나온 나머지

**작업 1~4에 안 들어간 발견** (FEATURES.md와 겹치는 것은 거기 우선순위를 따른다): 저장한 뒤 위치 고치기(작업 4 뒤에 `LocationSheet` 재사용 — 지금은 '위치 없음' 기록이 상세에서 줄 자체가 안 그려져 고칠 자리도 안 보인다) · 종추 집계 · 개체 수 칸 · CSV 내보내기(eBird) · 한국 조류 목록 약 600종 + 천연기념물·멸종위기 열(그러면 `stamps`·`sensitive`가 실제로 켜진다 — 지금은 `buildSighting`이 항상 `sensitive: false`) · 사진 없는 기록 · 밤 모드 수동 스위치(`useTheme`의 `forceDark`가 이미 있다, forest·cute·pop은 어두운 짝이 없다) · 서비스 워커 · 브라우저 뒤로가기 연동과 목록 스크롤 복원 · 목록 썸네일 지연 로딩(1000건이면 1000장을 한 번에 읽는다) · 큰 사진을 한 번만 디코드 + 탐지를 Worker로(지금 원본을 세 번 디코드) · 백업 ZIP 흘려 쓰기(지금 사진 전부를 메모리에) · 두 기기 백업을 합칠 때 `dexNo` 겹침(`planMerge`가 dexNo를 안 본다) · 설정에 버전·문의 링크 · "무엇이 어디로 나가나"(LLM·위키백과·Nominatim·CDN) 안내 · API 키 도움말(어디서 받나, 얼마인가, 어떤 모델인가) · 시트의 포커스 트랩 · OS 글자 크기 반영.

**지킬 강점** (검증자들이 "건드리지 말라"고 한 것): 참고 자료를 도구가 실제로 돌려준 주소에서만(`loop.ts:23-27`) · 현재 위치를 자동으로 넣지 않는다(`usePlace.ts:21`) · 복원은 병합이고 기기에만 있는 기록을 지우지 않는다(`backupFormat.ts:50-51`) · 더 새 버전의 백업은 거부 · 실패해도 기록 저장은 막지 않는다 · 한 장짜리 기록 화면 · 모델을 받기 전에 크기를 알린다 · 목록 썸네일이 크롭본이라 "그 새"가 보인다 · LLM에는 다시 인코딩한 그림만.

**반박되어 버린 주장** (고칠 것 없음): "모든 카드에 No. — 가 찍힌다"(`dexNoFor`가 `cardTier.ts:35`에 있고 `buildSighting.ts:48`·`RecordDetail.tsx:46`이 쓴다) · "카드 내보내기가 빌드도 안 된다"(`tsc --noEmit` 통과) · "화면 카드와 PNG가 다른 디자인"(`cardText.ts`를 공유한다).
