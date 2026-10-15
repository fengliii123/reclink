import { useEffect, useRef, useState } from 'react'
import { deleteRecording, getRecordingBlob, requestPersistentStorage } from '../media/store'
import { getMeta } from '../media/db'
import { recordingFilename } from '../shared/constants'
import { setupWindowSizeGuard } from '../shared/window-size'
import { openPopupWindow } from '../shared/windows'
import { formatBytes, formatDuration, formatTime, fixWebmDuration, modeLabel } from '../shared/format'
import { t } from '../shared/i18n'
import type { RecordingMeta } from '../shared/types'
import './complete.css'

/** 视频元数据加载后修复缺失的 duration（webm/fmp4 直录的通病） */
function useDurationFix(videoRef: React.RefObject<HTMLVideoElement | null>, src: string) {
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onLoaded = () => {
      fixWebmDuration(v)
      v.removeEventListener('loadedmetadata', onLoaded)
    }
    v.addEventListener('loadedmetadata', onLoaded)
    return () => v.removeEventListener('loadedmetadata', onLoaded)
  }, [src, videoRef])
}

export default function App() {
  const id = new URLSearchParams(location.search).get('id')
  const [meta, setMeta] = useState<RecordingMeta | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // macOS 上 type:popup 窗口尺寸可能被异步改回父窗大小；只保护创建初期，
  // 之后用户可自行拉大窗口看视频
  useEffect(() => setupWindowSizeGuard(560, 760, 10000), [])

  useEffect(() => {
    void requestPersistentStorage()
    if (!id) {
      setError(t('errMissingId'))
      return
    }
    void (async () => {
      try {
        const m = await getMeta(id)
        if (!m) {
          setError(t('errNotFound'))
          return
        }
        setMeta(m)
        const blob = await getRecordingBlob(id)
        setVideoUrl(URL.createObjectURL(blob))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [id])

  // 预览 URL 在替换/卸载时释放
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
    }
  }, [videoUrl])

  useDurationFix(videoRef, videoUrl ?? '')

  const isShot = meta?.mode === 'screenshot'
  const ext = meta?.mimeType.includes('png') ? 'png' : meta?.mimeType.includes('mp4') ? 'mp4' : 'webm'

  const download = async () => {
    if (!meta) return
    const raw = await getRecordingBlob(meta.id)
    // OPFS 文件不带 mime，下载时按元数据补上，避免文件类型丢失
    const blob = new Blob([raw], { type: meta.mimeType })
    const url = URL.createObjectURL(blob)
    await chrome.downloads.download({
      url,
      filename: recordingFilename(meta.mode, meta.createdAt, meta.mimeType),
      saveAs: false,
      conflictAction: 'uniquify',
    })
    setDownloaded(true)
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  /** 截图：复制 PNG 到系统剪贴板 */
  const copyImage = async () => {
    if (!meta) return
    const raw = await getRecordingBlob(meta.id)
    const blob = new Blob([raw], { type: 'image/png' })
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openLibrary = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/library/index.html') })
  }

  /** 截图条目：进入标注编辑器 */
  const openAnnotate = () => {
    if (!meta) return
    void openPopupWindow(`src/annotate/index.html?id=${meta.id}`, 1020, 720)
  }

  const remove = async () => {
    if (!meta) return
    // 两步确认：首次点击变为确认态，3 秒未确认自动复位（对齐竞品控制条交互）
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      setTimeout(() => setConfirmingDelete(false), 3000)
      return
    }
    await deleteRecording(meta.id)
    setDeleted(true)
  }

  return (
    <div className="page">
      <div className="card">
        <header>
          <span className="logo">
            <span className="logo-mark" />
            <span className="logo-name">reclink</span>
          </span>
          {error ? (
            <span className="done-badge error">! {t('doneError')}</span>
          ) : (
            <span className="done-badge">✓ {isShot ? t('doneShot') : t('doneRecord')}</span>
          )}
        </header>

        {error && (
          <div className="error-state">
            <p className="error">{error}</p>
            <p className="error-hint">{t('errHintNotFound')}</p>
            <button className="btn secondary" onClick={() => window.close()}>{t('close')}</button>
          </div>
        )}

        {deleted ? (
          <div className="deleted-state">
            <p>{t('deleted')}</p>
            <button className="btn secondary" onClick={openLibrary}>{t('openLibrary')}</button>
          </div>
        ) : meta && videoUrl ? (
          <>
            <div className="player">
              {isShot ? (
                <img src={videoUrl} alt="截图预览" />
              ) : (
                <video ref={videoRef} src={videoUrl} controls />
              )}
            </div>

            <div className="chips">
              <span className={`chip badge-${meta.mode}`}>{modeLabel(meta.mode)}</span>
              {!isShot && <span className="chip">{formatDuration(meta.durationMs)}</span>}
              <span className="chip">{formatBytes(meta.sizeBytes)}</span>
              <span className="chip">{formatTime(meta.createdAt)}</span>
              <span className="chip format">{ext.toUpperCase()}</span>
            </div>

            <div className="actions">
              {isShot && (
                <>
                  <button className="btn secondary" onClick={() => void copyImage()}>
                    {copied ? t('copied') : t('copy')}
                  </button>
                  <button className="btn secondary" onClick={openAnnotate}>
                    {t('annotate')}
                  </button>
                </>
              )}
              <button className="btn primary" onClick={() => void download()}>
                {downloaded ? t('downloadAgain') : `${t('download')} .${ext}`}
              </button>
              <button className="btn secondary" onClick={openLibrary}>{t('libraryLink')}</button>
              <button
                className={`btn ghost ${confirmingDelete ? 'danger' : ''}`}
                onClick={() => void remove()}
              >
                {confirmingDelete ? `${t('remove')} · ${t('recSure')}` : t('remove')}
              </button>
            </div>
            <p className="hint">{isShot ? t('hintShot') : t('hintVideo')}</p>
            <a
              className="rate-link"
              href={`https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`}
              target="_blank"
              rel="noreferrer"
            >
              ★★★★★ {t('ratePrompt')}
            </a>
          </>
        ) : !error ? (
          <div className="loading">{t('loading')}</div>
        ) : null}
      </div>
    </div>
  )
}
