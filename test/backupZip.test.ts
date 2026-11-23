import test from 'node:test'
import assert from 'node:assert/strict'
import { unzip, unzipSync, type Unzipped } from 'fflate'
import { zipToBlob, type ZipEntry } from '../src/data/backupZip.ts'

/** 항목들을 하나씩 내준다 (내보내기가 사진을 하나씩 읽어 내주는 것처럼) */
async function* entriesOf(list: ZipEntry[]): AsyncGenerator<ZipEntry> {
  for (const e of list) yield e
}

/** 가짜 사진 바이트 — 실제 JPEG일 필요는 없다 (압축하지 않고 그대로 넣는다) */
const bytes = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) % 256)

test('zipToBlob: 흘려 만든 ZIP을 불러오기와 같은 fflate unzip이 그대로 다시 읽는다 (경로·바이트가 같다)', async () => {
  const journal = new TextEncoder().encode(JSON.stringify({ format: 'bird-journal-backup', sightings: [{ id: 'a' }] }))
  const list: ZipEntry[] = [
    { path: 'journal.json', bytes: journal },
    { path: 'photos/a.full.jpg', bytes: bytes(70_000, 1) },
    { path: 'photos/a.thumb.jpg', bytes: bytes(5_000, 2) },
    { path: 'photos/한글-id.crop.jpg', bytes: bytes(0, 3) },
  ]
  const blob = await zipToBlob(entriesOf(list))
  assert.equal(blob.type, 'application/zip')
  const data = new Uint8Array(await blob.arrayBuffer())
  // 불러오기(backup.ts importBackup)는 콜백판 unzip을 쓴다 — 같은 것으로 읽는다
  const out = await new Promise<Unzipped>((resolve, reject) => unzip(data, (err, r) => (err ? reject(err) : resolve(r))))
  assert.deepEqual(Object.keys(out).sort(), list.map((e) => e.path).sort())
  for (const e of list) assert.deepEqual(out[e.path], e.bytes, e.path)
  // 압축하지 않는다 — 크기가 내용의 합보다 조금만 크다 (머리말·목록)
  assert.ok(data.length < list.reduce((n, e) => n + e.bytes.length, 0) + 1_000)
})

test('zipToBlob: 항목을 내주다 실패하면(사진 읽기 실패) 그 오류로 거절한다 — 반쪽 파일을 주지 않는다', async () => {
  async function* broken(): AsyncGenerator<ZipEntry> {
    yield { path: 'journal.json', bytes: bytes(10, 0) }
    throw new Error('사진을 읽지 못했습니다')
  }
  await assert.rejects(zipToBlob(broken()), /사진을 읽지 못했습니다/)
})

test('zipToBlob: 항목이 journal.json 하나뿐이어도(사진 없는 기록만) 열리는 ZIP이다', async () => {
  const blob = await zipToBlob(entriesOf([{ path: 'journal.json', bytes: bytes(3, 9) }]))
  assert.deepEqual(Object.keys(unzipSync(new Uint8Array(await blob.arrayBuffer()))), ['journal.json'])
})
