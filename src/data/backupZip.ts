/**
 * 백업 ZIP을 한 항목씩 흘려 만든다 (fflate `Zip` + `ZipPassThrough`, 압축 없음 — JPEG는 더 줄지 않는다).
 * IndexedDB·DOM을 쓰지 않는다 (node --test가 직접 읽는다).
 *
 * 사진을 전부 메모리에 올린 뒤 한 번에 묶으면 한순간에 사진 전체 크기의 서너 배(읽은 사진 · 묶은 ZIP · 그 복사본 · Blob)를 들어,
 * 사진이 몇백 장이면 아이폰 사파리 탭이 죽어 백업을 만들지 못한다. 여기서는 항목을 하나 받을 때마다 나온 조각을 곧바로 Blob 조각으로 바꿔 두고
 * 마지막에 이어 붙인다 — JS 메모리에는 사진 한 장과 그 조각만 남는다 (Blob을 만들 때 바이트가 브라우저 쪽으로 옮겨지고, 이어 붙일 때는 다시 복사하지 않는다).
 */
import { Zip, ZipPassThrough } from 'fflate'

/** ZIP에 넣을 항목 하나 */
export interface ZipEntry {
  /** ZIP 안 경로 (`journal.json`, `photos/<기록id>.<판>.jpg`) */
  path: string
  bytes: Uint8Array<ArrayBuffer>
}

/**
 * 항목을 차례로 받아 ZIP 파일(Blob) 하나로 만든다. 항목은 하나씩 꺼내 쓰고 들고 있지 않는다.
 * 항목을 내주는 쪽이 던지거나(사진 읽기 실패 등) ZIP을 만들다 실패하면(경로가 너무 긴 경우 등) 그 오류로 거절된다 — 반쪽 파일을 주지 않는다.
 * 만든 파일은 크기를 미리 모르는 방식(항목 뒤에 크기를 적는 data descriptor)이라 fflate `unzip`과 보통의 압축 풀기 프로그램이 모두 읽는다.
 */
export async function zipToBlob(entries: AsyncIterable<ZipEntry>): Promise<Blob> {
  const parts: Blob[] = []
  let failure: unknown = null
  const zip = new Zip((err, chunk) => {
    if (err) failure ??= err
    // 조각은 곧바로 Blob으로 바꿔 둔다 — 배열로 모아 두면 사진 전체가 JS 메모리에 남는다
    else parts.push(new Blob([chunk]))
  })
  for await (const { path, bytes } of entries) {
    const file = new ZipPassThrough(path)
    zip.add(file)
    file.push(bytes, true)
    if (failure) throw failure
  }
  zip.end()
  if (failure) throw failure
  return new Blob(parts, { type: 'application/zip' })
}
