import { useEffect, useState } from 'react'
import type { RecordingFormat, Resolution } from '../../shared/messages'
import type { Settings } from '../hooks'
import { t } from '../../shared/i18n'

interface Props {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  onBack: () => void
}

/** 更多设置视图：倒计时开关 / 分辨率 / 格式 + 倒计时链路诊断（排障用） */
export default function MoreView({ settings, updateSettings, onBack }: Props) {
  const { countdown, resolution, format } = settings
  const [diag, setDiag] = useState<string>('')
  useEffect(() => {
    void chrome.storage.session
      .get(['reclink:cd', 'reclink:cdDeliver', 'reclink:cdSeen', 'reclink:cdTab', 'reclink:cdInj', 'reclink:cdNotif', 'reclink:cdIcon'])
      .then((o) => {
        const cd = o['reclink:cd'] as { at?: number } | undefined
        const deliver = o['reclink:cdDeliver'] as number | undefined
        const seen = o['reclink:cdSeen'] as number | undefined
        const tab = (o['reclink:cdTab'] as string | undefined) ?? '?'
        const inj = (o['reclink:cdInj'] as string | undefined) ?? '?'
        const notif = o['reclink:cdNotif'] as number | string | undefined
        const icon = o['reclink:cdIcon'] as number | undefined
        const ts = (n?: number) => (n ? new Date(n).toLocaleTimeString() : 'no')
        const notifStr =
          notif == null ? 'no' : typeof notif === 'number' ? ts(notif) : String(notif).slice(0, 40)
        setDiag(
          cd
            ? `v${chrome.runtime.getManifest().version} · relay=${ts(cd.at)} · sent=${ts(deliver)} · seen=${ts(seen)} · icon=${ts(icon)} · inj=${inj.slice(0, 30)} · notif=${notifStr} · page=${tab.slice(0, 50)}`
            : `v${chrome.runtime.getManifest().version} · —`,
        )
      })
  }, [])
  return (
    <div className="popup-page">
      <div className="back-bar">
        <span className="back-btn" onClick={onBack}>
          ‹ {t('back')}
        </span>
      </div>
      <div className="pref-list">
        <div className="pref-row">
          <div className="row-main">
            <span className="row-label">{t('countdownTitle')}</span>
            <span className="row-sub">{t('countdownSub')}</span>
          </div>
          <button className={`switch ${countdown ? 'on' : ''}`} onClick={() => updateSettings({ countdown: !countdown })}>
            <span className="switch-knob" />
          </button>
        </div>
        <div className="pref-row">
          <div className="row-main">
            <span className="row-label">{t('resLabel')}</span>
          </div>
          <label className="res-select">
            {resolution}
            <select value={resolution} onChange={(e) => updateSettings({ resolution: e.target.value as Resolution })}>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
              <option value="2160p">2160p (4K)</option>
            </select>
          </label>
        </div>
        <div className="pref-row">
          <div className="row-main">
            <span className="row-label">{t('fmtLabel')}</span>
            <span className="row-sub">{t('fmtSub')}</span>
          </div>
          <label className="res-select">
            {format.toUpperCase()}
            <select value={format} onChange={(e) => updateSettings({ format: e.target.value as RecordingFormat })}>
              <option value="mp4">MP4</option>
              <option value="webm">WebM</option>
            </select>
          </label>
        </div>
      </div>
      <div className="diag-box" title="countdown chain diagnostics">
        {t('diagCountdown')}: {diag}
      </div>
    </div>
  )
}
