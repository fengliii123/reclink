import { recordingFilename } from '../shared/constants'
import { t } from '../shared/i18n'
import type { OffscreenStoppedMsg } from '../shared/messages'

/**
 * 用 offscreen document 创建的 blob URL 发起下载，并等待下载落盘。
 * 返回前必须保持 offscreen document 存活（blob URL 归属于它）。
 */
export async function saveRecording(msg: OffscreenStoppedMsg): Promise<void> {
  if (!msg.blobUrl) throw new Error('缺少下载数据')
  const filename = recordingFilename(msg.mode, msg.startedAt, msg.mimeType)

  let downloadId: number | undefined
  let settle: (result: 'complete' | 'interrupted') => void
  const settled = new Promise<'complete' | 'interrupted'>((resolve) => {
    settle = resolve
  })
  const listener = (delta: chrome.downloads.DownloadDelta) => {
    if (delta.id !== downloadId || !delta.state) return
    if (delta.state.current === 'in_progress') return
    chrome.downloads.onChanged.removeListener(listener)
    settle(delta.state.current as 'complete' | 'interrupted')
  }
  chrome.downloads.onChanged.addListener(listener)

  try {
    downloadId = await chrome.downloads.download({
      url: msg.blobUrl,
      filename,
      saveAs: false,
      conflictAction: 'uniquify',
    })
  } catch (e) {
    chrome.downloads.onChanged.removeListener(listener)
    throw e
  }

  const result = await settled
  if (result === 'interrupted') {
    throw new Error(t('errDownloadInterrupted'))
  }
}
