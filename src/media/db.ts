import type { RecordingMeta } from '../shared/types'

const DB_NAME = 'reclink'
const STORE = 'recordings'
const DIR = 'recordings'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putMeta(meta: RecordingMeta): Promise<void> {
  const db = await openDb()
  await tx(db, 'readwrite', (s) => s.put(meta))
  db.close()
}

export async function listMetas(): Promise<RecordingMeta[]> {
  const db = await openDb()
  const all = await tx<RecordingMeta[]>(db, 'readonly', (s) => s.getAll())
  db.close()
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getMeta(id: string): Promise<RecordingMeta | undefined> {
  const db = await openDb()
  const meta = await tx<RecordingMeta | undefined>(db, 'readonly', (s) => s.get(id))
  db.close()
  return meta
}

export async function deleteMeta(id: string): Promise<void> {
  const db = await openDb()
  await tx(db, 'readwrite', (s) => s.delete(id))
  db.close()
}

async function recordingsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(DIR, { create: true })
}

export async function writeBlob(id: string, blob: Blob): Promise<void> {
  const dir = await recordingsDir()
  const handle = await dir.getFileHandle(`${id}.webm`, { create: true })
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

export async function readBlob(id: string): Promise<Blob> {
  const dir = await recordingsDir()
  const handle = await dir.getFileHandle(`${id}.webm`)
  const file = await handle.getFile()
  return file
}

export async function deleteBlob(id: string): Promise<void> {
  try {
    const dir = await recordingsDir()
    await dir.removeEntry(`${id}.webm`)
  } catch {
    // 文件不存在时静默
  }
}
