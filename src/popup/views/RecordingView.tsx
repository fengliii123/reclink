import { useState } from 'react'
import type { RecordingState } from '../../shared/types'
import { t } from '../../shared/i18n'
import { PauseIcon, PlayIcon, StopIcon, TrashIcon } from '../icons'

interface Props {
  state: RecordingState
  elapsed: string
  finished: string | null
  error: string | null
  control: (type: 'CONTROL_PAUSE' | 'CONTROL_RESUME' | 'CONTROL_STOP' | 'CONTROL_DELETE') => void
}

/** 录制中视图：计时面板 + DISCARD/PAUSE/STOP */
export default function RecordingView({ state, elapsed, finished, error, control }: Props) {
  const [discardArmed, setDiscardArmed] = useState(false)
  const [camOn, setCamOn] = useState(false)

  return (
    <div className="popup-page">
      <div id="recording-view">
        <div className="title-area">
          <div className="title-left">
            <span className={`title-icon ${state.status === 'paused' ? 'paused' : ''}`} />
            {state.status === 'paused' ? t('recPaused') : state.status === 'saving' ? t('recSaving') : t('recRecording')}
          </div>
          {state.bubbleSupported && state.status !== 'saving' && (
            <div
              className="camera-action"
              onClick={() => {
                setCamOn(!camOn)
                chrome.runtime
                  .sendMessage({ type: camOn ? 'CONTROL_CAMERA_OFF' : 'CONTROL_CAMERA_ON' })
                  .catch(() => {})
              }}
            >
              {camOn ? t('recHideCam') : t('recEmbedCam')}
            </div>
          )}
        </div>
        <div className={`time-panel ${state.status === 'paused' ? 'paused' : ''}`}>
          <span className="time">{elapsed}</span>
        </div>
        {state.status !== 'saving' && (
          <div className="recording-action">
            <button
              className="ra-btn discard"
              onClick={() => {
                if (!discardArmed) {
                  setDiscardArmed(true)
                  return
                }
                control('CONTROL_DELETE')
              }}
            >
              <TrashIcon size={13} />
              {discardArmed ? t('recSure') : t('recDiscard')}
            </button>
            <button
              className="ra-btn pause"
              onClick={() => control(state.status === 'paused' ? 'CONTROL_RESUME' : 'CONTROL_PAUSE')}
            >
              {state.status === 'paused' ? <PlayIcon size={12} /> : <PauseIcon size={12} />}
              {state.status === 'paused' ? t('recResume') : t('recPause')}
            </button>
            <button className="ra-btn stop" onClick={() => control('CONTROL_STOP')}>
              <StopIcon size={11} />
              {t('recStop')}
            </button>
          </div>
        )}
      </div>
      {finished && <p className="saved">✓ {finished}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
