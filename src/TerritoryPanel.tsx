import { useRef, type ChangeEvent } from 'react'
import { t, territoryName } from './i18n'
import type { TerritoryProps } from './map/geo'
import type { AddErrors, AddProgress } from './photos/useAddPhotos'
import type { TerritoryPhotos } from './photos/useTerritoryPhotos'
import './TerritoryPanel.css'

interface Props {
  territory: TerritoryProps
  photos: TerritoryPhotos
  progress: AddProgress | null
  errors: AddErrors | null
  busy: boolean
  onAddFiles: (files: File[]) => void
  onClose: () => void
}

export function TerritoryPanel({
  territory,
  photos,
  progress,
  errors,
  busy,
  onAddFiles,
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

  const count = photos.photos.length
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
        <ul className="territory-panel-thumbs">
          {photos.photos.map((photo) => (
            <li key={photo.id}>
              <img src={photos.thumbs.get(photo.id)} alt="" />
            </li>
          ))}
        </ul>
      )}

      {ownErrors.length > 0 && (
        <ul className="territory-panel-errors" role="alert">
          {ownErrors.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="territory-panel-add"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {t('addPhotos')}
      </button>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
    </section>
  )
}
