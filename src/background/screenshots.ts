/**
 * 静态截图域：可见区域 / 选定区域 / 整页拼接 / 延迟 / OCR 落库与结果窗口。
 * 录制（tab/screen/camera）相关编排仍在 orchestration.ts。
 */
import { saveRecording as saveToLibrary } from '../media/store'
import type { CropRect, FromOffscreenMessage, ToBackgroundMessage } from '../shared/messages'
import { t } from '../shared/i18n'
import { openPopupWindow } from '../shared/windows'

type Extractable<T extends { type: string }, K extends string> = Extract<T, { type: K }>

/** 打开完成页小窗（录制完成 / 截图完成共用） */
export async function openCompleteWindow(recordingId: string): Promise<void> {
  await openPopupWindow(`src/complete/index.html?id=${recordingId}`, 560, 760)
}

/** 打开文本识别页小窗 */
export function openOcrWindow(recordingId: string): Promise<chrome.windows.Window | null> {
  return openPopupWindow(`src/ocr/index.html?id=${recordingId}`, 640, 780)
}

/** dataUrl PNG（可选裁剪，crop 为视口 CSS px）→ 入库，返回记录 id */
export async function savePngShot(dataUrl: string, crop?: CropRect, viewportWidth?: number): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob()
  let out = blob
  if (crop && viewportWidth) {
    const bmp = await createImageBitmap(blob)
    const scale = bmp.width / viewportWidth
    const canvas = new OffscreenCanvas(Math.round(crop.width * scale), Math.round(crop.height * scale))
    canvas.getContext('2d')!.drawImage(
      bmp,
      crop.x * scale, crop.y * scale, crop.width * scale, crop.height * scale,
      0, 0, canvas.width, canvas.height,
    )
    out = await canvas.convertToBlob({ type: 'image/png' })
    bmp.close()
  }
  return saveToLibrary({ mode: 'screenshot', createdAt: Date.now(), durationMs: 0, blob: out })
}

/** 截取活动标签页可见区域 → 入库 → 完成页（或 OCR 页） */
export async function handleCaptureVisible(opts?: { ocr?: boolean }): Promise<{ ok: boolean; error?: string; recordingId?: string }> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' })
    const id = await savePngShot(dataUrl)
    if (opts?.ocr) {
      await openOcrWindow(id)
    } else {
      await openCompleteWindow(id)
      chrome.runtime.sendMessage({ type: 'SAVE_COMPLETE', ok: true, recordingId: id }).catch(() => {})
    }
    return { ok: true, recordingId: id }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    if (!opts?.ocr) chrome.runtime.sendMessage({ type: 'SAVE_COMPLETE', ok: false, error }).catch(() => {})
    return { ok: false, error }
  }
}

/** recorder-window 截图模式 / popup 导入图片 / 标注保存：静态图已入库 → 打开完成页 */
export async function handleShotSaved(
  msg: Extractable<FromOffscreenMessage | ToBackgroundMessage, 'SHOT_SAVED'>,
): Promise<void> {
  await openCompleteWindow(msg.recordingId)
}

/** 延迟截取可视区域：popup 关闭后倒计时，到点执行可见区截图 */
export function handleDelayedVisibleShot(
  msg: Extractable<ToBackgroundMessage, 'DELAYED_VISIBLE_SHOT'>,
): void {
  const delay = msg.delayMs ?? 3000
  setTimeout(() => void handleCaptureVisible(), delay)
}

/** 整页截图：注入 page-shot 控制器，滚动步进 + 逐帧捕获 + 绝对定位拼接 */
export async function handleFullPageShot(): Promise<void> {
  let tabId: number | null = null
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    if (!tab?.id || !/^https?:/.test(tab.url ?? '')) throw new Error(t('errFullpageUnsupported'))
    tabId = tab.id
    const js = chrome.runtime.getManifest().content_scripts?.[2]?.js?.[0]
    if (!js) throw new Error(t('errShotScriptMissing'))
    await chrome.scripting.executeScript({ target: { tabId }, files: [js] })
    const begin = await chrome.tabs.sendMessage(tabId, { type: 'PAGE_SHOT_BEGIN' })
    if (!begin?.totalH) throw new Error(t('errPageHeight'))
    const vh = begin.viewportH as number
    const totalH = Math.min(begin.totalH as number, vh * 50)
    const steps = Math.ceil(totalH / vh)
    const windowId = tab.windowId

    // 增量拼接：逐帧捕获后立即绘制并 close，避免长页面几十帧 ImageBitmap
    // 全部驻留内存（50 屏 4K 可能数百 MB）
    let canvas: OffscreenCanvas | null = null
    let ctx: OffscreenCanvasRenderingContext2D | null = null
    let scaleH = 1
    // captureVisibleTab 有每秒 2 次的配额，逐步拼接必须节流 + 超限重试
    let lastCapture = 0
    const throttledCapture = async (): Promise<string> => {
      for (let attempt = 0; ; attempt++) {
        const wait = lastCapture + 650 - Date.now()
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
        try {
          const url = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
          lastCapture = Date.now()
          return url
        } catch (e) {
          if (attempt >= 2) throw e
          await new Promise((r) => setTimeout(r, 800))
        }
      }
    }
    for (let i = 0; i < steps; i++) {
      const resp = await chrome.tabs.sendMessage(tabId, { type: 'PAGE_SHOT_STEP', index: i })
      const dataUrl = await throttledCapture()
      const blob = await (await fetch(dataUrl)).blob()
      const bmp = await createImageBitmap(blob)
      if (!canvas) {
        scaleH = bmp.height / vh
        canvas = new OffscreenCanvas(bmp.width, Math.round(totalH * scaleH))
        ctx = canvas.getContext('2d')!
      }
      const drawH = Math.min(Math.round((resp?.needed ?? vh) * scaleH), bmp.height)
      const actualY = resp?.actualY ?? i * vh
      ctx!.drawImage(bmp, 0, 0, bmp.width, drawH, 0, Math.round(actualY * scaleH), bmp.width, drawH)
      bmp.close()
    }
    const out = await canvas!.convertToBlob({ type: 'image/png' })
    const id = await saveToLibrary({ mode: 'screenshot', createdAt: Date.now(), durationMs: 0, blob: out })
    await openCompleteWindow(id)
    chrome.runtime.sendMessage({ type: 'SAVE_COMPLETE', ok: true, recordingId: id }).catch(() => {})
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    chrome.runtime.sendMessage({ type: 'SAVE_COMPLETE', ok: false, error }).catch(() => {})
  } finally {
    if (tabId != null) chrome.tabs.sendMessage(tabId, { type: 'PAGE_SHOT_END' }).catch(() => {})
  }
}
