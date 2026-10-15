import { OFFSCREEN_URL } from '../shared/constants'

let creating: Promise<void> | null = null

export async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  })
  return contexts.length > 0
}

export async function ensureOffscreen(): Promise<void> {
  if (!(await hasOffscreenDocument())) {
    // 串行化并发创建，避免竞态下重复 createDocument 报错
    creating ??= chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.DISPLAY_MEDIA],
        justification: '录制屏幕/标签页/摄像头并保存视频',
      })
      .then(() => undefined)
    try {
      await creating
    } finally {
      creating = null
    }
  }
  await waitOffscreenReady()
}

/**
 * createDocument resolve 时 module 脚本可能尚未注册 onMessage 监听器，
 * 用 ping-pong 确认可接收消息（同时覆盖 SW 重启后文档已存在的场景）。
 */
async function waitOffscreenReady(timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const pong = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_PING' })
      if (pong?.ok) return
    } catch {
      // 尚无接收方
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('offscreen 文档未就绪')
}

export async function closeOffscreen(): Promise<void> {
  if (!(await hasOffscreenDocument())) return
  await chrome.offscreen.closeDocument()
}
