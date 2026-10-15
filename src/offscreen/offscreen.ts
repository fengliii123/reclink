import type { ToOffscreenMessage } from '../shared/messages'
import { controlRecorder, startRecorder } from './recorder'
import { shotScreen } from './shot'

chrome.runtime.onMessage.addListener((msg: ToOffscreenMessage, _sender, sendResponse) => {
  switch (msg?.type) {
    case 'OFFSCREEN_PING':
      // 监听器注册即视为就绪：SW 用 ping-pong 等待本文档可接收消息
      sendResponse({ ok: true })
      return false
    case 'OFFSCREEN_SHOT':
      shotScreen().then(
        (recordingId) => sendResponse({ ok: true, recordingId }),
        (e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      )
      return true
    case 'OFFSCREEN_START':
      startRecorder(msg).then(
        () => sendResponse({ ok: true }),
        (e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      )
      return true
    case 'OFFSCREEN_CONTROL':
      // stop 的结果通过 OFFSCREEN_STOPPED 异步通知，这里只确认收到
      try {
        controlRecorder(msg.action)
        sendResponse({ ok: true })
      } catch (e) {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
      }
      return false
  }
  return false
})

console.log('[reclink] offscreen document ready')
