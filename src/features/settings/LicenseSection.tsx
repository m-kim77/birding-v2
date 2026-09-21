/**
 * 오픈소스·모델·자료의 출처. 라이선스가 고지를 요구한다 (Apache-2.0, ODbL 등).
 * 모델이나 자료를 더하거나 바꾸면 여기에도 한 줄을 더한다 — 고지 의무는 배포하는 쪽에 있다.
 */
const CREDITS: Array<{ what: string; who: string; license: string }> = [
  { what: '새 찾기 모델 EfficientDet-Lite0 · MediaPipe Tasks', who: 'Google', license: 'Apache-2.0' },
  { what: '지도 자료와 타일', who: '© OpenStreetMap 기여자', license: 'ODbL' },
  { what: '장소 이름 찾기 (Nominatim)', who: 'OpenStreetMap', license: 'ODbL' },
  { what: '판정 근거 자료', who: '위키백과', license: 'CC BY-SA 4.0' },
  { what: 'Leaflet · React · exifr · fflate', who: '각 저자', license: 'BSD-2 / MIT' },
  { what: '글꼴 Pretendard · Noto Serif KR', who: '길형진 · Google', license: 'SIL OFL 1.1' },
]

/** 접어 둔 출처 목록. 버튼이 아니라 펼침이다 — 다른 화면으로 갈 만큼의 내용이 아니다 */
export default function LicenseSection() {
  return (
    <details className="credits">
      <summary>오픈소스 · 모델 · 자료 출처</summary>
      <ul>{CREDITS.map((c) => <li key={c.what}><strong>{c.what}</strong><small>{c.who} · {c.license}</small></li>)}</ul>
    </details>
  )
}
