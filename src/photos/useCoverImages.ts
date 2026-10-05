import { useEffect, useRef, useState } from 'react'
import { getCovers, getImage, type Crop, type ImageSize, type PhotoDb } from '../storage/db'

// A photo ready to draw: its image URL plus what is needed to place it by its crop.
export interface PhotoImage {
  photoId: string
  href: string
  crop: Crop | null
  // Size of the stored photo, for placing it by its crop.
  width: number
  height: number
}

export type CoverImage = PhotoImage

// The smallest stored size that stays sharp for a photo area this many device pixels across.
// Decoded images cost width × height × 4 bytes (1024 px ≈ 4 MB, 2048 px ≈ 16 MB), so only
// territories that are large on screen get the bigger versions.
export function sizeForScreen(devicePx: number): ImageSize {
  if (devicePx > 1024) return 'full'
  if (devicePx > 256) return 'map'
  return 'thumb'
}

// Image URLs for the photo shown on each territory, in the size from `sizes`
// (territories not listed get the thumbnail).
export function useCoverImages(
  db: PhotoDb | null,
  version: number,
  sizes: ReadonlyMap<string, ImageSize>,
): Map<string, CoverImage> {
  const [covers, setCovers] = useState<Map<string, CoverImage>>(() => new Map())
  // Object URLs by `${photoId}:${size}`, reused across reloads and revoked once unused.
  const urls = useRef(new Map<string, string>())
  const sizesKey = [...sizes]
    .map(([id, size]) => `${id}=${size}`)
    .sort()
    .join(',')

  useEffect(() => {
    if (!db) return
    let cancelled = false
    const wanted = new Map(
      sizesKey ? sizesKey.split(',').map((entry) => entry.split('=') as [string, ImageSize]) : [],
    )
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
        const size = wanted.get(territoryId) ?? 'thumb'
        const { key, url } = await urlFor(photo.id, size)
        if (!url) continue
        used.add(key)
        const { id: photoId, crop, width, height } = photo
        next.set(territoryId, { photoId, href: url, crop, width, height })
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
  }, [db, version, sizesKey])

  useEffect(() => {
    const cache = urls.current
    return () => {
      for (const url of cache.values()) URL.revokeObjectURL(url)
      cache.clear()
    }
  }, [])

  return covers
}
