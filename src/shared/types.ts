export type RecordingMode = 'tab' | 'screen' | 'camera'

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'saving'

export interface RecordingState {
  status: RecordingStatus
  mode: RecordingMode | null
  /** 录制的目标标签页（tab 模式）或发起录制的锚点标签页（screen 模式），控制条注入到这里 */
  targetTabId: number | null
  startedAt: number | null
  /** 已累计的暂停时长 ms */
  pausedAccumMs: number
  /** 当前这次暂停开始的时间戳，非暂停态为 null */
  pausedAt: number | null
  micEnabled: boolean
  /** 本次录制是否支持"加入人像"（合成管线存在：tab/区域 或 开人像的 screen） */
  bubbleSupported: boolean
}

export const IDLE_STATE: RecordingState = {
  status: 'idle',
  mode: null,
  targetTabId: null,
  startedAt: null,
  pausedAccumMs: 0,
  pausedAt: null,
  micEnabled: false,
  bubbleSupported: false,
}

/** 录制库条目的种类：三种录制模式 + 静态截图 */
export type LibraryMode = RecordingMode | 'screenshot'

export interface RecordingMeta {
  id: string
  mode: LibraryMode
  createdAt: number
  durationMs: number
  sizeBytes: number
  mimeType: string
}

export function elapsedMs(state: RecordingState): number {
  if (!state.startedAt) return 0
  const now = state.pausedAt ?? Date.now()
  return Math.max(0, now - state.startedAt - state.pausedAccumMs)
}
