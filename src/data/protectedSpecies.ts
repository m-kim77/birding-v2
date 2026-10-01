/**
 * 보호종 표 — 법으로 보호하는 새의 국명과 그 지위(멸종위기 야생생물 급 · 천연기념물).
 * 기록에 저장하지 않고 볼 때 국명으로 찾는다. 목록이 개정되면 이 파일만 고치면 옛 기록에도 새 표가 걸린다.
 *
 * **기억이나 AI의 답으로 채우지 않는다.** 아래 세 목록은 공식 출처의 이름을 원문 순서 그대로 옮긴 것이다.
 * - 멸종위기 야생생물(조류): 「야생생물 보호 및 관리에 관한 법률 시행규칙」 별표 1 <개정 2022. 12. 9.>
 *   (환경부령 제1010호, 이 별표는 2023. 1. 1. 시행). 2026-10-01에 법제처 국가법령정보센터의 연혁·개정문을 보고
 *   현행(기후에너지환경부령 제39호, 2026. 5. 12.)까지 별표 1을 고친 개정이 없음을 확인했다.
 * - 천연기념물(조류): 국가유산청 국가유산검색 목록 (종목 천연기념물, 소재지 '전국일원', 해제되지 않은 것), 2026-10-01에 받음.
 *   종 자체가 지정된 것만 넣었다. '○○ 번식지·도래지·서식지'는 그 장소가 천연기념물이라 종에 붙이지 않는다.
 *   소재지가 한 지역인 지정(예: 한 마을의 닭 품종)도 야생의 종 지정이 아니라 넣지 않았다.
 * 개정되면 원문에서 다시 옮기고 `PROTECTED_BASIS`의 기준일을 고친다. 수와 몇몇 이름은 test/protectedSpecies.test.ts가 지킨다.
 *
 * 이름 추천 표(`species.ts SPECIES`)에는 넣지 않는다 — 이름 추천·AI 국명 도구·답 거르기가 같이 바뀐다.
 */

/** 출처와 기준일. 설정의 출처 목록(LicenseSection)이 같은 값을 쓴다 — 표를 고치면 여기도 같이 고친다 */
export const PROTECTED_BASIS = {
  endangered: { who: '기후에너지환경부 · 야생생물 보호 및 관리에 관한 법률 시행규칙 별표 1', asOf: '2022. 12. 9. 개정' },
  monument: { who: '국가유산청 · 국가유산검색 천연기념물 목록', asOf: '2026. 10. 1. 받음' },
} as const

/** 멸종위기 야생생물 Ⅰ급 조류 — 별표 1 "3. 조류 가." 번호 순 (16종) */
export const ENDANGERED_1: readonly string[] = [
  '검독수리', '고니', '넓적부리도요', '노랑부리백로', '느시', '두루미', '먹황새', '뿔제비갈매기',
  '저어새', '참수리', '청다리도요사촌', '크낙새', '호사비오리', '혹고니', '황새', '흰꼬리수리',
]

/** 멸종위기 야생생물 Ⅱ급 조류 — 별표 1 "3. 조류 나." 번호 순 (53종) */
export const ENDANGERED_2: readonly string[] = [
  '개리', '검은머리갈매기', '검은머리물떼새', '검은머리촉새', '검은목두루미', '고대갈매기', '긴꼬리딱새', '긴점박이올빼미',
  '까막딱다구리', '노랑부리저어새', '독수리', '따오기', '뜸부기', '매', '무당새', '물수리',
  '벌매', '붉은가슴흰죽지', '붉은배새매', '붉은어깨도요', '붉은해오라기', '뿔쇠오리', '뿔종다리', '새매',
  '새호리기', '섬개개비', '솔개', '쇠검은머리쑥새', '쇠제비갈매기', '수리부엉이', '시베리아흰두루미', '알락개구리매',
  '알락꼬리마도요', '양비둘기', '올빼미', '재두루미', '잿빛개구리매', '조롱이', '참매', '청호반새',
  '큰고니', '큰기러기', '큰덤불해오라기', '큰뒷부리도요', '큰말똥가리', '팔색조', '항라머리검독수리', '흑기러기',
  '흑두루미', '흑비둘기', '흰목물떼새', '흰이마기러기', '흰죽지수리',
]

/** 천연기념물 조류 — 국가유산청 목록의 이름 그대로, 목록 순 (46종). 국가유산청 표기라 법령과 다른 이름이 둘 있다 (`SAME_SPECIES`) */
export const MONUMENT_BIRDS: readonly string[] = [
  '크낙새', '따오기', '황새', '먹황새', '고니', '큰고니', '혹고니', '두루미',
  '재두루미', '팔색조', '저어새', '노랑부리저어새', '느시(들칠면조)', '흑비둘기', '흑두루미', '까막딱따구리',
  '독수리', '검독수리', '참수리', '흰꼬리수리', '참매', '붉은배새매', '개구리매', '새매',
  '알락개구리매', '잿빛개구리매', '매', '황조롱이', '올빼미', '수리부엉이', '솔부엉이', '쇠부엉이',
  '칡부엉이', '소쩍새', '큰소쩍새', '개리', '흑기러기', '검은머리물떼새', '원앙', '노랑부리백로',
  '뜸부기', '두견', '호사비오리', '호사도요', '뿔쇠오리', '검은목두루미',
]

/**
 * 두 기관이 같은 종을 다르게 적은 것: 국가유산청 표기 → 법령 표기. 표에는 법령 표기로 한 줄이고, 두 표기 모두 찾힌다.
 * 앱은 '오색딱다구리'처럼 '딱다구리'로 적는다 (법령 표기와 같다). 여기에는 두 원문에 실제로 있는 표기만 둔다.
 */
const SAME_SPECIES = new Map([
  ['까막딱따구리', '까막딱다구리'],
  ['느시(들칠면조)', '느시'],
])

/** 한 종의 보호 지위 */
export interface Protection {
  /** 국명 (법령 표기. 천연기념물에만 있는 종은 국가유산청 표기) */
  ko: string
  /** 멸종위기 야생생물 급. 멸종위기가 아니면 없다 */
  endangered?: 1 | 2
  /** 천연기념물로 지정된 종이면 true, 아니면 없다 */
  monument?: true
}

/** 세 목록을 국명 하나에 한 줄로 합친다. 국가유산청 표기는 법령 표기로 모은다 */
function buildTable(): Map<string, Protection> {
  const table = new Map<string, Protection>()
  /** 국명의 줄. 없으면 새로 만든다 */
  const row = (ko: string): Protection => {
    const found = table.get(ko)
    if (found) return found
    const made: Protection = { ko }
    table.set(ko, made)
    return made
  }
  ENDANGERED_1.forEach((ko) => { row(ko).endangered = 1 })
  ENDANGERED_2.forEach((ko) => { row(ko).endangered = 2 })
  MONUMENT_BIRDS.forEach((name) => { row(SAME_SPECIES.get(name) ?? name).monument = true })
  return table
}

const TABLE = buildTable()

/** 표의 모든 종 — 한 종에 한 줄 (법령 목록 순, 그 뒤에 천연기념물에만 있는 종) */
export const PROTECTED: readonly Protection[] = [...TABLE.values()]

/**
 * 국명으로 보호 지위를 찾는다. 앞뒤 공백만 떼고 이름이 **정확히 같을 때만** 찾는다 (국가유산청 표기 두 개도 받는다).
 * 빈 이름·'이름 미정'·표에 없는 이름은 null.
 * 비슷한 이름은 맞추지 않는다 — 아종·갈라진 종(예: 법령의 '큰기러기'와 '큰부리큰기러기')에 틀린 표시를 붙이느니 빠지는 쪽이 낫다.
 * 학명으로도 찾지 않는다 — 법령의 학명에는 옛 분류가 섞여 있어 앱·AI가 쓰는 학명과 어긋난다.
 */
export function protectionOf(ko: string | undefined): Protection | null {
  const name = (ko ?? '').trim()
  return TABLE.get(SAME_SPECIES.get(name) ?? name) ?? null
}

/** 급의 로마 숫자 — 법령이 쓰는 글자 그대로 */
const GRADE = { 1: 'Ⅰ', 2: 'Ⅱ' } as const

/**
 * 기록 상세에 적을 한 줄 — 예: '멸종위기 야생생물 Ⅱ급 · 천연기념물'. 법정 이름 그대로 적는다. 표에 없는 종은 빈 문자열.
 * 카드에는 쓰지 않는다 — 카드에 급을 적으면 옛 카드 등급처럼 읽힌다 (CLAUDE.md "카드에 등급을 매기지 않는다").
 */
export function protectionLine(ko: string | undefined): string {
  const p = protectionOf(ko)
  if (!p) return ''
  const parts: string[] = []
  if (p.endangered) parts.push(`멸종위기 야생생물 ${GRADE[p.endangered]}급`)
  if (p.monument) parts.push('천연기념물')
  return parts.join(' · ')
}

/**
 * 기록 상세의 보호종 줄 아래에 적을 지정 기관 — 예: '기후에너지환경부 · 국가유산청 지정'. 표에 없는 종은 빈 문자열.
 * 멸종위기는 시행규칙의 소관 부처(기후에너지환경부 — 2025. 10. 1. 부처 이름이 바뀌었다), 천연기념물은 국가유산청이다.
 * 둘 중 하나만인 종에 두 기관을 다 적지 않는다 — 예: 솔개는 천연기념물이 아니므로 국가유산청이 지정한 것이 아니다.
 */
export function protectionBy(ko: string | undefined): string {
  const p = protectionOf(ko)
  if (!p) return ''
  const who = [p.endangered ? '기후에너지환경부' : '', p.monument ? '국가유산청' : ''].filter(Boolean)
  return `${who.join(' · ')} 지정`
}

/**
 * 위치 숨기기 스위치 아래에 적을 안내 — 보호종이면 둥지·번식지의 위치를 가리기를 권한다. 표에 없는 종은 빈 문자열.
 * 권하기만 한다. 스위치를 저절로 켜지 않는다 — 도심에서 흔한 원앙·황조롱이의 핀까지 말없이 지도에서 사라진다.
 */
export function hideHint(ko: string | undefined): string {
  const line = protectionLine(ko)
  return line ? `${line}입니다. 둥지·번식지에서 찍었다면 위치 숨기기를 권합니다.` : ''
}
