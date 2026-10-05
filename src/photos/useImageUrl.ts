import { useEffect, useState } from 'react'
import { getImage, type ImageSize, type PhotoDb } from '../storage/db'

// An object URL for one stored image, revoked when the photo changes or on unmount.
// Null while loading (or for a missing photo).
export function useImageUrl(db: PhotoDb, photoId: string | null, size: ImageSize): string | null {
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null)
  const key = photoId ? `${photoId}:${size}` : null

  useEffect(() => {
    if (!photoId || !key) return
    let url: string | null = null
    let cancelled = false
    void getImage(db, photoId, size).then((blob) => {
      if (!blob || cancelled) return
      url = URL.createObjectURL(blob)
      setLoaded({ key, url })
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [db, photoId, size, key])

  return loaded && loaded.key === key ? loaded.url : null
}
