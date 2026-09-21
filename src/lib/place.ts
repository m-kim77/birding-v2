/**
 * 좌표 → 장소 이름. `/api/place`(Vercel 함수)를 거친다 — 이유는 그 파일 머리말 참고.
 * **실패해도 던지지 않고 빈 문자열을 준다.** 장소 이름이 없어도 기록은 저장돼야 한다.
 * 좌표를 소수 4자리(≈11m)로 뭉개서 부른다 — 같은 자리의 요청이 같은 주소가 되어 캐시에 걸린다.
 */
export async function lookupPlace(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`/api/place?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`)
    if (!res.ok) return ''
    return String(((await res.json()) as { place?: string }).place ?? '')
  } catch {
    return ''
  }
}

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
