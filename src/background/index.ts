import type { BroadcastMessage, FromOffscreenMessage, ToBackgroundMessage } from '../shared/messages'
import {
  confirmRecordingStarted,
  discardRecording,
  getState,
  handleCameraAuthed,
  handleCountdownCancel,
  handleOffscreenCountdown,
  handleOffscreenDiscarded,
  handleOffscreenStopped,
  handleRegionSelected,
  handleScreenPick,
  openRecorderWindow,
  pauseRecording,
  recoverState,
  resumeRecording,
  startRegionSelection,
  startRecording,
  stopRecording,
  toggleCamera,
  toggleMic,
} from './orchestration'
import {
  handleCaptureVisible,
  handleDelayedVisibleShot,
  handleFullPageShot,
  handleShotSaved,
} from './screenshots'

void recoverState()

/** 快捷键：Ctrl+Shift+S 截取当前标签页可视区域 */
chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture_visible') void handleCaptureVisible()
})

chrome.runtime.onMessage.addListener(
  (msg: ToBackgroundMessage | FromOffscreenMessage | BroadcastMessage, sender, sendResponse) => {
    switch (msg?.type) {
      case 'GET_STATE':
        getState().then(sendResponse)
        return true
      case 'START_RECORDING':
        startRecording(msg).then(sendResponse)
        return true
      case 'RECORDING_STARTED':
        confirmRecordingStarted(msg).then(() => sendResponse({ ok: true }))
        return true
      // CONTROL_* 均为 fire-and-forget：调用方（控制条/popup）不等待响应，
      // 状态变化通过 STATE_CHANGED 广播回传，故不 sendResponse
      case 'CONTROL_PAUSE':
        pauseRecording()
        return false
      case 'CONTROL_RESUME':
        resumeRecording()
        return false
      case 'CONTROL_STOP':
        stopRecording()
        return false
      case 'CONTROL_DELETE':
        discardRecording()
        return false
      case 'CONTROL_CAMERA_ON':
        void toggleCamera(true)
        return false
      case 'CONTROL_CAMERA_OFF':
        void toggleCamera(false)
        return false
      case 'CONTROL_MIC_ON':
        void toggleMic(true)
        return false
      case 'CONTROL_MIC_OFF':
        void toggleMic(false)
        return false
      case 'START_REGION':
        void startRegionSelection(msg)
        return false
      case 'OPEN_RECORDER_WINDOW':
        openRecorderWindow(msg).then(sendResponse)
        return true
      case 'START_SCREEN_PICK':
        handleScreenPick(msg)
        return false
      case 'CAPTURE_VISIBLE':
        handleCaptureVisible().then(sendResponse)
        return true
      case 'FULLPAGE_SHOT':
        void handleFullPageShot()
        return false
      case 'DELAYED_VISIBLE_SHOT':
        handleDelayedVisibleShot(msg)
        return false
      case 'OCR_VISIBLE':
        void handleCaptureVisible({ ocr: true })
        return false
      case 'REGION_SELECTED':
        void handleRegionSelected(msg, sender.tab?.id ?? null)
        return false
      case 'OFFSCREEN_STOPPED':
        handleOffscreenStopped(msg)
        return false
      case 'OFFSCREEN_DISCARDED':
        handleOffscreenDiscarded()
        return false
      case 'OFFSCREEN_COUNTDOWN':
        void handleOffscreenCountdown(msg)
        return false
      case 'COUNTDOWN_CANCEL':
        handleCountdownCancel()
        return false
      case 'COUNTDOWN_SEEN':
        console.log('[reclink] countdown seen by control bar')
        void chrome.storage.session.set({ 'reclink:cdSeen': Date.now() })
        return false
      case 'CAMERA_AUTHED':
        void handleCameraAuthed()
        return false
      case 'SHOT_SAVED':
        void handleShotSaved(msg)
        return false
    }
    return false
  },
)

console.log('[reclink] service worker ready')
