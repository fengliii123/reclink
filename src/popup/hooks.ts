import { useEffect, useState } from 'react'
import { STORAGE_SETTINGS_KEY } from '../shared/constants'
import type { RecordingFormat, Resolution } from '../shared/messages'
import { IDLE_STATE, elapsedMs, type RecordingState } from '../shared/types'

export interface Settings {
  format: RecordingFormat
  micEnabled: boolean
  showControlBar: boolean
  countdown: boolean
  resolution: Resolution
}

export const RESOLUTION_OPTIONS: Resolution[] = ['720p', '1080p', '2160p']

const DEFAULT_SETTINGS: Settings = {
  format: 'mp4',
  micEnabled: true,
  showControlBar: true,
  countdown: true,
  resolution: '720p',
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  useEffect(() => {
    void chrome.storage.local.get(STORAGE_SETTINGS_KEY).then((obj) => {
      const saved = obj[STORAGE_SETTINGS_KEY] as Partial<Settings> | undefined
      if (saved) {
        const merged = { ...DEFAULT_SETTINGS, ...saved }
        // 旧版本的 480p 档已移除
        if (!RESOLUTION_OPTIONS.includes(merged.resolution)) merged.resolution = '720p'
        setSettings(merged)
      }
    })
  }, [])
  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      void chrome.storage.local.set({ [STORAGE_SETTINGS_KEY]: next })
      return next
    })
  }
  return [settings, update]
}

/** tabCapture 无法捕获浏览器内部页面（chrome:// 等），content script 也无法注入 */
export function isInternalUrl(url: string): boolean {
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('https://chrome.google.com/webstore')
  )
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** 订阅 SW 的录制状态（初始拉取 + STATE_CHANGED 广播） */
export function useRecordingState(): RecordingState {
  const [state, setState] = useState<RecordingState>(IDLE_STATE)
  useEffect(() => {
    let alive = true
    const refresh = async () => {
      const s = await chrome.runtime.sendMessage({ type: 'GET_STATE' })
      if (alive && s) setState(s)
    }
    void refresh()
    const listener = (msg: { type: string; state?: RecordingState }) => {
      if (msg.type === 'STATE_CHANGED' && msg.state) setState(msg.state)
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => {
      alive = false
      chrome.runtime.onMessage.removeListener(listener)
    }
  }, [])
  return state
}

export function useElapsed(state: RecordingState): string {
  const [, setNow] = useState(Date.now())
  useEffect(() => {
    if (state.status !== 'recording') return
    const t = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(t)
  }, [state.status])
  if (state.status !== 'recording' && state.status !== 'paused') return '00:00'
  return formatElapsed(elapsedMs(state))
}
