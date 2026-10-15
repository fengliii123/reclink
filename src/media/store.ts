import type { LibraryMode } from '../shared/types'
import { deleteBlob, deleteMeta, listMetas, putMeta, readBlob, writeBlob } from './db'

export interface NewRecording {
  mode: LibraryMode
  createdAt: number
  durationMs: number
  blob: Blob
}

export async function saveRecording(rec: NewRecording): Promise<string> {
  const id = crypto.randomUUID()
  await writeBlob(id, rec.blob)
  await putMeta({
    id,
    mode: rec.mode,
    createdAt: rec.createdAt,
    durationMs: rec.durationMs,
    sizeBytes: rec.blob.size,
    mimeType: rec.blob.type || 'video/webm',
  })
  return id
}

export async function listRecordings() {
  return listMetas()
}

export async function getRecordingBlob(id: string): Promise<Blob> {
  return readBlob(id)
}

export async function deleteRecording(id: string): Promise<void> {
  await deleteBlob(id)
  await deleteMeta(id)
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

export async function storageUsage(): Promise<{ usage: number; quota: number }> {
  const est = await navigator.storage.estimate()
  return { usage: est.usage ?? 0, quota: est.quota ?? 0 }
}
