/**
 * 区域录制选区器：注入到目标标签页，全屏遮罩 + 拖拽选区 + 确认工具条。
 * 确认后向 SW 发送 REGION_SELECTED，由其以 tab 模式 + crop 启动录制。
 */
import { t } from '../../shared/i18n'
import { pickerStyles } from './styles'

const HOST_ID = 'reclink-region-picker'

interface Selection {
  x: number
  y: number
  width: number
  height: number
}

function mount(): void {
  if (document.getElementById(HOST_ID)) return
  const host = document.createElement('div')
  host.id = HOST_ID
  const shadow = host.attachShadow({ mode: 'open' })

  let purpose: 'record' | 'shot' | 'ocr' = 'record'

  shadow.innerHTML = `
    <style>${pickerStyles}</style>
    <div class="overlay" part="overlay">
      <div class="crosshair-tip">${t('pickerTip', t('pickerVerb_record'))}</div>
      <div class="rect" hidden>
        <span class="size"></span>
      </div>
      <div class="toolbar" hidden>
        <button class="btn primary confirm">${t('pickerConfirm_record')}</button>
        <button class="btn reset">${t('pickerReset')}</button>
        <button class="btn ghost cancel">${t('pickerCancel')}</button>
      </div>
    </div>
  `
  document.documentElement.appendChild(host)

  const overlay = shadow.querySelector('.overlay') as HTMLDivElement
  const rectEl = shadow.querySelector('.rect') as HTMLDivElement
  const sizeEl = shadow.querySelector('.size') as HTMLSpanElement
  const toolbar = shadow.querySelector('.toolbar') as HTMLDivElement
  const tip = shadow.querySelector('.crosshair-tip') as HTMLDivElement
  const confirmBtn = shadow.querySelector('.confirm') as HTMLButtonElement

  let start: { x: number; y: number } | null = null
  let selection: Selection | null = null

  const remove = () => {
    host.remove()
  }

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('.toolbar')) return
    start = { x: e.clientX, y: e.clientY }
    selection = null
    toolbar.hidden = true
    tip.hidden = true
    rectEl.hidden = false
    rectEl.style.width = '0px'
    rectEl.style.height = '0px'
    rectEl.style.left = `${e.clientX}px`
    rectEl.style.top = `${e.clientY}px`
  }

  const onMove = (e: MouseEvent) => {
    if (!start) return
    const x = Math.min(start.x, e.clientX)
    const y = Math.min(start.y, e.clientY)
    const width = Math.abs(e.clientX - start.x)
    const height = Math.abs(e.clientY - start.y)
    selection = { x, y, width, height }
    rectEl.style.left = `${x}px`
    rectEl.style.top = `${y}px`
    rectEl.style.width = `${width}px`
    rectEl.style.height = `${height}px`
    sizeEl.textContent = `${Math.round(width)} × ${Math.round(height)}`
  }

  const onUp = () => {
    if (!start) return
    start = null
    if (!selection || selection.width < 12 || selection.height < 12) {
      // 选区过小视为误触
      rectEl.hidden = true
      tip.hidden = false
      return
    }
    // 工具条放在选区右下方（不越界）
    const tbW = 260
    const left = Math.min(selection.x + selection.width - tbW, window.innerWidth - tbW - 8)
    const top = Math.min(selection.y + selection.height + 10, window.innerHeight - 52)
    toolbar.style.left = `${Math.max(left, 8)}px`
    toolbar.style.top = `${Math.max(top, 8)}px`
    toolbar.hidden = false
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') remove()
  }

  overlay.addEventListener('mousedown', onDown)
  overlay.addEventListener('mousemove', onMove)
  overlay.addEventListener('mouseup', onUp)
  document.addEventListener('keydown', onKeyDown, true)

  confirmBtn.addEventListener('click', () => {
    if (!selection) return
    // 截图用途必须先卸载遮罩再上报，否则遮罩会被 captureVisibleTab 拍进去
    remove()
    void chrome.runtime.sendMessage({
      type: 'REGION_SELECTED',
      crop: selection,
      viewportWidth: window.innerWidth,
      purpose,
    })
  })
  shadow.querySelector('.reset')!.addEventListener('click', () => {
    selection = null
    rectEl.hidden = true
    toolbar.hidden = true
    tip.hidden = false
  })
  shadow.querySelector('.cancel')!.addEventListener('click', remove)

  // SW 在注入后重发配置时（SW 重启场景）幂等挂载
  chrome.runtime.onMessage.addListener((msg: { type: string; purpose?: 'record' | 'shot' | 'ocr' }) => {
    if (msg?.type === 'REGION_DISMISSED') remove()
    if (msg?.type === 'REGION_CONFIG' && msg.purpose) {
      purpose = msg.purpose
      confirmBtn.textContent = t(`pickerConfirm_${purpose}`)
      tip.textContent = t('pickerTip', t(`pickerVerb_${purpose}`))
    }
  })
}

mount()
