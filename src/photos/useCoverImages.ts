import { useEffect, useRef, useState } from 'react'
import { getCovers, getImage, type Crop, type ImageSize, type PhotoDb } from '../storage/db'

export interface CoverImage {
  href: string
  crop: Crop | null
}

// Image URLs for the photo shown on each territory. Territories in `hiRes` (large on screen)
// get the 1024 px version, the rest the 256 px thumbnail: decoded 1024 px images take ~4 MB
// each, too much to hold for every country at once on a phone.
export function useCoverImages(
  db: PhotoDb | null,
  version: number,
  hiRes: ReadonlySet<string>,
): Map<string, CoverImage> {
  const [covers, setCovers] = useState<Map<string, CoverImage>>(() => new Map())
  // Object URLs by `${photoId}:${size}`, reused across reloads and revoked once unused.
  const urls = useRef(new Map<string, string>())
  const hiResKey = [...hiRes].sort().join(',')

  useEffect(() => {
    if (!db) return
    let cancelled = false
    const wanted = new Set(hiResKey ? hiResKey.split(',') : [])
    void (async () => {
      const cache = urls.current
      const urlFor = async (photoId: string, size: ImageSize) => {
        const key = `${photoId}:${size}`
        if (!cache.has(key)) {
          const blob = await getImage(db, photoId, size)
          if (blob) cache.set(key, URL.createObjectURL(blob))
        }
        return { key, url: cache.get(key) }
      }

      const next = new Map<string, CoverImage>()
      const used = new Set<string>()
      for (const [territoryId, photo] of await getCovers(db)) {
        const size = wanted.has(territoryId) ? 'map' : 'thumb'
        const { key, url } = await urlFor(photo.id, size)
        if (!url) continue
        used.add(key)
        next.set(territoryId, { href: url, crop: photo.crop })
      }
      // A newer run will take over; it reuses whatever this one put in the cache.
      if (cancelled) return
      setCovers(next)
      for (const [key, url] of cache) {
        if (!used.has(key)) {
          URL.revokeObjectURL(url)
          cache.delete(key)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [db, version, hiResKey])

  useEffect(() => {
    const cache = urls.current
    return () => {
      for (const url of cache.values()) URL.revokeObjectURL(url)
      cache.clear()
    }
  }, [])

  return covers
}
