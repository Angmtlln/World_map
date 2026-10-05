import type { Photo } from '../storage/db'

// The cover goes first; the rest keep their order (by when they were added).
export function coverFirst(photos: Photo[], coverId: string | undefined): Photo[] {
  const cover = photos.find((p) => p.id === coverId)
  return cover ? [cover, ...photos.filter((p) => p !== cover)] : photos
}
