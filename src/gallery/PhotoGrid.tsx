import { t } from '../i18n'
import type { Photo } from '../storage/db'
import './PhotoGrid.css'

interface Props {
  title: string
  photos: Photo[]
  coverId: string | undefined
  thumbs: Map<string, string>
  onOpen: (index: number) => void
  onClose: () => void
}

export function PhotoGrid({ title, photos, coverId, thumbs, onOpen, onClose }: Props) {
  return (
    <div className="photo-grid" role="dialog" aria-label={title}>
      <header className="photo-grid-header">
        <div>
          <h2 className="photo-grid-title">{title}</h2>
          <div className="photo-grid-meta">{t('photoCount', { count: photos.length })}</div>
        </div>
        <button
          type="button"
          className="photo-grid-close"
          onClick={onClose}
          aria-label={t('close')}
        >
          ×
        </button>
      </header>
      <ul className="photo-grid-list">
        {photos.map((photo, i) => (
          <li key={photo.id}>
            <button
              type="button"
              className={photo.id === coverId ? 'is-cover' : undefined}
              onClick={() => onOpen(i)}
            >
              <img src={thumbs.get(photo.id)} alt="" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
