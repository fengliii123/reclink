interface IconProps {
  size?: number
  className?: string
}

export function ScreenIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="1.5" y="3" width="17" height="11.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 17.75h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 14.5v3.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function TabIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="1.5" y="3" width="17" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M1.5 7h17" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="4.4" cy="5" r="0.9" fill="currentColor" />
      <circle cx="7" cy="5" r="0.9" fill="currentColor" />
    </svg>
  )
}

export function CameraIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="1.5" y="4" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14.5 9l3.2-2.2a.5.5 0 0 1 .8.4v5.6a.5.5 0 0 1-.8.4L14.5 11" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function LibraryIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="1.5" y="4" width="17" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 7.5l4.5 2.5L8 12.5v-5z" fill="currentColor" />
    </svg>
  )
}

export function TrashIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M3.5 5.5h13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8 5.5V4a1.5 1.5 0 0 1 1.5-1.5h1A1.5 1.5 0 0 1 12 4v1.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.5 5.5l.8 10a1.5 1.5 0 0 0 1.5 1.4h4.4a1.5 1.5 0 0 0 1.5-1.4l.8-10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8.3 8.5v5M11.7 8.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function PauseIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" className={className}>
      <rect x="5" y="4" width="3.4" height="12" rx="1.2" />
      <rect x="11.6" y="4" width="3.4" height="12" rx="1.2" />
    </svg>
  )
}

export function PlayIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M6.2 3.9a1.1 1.1 0 0 1 1.66-.95l9.1 5.6a1.1 1.1 0 0 1 0 1.88l-9.1 5.6a1.1 1.1 0 0 1-1.66-.95V3.9z" transform="translate(-1.5 0)" />
    </svg>
  )
}

export function StopIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" className={className}>
      <rect x="4" y="4" width="12" height="12" rx="2.5" />
    </svg>
  )
}

/** 摄像头卡片：框内人像（Awesome Screenshot 样式） */
export function PersonCamIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="1.5" y="2.5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="10" cy="8.2" r="2.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.6 15.2a4.6 4.6 0 0 1 8.8 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/** 区域录制卡片：虚线选框 */
export function RegionIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M6 2.5H4A1.5 1.5 0 0 0 2.5 4v2M14 2.5h2A1.5 1.5 0 0 1 17.5 4v2M6 17.5H4A1.5 1.5 0 0 1 2.5 16v-2M14 17.5h2a1.5 1.5 0 0 0 1.5-1.5v-2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

/** 录屏 Tab：摄影机 */
export function VideoCamIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="1.5" y="5" width="12" height="10.5" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M13.5 9l3.6-2.4a.5.5 0 0 1 .8.4v6a.5.5 0 0 1-.8.4l-3.6-2.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 可见区域截图卡片：取景框内一只眼睛 */
export function VisibleIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M1.5 7V4.5A1.5 1.5 0 0 1 3 3h2.5M14.5 3H17a1.5 1.5 0 0 1 1.5 1.5V7M18.5 13v2.5a1.5 1.5 0 0 1-1.5 1.5h-2.5M5.5 17H3a1.5 1.5 0 0 1-1.5-1.5V13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M4.5 10s2-3.4 5.5-3.4S15.5 10 15.5 10s-2 3.4-5.5 3.4S4.5 10 4.5 10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" />
    </svg>
  )
}

/** 整个页面卡片：带滚动箭头的文档 */
export function PageIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M4 2.5h8l3.5 3.5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M11.5 2.5V6h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 8.5v5M7.6 11.2L10 13.6l2.4-2.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** 延迟截取：时钟 + 逆时针箭头 */
export function ClockIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="10" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 7.5v3l2 1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.2 4.2L3.5 4.8l.7 2.9M3.5 4.8A7.6 7.6 0 0 1 10 2.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** 导入图片：相框 + 加号 */
export function ImportImageIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="1.8" y="3.5" width="13.4" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6" cy="7.3" r="1.3" fill="currentColor" />
      <path d="M2.5 12.8l3.4-3.2 4.2 4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.6 11.4l1.9-1.8 3.4 3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="15.4" cy="14.6" r="3.2" fill="#fff" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15.4 13v3.2M13.8 14.6h3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** OCR：括线夹文本行 */
export function ScanTextIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M2.5 6.5V4A1.5 1.5 0 0 1 4 2.5h2.5M13.5 2.5H16A1.5 1.5 0 0 1 17.5 4v2.5M17.5 13.5V16a1.5 1.5 0 0 1-1.5 1.5h-2.5M6.5 17.5H4A1.5 1.5 0 0 1 2.5 16v-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M5.5 7h9M5.5 10h6.5M5.5 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
