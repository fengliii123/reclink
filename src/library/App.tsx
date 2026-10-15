import { useCallback, useEffect, useState } from 'react'
import {
  deleteRecording,
  getRecordingBlob,
  listRecordings,
  requestPersistentStorage,
  storageUsage,
} from '../media/store'
import type { RecordingMeta } from '../shared/types'
import { recordingFilename } from '../shared/constants'
import { formatBytes, formatDuration, formatTime, fixWebmDuration, modeLabel } from '../shared/format'
import { t } from '../shared/i18n'
import { openPopupWindow } from '../shared/windows'
import './library.css'

export default function App() {
  const [items, setItems] = useState<RecordingMeta[]>([])
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setItems(await listRecordings())
    setUsage(await storageUsage())
  }, [])

  useEffect(() => {
    void requestPersistentStorage()
    void refresh()
  }, [refresh])

  const openPreview = async (id: string) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    if (previewId === id) {
      setPreviewId(null)
      setPreviewUrl(null)
      return
    }
    const blob = await getRecordingBlob(id)
    setPreviewId(id)
    setPreviewUrl(URL.createObjectURL(blob))
  }

  const openAnnotate = (id: string) => openPopupWindow(`src/annotate/index.html?id=${id}`, 1020, 720)

  const download = async (item: RecordingMeta) => {
    const raw = await getRecordingBlob(item.id)
    // OPFS 文件不带 mime，下载时按元数据补上
    const blob = new Blob([raw], { type: item.mimeType })
    const url = URL.createObjectURL(blob)
    await chrome.downloads.download({
      url,
      filename: recordingFilename(item.mode, item.createdAt, item.mimeType),
      conflictAction: 'uniquify',
    })
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const remove = async (id: string) => {
    await deleteRecording(id)
    if (previewId === id) {
      setPreviewId(null)
      setPreviewUrl(null)
    }
    await refresh()
  }

  return (
    <div className="page">
      <header>
        <h1>{t('libTitle')}</h1>
        {usage && (
          <span className="usage">
            {t('usageUsed')} {formatBytes(usage.usage)} / {t('usageQuota')} {formatBytes(usage.quota)}
          </span>
        )}
      </header>

      {items.length === 0 ? (
        <p className="empty">{t('libEmpty')}</p>
      ) : (
        <ul className="list">
          {items.map((item) => (
            <li key={item.id} className="item">
              <div className="meta">
                <span className={`badge ${item.mode}`}>{modeLabel(item.mode)}</span>
                <span className="time">{formatTime(item.createdAt, true)}</span>
                <span className="detail">
                  {item.mode === 'screenshot' ? formatBytes(item.sizeBytes) : `${formatDuration(item.durationMs)} · ${formatBytes(item.sizeBytes)}`}
                </span>
              </div>
              <div className="actions">
                <button onClick={() => void openPreview(item.id)}>
                  {previewId === item.id ? t('collapse') : t('preview')}
                </button>
                {item.mode === 'screenshot' && (
                  <button onClick={() => void openAnnotate(item.id)}>{t('annotate')}</button>
                )}
                <button onClick={() => void download(item)}>{t('download')}</button>
                <button className="danger" onClick={() => void remove(item.id)}>{t('remove')}</button>
              </div>
              {previewId === item.id && previewUrl && (
                item.mode === 'screenshot' ? (
                  <img className="preview shot" src={previewUrl} alt="截图预览" />
                ) : (
                  <video
                    className="preview"
                    src={previewUrl}
                    controls
                    ref={(v) => v && fixWebmDuration(v)}
                  />
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
