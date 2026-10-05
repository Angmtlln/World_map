import { useEffect, useRef, useState } from 'react'
import { getImage, getPhotos, type Photo, type PhotoDb } from '../storage/db'

export interface TerritoryPhotos {
  photos: Photo[]
  // Object URLs of the thumbnails, by photo id.
  thumbs: Map<string, string>
}

const EMPTY: TerritoryPhotos = { photos: [], thumbs: new Map() }

const revoke = (urls: Iterable<string>) => {
  for (const url of urls) URL.revokeObjectURL(url)
}

// Photos of one territory with their thumbnails. Bump `version` to reload after a change.
export function useTerritoryPhotos(
  db: PhotoDb | null,
  territoryId: string | null,
  version: number,
): TerritoryPhotos {
  const [loaded, setLoaded] = useState<{ territoryId: string; value: TerritoryPhotos } | null>(null)
  // Thumbnail URLs currently on screen. They are revoked only once replaced, so the
  // old thumbnails stay visible while a reload is in flight.
  const shownUrls = useRef<string[]>([])

  useEffect(() => {
    if (!db || !territoryId) return
    let cancelled = false
    void (async () => {
      const photos = await getPhotos(db, territoryId)
      const thumbs = new Map<string, string>()
      for (const photo of photos) {
        const blob = await getImage(db, photo.id, 'thumb')
        if (blob) thumbs.set(photo.id, URL.createObjectURL(blob))
      }
      if (cancelled) {
        revoke(thumbs.values())
        return
      }
      const previous = shownUrls.current
      shownUrls.current = [...thumbs.values()]
      setLoaded({ territoryId, value: { photos, thumbs } })
      revoke(previous)
    })()
    return () => {
      cancelled = true
    }
  }, [db, territoryId, version])

  useEffect(() => {
    const urls = shownUrls
    return () => revoke(urls.current)
  }, [])

  // Show nothing for a territory that has not loaded yet rather than the previous one's photos.
  return loaded && loaded.territoryId === territoryId ? loaded.value : EMPTY
}
