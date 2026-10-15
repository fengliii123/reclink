import { useEffect, useRef, useState } from 'react'
import { saveRecording as saveToLibrary } from '../media/store'
import { t } from '../shared/i18n'
import { openPopupWindow } from '../shared/windows'
import { isInternalUrl, useElapsed, useRecordingState, useSettings } from './hooks'
import { CameraIcon, LibraryIcon, VideoCamIcon } from './icons'
import RecordingView from './views/RecordingView'
import MoreView from './views/MoreView'
import ShotTab, { type ShotAction } from './views/ShotTab'
import RecordTab, { type MenuMode } from './views/RecordTab'
import './popup.css'

/**
 * popup 装配层：持有全局状态与动作（发消息给 SW），视图渲染在 views/。
 * 布局按 Awesome Screenshot 当前 Chrome 版复刻：截图/录屏双 Tab + 账户页脚。
 */
export default function App() {
  const state = useRecordingState()
  const [settings, updateSettings] = useSettings()
  const { micEnabled, format, resolution, countdown } = settings
  const countdownMs = countdown ? 3000 : 0
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [selected, setSelected] = useState<MenuMode>('screen')
  const [activeTab, setActiveTab] = useState<'record' | 'shot'>('record')
  const [view, setView] = useState<'main' | 'more'>('main')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState<string | null>(null)
  const [pendingOrigin, setPendingOrigin] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const elapsed = useElapsed(state)

  useEffect(() => {
    const listener = (msg: { type: string; ok?: boolean; filename?: string; recordingId?: string; error?: string }) => {
      if (msg.type !== 'SAVE_COMPLETE') return
      if (msg.ok) setFinished(msg.recordingId ? t('msgRecordDone') : `${t('msgSavedTo')}${msg.filename ?? t('downloadDir')}`)
      else setError(`${t('errSaveFailed')}: ${msg.error ?? t('unknownError')}`)
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  /** 取当前活动标签页（popup 自身作为标签页打开的 e2e 场景下为后台页，不影响） */
  const activeTabOfWindow = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    return tab
  }

  /** 整屏入口：SW 直接弹原生选源器（无扩展窗口），选完创建隐形宿主窗 */
  const startScreenPick = async (opts?: { shotOnly?: boolean }) => {
    const tab = await activeTabOfWindow()
    await chrome.runtime.sendMessage({
      type: 'START_SCREEN_PICK',
      micEnabled: opts?.shotOnly ? false : micEnabled,
      cameraEnabled: opts?.shotOnly ? false : cameraEnabled,
      format,
      resolution,
      countdownMs,
      targetTabId: tab?.id ?? null,
      shotOnly: opts?.shotOnly,
    })
  }

  /** 截图入口：卡片/功能行点击即执行（对齐 AS 交互），派发后 popup 自关 */
  const shot = async (mode: ShotAction) => {
    setError(null)
    try {
      if (mode === 'visible') {
        const resp = await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE' })
        if (!resp?.ok) {
          setError(resp?.error ?? t('errShotFailed'))
          return
        }
        window.close()
        return
      }
      if (mode === 'fullpage') {
        await chrome.runtime.sendMessage({ type: 'FULLPAGE_SHOT' })
        window.close()
        return
      }
      if (mode === 'delayed') {
        await chrome.runtime.sendMessage({ type: 'DELAYED_VISIBLE_SHOT', delayMs: 3000 })
        window.close()
        return
      }
      if (mode === 'ocr' || mode === 'region') {
        const tab = await activeTabOfWindow()
        if (isInternalUrl(tab?.url ?? '')) {
          // 内部页面注不进选区器：区域截图回退整屏，OCR 直接对可视区域整图识别
          if (mode === 'ocr') await chrome.runtime.sendMessage({ type: 'OCR_VISIBLE' })
          else await startScreenPick({ shotOnly: true })
          window.close()
          return
        }
        await chrome.runtime.sendMessage({
          type: 'START_REGION',
          micEnabled,
          cameraEnabled,
          format,
          resolution,
          purpose: mode === 'ocr' ? 'ocr' : 'shot',
        })
        window.close()
        return
      }
      await startScreenPick({ shotOnly: true })
      window.close()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  /** 导入图片：优先剪贴板里的图，没有则弹文件选择；入库后进入标注编辑器 */
  const importImage = async (file?: File | null) => {
    setError(null)
    try {
      let blob: Blob | null = file ?? null
      if (!blob) {
        // clipboardRead 为 optional 权限，首次粘贴导入时向用户申请
        const granted = await chrome.permissions.request({ permissions: ['clipboardRead'] }).catch(() => false)
        if (!granted) {
          fileInputRef.current?.click()
          return
        }
        const items = await navigator.clipboard.read().catch(() => [])
        for (const it of items) {
          const type = it.types.find((t) => t.startsWith('image/'))
          if (type) {
            blob = await it.getType(type)
            break
          }
        }
      }
      if (!blob) {
        fileInputRef.current?.click()
        return
      }
      const id = await saveToLibrary({ mode: 'screenshot', createdAt: Date.now(), durationMs: 0, blob })
      await openPopupWindow(`src/annotate/index.html?id=${id}`, 1020, 720)
      window.close()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) await importImage(file)
  }

  const start = async () => {
    if (starting) return
    setStarting(true)
    setError(null)
    setFinished(null)
    setPendingOrigin(null)
    try {
      let tabId: number | undefined
      if (selected !== 'camera') {
        const tab = await activeTabOfWindow()
        if (isInternalUrl(tab?.url ?? '')) {
          // 内部页面：区域/标签页录制都不可用，静默切换整屏流程（可录该页面所在窗口）
          await startScreenPick()
          window.close()
          return
        }
        if (selected === 'region') {
          // 区域录制：SW 注入选区器到活动标签页，确认后自动开始
          await chrome.runtime.sendMessage({
            type: 'START_REGION',
            micEnabled,
            cameraEnabled,
            format,
            resolution,
            countdownMs,
          })
          window.close()
          return
        }
        if (selected === 'screen') {
          // 整屏：SW 直接弹原生选源器（视觉上只弹系统 dialog），倒计时/控制在页面
          await startScreenPick()
          window.close()
          return
        }
        if (!tab?.id) throw new Error(t('errNoTab'))
        tabId = tab.id
      }
      // tab/camera 都由 offscreen 承载（camera 首次授权时 SW 会自动弹授权窗）
      const resp = await chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        mode: selected,
        tabId,
        micEnabled,
        cameraEnabled,
        format,
        resolution,
        countdownMs,
      })
      if (resp && !resp.ok && /invoked for the current page|activeTab/i.test(resp.error ?? '')) {
        // 用户点击图标打开 popup 时 activeTab 已授予；走到这里说明
        // 站点权限被限制（如站点访问设为"点击时"），引导显式授权
        const tab = await activeTabOfWindow()
        setPendingOrigin(new URL(tab!.url!).origin + '/*')
        return
      }
      if (!resp?.ok) {
        setError(resp?.error ?? t('errStartFailed'))
        return
      }
      // 倒计时与控制都在页面控制条上，popup 使命完成
      window.close()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }

  const authorizeAndStart = async () => {
    if (!pendingOrigin) return
    try {
      const granted = await chrome.permissions.request({ origins: [pendingOrigin] })
      if (granted) {
        setPendingOrigin(null)
        await start()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const control = (type: 'CONTROL_PAUSE' | 'CONTROL_RESUME' | 'CONTROL_STOP' | 'CONTROL_DELETE') => {
    chrome.runtime.sendMessage({ type }).catch(() => {})
  }

  const openLibrary = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/library/index.html') })
  }

  /* ── 录制中视图 ── */
  if (state.status === 'recording' || state.status === 'paused' || state.status === 'saving') {
    return <RecordingView state={state} elapsed={elapsed} finished={finished} error={error} control={control} />
  }

  /* ── 更多设置视图 ── */
  if (view === 'more') {
    return <MoreView settings={settings} updateSettings={updateSettings} onBack={() => setView('main')} />
  }

  /* ── 主菜单 ── */
  return (
    <div className="popup-page">
      <div className="tabs">
        <div className={`tab ${activeTab === 'shot' ? 'active' : 'inactive'}`} onClick={() => setActiveTab('shot')}>
          <CameraIcon size={16} />
          {t('tabShot')}
        </div>
        <div className={`tab ${activeTab === 'record' ? 'active' : 'inactive'}`} onClick={() => setActiveTab('record')}>
          <VideoCamIcon size={16} />
          {t('tabRecord')}
        </div>
      </div>

      {activeTab === 'shot' && (
        <ShotTab
          onShot={(action) => void shot(action)}
          onImportImage={() => void importImage()}
          fileInputRef={fileInputRef}
          onImportFile={(e) => void onImportFile(e)}
        />
      )}

      {activeTab === 'record' && (
        <RecordTab
          selected={selected}
          onSelect={setSelected}
          cameraEnabled={cameraEnabled}
          onToggleCamera={() => setCameraEnabled(!cameraEnabled)}
          settings={settings}
          updateSettings={updateSettings}
          starting={starting}
          onStart={() => void start()}
          onMore={() => setView('more')}
        />
      )}

      <div className="account-bar">
        <span className="avatar" />
        <span className="acct-name">reclink</span>
        <span className="acct-link" onClick={openLibrary}>
          <LibraryIcon size={13} />
          {t('libraryLink')}
        </span>
        <span className="acct-gear" title={t('settingsTitle')} onClick={() => setView('more')}>
          ⚙
        </span>
      </div>

      {pendingOrigin && (
        <div className="auth">
          <p className="auth-tip">{t('needPermission')}</p>
          <button className="auth-btn" onClick={authorizeAndStart}>
            {t('authorizeStart')}
          </button>
        </div>
      )}
      {finished && <p className="saved">✓ {finished}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
