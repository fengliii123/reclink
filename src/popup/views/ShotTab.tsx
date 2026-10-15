import type { RefObject } from 'react'
import {
  ChevronDownIcon,
  ClockIcon,
  ImportImageIcon,
  PageIcon,
  RegionIcon,
  ScanTextIcon,
  ScreenIcon,
  VisibleIcon,
} from '../icons'
import { t } from '../../shared/i18n'

export type ShotAction = 'visible' | 'region' | 'screen' | 'ocr' | 'fullpage' | 'delayed'

interface Props {
  onShot: (action: ShotAction) => void
  onImportImage: () => void
  fileInputRef: RefObject<HTMLInputElement>
  onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void
}

/** 截图 Tab：3 列即点即拍卡片 + 功能行 + 存储位置行（对齐 AS 参考图） */
export default function ShotTab({ onShot, onImportImage, fileInputRef, onImportFile }: Props) {
  return (
    <div className="content">
      <div className="shot-cards">
        <button className="shot-card" onClick={() => onShot('visible')}>
          <span className="mode-icon blue">
            <VisibleIcon size={21} />
          </span>
          <span className="mode-label">{t('shotVisible')}</span>
        </button>
        <button className="shot-card" onClick={() => onShot('fullpage')}>
          <span className="mode-icon">
            <PageIcon size={21} />
          </span>
          <span className="mode-label">{t('shotFullpage')}</span>
        </button>
        <button className="shot-card" onClick={() => onShot('region')}>
          <span className="mode-icon">
            <RegionIcon size={21} />
          </span>
          <span className="mode-label">{t('shotRegion')}</span>
        </button>
      </div>

      <div className="shot-rows">
        <button className="shot-row" onClick={() => onShot('delayed')}>
          <span className="row-icon">
            <ClockIcon size={17} />
          </span>
          {t('shotDelayed')}
        </button>
        <button className="shot-row" onClick={() => onShot('screen')}>
          <span className="row-icon">
            <ScreenIcon size={17} />
          </span>
          {t('shotScreen')}
        </button>
        <button className="shot-row" onClick={onImportImage}>
          <span className="row-icon">
            <ImportImageIcon size={17} />
          </span>
          {t('shotAnnotate')}
        </button>
        <button className="shot-row" onClick={() => onShot('ocr')}>
          <span className="row-icon">
            <ScanTextIcon size={17} />
          </span>
          {t('shotOcr')}
        </button>
      </div>

      <div className="storage-row">
        <span>{t('storageTo')}</span>
        <span className="storage-chip">
          💻 {t('storageLocal')} <ChevronDownIcon size={12} className="caret" />
        </span>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onImportFile} />
    </div>
  )
}
