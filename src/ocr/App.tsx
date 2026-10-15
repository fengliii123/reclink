import { useEffect, useRef, useState } from 'react'
import { createWorker } from 'tesseract.js'
import { getRecordingBlob } from '../media/store'
import { getMeta } from '../media/db'
import { t } from '../shared/i18n'

/**
 * 文本识别（OCR）：region-picker 选区截图后由 SW 打开本页。
 * tesseract 的 worker / wasm core / 语言包全部为扩展内置静态资源（public/vendor），
 * workerBlobURL 必须关闭 —— MV3 扩展页 CSP 不允许 blob: worker。
 */
export default function App() {
  const id = new URLSearchParams(location.search).get('id')
  const [status, setStatus] = useState(t('ocrInit'))
  const [progress, setProgress] = useState(0)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const terminated = useRef(false)

  useEffect(() => {
    terminated.current = false
    void (async () => {
      try {
        if (!id) throw new Error(t('ocrMissingId'))
        const meta = await getMeta(id)
        if (!meta) throw new Error(t('ocrNotFound'))
        const blob = await getRecordingBlob(id)
        setImgUrl(URL.createObjectURL(blob))

        setStatus(t('ocrLoad'))
        const worker = await createWorker(['chi_sim', 'eng'], 1, {
          workerPath: chrome.runtime.getURL('vendor/tesseract/worker.min.js'),
          corePath: chrome.runtime.getURL('vendor/tesseract/'),
          langPath: chrome.runtime.getURL('vendor/tessdata/'),
          // 本地语言包是非 gz 的 .traineddata；默认 gzip:true 会去拉 .traineddata.gz
          gzip: false,
          workerBlobURL: false,
          logger: (m: { status: string; progress: number }) => {
            if (terminated.current) return
            if (m.status) setStatus(m.status === 'recognizing text' ? t('ocrRecognizing') : m.status)
            if (typeof m.progress === 'number') setProgress(Math.round(m.progress * 100))
          },
        })
        try {
          const { data } = await worker.recognize(blob)
          if (terminated.current) return
          setText(data.text ?? '')
        } finally {
          terminated.current = true
          await worker.terminate()
        }
      } catch (e) {
        if (!terminated.current) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      terminated.current = true
    }
  }, [id])

  const copy = async () => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const download = () => {
    if (!text) return
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    void chrome.downloads.download({ url, filename: 'reclink/ocr-text.txt', conflictAction: 'uniquify' })
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <div className="ocr-page">
      <header>
        <span className="logo">
          <span className="logo-mark" />
          <span className="logo-name">reclink</span>
        </span>
        <span className="title">{t('ocrTitle')}</span>
      </header>

      {imgUrl && (
        <div className="thumb">
          <img src={imgUrl} alt="识别源图" />
        </div>
      )}

      {error ? (
        <div className="panel error">{error}</div>
      ) : text == null ? (
        <div className="panel status">
          <p>{status}</p>
          <div className="progress">
            <div className="bar" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <>
          <div className="panel result">
            <textarea readOnly value={text} placeholder={t('ocrEmpty')} />
          </div>
          <footer className="actions">
            <span className="len">{text.trim().length} {t('ocrChars')}</span>
            <button className="btn ghost" onClick={() => window.close()}>
              {t('close')}
            </button>
            <button className="btn secondary" onClick={download}>
              {t('ocrSaveTxt')}
            </button>
            <button className="btn primary" onClick={() => void copy()}>
              {copied ? t('copied') : t('ocrCopy')}
            </button>
          </footer>
        </>
      )}
    </div>
  )
}
