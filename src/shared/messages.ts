import type { RecordingMode, RecordingState } from './types'

export type RecordingFormat = 'mp4' | 'webm'

/** 视频分辨率档位（2160p = 4K） */
export type Resolution = '720p' | '1080p' | '2160p'

/** 区域录制选区（页面视口 CSS 像素） */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/** popup / content script / library → service worker */
export interface StartRecordingMsg {
  type: 'START_RECORDING'
  mode: RecordingMode
  /** tab 模式为被录制标签页；screen 模式为发起录点的锚点标签页 */
  tabId?: number
  micEnabled: boolean
  /** 录制画面叠加摄像头气泡（tab/screen 模式有效） */
  cameraEnabled?: boolean
  /** 区域录制选区（仅 tab 模式） */
  crop?: CropRect
  /** 发起选区时页面视口宽度（CSS px），用于视频像素换算 */
  viewportWidth?: number
  /** 导出格式（MediaRecorder 直录，mp4 需要 Chrome 126+，不支持时回退 webm） */
  format: RecordingFormat
  /** 视频分辨率档位 */
  resolution: Resolution
  /** 开始录制前的倒计时时长（0 = 无倒计时） */
  countdownMs?: number
  /** tab 模式：tabCapture 的 streamId（一次性） */
  streamId?: string
}

/** 区域选择器的用途：选区后开录 / 截取静态图 / OCR 文本识别 */
export type RegionPurpose = 'record' | 'shot' | 'ocr'

/** popup → SW：在活动标签页启动区域选择 */
export interface StartRegionMsg {
  type: 'START_REGION'
  micEnabled: boolean
  cameraEnabled: boolean
  format: RecordingFormat
  resolution: Resolution
  /** 开始录制前的倒计时时长（0 = 无倒计时） */
  countdownMs?: number
  purpose?: RegionPurpose
}

/** popup → SW：打开 recorder-window（camera 一次性授权窗，offscreen 无法弹权限提示） */
export interface OpenRecorderWindowMsg {
  type: 'OPEN_RECORDER_WINDOW'
  mode: 'camera'
  micEnabled: boolean
  cameraEnabled: boolean
  format: RecordingFormat
  resolution: Resolution
}

/** popup → SW：截取活动标签页的可见区域 */
export interface CaptureVisibleMsg {
  type: 'CAPTURE_VISIBLE'
}

/**
 * popup → SW：整屏录制/截图入口。由 offscreen 文档 getDisplayMedia 弹
 * Chrome 原生选源器（无扩展窗口），录制全程在 offscreen 内完成。
 */
export interface StartScreenPickMsg {
  type: 'START_SCREEN_PICK'
  micEnabled: boolean
  cameraEnabled: boolean
  format: RecordingFormat
  resolution: Resolution
  countdownMs?: number
  /** 倒计时/控制条注入的锚点标签页 */
  targetTabId: number | null
  /** true = 选源后只截一帧静态图（截图功能的整屏模式） */
  shotOnly?: boolean
}

/** popup → SW：整页截图（滚动拼接） */
export interface FullPageShotMsg {
  type: 'FULLPAGE_SHOT'
}

/** popup → SW：延迟后截取可视区域 */
export interface DelayedVisibleShotMsg {
  type: 'DELAYED_VISIBLE_SHOT'
  delayMs?: number
}

/** popup → SW：直接对可视区域做 OCR（内部页面无法注入选区器时） */
export interface OcrVisibleMsg {
  type: 'OCR_VISIBLE'
}

/** SW → page-shot content script：整页截图开始（返回视口/总高） */
export interface PageShotBeginMsg {
  type: 'PAGE_SHOT_BEGIN'
}

/** SW → page-shot content script：滚到第 index 步（返回该步需要的 CSS 高度） */
export interface PageShotStepMsg {
  type: 'PAGE_SHOT_STEP'
  index: number
}

/** SW → page-shot content script：结束并恢复滚动位置 */
export interface PageShotEndMsg {
  type: 'PAGE_SHOT_END'
}

/** region-picker → SW：选区确认 */
export interface RegionSelectedMsg {
  type: 'REGION_SELECTED'
  crop: CropRect
  viewportWidth: number
  purpose?: RegionPurpose
}

/** SW → region-picker：携带启动参数 */
export interface RegionConfigMsg {
  type: 'REGION_CONFIG'
  micEnabled: boolean
  cameraEnabled: boolean
  format: RecordingFormat
  resolution: Resolution
  countdownMs?: number
  purpose?: RegionPurpose
}

export interface GetStateMsg {
  type: 'GET_STATE'
}

export type ControlAction =
  | 'CONTROL_PAUSE'
  | 'CONTROL_RESUME'
  | 'CONTROL_STOP'
  | 'CONTROL_DELETE'
  | 'CONTROL_CAMERA_ON'
  | 'CONTROL_CAMERA_OFF'
  | 'CONTROL_MIC_ON'
  | 'CONTROL_MIC_OFF'

export interface ControlMsg {
  type: ControlAction
}

/** 控制条 → SW：取消倒计时（SW 再广播给录制宿主，中止未开始的录制） */
export interface CountdownCancelMsg {
  type: 'COUNTDOWN_CANCEL'
}

/** 控制条 → SW：倒计时消息已到达页面（诊断链路用） */
export interface CountdownSeenMsg {
  type: 'COUNTDOWN_SEEN'
}

/** 倒计时被取消：recorder 尚未开录，直接清理 */
export const RECORD_CANCELLED = '__reclink_cancelled__'

export type ToBackgroundMessage =
  | StartRecordingMsg
  | GetStateMsg
  | ControlMsg
  | StartRegionMsg
  | RegionSelectedMsg
  | OpenRecorderWindowMsg
  | CountdownCancelMsg
  | CountdownSeenMsg
  | CaptureVisibleMsg
  | StartScreenPickMsg
  | FullPageShotMsg
  | DelayedVisibleShotMsg
  | OcrVisibleMsg
  | ShotSavedMsg

/** service worker → offscreen document / recorder-window 页 */
export interface OffscreenPingMsg {
  type: 'OFFSCREEN_PING'
}

/** SW → offscreen：整屏截图（getDisplayMedia 选源后抓单帧） */
export interface OffscreenShotMsg {
  type: 'OFFSCREEN_SHOT'
}

export interface OffscreenStartMsg {
  type: 'OFFSCREEN_START'
  mode: RecordingMode
  /** tab 模式必填；screen 走 getDisplayMedia、camera 走 gUM，均无需 */
  streamId?: string
  micEnabled: boolean
  cameraEnabled?: boolean
  crop?: CropRect
  viewportWidth?: number
  format: RecordingFormat
  resolution: Resolution
  /** 控制条（倒计时）注入的标签页 */
  targetTabId?: number
  /** 取流成功后先倒计时再开录 */
  countdownMs?: number
}

export interface OffscreenControlMsg {
  type: 'OFFSCREEN_CONTROL'
  action: 'pause' | 'resume' | 'stop' | 'delete' | 'camera-on' | 'camera-off' | 'mic-on' | 'mic-off'
}

/** 录制被丢弃（delete）：不保存，仅清理 */
export interface OffscreenDiscardedMsg {
  type: 'OFFSCREEN_DISCARDED'
}

export type ToOffscreenMessage = OffscreenPingMsg | OffscreenShotMsg | OffscreenStartMsg | OffscreenControlMsg

/** offscreen document / recorder-window 页 → service worker */
export interface OffscreenStoppedMsg {
  type: 'OFFSCREEN_STOPPED'
  /** 仅入库失败时存在（回退自动下载用；宿主页面关闭前有效） */
  blobUrl?: string
  sizeBytes: number
  durationMs: number
  mimeType: string
  mode: RecordingMode
  startedAt: number
  /** 已存入录制库的记录 id（入库失败为空） */
  recordingId?: string
}

/** recorder-window 截图模式 / popup 导入图片 → SW：静态图已入库（SW 打开完成页） */
export interface ShotSavedMsg {
  type: 'SHOT_SAVED'
  recordingId: string
}

/** offscreen 引擎 → SW：开录成功（录制状态的唯一写入点，含 SW 回收后重建） */
export interface RecordingStartedMsg {
  type: 'RECORDING_STARTED'
  mode: RecordingMode
  /** 控制条注入的锚点标签页（camera 模式可为 null） */
  targetTabId: number | null
  micEnabled: boolean
  cameraEnabled?: boolean
}

export type FromOffscreenMessage =
  | OffscreenStoppedMsg
  | OffscreenDiscardedMsg
  | OffscreenCountdownMsg
  | CameraAuthedMsg
  | ShotSavedMsg
  | RecordingStartedMsg

/** 宿主（offscreen/recorder-window）→ SW：请求在目标页显示开录倒计时 */
export interface OffscreenCountdownMsg {
  type: 'OFFSCREEN_COUNTDOWN'
  targetTabId: number
  seconds: number
}

/** recorder-window 授权窗 → SW：摄像头权限已授予（重发暂存的 camera 启动请求） */
export interface CameraAuthedMsg {
  type: 'CAMERA_AUTHED'
}

/** service worker → popup / content script 广播 */
export interface StateChangedMsg {
  type: 'STATE_CHANGED'
  state: RecordingState
  /** 控制栏设置开关（false 时控制条脚本只显示倒计时遮罩，不渲染控制栏） */
  barEnabled?: boolean
}

/** SW → 目标页控制条：开录倒计时 */
export interface CountdownMsg {
  type: 'COUNTDOWN'
  seconds: number
}

export interface SaveCompleteMsg {
  type: 'SAVE_COMPLETE'
  ok: boolean
  recordingId?: string
  filename?: string
  error?: string
}

export type BroadcastMessage = StateChangedMsg | SaveCompleteMsg | CountdownMsg
