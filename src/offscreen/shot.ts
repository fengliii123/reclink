import { saveRecording as saveToLibrary } from '../media/store'

/**
 * 整屏截图：offscreen 内 getDisplayMedia 选源后抓单帧 → 入库 → SHOT_SAVED。
 * （chooseDesktopMedia 的 streamId 绑定请求上下文，无法跨文档传递给窗口，
 * 整屏画面类功能统一收口在 offscreen。）
 */
export async function shotScreen(): Promise<string> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'monitor' },
    audio: false,
  })
  const video = document.createElement('video')
  video.muted = true
  video.srcObject = stream
  await video.play()
  if (video.videoWidth === 0) {
    await new Promise<void>((r) => video.addEventListener('loadeddata', () => r(), { once: true }))
  }
  // 不能用 rAF：offscreen 文档永远 hidden，rAF 不会触发（会永久挂起）
  await new Promise<void>((r) => setTimeout(r, 60))
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')!.drawImage(video, 0, 0)
  for (const tr of stream.getTracks()) tr.stop()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('PNG encode failed')
  const id = await saveToLibrary({ mode: 'screenshot', createdAt: Date.now(), durationMs: 0, blob })
  await chrome.runtime.sendMessage({ type: 'SHOT_SAVED', recordingId: id }).catch(() => {})
  return id
}
