import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { formatDate, t } from '../i18n'
import { useImageUrl } from '../photos/useImageUrl'
import type { Photo, PhotoDb } from '../storage/db'
import './PhotoViewer.css'

// Horizontal travel in px after which a swipe turns the page.
const SWIPE_DISTANCE = 50

interface Props {
  db: PhotoDb
  photos: Photo[]
  index: number
  coverId: string | undefined
  thumbs: Map<string, string>
  // False while a dialog or editor is open on top, so arrow keys do not act underneath.
  active: boolean
  onIndexChange: (index: number) => void
  onClose: () => void
  onMakeCover: (photo: Photo) => void
  onEditCrop: (photo: Photo) => void
  onDelete: (photo: Photo) => void
}

export function PhotoViewer({
  db,
  photos,
  index,
  coverId,
  thumbs,
  active,
  onIndexChange,
  onClose,
  onMakeCover,
  onEditCrop,
  onDelete,
}: Props) {
  const photo = photos[index]
  const full = useImageUrl(db, photo.id, 'full')
  const swipeStart = useRef<number | null>(null)
  const [dragX, setDragX] = useState(0)

  const hasPrev = index > 0
  const hasNext = index < photos.length - 1
  const go = (delta: number) => {
    const next = index + delta
    if (next >= 0 && next < photos.length) onIndexChange(next)
  }

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    swipeStart.current = e.clientX
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (swipeStart.current !== null) setDragX(e.clientX - swipeStart.current)
  }

  function handlePointerUp() {
    if (dragX < -SWIPE_DISTANCE) go(1)
    if (dragX > SWIPE_DISTANCE) go(-1)
    swipeStart.current = null
    setDragX(0)
  }

  const isCover = photo.id === coverId

  return (
    <div
      className="photo-viewer"
      role="dialog"
      aria-label={t('photoOf', { index: index + 1, total: photos.length })}
    >
      <header className="photo-viewer-header">
        <span className="photo-viewer-counter">
          {t('photoOf', { index: index + 1, total: photos.length })}
          {photo.takenAt !== null && (
            <span className="photo-viewer-date">{formatDate(photo.takenAt)}</span>
          )}
          {isCover && <span className="photo-viewer-badge">{t('isCover')}</span>}
        </span>
        <button
          type="button"
          className="photo-viewer-close"
          onClick={onClose}
          aria-label={t('close')}
        >
          ×
        </button>
      </header>

      <div
        className="photo-viewer-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          key={photo.id}
          src={full ?? thumbs.get(photo.id)}
          alt=""
          draggable={false}
          style={{ transform: `translateX(${dragX}px)` }}
        />
        {hasPrev && (
          <button
            type="button"
            className="photo-viewer-nav photo-viewer-prev"
            onClick={() => go(-1)}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={t('previous')}
          >
            ‹
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            className="photo-viewer-nav photo-viewer-next"
            onClick={() => go(1)}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={t('next')}
          >
            ›
          </button>
        )}
      </div>

      <footer className="photo-viewer-actions">
        <button type="button" onClick={() => onMakeCover(photo)} disabled={isCover}>
          {t('makeCover')}
        </button>
        <button type="button" onClick={() => onEditCrop(photo)}>
          {t('editCrop')}
        </button>
        <button type="button" className="photo-viewer-delete" onClick={() => onDelete(photo)}>
          {t('deletePhoto')}
        </button>
      </footer>
    </div>
  )
}
