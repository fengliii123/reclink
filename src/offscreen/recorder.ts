import { RECORDER_TIMESLICE_MS } from '../shared/constants'
import { saveRecording } from '../media/store'
import { RECORD_CANCELLED, type OffscreenStartMsg, type RecordingFormat } from '../shared/messages'
import type { RecordingMode } from '../shared/types'
import { buildStream, type AssembledStream } from './streams'

let recorder: MediaRecorder | null = null
let assembled: AssembledStream | null = null
let chunks: Blob[] = []
let startedAt = 0
let pausedMs = 0
let pauseStartedAt: number | null = null
let mode: RecordingMode = 'camera'
let discardNext = false

const FORMAT_CANDIDATES: Record<RecordingFormat, string[]> = {
  mp4: ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'video/mp4'],
  webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
}

function pickMimeType(format: RecordingFormat): string {
  // 优先请求的格式；Chrome 126+ 支持 MP4 直录，不支持时回退另一种
  const primary = format === 'mp4' ? FORMAT_CANDIDATES.mp4 : FORMAT_CANDIDATES.webm
  const fallback = format === 'mp4' ? FORMAT_CANDIDATES.webm : FORMAT_CANDIDATES.mp4
  return (
    primary.find((c) => MediaRecorder.isTypeSupported(c))
    ?? fallback.find((c) => MediaRecorder.isTypeSupported(c))
    ?? ''
  )
}

/** 倒计时等待期间可被 COUNTDOWN_CANCEL 消息打断 */
function waitCancelable(ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(onCancel)
      resolve(false)
    }, ms)
    const onCancel = (m: { type?: string }) => {
      if (m?.type === 'COUNTDOWN_CANCEL') {
        clearTimeout(timer)
        chrome.runtime.onMessage.removeListener(onCancel)
        resolve(true)
      }
    }
    chrome.runtime.onMessage.addListener(onCancel)
  })
}

function releaseAssembled(): void {
  assembled?.cleanup()
  for (const s of assembled?.ownedStreams ?? []) {
    for (const t of s.getTracks()) t.stop()
  }
  assembled = null
}

export async function startRecorder(msg: OffscreenStartMsg): Promise<void> {
  if (recorder) throw new Error('录制已在进行中')
  assembled = await buildStream(msg)
  mode = msg.mode
  // 取流成功后先在目标页控制条上倒计时，再正式开录（对齐 Awesome Screenshot 交互）
  if (msg.countdownMs && msg.countdownMs > 0) {
    const seconds = Math.ceil(msg.countdownMs / 1000)
    if (msg.targetTabId != null) {
      await chrome.runtime
        .sendMessage({ type: 'OFFSCREEN_COUNTDOWN', targetTabId: msg.targetTabId, seconds })
        .catch(() => {})
    }
    const cancelled = await waitCancelable(msg.countdownMs)
    if (cancelled) {
      releaseAssembled()
      throw new Error(RECORD_CANCELLED)
    }
  }
  const mimeType = pickMimeType(msg.format)
  recorder = new MediaRecorder(assembled.stream, mimeType ? { mimeType } : undefined)
  chunks = []
  startedAt = Date.now()
  pausedMs = 0
  pauseStartedAt = null
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  recorder.onstop = finish
  recorder.onerror = (e) => {
    console.error('[reclink] MediaRecorder error:', e)
    // 录制器异常时尽量保存已录内容
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }
  // 视频轨意外结束（如被录制的标签页被关闭）时自动收尾
  assembled.stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  })
  recorder.start(RECORDER_TIMESLICE_MS)
  // 真正开录后才上报状态：screen 选源器可能停留任意久，期间 SW 可能被回收，
  // 由本消息重建录制状态（SW 侧 confirmRecordingStarted 幂等）
  void chrome.runtime
    .sendMessage({
      type: 'RECORDING_STARTED',
      mode: msg.mode,
      targetTabId: msg.targetTabId ?? null,
      micEnabled: msg.micEnabled,
      cameraEnabled: msg.cameraEnabled === true,
    })
    .catch(() => {})
}

export function controlRecorder(
  action: 'pause' | 'resume' | 'stop' | 'delete' | 'camera-on' | 'camera-off' | 'mic-on' | 'mic-off',
): void {
  if (action === 'camera-on' || action === 'camera-off') {
    // tab/screen 固定走合成管线，人像开关只是绘制层变化
    if (!assembled?.compositor) return
    if (action === 'camera-on') {
      void assembled.compositor
        .enableCamera()
        .then((cam) => assembled?.ownedStreams.push(cam))
        .catch((e) => console.warn('[reclink] enable camera failed:', e))
    } else {
      assembled.compositor.disableCamera()
    }
    return
  }
  if (action === 'mic-on' || action === 'mic-off') {
    // 录制中静音/恢复：只对已存在的麦克风轨有效（开录未开麦则无轨可开）
    if (assembled?.micTrack) assembled.micTrack.enabled = action === 'mic-on'
    return
  }
  if (!recorder) return
  if (action === 'pause' && recorder.state === 'recording') {
    recorder.pause()
    pauseStartedAt = Date.now()
  } else if (action === 'resume' && recorder.state === 'paused' && pauseStartedAt != null) {
    recorder.resume()
    pausedMs += Date.now() - pauseStartedAt
    pauseStartedAt = null
  } else if (action === 'stop' && recorder.state !== 'inactive') {
    recorder.stop()
  } else if (action === 'delete' && recorder.state !== 'inactive') {
    discardNext = true
    recorder.stop()
  }
}

async function finish(): Promise<void> {
  if (discardNext) {
    discardNext = false
    // 丢弃：释放资源，不保存
    assembled?.cleanup()
    for (const s of assembled?.ownedStreams ?? []) {
      for (const t of s.getTracks()) t.stop()
    }
    assembled = null
    recorder = null
    chunks = []
    void chrome.runtime.sendMessage({ type: 'OFFSCREEN_DISCARDED' })
    return
  }
  const mimeType = recorder?.mimeType || 'video/webm'
  const sizeBytes = chunks.reduce((sum, c) => sum + c.size, 0)
  const durationMs = Date.now() - startedAt - pausedMs
  const blob = new Blob(chunks, { type: mimeType })
  const startedAtCopy = startedAt
  const modeCopy = mode

  // 释放所有捕获资源（恢复标签页声音、麦克风、摄像头指示灯）
  assembled?.cleanup()
  for (const s of assembled?.ownedStreams ?? []) {
    for (const t of s.getTracks()) t.stop()
  }
  assembled = null
  recorder = null
  chunks = []

  // 入录制库（OPFS）；成功后由完成页承接预览/手动下载，宿主页面可立即关闭
  let recordingId: string | undefined
  try {
    recordingId = await saveRecording({
      mode: modeCopy,
      createdAt: startedAtCopy,
      durationMs,
      blob,
    })
  } catch (e) {
    console.warn('[reclink] library save failed:', e)
  }

  void chrome.runtime.sendMessage({
    type: 'OFFSCREEN_STOPPED',
    // 入库失败时才附带 blobUrl（回退自动下载）。它归属 offscreen 文档，
    // SW 侧无法跨文档 revoke；下载完成后宿主随即关闭，blob 随之释放
    blobUrl: recordingId ? undefined : URL.createObjectURL(blob),
    sizeBytes,
    durationMs,
    mimeType,
    mode: modeCopy,
    startedAt: startedAtCopy,
    recordingId,
  })
}
