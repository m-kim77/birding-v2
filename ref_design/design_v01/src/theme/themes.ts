/**
 * 테마별 토큰 값. **이 파일이 겉모습의 단일 원본이다.**
 *
 * 규칙 (v2 CLAUDE.md "겉모습은 토큰으로만 바꾼다"):
 * - 컴포넌트는 테마 id를 검사하지 않는다. 여기 적힌 값이 CSS 변수로 내려갈 뿐이다.
 * - 테마를 더할 때는 이 파일에 항목 하나를 더하고 `npm run check`로 대비를 확인한다. 다른 파일은 고치지 않는다.
 * - 토큰으로 표현되지 않는 차이가 필요하면 토큰을 더한다. 컴포넌트에 분기를 넣지 않는다.
 *
 * 이 파일은 node가 타입만 지우고 직접 실행한다 (scripts/check-contrast.ts).
 * 그래서 enum·namespace 같은 지울 수 없는 문법과 다른 모듈 import를 쓰지 않는다.
 */

/** CSS 변수로 내려가는 값들. 키 `bgCard`는 변수 `--bg-card`가 된다 */
export interface ThemeTokens {
  /** 앱 화면 바탕. 색 또는 그라데이션 */
  bgApp: string
  /** 카드 바탕. 유리 테마처럼 반투명일 수 있다 */
  bgCard: string
  /** 칩·눌린 영역·구분 바탕 */
  bgSurface: string
  bgInput: string
  /** 본문·제목 */
  text1: string
  /** 보조 본문 */
  text2: string
  /** 부가 정보(날짜·단위). 작은 글씨로 쓰이므로 이것도 대비 4.5:1을 넘어야 한다 */
  text3: string
  primary: string
  onPrimary: string
  accent: string
  onAccent: string
  border: string
  /** 카드 테두리 전체 선언. 없으면 'none' */
  cardBorder: string
  cardShadow: string
  radiusCard: string
  radiusControl: string
  /** 새 이름·화면 제목용 글꼴 */
  fontDisplay: string
  fontBody: string
  weightTitle: string
  tabBg: string
  tabActive: string
  tabInactive: string
  /** 상태 색. 테마가 달라도 같은 뜻(성공·주의·오류)으로 읽혀야 한다 */
  ok: string
  warn: string
  err: string
  /** 화면 배경 장식 (background-image 값). 없으면 'none' */
  backdrop: string
  /** 카드 뒤 흐림 (backdrop-filter 값). 없으면 'none' */
  cardBlur: string
}

export interface ThemeDef {
  id: string
  name: string
  desc: string
  tokens: ThemeTokens
  /**
   * 대비 검사용 불투명 바탕. 반투명·그라데이션은 계산할 수 없어서
   * "실제로 글자 뒤에 깔리는 색에 가장 가까운 단색"을 사람이 적어 둔다.
   */
  solid: { app: string; card: string; tab: string }
}

const SANS = "'Pretendard', -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
const SERIF = "'Noto Serif KR', 'AppleMyungjo', 'Nanum Myeongjo', Georgia, serif"

export const THEMES: ThemeDef[] = [
  {
    id: 'dogam', name: '도감', desc: '자연 도감 · 필드 노트',
    solid: { app: '#F8F2E0', card: '#FFFCF0', tab: '#F8F2E0' },
    tokens: {
      bgApp: '#F8F2E0', bgCard: '#FFFCF0', bgSurface: '#F0E8D0', bgInput: '#FFFCF0',
      text1: '#1A1008', text2: '#4A3418', text3: '#735426',
      primary: '#4C6A2E', onPrimary: '#FFFCF0', accent: '#8A4A18', onAccent: '#FFFCF0',
      border: '#D8C890', cardBorder: '1px solid rgba(160,120,40,0.28)',
      cardShadow: '0 2px 8px rgba(80,50,10,0.10)',
      radiusCard: '6px', radiusControl: '6px',
      fontDisplay: SERIF, fontBody: SANS, weightTitle: '700',
      tabBg: 'rgba(248,242,224,0.97)', tabActive: '#4C6A2E', tabInactive: '#735426',
      ok: '#3F6212', warn: '#8A4A18', err: '#A11D1D',
      // 종이 결 — 아주 옅은 가로줄
      backdrop: 'repeating-linear-gradient(0deg, transparent 0 27px, rgba(160,120,40,0.07) 27px 28px)',
      cardBlur: 'none',
    },
  },
  {
    id: 'forest', name: '숲속', desc: '내추럴 그린',
    solid: { app: '#F5F7F0', card: '#FFFFFF', tab: '#F5F7F0' },
    tokens: {
      bgApp: '#F5F7F0', bgCard: '#FFFFFF', bgSurface: '#E6EFE2', bgInput: '#FFFFFF',
      text1: '#1E2E1A', text2: '#34502F', text3: '#4E6B48',
      primary: '#3F6E4D', onPrimary: '#FFFFFF', accent: '#8A5A00', onAccent: '#FFFFFF',
      border: '#D2E2CA', cardBorder: 'none',
      cardShadow: '0 4px 16px rgba(44,58,40,0.10), 0 1px 3px rgba(44,58,40,0.06)',
      radiusCard: '18px', radiusControl: '12px',
      fontDisplay: SANS, fontBody: SANS, weightTitle: '800',
      tabBg: 'rgba(245,247,240,0.97)', tabActive: '#3F6E4D', tabInactive: '#4E6B48',
      ok: '#2F6B3F', warn: '#8A5A00', err: '#B42318',
      backdrop: 'none', cardBlur: 'none',
    },
  },
  {
    id: 'cute', name: '귀여운', desc: '따뜻한 파스텔',
    solid: { app: '#FFF8F0', card: '#FFFFFF', tab: '#FFF8F0' },
    tokens: {
      bgApp: '#FFF8F0', bgCard: '#FFFFFF', bgSurface: '#F6EBDA', bgInput: '#FFFFFF',
      // Figma 시안의 보조 글씨(#C49A6C)는 대비 2:1 남짓이라 진하게 고쳤다
      text1: '#3D2B1F', text2: '#6B4226', text3: '#80573A',
      primary: '#9DD3F2', onPrimary: '#23323D', accent: '#FFB5A0', onAccent: '#4A2318',
      border: '#F0E2CC', cardBorder: 'none',
      cardShadow: '0 4px 16px rgba(61,43,31,0.09), 0 1px 4px rgba(61,43,31,0.05)',
      radiusCard: '24px', radiusControl: '999px',
      fontDisplay: SANS, fontBody: SANS, weightTitle: '800',
      tabBg: 'rgba(255,248,240,0.96)', tabActive: '#2C6E9E', tabInactive: '#80573A',
      ok: '#2F7D56', warn: '#9A5B13', err: '#B93A32',
      backdrop: 'radial-gradient(circle at 12% 0%, rgba(157,220,188,0.35), transparent 42%), radial-gradient(circle at 95% 8%, rgba(255,181,160,0.30), transparent 38%)',
      cardBlur: 'none',
    },
  },
  {
    id: 'simple', name: '심플', desc: '미니멀 화이트',
    solid: { app: '#F7F7F7', card: '#FFFFFF', tab: '#FFFFFF' },
    tokens: {
      bgApp: '#F7F7F7', bgCard: '#FFFFFF', bgSurface: '#F0F1F3', bgInput: '#FFFFFF',
      text1: '#1A1A1A', text2: '#4B5563', text3: '#5F6875',
      primary: '#2563EB', onPrimary: '#FFFFFF', accent: '#B45309', onAccent: '#FFFFFF',
      border: '#E5E7EB', cardBorder: 'none',
      cardShadow: '0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
      radiusCard: '14px', radiusControl: '10px',
      fontDisplay: SANS, fontBody: SANS, weightTitle: '700',
      tabBg: 'rgba(255,255,255,0.97)', tabActive: '#2563EB', tabInactive: '#5F6875',
      ok: '#15803D', warn: '#B45309', err: '#B91C1C',
      backdrop: 'none', cardBlur: 'none',
    },
  },
  {
    id: 'modern', name: '모던', desc: '다크 네이비',
    solid: { app: '#0F1117', card: '#1A1D2E', tab: '#0F1117' },
    tokens: {
      bgApp: '#0F1117', bgCard: '#1A1D2E', bgSurface: '#252840', bgInput: '#14172A',
      text1: '#F0F2FF', text2: '#B4BBD8', text3: '#9098B8',
      primary: '#8AA4FF', onPrimary: '#0F1117', accent: '#FF8FB4', onAccent: '#0F1117',
      border: '#2E3352', cardBorder: '1px solid rgba(255,255,255,0.06)',
      cardShadow: '0 4px 24px rgba(0,0,0,0.4)',
      radiusCard: '16px', radiusControl: '10px',
      fontDisplay: SANS, fontBody: SANS, weightTitle: '700',
      tabBg: 'rgba(15,17,23,0.97)', tabActive: '#8AA4FF', tabInactive: '#9098B8',
      ok: '#6EE7A0', warn: '#FBBF24', err: '#FF8A8A',
      backdrop: 'none', cardBlur: 'none',
    },
  },
  {
    id: 'glass', name: '유리', desc: '글라스모피즘',
    // 그라데이션 위 반투명 카드 — 가장 밝아지는 지점 기준으로 적었다
    solid: { app: '#14183A', card: '#2A2F55', tab: '#10122E' },
    tokens: {
      bgApp: 'linear-gradient(160deg, #1A0A3A 0%, #0A1A3A 50%, #0A2A2A 100%)',
      bgCard: 'rgba(255,255,255,0.09)', bgSurface: 'rgba(255,255,255,0.08)', bgInput: 'rgba(255,255,255,0.10)',
      text1: '#F0F4FF', text2: '#C2D0EC', text3: '#A9BBDD',
      primary: '#80C8FF', onPrimary: '#0A1A3A', accent: '#FF9CCB', onAccent: '#0A1A3A',
      border: 'rgba(255,255,255,0.16)', cardBorder: '1px solid rgba(255,255,255,0.16)',
      cardShadow: '0 8px 32px rgba(0,0,0,0.30)',
      radiusCard: '20px', radiusControl: '14px',
      fontDisplay: SANS, fontBody: SANS, weightTitle: '700',
      tabBg: 'rgba(10,10,40,0.88)', tabActive: '#80C8FF', tabInactive: '#A9BBDD',
      ok: '#7FF0B0', warn: '#FFD166', err: '#FF9A9A',
      backdrop: 'radial-gradient(circle at 85% 0%, rgba(128,200,255,0.20), transparent 45%), radial-gradient(circle at 0% 60%, rgba(255,128,192,0.14), transparent 40%)',
      cardBlur: 'blur(16px)',
    },
  },
  {
    id: 'pop', name: '팝', desc: '볼드 팝아트',
    solid: { app: '#FFF8E0', card: '#FFFFFF', tab: '#FFFFFF' },
    tokens: {
      bgApp: '#FFF8E0', bgCard: '#FFFFFF', bgSurface: '#FFE880', bgInput: '#FFFFFF',
      text1: '#1A1A1A', text2: '#1A1A1A', text3: '#4D4D4D',
      // 빨강 위 흰 글씨는 대비 3.6:1이라 검정 글씨로 바꿨다
      primary: '#FF4D6A', onPrimary: '#1A1A1A', accent: '#1D5FE0', onAccent: '#FFFFFF',
      border: '#1A1A1A', cardBorder: '2.5px solid #1A1A1A',
      cardShadow: '4px 4px 0 #1A1A1A',
      radiusCard: '12px', radiusControl: '10px',
      fontDisplay: SANS, fontBody: SANS, weightTitle: '900',
      tabBg: '#FFFFFF', tabActive: '#D4143A', tabInactive: '#4D4D4D',
      ok: '#0B7A3B', warn: '#8A4B00', err: '#C2102F',
      backdrop: 'linear-gradient(180deg, #FFE000 0 140px, transparent 140px)',
      cardBlur: 'none',
    },
  },
]

/**
 * 설정 화면에서 고르는 선택지. 심플과 모던은 한 쌍이라 선택지는 6개다.
 * `light`/`dark`가 다르면 기기의 라이트·다크 설정에 따라 둘 중 하나가 적용된다.
 */
export interface ThemeChoice {
  id: string
  name: string
  desc: string
  light: string
  dark: string
}

export const THEME_CHOICES: ThemeChoice[] = [
  { id: 'dogam', name: '도감', desc: '자연 도감 · 필드 노트', light: 'dogam', dark: 'dogam' },
  { id: 'forest', name: '숲속', desc: '내추럴 그린', light: 'forest', dark: 'forest' },
  { id: 'cute', name: '귀여운', desc: '따뜻한 파스텔', light: 'cute', dark: 'cute' },
  { id: 'simple', name: '심플 · 모던', desc: '기기의 라이트·다크 설정을 따름', light: 'simple', dark: 'modern' },
  { id: 'glass', name: '유리', desc: '글라스모피즘', light: 'glass', dark: 'glass' },
  { id: 'pop', name: '팝', desc: '볼드 팝아트', light: 'pop', dark: 'pop' },
]

export const DEFAULT_CHOICE = 'dogam'
