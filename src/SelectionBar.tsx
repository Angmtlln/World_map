import { t, territoryName } from './i18n'
import type { TerritoryProps } from './map/geo'
import './SelectionBar.css'

interface Props {
  territory: TerritoryProps
  onClose: () => void
}

export function SelectionBar({ territory, onClose }: Props) {
  return (
    <div className="selection-bar" role="status">
      <div className="selection-bar-text">
        <div className="selection-bar-name">{territoryName(territory)}</div>
        <div className="selection-bar-kind">
          {territory.kind === 'region' ? t('kindRegion') : t('kindCountry')}
        </div>
      </div>
      <button
        type="button"
        className="selection-bar-close"
        onClick={onClose}
        aria-label={t('close')}
      >
        ×
      </button>
    </div>
  )
}
