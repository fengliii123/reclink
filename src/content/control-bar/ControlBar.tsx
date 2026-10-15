import { useEffect, useState } from 'react'
import { IDLE_STATE, elapsedMs, type RecordingState } from '../../shared/types'
import { t } from '../../shared/i18n'
import { controlBarStyles } from './styles'
import AnnotationCanvas, { type AnnoTool, type CursorFx } from './annotation'

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function Timer({ state }: { state: RecordingState }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (state.status !== 'recording') return
    const timer = window.setInterval(() => tick((n) => n + 1), 500)
    return () => window.clearInterval(timer)
  }, [state.status])
  return <span className="timer">{formatElapsed(elapsedMs(state))}</span>
}

/** Feather/Lucide 风格线性图标（24 viewBox，stroke 2，圆角端点） */
function PauseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="5" y="4" width="5" height="16" rx="1.5" />
      <rect x="14" y="4" width="5" height="16" rx="1.5" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 4.8a1.2 1.2 0 0 1 1.8-1l10 6.2a1.2 1.2 0 0 1 0 2l-10 6.2a1.2 1.2 0 0 1-1.8-1V4.8z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="3" />
    </svg>
  )
}

function CamIcon({ muted = false }: { muted?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 8l-6 4 6 4V8z" />
      <rect x="1" y="5" width="15" height="14" rx="2.5" />
      {muted && <path d="M3 3l18 18" stroke="#ff7a7a" />}
    </svg>
  )
}

function CursorFxIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 4l7 16 2.4-7L20.5 10 4 4z" fill="currentColor" stroke="none" />
      <circle cx="17" cy="17" r="4.2" />
    </svg>
  )
}

function SpotlightIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="8.5" strokeDasharray="2.5 3.5" />
    </svg>
  )
}

function RingFxIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="9.5" opacity="0.45" />
    </svg>
  )
}

function PatchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="9" opacity="0.85" />
    </svg>
  )
}

function PlainCursorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 4l7.1 17 2.5-7.4L20 10.1 4 4z" />
    </svg>
  )
}

function MicIcon({ muted = false }: { muted?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
      {muted && <path d="M3 3l18 18" stroke="#ff7a7a" />}
    </svg>
  )
}

function PenIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  )
}

function RectIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="6" width="16" height="12" rx="2" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 17L17 7" />
      <path d="M8 7h9v9" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 21l-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21H7z" />
      <path d="M22 21H7" />
      <path d="M5 11l8 8" />
    </svg>
  )
}

function BroomIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.5 3.5l-8 8" />
      <path d="M12.5 11.5l3.8 3.8-4.6 4.6c-1 1-2.7 1-3.7 0l-2.9-2.9c-1-1-1-2.7 0-3.7z" />
      <path d="M5.5 13.5L2 17" />
    </svg>
  )
}

function ChevronIcon({ open = false }: { open?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {open ? <path d="M15 4l-8 8 8 8" /> : <path d="M9 4l8 8-8 8" />}
    </svg>
  )
}

const ANNO_COLORS = ['#ef4444', '#3b82f6', '#22c55e']

export default function ControlBar() {
  const [state, setState] = useState<RecordingState>(IDLE_STATE)
  const [cameraOn, setCameraOn] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [barEnabled, setBarEnabled] = useState(true)
  const [tool, setTool] = useState<AnnoTool | null>(null)
  const [color, setColor] = useState(ANNO_COLORS[0])
  const [clearTick, setClearTick] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  /** 顶部浮动条：none 收起 / anno 批注工具 / fx 光标效果 */
  const [panel, setPanel] = useState<'none' | 'anno' | 'fx'>('none')
  const [cursorFx, setCursorFx] = useState<CursorFx>('none')

  useEffect(() => {
    void chrome.runtime.sendMessage({ type: 'GET_STATE' }).then((s) => {
      if (s) setState(s)
    })
    const listener = (msg: { type: string; state?: RecordingState; barEnabled?: boolean }) => {
      if (msg.type === 'STATE_CHANGED' && msg.state) {
        setState(msg.state)
        if (typeof msg.barEnabled === 'boolean') setBarEnabled(msg.barEnabled)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    // 心跳自检：扩展重载后本组件可能成为孤儿（chrome 调用抛错），主动拆除宿主，
    // 避免冻结的分享条/控制条残留在页面上；顺带回捞漏收的状态广播
    const hb = window.setInterval(() => {
      try {
        chrome.runtime.sendMessage({ type: 'GET_STATE' }).then(
          (s) => {
            if (s) setState(s as RecordingState)
          },
          () => {},
        )
      } catch {
        window.clearInterval(hb)
        document.getElementById('reclink-control-bar')?.remove()
      }
    }, 3000)
    return () => {
      chrome.runtime.onMessage.removeListener(listener)
      window.clearInterval(hb)
    }
  }, [])

  // 倒计时遮罩由 SW 内联注入的独立元素承担（见 orchestration countdownOverlayMain），
  // 本组件只负责录制中的控制 UI
  if (state.status === 'idle') return null

  const control = (type: 'CONTROL_PAUSE' | 'CONTROL_RESUME' | 'CONTROL_STOP' | 'CONTROL_DELETE' | 'CONTROL_CAMERA_ON' | 'CONTROL_CAMERA_OFF' | 'CONTROL_MIC_ON' | 'CONTROL_MIC_OFF') => {
    chrome.runtime.sendMessage({ type }).catch(() => {})
  }

  const toggleCam = () => {
    const next = !cameraOn
    setCameraOn(next)
    control(next ? 'CONTROL_CAMERA_ON' : 'CONTROL_CAMERA_OFF')
  }

  const toggleMic = () => {
    const next = !micOn
    setMicOn(next)
    control(next ? 'CONTROL_MIC_ON' : 'CONTROL_MIC_OFF')
  }

  if (!barEnabled) return null
  const canAnnotate = state.mode !== 'camera'

  return (
    <>
      <style>{controlBarStyles}</style>
      {canAnnotate && state.status !== 'saving' && (
        <AnnotationCanvas tool={tool} color={color} clearTick={clearTick} cursorFx={cursorFx} />
      )}
      {canAnnotate && panel !== 'none' && state.status !== 'saving' && (
        <div className="strip">
          {panel === 'anno' ? (
            <>
              <button className={`tool-btn ${tool === 'pen' ? 'lit' : ''}`} title={t('cbToolPen')} onClick={() => setTool(tool === 'pen' ? null : 'pen')}>
                <PenIcon />
              </button>
              <button className={`tool-btn ${tool === 'rect' ? 'lit' : ''}`} title={t('cbToolRect')} onClick={() => setTool(tool === 'rect' ? null : 'rect')}>
                <RectIcon />
              </button>
              <button className={`tool-btn ${tool === 'arrow' ? 'lit' : ''}`} title={t('cbToolArrow')} onClick={() => setTool(tool === 'arrow' ? null : 'arrow')}>
                <ArrowIcon />
              </button>
              <span className="divider" />
              <span className="color-dots">
                {ANNO_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`color-dot ${color === c ? 'sel' : ''}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </span>
              <span className="divider" />
              <button className={`tool-btn ${tool === 'eraser' ? 'lit' : ''}`} title={t('cbToolEraser')} onClick={() => setTool(tool === 'eraser' ? null : 'eraser')}>
                <ClearIcon />
              </button>
              <button className="tool-btn" title={t('cbClear')} onClick={() => setClearTick((n) => n + 1)}>
                <BroomIcon />
              </button>
            </>
          ) : (
            <>
              <button className={`tool-btn ${cursorFx === 'none' ? 'lit' : ''}`} title={t('cbFxNormal')} onClick={() => setCursorFx('none')}>
                <PlainCursorIcon />
              </button>
              <button className={`tool-btn ${cursorFx === 'spotlight' ? 'lit' : ''}`} title={t('cbFxSpotlight')} onClick={() => setCursorFx('spotlight')}>
                <SpotlightIcon />
              </button>
              <button className={`tool-btn ${cursorFx === 'ring' ? 'lit' : ''}`} title={t('cbFxRing')} onClick={() => setCursorFx('ring')}>
                <RingFxIcon />
              </button>
              <button className={`tool-btn ${cursorFx === 'patch' ? 'lit' : ''}`} title={t('cbFxPatch')} onClick={() => setCursorFx('patch')}>
                <PatchIcon />
              </button>
            </>
          )}
        </div>
      )}
      <div className={`bar ${collapsed ? 'compact' : ''}`}>
        {state.status === 'saving' ? (
          <span className="label">{t('cbSaving')}</span>
        ) : collapsed ? (
          <>
            <Timer state={state} />
            <span className="divider" />
            <button className="stop-btn" title={t('cbStop')} onClick={() => control('CONTROL_STOP')}>
              <StopIcon />
            </button>
            <span className="divider" />
            <button className="tool-btn" title={t('cbExpand')} onClick={() => setCollapsed(false)}>
              <ChevronIcon open />
            </button>
          </>
        ) : (
          <>
            <Timer state={state} />
            <button
              className={`pause-btn ${state.status === 'paused' ? 'paused' : ''}`}
              title={state.status === 'paused' ? t('cbResume') : t('cbPause')}
              aria-label={state.status === 'paused' ? t('cbResume') : t('cbPause')}
              onClick={() => control(state.status === 'paused' ? 'CONTROL_RESUME' : 'CONTROL_PAUSE')}
            >
              {state.status === 'paused' ? <PlayIcon /> : <PauseIcon />}
            </button>
            <button className="stop-btn" title={t('cbStop')} onClick={() => control('CONTROL_STOP')}>
              <StopIcon />
              {t('cbStopLabel')}
            </button>
            {state.bubbleSupported && (
              <button className={`tool-btn ${cameraOn ? '' : 'muted'}`} title={cameraOn ? t('cbCamOff') : t('cbCamOn')} onClick={toggleCam}>
                <CamIcon muted={!cameraOn} />
              </button>
            )}
            {state.micEnabled && (
              <button className={`tool-btn ${micOn ? '' : 'muted'}`} title={micOn ? t('cbMicOff') : t('cbMicOn')} onClick={toggleMic}>
                <MicIcon muted={!micOn} />
              </button>
            )}
            {canAnnotate && (
              <>
                <span className="divider" />
                <button
                  className={`tool-btn ${panel === 'fx' ? 'lit' : ''}`}
                  title={t('cbCursorFx')}
                  onClick={() => setPanel(panel === 'fx' ? 'none' : 'fx')}
                >
                  <CursorFxIcon />
                </button>
                <button
                  className={`tool-btn ${panel === 'anno' ? 'lit' : ''}`}
                  title={t('cbAnnoPanel')}
                  onClick={() => {
                    const next = panel === 'anno' ? 'none' : 'anno'
                    setPanel(next)
                    if (next === 'none') setTool(null)
                  }}
                >
                  <PenIcon />
                </button>
              </>
            )}
            <span className="divider" />
            <button className="tool-btn" title={t('cbCollapse')} onClick={() => setCollapsed(true)}>
              <ChevronIcon />
            </button>
          </>
        )}
      </div>
    </>
  )
}
