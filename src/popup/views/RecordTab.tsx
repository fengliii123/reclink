import type { RecordingFormat, Resolution } from '../../shared/messages'
import type { Settings } from '../hooks'
import { t } from '../../shared/i18n'
import { ChevronDownIcon, PersonCamIcon, RegionIcon, ScreenIcon, TabIcon } from '../icons'

export type MenuMode = 'screen' | 'camera' | 'tab' | 'region'

const MODES: { mode: MenuMode; labelKey: string; Icon: typeof ScreenIcon }[] = [
  { mode: 'screen', labelKey: 'modeScreen', Icon: ScreenIcon },
  { mode: 'camera', labelKey: 'modeCamera', Icon: PersonCamIcon },
  { mode: 'tab', labelKey: 'modeTab', Icon: TabIcon },
  { mode: 'region', labelKey: 'modeRegion', Icon: RegionIcon },
]

interface Props {
  selected: MenuMode
  onSelect: (mode: MenuMode) => void
  cameraEnabled: boolean
  onToggleCamera: () => void
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  starting: boolean
  onStart: () => void
  onMore: () => void
}

/** 录屏 Tab：2×2 模式卡片 + 麦克风/人像/控制栏 + 设置行 + 开始按钮 */
export default function RecordTab({
  selected,
  onSelect,
  cameraEnabled,
  onToggleCamera,
  settings,
  updateSettings,
  starting,
  onStart,
  onMore,
}: Props) {
  const { micEnabled, showControlBar, format, resolution } = settings
  return (
    <div className="content">
      <div className="mode-grid">
        {MODES.map(({ mode, labelKey, Icon }) => (
          <button key={mode} className={`mode ${selected === mode ? 'active' : ''}`} onClick={() => onSelect(mode)}>
            <span className="mode-icon">
              <Icon size={22} />
            </span>
            <span className="mode-label">{t(labelKey)}</span>
          </button>
        ))}
      </div>

      <div className="toggle-row">
        <button
          className={`toggle-card ${micEnabled ? '' : 'muted'}`}
          title={micEnabled ? t('micOn') : t('micOff')}
          aria-label={t(micEnabled ? 'micOn' : 'micOff')}
          onClick={() => updateSettings({ micEnabled: !micEnabled })}
        >
          <span className="icon-wrap">
            <MicGlyph />
          </span>
          <ChevronDownIcon size={12} className="caret" />
        </button>
        <button
          className={`toggle-card ${cameraEnabled ? '' : 'muted'}`}
          title={cameraEnabled ? t('camOn') : t('camOff')}
          aria-label={t(cameraEnabled ? 'camOn' : 'camOff')}
          onClick={onToggleCamera}
        >
          <span className="icon-wrap">
            <PersonCamIcon size={16} />
          </span>
          <ChevronDownIcon size={12} className="caret" />
        </button>
        <div className="switch-card">
          <span className="switch-card-label">{t('controlBar')}</span>
          <button
            className={`switch ${showControlBar ? 'on' : ''}`}
            onClick={() => updateSettings({ showControlBar: !showControlBar })}
          >
            <span className="switch-knob" />
          </button>
        </div>
      </div>

      <div className="settings-row">
        <label className="setting-chip" title={t('resolution')}>
          <span className="badge solid">HD</span>
          {resolution}
          <ChevronDownIcon size={12} className="caret" />
          <select value={resolution} onChange={(e) => updateSettings({ resolution: e.target.value as Resolution })}>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            <option value="2160p">2160p (4K)</option>
          </select>
        </label>
        <label className="setting-chip" title={t('exportFormat')}>
          <span className="badge outline">{format.toUpperCase()}</span>
          <ChevronDownIcon size={12} className="caret" />
          <select value={format} onChange={(e) => updateSettings({ format: e.target.value as RecordingFormat })}>
            <option value="mp4">MP4</option>
            <option value="webm">WebM</option>
          </select>
        </label>
        <button className="more-link" onClick={onMore}>
          {t('more')} <span className="more-arrow">›</span>
        </button>
      </div>

      <button className="start" onClick={onStart} disabled={starting}>
        <span className="rec-ring" />
        {starting ? t('starting') : t('startRecording')}
      </button>
    </div>
  )
}

/** 麦克风小图标（toggle 卡用；静音斜杠由 CSS 画） */
function MicGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="7" y="1.8" width="6" height="10.4" rx="3" />
      <path d="M4 9.5a6 6 0 0 0 12 0" />
      <path d="M10 15.5v2.7M7 18.2h6" />
    </svg>
  )
}
