import { useRef, type ChangeEvent } from 'react'
import { t, territoryName } from './i18n'
import type { TerritoryProps } from './map/geo'
import type { AddErrors, AddProgress } from './photos/useAddPhotos'
import type { Photo } from './storage/db'
import './TerritoryPanel.css'

// With more photos than this the strip gets an "All photos" button for the grid.
const STRIP_LIMIT = 3

interface Props {
  territory: TerritoryProps
  // Cover first.
  photos: Photo[]
  thumbs: Map<string, string>
  coverId: string | undefined
  progress: AddProgress | null
  errors: AddErrors | null
  busy: boolean
  onAddFiles: (files: File[]) => void
  // Absent while the territory has no photo shown on the map.
  onEditCrop?: () => void
  onOpenPhoto: (index: number) => void
  onShowAll: () => void
  onClose: () => void
}

export function TerritoryPanel({
  territory,
  photos,
  thumbs,
  coverId,
  progress,
  errors,
  busy,
  onAddFiles,
  onEditCrop,
  onOpenPhoto,
  onShowAll,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const ownProgress = progress?.territoryId === territory.id ? progress : null
  const ownErrors = errors?.territoryId === territory.id ? errors.messages : []

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    // Reset so choosing the same file again still fires a change.
    event.target.value = ''
    onAddFiles(files)
  }

  const count = photos.length
  const status = ownProgress
    ? t('processing', { done: ownProgress.done, total: ownProgress.total })
    : count
      ? t('photoCount', { count })
      : t('noPhotos')

  return (
    <section className="territory-panel" aria-label={territoryName(territory)}>
      <header className="territory-panel-header">
        <div className="territory-panel-title">
          <h2 className="territory-panel-name">{territoryName(territory)}</h2>
          <div className="territory-panel-meta">
            {territory.kind === 'region' ? t('kindRegion') : t('kindCountry')} · {status}
          </div>
        </div>
        <button
          type="button"
          className="territory-panel-close"
          onClick={onClose}
          aria-label={t('close')}
        >
          ×
        </button>
      </header>

      {count > 0 && (
        <div className="territory-panel-strip">
          <ul className="territory-panel-thumbs">
            {photos.map((photo, i) => (
              <li key={photo.id}>
                <button
                  type="button"
                  className={photo.id === coverId ? 'is-cover' : undefined}
                  onClick={() => onOpenPhoto(i)}
                  aria-label={t('photoOf', { index: i + 1, total: count })}
                >
                  <img src={thumbs.get(photo.id)} alt="" />
                </button>
              </li>
            ))}
          </ul>
          {count > STRIP_LIMIT && (
            <button type="button" className="territory-panel-all" onClick={onShowAll}>
              {t('allPhotos')}
            </button>
          )}
        </div>
      )}

      {ownErrors.length > 0 && (
        <ul className="territory-panel-errors" role="alert">
          {ownErrors.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      )}

      <div className="territory-panel-actions">
        {onEditCrop && (
          <button type="button" className="territory-panel-secondary" onClick={onEditCrop}>
            {t('editCrop')}
          </button>
        )}
        <button
          type="button"
          className="territory-panel-add"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {t('addPhotos')}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
    </section>
  )
}
