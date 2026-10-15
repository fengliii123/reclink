import { RECORDER_WINDOW_SIZE } from '../shared/constants'
import { t } from '../shared/i18n'
import { setupWindowSizeGuard } from '../shared/window-size'

/**
 * camera 一次性授权窗（chrome.windows.create type:popup）：
 * offscreen 文档无法弹 getUserMedia 权限提示，首次使用摄像头时由本窗口
 * 承载授权；授权成功立即释放设备并自关，正式录制在 offscreen 内静默取流。
 */
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const prepareEl = $('prepare')
const prepareTitle = $('prepare-title')
const prepareHint = $('prepare-hint')
const spinnerEl = $('spinner')
const errorEl = $('error-view')
const errorTitle = $('error-title')
const errorDetail = $('error-detail')
const errorGuide = $('error-guide')
const retryBtn = $('retry')

function show(which: 'prepare' | 'error'): void {
  prepareEl.hidden = which !== 'prepare'
  errorEl.hidden = which !== 'error'
}

function showError(titleKey: string, detail: string, guide = false): void {
  spinnerEl.hidden = true
  errorTitle.textContent = t(titleKey)
  errorDetail.textContent = detail
  errorGuide.hidden = !guide
  if (guide) {
    errorGuide.innerHTML = `${t('rwCamGuide1')}<br>${t('rwCamGuide2')}`
  }
  show('error')
}

async function requestAuth(): Promise<void> {
  show('prepare')
  $('mark').hidden = true
  spinnerEl.hidden = false
  prepareTitle.textContent = t('rwPreparing')
  prepareHint.textContent = t('rwCamRequesting')
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    // 仅授权：立即释放设备并关闭窗口，正式录制走 offscreen
    for (const tr of stream.getTracks()) tr.stop()
    await chrome.runtime.sendMessage({ type: 'CAMERA_AUTHED' }).catch(() => {})
    window.close()
  } catch (e) {
    const name = e instanceof DOMException ? e.name : ''
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      showError('rwNoCamera', t('rwNoCameraHint'))
    } else {
      showError('rwCamDenied', t('rwCamDeniedHint'), true)
    }
  }
}

document.title = t('rwTitle')
retryBtn.textContent = t('pickerReset')

setupWindowSizeGuard(RECORDER_WINDOW_SIZE.camera.width, RECORDER_WINDOW_SIZE.camera.height)

void requestAuth()
