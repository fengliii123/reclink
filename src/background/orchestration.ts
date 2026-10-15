import { RECORDER_WINDOW_SIZE, STORAGE_SETTINGS_KEY, STORAGE_STATE_KEY, recordingFilename } from '../shared/constants'
import { RECORD_CANCELLED, type FromOffscreenMessage, type StartRecordingMsg, type ToBackgroundMessage } from '../shared/messages'
import { IDLE_STATE, elapsedMs, type RecordingState } from '../shared/types'
import { t } from '../shared/i18n'
import { closeOffscreen, ensureOffscreen, hasOffscreenDocument } from './offscreen-manager'
import { saveRecording } from './saver'
import { openCompleteWindow, openOcrWindow, savePngShot } from './screenshots'

export async function getState(): Promise<RecordingState> {
  const obj = await chrome.storage.session.get(STORAGE_STATE_KEY)
  return (obj[STORAGE_STATE_KEY] as RecordingState | undefined) ?? IDLE_STATE
}

async function setState(next: RecordingState, extraTabIds: number[] = []): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_STATE_KEY]: next })
  console.log('[reclink] setState ->', next.status)
  applyBadge(next)
  void broadcastState(next, extraTabIds)
}

/** 录制中徽章显示实时计时（商用版同款红底 m:ss），每秒刷新 */
let badgeTimer: ReturnType<typeof setInterval> | null = null

function formatBadgeText(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function applyBadge(state: RecordingState): void {
  if (badgeTimer) {
    clearInterval(badgeTimer)
    badgeTimer = null
  }
  if (state.status === 'recording') {
    const update = () => chrome.action.setBadgeText({ text: formatBadgeText(elapsedMs(state)) })
    update()
    chrome.action.setBadgeBackgroundColor({ color: '#D93025' })
    badgeTimer = setInterval(update, 1000)
    return
  }
  const badge =
    state.status === 'paused' ? { text: '❚❚', color: '#d97706' }
    : state.status === 'saving' ? { text: '···', color: '#6b7280' }
    : { text: '', color: '#000000' }
  chrome.action.setBadgeText({ text: badge.text })
  chrome.action.setBadgeBackgroundColor({ color: badge.color })
}

/**
 * SW 冷启动（被回收后唤醒/浏览器启动）时恢复状态：
 * - storage.session 在浏览器会话内持久，录制状态可能仍有效
 * - 所有录制模式都由 offscreen 文档承载引擎
 * - 宿主已不存在（异常退出）时回到 idle
 */
export async function recoverState(): Promise<void> {
  const s = await getState()
  if (s.status === 'idle') {
    applyBadge(IDLE_STATE)
    return
  }
  const hostAlive = await hasOffscreenDocument().catch(() => false)
  if (!hostAlive) {
    console.warn('[reclink] state is', s.status, 'but recorder host missing, resetting to idle')
    await setState(IDLE_STATE)
    return
  }
  applyBadge(s)
  await broadcastState(s)
  // SW 重启期间标签页可能已导航（控制条丢失），重新注入（脚本自身幂等）
  if (s.targetTabId != null) {
    await injectControlBar(s.targetTabId)
  }
}

/** 动态注入控制条到目标标签页（chrome:// 等页面会失败，降级为 popup/badge 控制） */
async function injectControlBar(tabId: number): Promise<void> {
  // crxjs 输出的 content script 文件名带 hash，从自身 manifest 读取实际路径
  const js = chrome.runtime.getManifest().content_scripts?.[0]?.js?.[0]
  if (!js) {
    console.warn('[reclink] control bar file not found in manifest')
    return
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [js],
    })
  } catch (e) {
    console.warn('[reclink] control bar injection skipped:', e)
  }
}

/**
 * 倒计时投递不看 tab.url：file:// 页面、站点访问受限页面上脚本其实存在
 * （声明式 content script 自动注入），但 url 前缀检查会误判为不可注入而
 * 丢弃倒计时。tabs.sendMessage / executeScript 失败均被静默捕获，无需预判。
 */

/**
 * 自包含倒计时遮罩（executeScript 内联注入，函数体必须无外部引用）。
 * 不走 crxjs 内容脚本：其 loader 动态 import 在真实环境可能失败/超时
 * （用户实测倒计时 3 秒窗口内页面无接收端），内联函数即注即用；
 * activeTab 授权下连新标签页/chrome:// 页也能注入。类名保持旧契约（e2e 依赖）。
 */
function countdownOverlayMain(): void {
  const w = window as unknown as { __reclinkCdReady?: boolean }
  // 同一 isolated world 内幂等（executeScript 可能重复注入，模块级 flag 不跨世界）
  if (w.__reclinkCdReady) return
  w.__reclinkCdReady = true
  // 扩展重载后，旧世界的遮罩节点成为孤儿（其监听器已随旧 context 失效）。
  // 必须移除重建，否则守卫误判"已存在"而跳过监听器注册 → 消息永远无接收端
  document.getElementById('reclink-countdown')?.remove()
  const root = document.createElement('div')
  root.id = 'reclink-countdown'
  const style = document.createElement('style')
  style.textContent = `
.countdown-overlay { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,.62);
  display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff;
  font-family: -apple-system,'PingFang SC','Microsoft YaHei',sans-serif; user-select: none; }
.countdown-text { font-size: 28px; font-weight: 600; letter-spacing: .4px; text-shadow: 0 2px 10px rgba(0,0,0,.85); }
.countdown-num { font-family: Arial,sans-serif; font-size: 112px; line-height: 1.15; font-weight: 700;
  font-variant-numeric: tabular-nums; text-shadow: 0 4px 22px rgba(0,0,0,.9); }
.countdown-cancel { margin-top: 36px; padding: 8px 38px; border: 1px solid rgba(255,255,255,.6);
  border-radius: 6px; font-size: 15px; color: #fff; cursor: pointer; }
.countdown-cancel:hover { background: rgba(255,255,255,.12); }
.countdown-overlay[hidden] { display: none !important; }`
  const overlay = document.createElement('div')
  overlay.className = 'countdown-overlay'
  overlay.hidden = true
  const text = document.createElement('div')
  text.className = 'countdown-text'
  text.textContent = chrome.i18n.getMessage('countdownLabel')
  const num = document.createElement('span')
  num.className = 'countdown-num'
  const cancel = document.createElement('div')
  cancel.className = 'countdown-cancel'
  cancel.textContent = chrome.i18n.getMessage('countdownCancel')
  cancel.addEventListener('click', () => {
    overlay.hidden = true
    chrome.runtime.sendMessage({ type: 'COUNTDOWN_CANCEL' }).catch(() => {})
  })
  overlay.append(text, num, cancel)
  root.append(style, overlay)
  document.documentElement.appendChild(root)
  let reported = false
  let autoHide = 0
  chrome.runtime.onMessage.addListener((m: { type?: string; seconds?: number }) => {
    if (m?.type === 'COUNTDOWN' && typeof m.seconds === 'number') {
      overlay.hidden = false
      num.textContent = String(m.seconds)
      // 兜底自隐：SW 重发间隔 300ms，1.2s 无新消息视为结束（防 STATE_CHANGED
      // 未到达本标签页时遮罩滞留）
      clearTimeout(autoHide)
      autoHide = setTimeout(() => {
        overlay.hidden = true
      }, 1200) as unknown as number
      if (!reported) {
        reported = true
        chrome.runtime.sendMessage({ type: 'COUNTDOWN_SEEN' }).catch(() => {})
      }
    } else if (m?.type === 'STATE_CHANGED') {
      overlay.hidden = true
      clearTimeout(autoHide)
    }
    return false
  })
}

function injectCountdownOverlay(tabId: number, record = false): void {
  chrome.scripting
    .executeScript({ target: { tabId }, func: countdownOverlayMain })
    .then(() => {
      if (record) void chrome.storage.session.set({ 'reclink:cdInj': 'ok' })
    })
    .catch((e) => {
      if (record) void chrome.storage.session.set({ 'reclink:cdInj': String(e) })
    })
}

/** 广播状态；barEnabled 让控制条脚本在"控制栏关闭"时只隐藏控制栏、仍显示倒计时遮罩 */
async function broadcastState(state: RecordingState, extraTabIds: number[] = []): Promise<void> {
  const barEnabled = await controlBarEnabled()
  // popup 可能关闭，发送失败属正常
  chrome.runtime.sendMessage({ type: 'STATE_CHANGED', state, barEnabled }).catch(() => {})
  const tabIds = new Set<number>(extraTabIds)
  if (state.targetTabId != null) tabIds.add(state.targetTabId)
  for (const tabId of tabIds) {
    chrome.tabs.sendMessage(tabId, { type: 'STATE_CHANGED', state, barEnabled }).catch(() => {})
  }
}

let startInFlight: Promise<{ ok: boolean; error?: string }> | null = null

/**
 * 打开 recorder-window（camera 一次性授权窗）。开窗收口在 SW 单点执行，
 * 避免并发产生多个窗口；每次先清掉遗留的授权窗口。
 */
let openWindowInFlight: Promise<{ ok: boolean }> | null = null

export function openRecorderWindow(msg: Extract<ToBackgroundMessage, { type: 'OPEN_RECORDER_WINDOW' }>): Promise<{ ok: boolean }> {
  if (openWindowInFlight) return openWindowInFlight
  openWindowInFlight = doOpenRecorderWindow(msg).finally(() => {
    openWindowInFlight = null
  })
  return openWindowInFlight
}

async function doOpenRecorderWindow(
  _msg: Extract<ToBackgroundMessage, { type: 'OPEN_RECORDER_WINDOW' }>,
): Promise<{ ok: boolean }> {
  // 清理遗留窗口（同 URL 的标签/窗口一律移除，重开新的）
  const stale = await chrome.tabs.query({ url: chrome.runtime.getURL('src/recorder-window/index.html*') })
  for (const t of stale) {
    if (t.id != null) await chrome.tabs.remove(t.id).catch(() => {})
  }
  const url = chrome.runtime.getURL('src/recorder-window/index.html?mode=camera')
  const { width, height } = RECORDER_WINDOW_SIZE.camera
  const win = await chrome.windows.getLastFocused()
  const left = win.left != null && win.width != null ? Math.round(win.left + (win.width - width) / 2) : undefined
  const top = win.top != null && win.height != null ? Math.round(win.top + (win.height - height) / 2) : undefined
  const created = await chrome.windows.create({ type: 'popup', url, width, height, left, top, focused: true })
  if (!created?.id) return { ok: false }
  // macOS 上 type:popup 的尺寸可能被异步覆盖为父窗口大小，稍后重申（页面内另有常驻自愈）
  const winId = created.id
  const reassert = () => chrome.windows.update(winId, { width, height, left, top }).catch(() => {})
  setTimeout(reassert, 300)
  setTimeout(reassert, 900)
  return { ok: true }
}

/**
 * 整屏录制/截图入口：offscreen 文档 getDisplayMedia 弹 Chrome 原生选源器，
 * 全程无扩展窗口（chooseDesktopMedia 的 streamId 绑定请求上下文、无法跨文档
 * 消费，Chromium 326509126 —— 已废弃该路径）。
 * 录制复用 startRecording(mode: screen)；截图走 OFFSCREEN_SHOT 抓单帧。
 */
export function handleScreenPick(msg: Extract<ToBackgroundMessage, { type: 'START_SCREEN_PICK' }>): void {
  if (msg.shotOnly) {
    void (async () => {
      try {
        await ensureOffscreen()
        const resp = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_SHOT' }) as { ok?: boolean; error?: string } | undefined
        // popup 点击后即关，失败只能经系统通知告知（如用户取消选源 / 编码失败）
        if (resp && resp.ok === false) {
          void chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/128.png'),
            title: 'reclink',
            message: resp.error || t('errShotFailed'),
          })
        }
      } catch (e) {
        console.warn('[reclink] screen shot failed:', e)
      } finally {
        // 截图完成（或用户取消选源）：offscreen 使命结束
        await closeOffscreen().catch(() => {})
      }
    })()
    return
  }
  void startRecording({
    type: 'START_RECORDING',
    mode: 'screen',
    tabId: msg.targetTabId ?? undefined,
    micEnabled: msg.micEnabled,
    cameraEnabled: msg.cameraEnabled,
    format: msg.format,
    resolution: msg.resolution,
    countdownMs: msg.countdownMs,
  })
}

export function startRecording(msg: StartRecordingMsg): Promise<{ ok: boolean; error?: string }> {
  // 串行化并发启动（如重复点击/popup 重开），避免两个 START 同时通过 idle 检查
  if (startInFlight) return Promise.resolve({ ok: false, error: t('errStarting') })
  startInFlight = doStartRecording(msg).finally(() => {
    startInFlight = null
  })
  return startInFlight
}

/** camera 首次授权被拒时暂存启动请求，授权窗成功后自动重发 */
let pendingCameraStart: StartRecordingMsg | null = null

async function doStartRecording(msg: StartRecordingMsg): Promise<{ ok: boolean; error?: string }> {
  const current = await getState()
  if (current.status !== 'idle') {
    return { ok: false, error: t('errBusy') }
  }
  try {
    // 先确保 offscreen 存在再取 streamId（有效期短，一次性）
    await ensureOffscreen()
    let streamId: string | undefined
    if (msg.mode === 'tab') {
      if (!msg.tabId) throw new Error(t('errNoTargetTab'))
      streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: msg.tabId })
    }
    let targetTabId = msg.tabId ?? null
    if (msg.mode === 'camera') {
      // 摄像头模式没有"被录制页面"，控制条挂在发起时的活动标签页上
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
      targetTabId = tab?.id ?? null
    }
    // 提前注入控制条脚本与独立倒计时遮罩：screen 模式选源器可能停留任意久，
    // 倒计时窗口只有 3 秒（注入均幂等，失败被静默捕获）
    if (targetTabId != null) {
      injectCountdownOverlay(targetTabId)
      await injectControlBar(targetTabId)
    }
    const resp = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_START',
      mode: msg.mode,
      streamId,
      micEnabled: msg.micEnabled,
      cameraEnabled: msg.cameraEnabled,
      crop: msg.crop,
      viewportWidth: msg.viewportWidth,
      format: msg.format,
      resolution: msg.resolution,
      targetTabId: targetTabId ?? undefined,
      countdownMs: msg.countdownMs ?? 0,
    })
    if (!resp?.ok) {
      if (resp?.error === RECORD_CANCELLED) {
        // 倒计时被取消 / 用户在选源器点了取消：静默收场（状态未离开 idle）
        await closeOffscreen().catch(() => {})
        return { ok: true }
      }
      throw new Error(resp?.error ?? t('errStart'))
    }
    // 录制状态由宿主上报的 RECORDING_STARTED 设置（见 confirmRecordingStarted）
    return { ok: true }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    // offscreen 无法弹摄像头权限提示 → 打开一次性授权窗，成功后自动重试
    if (msg.mode === 'camera' && /NotAllowedError|permission|权限|denied/i.test(err)) {
      pendingCameraStart = msg
      await openRecorderWindow({
        type: 'OPEN_RECORDER_WINDOW',
        mode: 'camera',
        micEnabled: msg.micEnabled,
        cameraEnabled: false,
        format: msg.format,
        resolution: msg.resolution,
      })
      return { ok: true }
    }
    // 启动失败时清理 offscreen，避免残留空文档
    await closeOffscreen().catch(() => {})
    return { ok: false, error: err }
  }
}

/** 授权窗授权成功：重发暂存的 camera 启动请求 */
export async function handleCameraAuthed(): Promise<void> {
  const pending = pendingCameraStart
  pendingCameraStart = null
  if (!pending) return
  await startRecording(pending)
}

/** 倒计时重发定时器（取消时需要停止，否则会把已取消的倒计时重新刷出来） */
let countdownResendTimer: ReturnType<typeof setInterval> | null = null

/** 工具栏图标倒计时（无页面可显示时的最后兜底，不受系统通知设置影响） */
let countdownIconGen = 0

async function drawCountdownIcon(n: number): Promise<void> {
  const gen = ++countdownIconGen
  try {
    const resp = await fetch(chrome.runtime.getURL('icons/128.png'))
    const bmp = await createImageBitmap(await resp.blob())
    const canvas = new OffscreenCanvas(128, 128)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bmp, 0, 0, 128, 128)
    ctx.fillStyle = '#202124'
    ctx.beginPath()
    ctx.arc(64, 64, 47, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 64px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(n), 64, 70)
    if (gen !== countdownIconGen) return
    chrome.action
      .setIcon({ imageData: ctx.getImageData(0, 0, 128, 128) })
      .then(() => {
        if (gen === countdownIconGen) void chrome.storage.session.set({ 'reclink:cdIcon': Date.now() })
      })
      .catch(() => {})
  } catch {
    // 图标绘制失败不影响倒计时本身
  }
}

function restoreToolbarIcon(): void {
  countdownIconGen++
  chrome.action
    .setIcon({ path: { '16': 'icons/16.png', '32': 'icons/32.png', '48': 'icons/48.png', '128': 'icons/128.png' } })
    .catch(() => {})
}

function stopCountdownResend(): void {
  if (countdownResendTimer) {
    clearInterval(countdownResendTimer)
    countdownResendTimer = null
  }
}

/** 用户点击倒计时 Cancel：停止重发并通知录制宿主中止 */
export function handleCountdownCancel(): void {
  stopCountdownResend()
  chrome.action.setBadgeText({ text: '' })
  void chrome.notifications.clear('reclink-countdown').catch(() => {})
  restoreToolbarIcon()
  chrome.runtime.sendMessage({ type: 'COUNTDOWN_CANCEL' }).catch(() => {})
}

/** 宿主请求在目标页控制条上显示开录倒计时 */
export async function handleOffscreenCountdown(
  msg: Extract<FromOffscreenMessage, { type: 'OFFSCREEN_COUNTDOWN' }>,
): Promise<void> {
  // 倒计时总时长以本函数收到消息时起算（与录制宿主的 waitCancelable 有毫秒级偏差，可接受）
  stopCountdownResend()
  const totalMs = msg.seconds * 1000
  const start = Date.now()

  // 诊断面包屑：报障时在 SW 控制台 chrome.storage.session.get(null) 可定位断点
  void chrome.storage.session.set({
    'reclink:cd': { at: Date.now(), targetTabId: msg.targetTabId, seconds: msg.seconds },
  })
  void chrome.tabs
    .get(msg.targetTabId)
    .then((tab) =>
      chrome.storage.session.set({ 'reclink:cdTab': `${tab.url ?? '(no url)'} · ${tab.title ?? ''}` }),
    )
    .catch((e) => chrome.storage.session.set({ 'reclink:cdTab': `tabs.get failed: ${String(e)}` }))
  console.log('[reclink] countdown relay ->', { targetTabId: msg.targetTabId })

  // 控制条脚本冷加载可能超过 1s（executeScript resolve 后 loader 还要动态 import），
  // 固定重试几次会整体错过。改为按剩余秒数持续重发（300ms 一次），晚就绪也能立即追上。
  // 同时在工具栏徽章上同步倒数 —— 页面注入失败时也始终可见。
  // 锚点页无接收端（新标签页/chrome:// 等不可注入页）时，倒计时改挂到
  // 用户当前正在看的活动标签页（一次性切换，之后持续投递）。
  let countdownTabId = msg.targetTabId
  let delivered = false
  let failStreak = 0
  let notified = false
  countdownResendTimer = setInterval(() => {
    const remain = Math.ceil((totalMs - (Date.now() - start)) / 1000)
    if (remain <= 0) {
      stopCountdownResend()
      chrome.action.setBadgeText({ text: '' })
      void chrome.notifications.clear('reclink-countdown').catch(() => {})
      restoreToolbarIcon()
      return
    }
    chrome.action.setBadgeText({ text: String(remain) })
    chrome.action.setBadgeBackgroundColor({ color: '#1A73E8' })
    if (!delivered) void drawCountdownIcon(remain)
    chrome.tabs
      .sendMessage(countdownTabId, { type: 'COUNTDOWN', seconds: remain })
      .then(() => {
        if (!delivered) {
          delivered = true
          failStreak = 0
          void chrome.storage.session.set({ 'reclink:cdDeliver': Date.now() })
          // 页面遮罩接管倒计时后撤掉系统通知与图标倒计时
          void chrome.notifications.clear('reclink-countdown').catch(() => {})
          restoreToolbarIcon()
        }
      })
      .catch(() => {
        failStreak++
        // 锚点与活动页都无接收端（chrome:// 等内部页发起，扩展被禁止注入）：
        // 用系统通知兜底显示倒计时（唯一剩余的合法提示面）
        if (!notified && !delivered && failStreak >= 2) {
          notified = true
          void chrome.notifications
            .create('reclink-countdown', {
              type: 'basic',
              iconUrl: chrome.runtime.getURL('icons/128.png'),
              title: 'reclink',
              message: t('notifCountdown', [String(remain)]),
              priority: 2,
            })
            .then(() => {
              void chrome.storage.session.set({ 'reclink:cdNotif': Date.now() })
            })
            .catch((e) => {
              void chrome.storage.session.set({ 'reclink:cdNotif': `failed: ${String(e)}` })
            })
        }
        // 锚点无接收端（新标签页/chrome:// 等不可注入页）：每次失败都重新评估
        // 当前活动标签页（选源完成与切换存在竞态，一次性切换会漏）
        void chrome.tabs
          .query({ active: true, lastFocusedWindow: true })
          .then(([tab]) => {
            if (tab?.id != null && tab.id !== countdownTabId && /^(https?|file):/.test(tab.url ?? '')) {
              countdownTabId = tab.id
              injectCountdownOverlay(tab.id)
            }
          })
          .catch(() => {})
      })
  }, 300)

  injectCountdownOverlay(msg.targetTabId, true)
  await injectControlBar(msg.targetTabId)
}

/**
 * offscreen 引擎开录成功后上报 —— 录制状态的唯一写入点。
 * 放在宿主侧上报（而非 OFFSCREEN_START 的响应回调）是因为 screen 模式
 * 的原生选源器可能停留任意久，期间 SW 可能被回收；由宿主消息重建状态。
 */
export async function confirmRecordingStarted(
  msg: Extract<FromOffscreenMessage, { type: 'RECORDING_STARTED' }>,
): Promise<{ ok: boolean }> {
  const current = await getState()
  if (current.status !== 'idle') return { ok: true }
  // 倒计时重发器可能还剩最后一两次 tick，会覆盖录制计时徽章（甚至清空），先停掉
  stopCountdownResend()
  await setState({
    status: 'recording',
    mode: msg.mode,
    targetTabId: msg.targetTabId,
    startedAt: Date.now(),
    pausedAccumMs: 0,
    pausedAt: null,
    micEnabled: msg.micEnabled,
    bubbleSupported: msg.mode === 'tab' || (msg.mode === 'screen' && msg.cameraEnabled === true),
  })
  if (msg.targetTabId != null) {
    await injectControlBar(msg.targetTabId)
  }
  return { ok: true }
}

async function controlBarEnabled(): Promise<boolean> {
  const obj = await chrome.storage.local.get(STORAGE_SETTINGS_KEY)
  const settings = obj[STORAGE_SETTINGS_KEY] as { showControlBar?: boolean } | undefined
  return settings?.showControlBar !== false
}

export async function pauseRecording(): Promise<void> {
  const s = await getState()
  if (s.status !== 'recording') return
  await chrome.runtime.sendMessage({ type: 'OFFSCREEN_CONTROL', action: 'pause' }).catch(() => {})
  await setState({ ...s, status: 'paused', pausedAt: Date.now() })
}

export async function resumeRecording(): Promise<void> {
  const s = await getState()
  if (s.status !== 'paused' || s.pausedAt == null) return
  await chrome.runtime.sendMessage({ type: 'OFFSCREEN_CONTROL', action: 'resume' }).catch(() => {})
  await setState({
    ...s,
    status: 'recording',
    pausedAccumMs: s.pausedAccumMs + (Date.now() - s.pausedAt),
    pausedAt: null,
  })
}

export async function stopRecording(): Promise<void> {
  const s = await getState()
  if (s.status !== 'recording' && s.status !== 'paused') return
  await setState({ ...s, status: 'saving' })
  try {
    await chrome.runtime.sendMessage({ type: 'OFFSCREEN_CONTROL', action: 'stop' })
  } catch {
    // offscreen 已不在（被杀/异常关闭）：OFFSCREEN_STOPPED 永远不会来，直接复位，
    // 否则状态卡死在 saving、徽章停在 '···'，无法再次开录。录像随 offscreen 丢失。
    chrome.runtime.sendMessage({ type: 'SAVE_COMPLETE', ok: false, error: t('errRecorderLost') }).catch(() => {})
    await closeOffscreen().catch(() => {})
    await setState(IDLE_STATE, s.targetTabId != null ? [s.targetTabId] : [])
  }
  // 后续由 OFFSCREEN_STOPPED 消息驱动（handleOffscreenStopped）
}

/** 丢弃当前录制：不保存，直接清理 */
export async function discardRecording(): Promise<void> {
  const s = await getState()
  if (s.status !== 'recording' && s.status !== 'paused') return
  await setState({ ...s, status: 'saving' })
  try {
    await chrome.runtime.sendMessage({ type: 'OFFSCREEN_CONTROL', action: 'delete' })
  } catch {
    await handleOffscreenDiscarded()
    return
  }
  // 后续由 OFFSCREEN_DISCARDED 消息驱动（handleOffscreenDiscarded）
}

export async function handleOffscreenDiscarded(): Promise<void> {
  const s = await getState()
  await closeOffscreen().catch(() => {})
  await setState(IDLE_STATE, s.targetTabId != null ? [s.targetTabId] : [])
}

/** 录制中动态开关人像气泡 */
export async function toggleCamera(on: boolean): Promise<void> {
  const s = await getState()
  if (s.status !== 'recording' && s.status !== 'paused') return
  await chrome.runtime
    .sendMessage({ type: 'OFFSCREEN_CONTROL', action: on ? 'camera-on' : 'camera-off' })
    .catch(() => {})
}

/** 录制中静音/恢复麦克风（仅对开录时启用的麦克风有效） */
export async function toggleMic(on: boolean): Promise<void> {
  const s = await getState()
  if (s.status !== 'recording' && s.status !== 'paused') return
  await chrome.runtime
    .sendMessage({ type: 'OFFSCREEN_CONTROL', action: on ? 'mic-on' : 'mic-off' })
    .catch(() => {})
}

/** 区域录制：向活动标签页注入选区脚本并下发启动参数 */
export async function startRegionSelection(msg: Extract<ToBackgroundMessage, { type: 'START_REGION' }>): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return
  const url = tab.url ?? ''
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('https://chrome.google.com/webstore')) {
    chrome.runtime.sendMessage({ type: 'SAVE_COMPLETE', ok: false, error: t('errFullpageUnsupported') }).catch(() => {})
    return
  }
  await chrome.storage.session.set({ 'reclink:region': msg })
  const js = chrome.runtime.getManifest().content_scripts?.[1]?.js?.[0]
  if (!js) return
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [js] })
    const tabId = tab.id
    const { type: _ignored, ...cfg } = msg
    // executeScript 返回时 crxjs loader 可能还没完成动态 import（监听器未挂上），
    // 配置消息按 300ms 重发几次兜底；选区器按收到的值幂等更新
    const sendCfg = () =>
      chrome.tabs
        .sendMessage(tabId, { type: 'REGION_CONFIG', ...cfg, purpose: msg.purpose ?? 'record' })
        .catch(() => {})
    await sendCfg()
    for (const delay of [300, 700, 1200]) setTimeout(sendCfg, delay)
  } catch (e) {
    console.warn('[reclink] region picker injection failed:', e)
  }
}

/** 选区确认后以 tab 模式 + crop 启动录制 */
export async function handleRegionSelected(
  msg: Extract<ToBackgroundMessage, { type: 'REGION_SELECTED' }>,
  senderTabId: number | null,
): Promise<void> {
  const stored = await chrome.storage.session.get('reclink:region')
  const cfg = stored['reclink:region'] as Extract<ToBackgroundMessage, { type: 'START_REGION' }> | undefined
  await chrome.storage.session.remove('reclink:region')
  if (!cfg || senderTabId == null) return
  const purpose = msg.purpose ?? cfg.purpose ?? 'record'
  if (purpose === 'shot' || purpose === 'ocr') {
    // 区域截图 / 区域 OCR：截取该标签页可见区域并按选区裁剪
    try {
      const tab = await chrome.tabs.get(senderTabId)
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
      const id = await savePngShot(dataUrl, msg.crop, msg.viewportWidth)
      if (purpose === 'ocr') await openOcrWindow(id)
      else await openCompleteWindow(id)
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      chrome.runtime.sendMessage({ type: 'SAVE_COMPLETE', ok: false, error }).catch(() => {})
    }
    return
  }
  const resp = await startRecording({
    type: 'START_RECORDING',
    mode: 'tab',
    tabId: senderTabId,
    micEnabled: cfg.micEnabled,
    cameraEnabled: cfg.cameraEnabled,
    crop: msg.crop,
    viewportWidth: msg.viewportWidth,
    format: cfg.format,
    resolution: cfg.resolution,
    countdownMs: cfg.countdownMs,
  })
  if (!resp.ok) {
    chrome.runtime.sendMessage({ type: 'SAVE_COMPLETE', ok: false, error: resp.error }).catch(() => {})
  }
}

export async function handleOffscreenStopped(
  msg: Extract<FromOffscreenMessage, { type: 'OFFSCREEN_STOPPED' }>,
): Promise<void> {
  const s = await getState()
  try {
    if (msg.recordingId) {
      // 已入库：以独立小窗口打开完成页（预览 + 手动下载），宿主页面可立即关闭
      await openCompleteWindow(msg.recordingId)
      chrome.runtime
        .sendMessage({ type: 'SAVE_COMPLETE', ok: true, recordingId: msg.recordingId })
        .catch(() => {})
      if (s.targetTabId != null) {
        chrome.tabs.sendMessage(s.targetTabId, { type: 'SAVE_COMPLETE', ok: true }).catch(() => {})
      }
      return
    }
    // 入库失败的兜底：直接下载（blobUrl 归宿主所有，需先完成下载再关宿主）
    await saveRecording(msg)
    chrome.runtime
      .sendMessage({
        type: 'SAVE_COMPLETE',
        ok: true,
        filename: recordingFilename(msg.mode, msg.startedAt, msg.mimeType),
      })
      .catch(() => {})
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    chrome.runtime.sendMessage({ type: 'SAVE_COMPLETE', ok: false, error }).catch(() => {})
  } finally {
    await closeOffscreen().catch(() => {})
    // 回到 idle 时 targetTabId 已为空，需显式带上原目标标签页让控制条卸载
    await setState(IDLE_STATE, s.targetTabId != null ? [s.targetTabId] : [])
  }
}
