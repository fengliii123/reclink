import { t } from './i18n'
import type { LibraryMode } from './types'

/** 录制库条目类型标签（complete / library 共用，i18n） */
export function modeLabel(mode: LibraryMode): string {
  return t(`label${mode.charAt(0).toUpperCase()}${mode.slice(1)}`)
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return m > 0 ? t('durMinSec', [String(m), ss]) : t('durSec', [String(s)])
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatTime(ts: number, withSeconds = false): string {
  const d = new Date(ts)
  const pad = (v: number) => String(v).padStart(2, '0')
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return withSeconds ? `${base}:${pad(d.getSeconds())}` : base
}

/** 修复 MediaRecorder 产出的 webm/fmp4 缺失 duration（loadedmetadata 后调用一次） */
export function fixWebmDuration(video: HTMLVideoElement): void {
  const onLoaded = () => {
    if (video.duration === Infinity) {
      video.currentTime = 1e10
      const onSeeked = () => {
        video.removeEventListener('timeupdate', onSeeked)
        video.currentTime = 0
      }
      video.addEventListener('timeupdate', onSeeked)
    }
    video.removeEventListener('loadedmetadata', onLoaded)
  }
  video.addEventListener('loadedmetadata', onLoaded)
}
