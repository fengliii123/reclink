export const STORAGE_STATE_KEY = 'reclink:state'

export const STORAGE_SETTINGS_KEY = 'reclink:settings'

export const OFFSCREEN_URL = 'src/offscreen/offscreen.html'

export const RECORDER_TIMESLICE_MS = 1000

/**
 * recorder-window（camera 一次性授权窗）尺寸：创建与页面内尺寸自愈共用，必须一致。
 */
export const RECORDER_WINDOW_SIZE: Record<'camera', { width: number; height: number }> = {
  camera: { width: 500, height: 560 },
}

export function recordingFilename(mode: string, startedAt: number, mimeType: string): string {
  const d = new Date(startedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('mp4') ? 'mp4' : 'webm'
  return `reclink/${mode}-${stamp}.${ext}`
}
