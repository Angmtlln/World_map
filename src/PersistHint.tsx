import { t } from './i18n'
import './PersistHint.css'

export function PersistHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="persist-hint" role="status">
      <p>{t('persistHint')}</p>
      <button type="button" onClick={onDismiss}>
        {t('dismiss')}
      </button>
    </div>
  )
}
