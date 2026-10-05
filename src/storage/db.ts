import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export const DB_NAME = 'world-map'
const DB_VERSION = 1

// thumb 256 px for the gallery, map 1024 px for the fill on the map, full 2048 px for viewing.
export type ImageSize = 'thumb' | 'map' | 'full'
export const IMAGE_SIZES: readonly ImageSize[] = ['thumb', 'map', 'full']

// How the photo sits inside the territory outline: offset and scale relative to the
// territory's bounding box. Set by the crop editor; null means "cover the box".
export interface Crop {
  x: number
  y: number
  scale: number
}

export interface Photo {
  id: string
  territoryId: string
  addedAt: number
  // From EXIF when available (step 2.3).
  takenAt: number | null
  // Size of the full version, for layout before the image loads.
  width: number
  height: number
  crop: Crop | null
}

// Per-territory settings. A territory without a record uses its first photo as the cover.
export interface TerritoryRecord {
  id: string
  coverPhotoId: string | null
}

interface ImageRecord {
  photoId: string
  size: ImageSize
  blob: Blob
}

interface Schema extends DBSchema {
  photos: { key: string; value: Photo; indexes: { byTerritory: string } }
  // Image blobs live apart from the metadata so lists of photos stay cheap to read
  // and each size can be loaded (and later synced) on its own.
  images: { key: [string, ImageSize]; value: ImageRecord }
  territories: { key: string; value: TerritoryRecord }
}

export type PhotoDb = IDBPDatabase<Schema>

export function openPhotoDb(name = DB_NAME): Promise<PhotoDb> {
  return openDB<Schema>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const photos = db.createObjectStore('photos', { keyPath: 'id' })
        photos.createIndex('byTerritory', 'territoryId')
        db.createObjectStore('images', { keyPath: ['photoId', 'size'] })
        db.createObjectStore('territories', { keyPath: 'id' })
      }
    },
  })
}

export interface NewPhoto {
  territoryId: string
  takenAt: number | null
  width: number
  height: number
  images: Record<ImageSize, Blob>
  addedAt?: number
}

export async function addPhoto(db: PhotoDb, input: NewPhoto): Promise<Photo> {
  const photo: Photo = {
    id: crypto.randomUUID(),
    territoryId: input.territoryId,
    addedAt: input.addedAt ?? Date.now(),
    takenAt: input.takenAt,
    width: input.width,
    height: input.height,
    crop: null,
  }
  // One transaction: either the photo and all its sizes are saved, or nothing is.
  const tx = db.transaction(['photos', 'images'], 'readwrite')
  await Promise.all([
    tx.objectStore('photos').add(photo),
    ...IMAGE_SIZES.map((size) =>
      tx.objectStore('images').add({ photoId: photo.id, size, blob: input.images[size] }),
    ),
    tx.done,
  ])
  return photo
}

const byAddedAt = (a: Photo, b: Photo) => a.addedAt - b.addedAt || a.id.localeCompare(b.id)

export async function getPhotos(db: PhotoDb, territoryId: string): Promise<Photo[]> {
  const photos = await db.getAllFromIndex('photos', 'byTerritory', territoryId)
  return photos.sort(byAddedAt)
}

export async function getImage(
  db: PhotoDb,
  photoId: string,
  size: ImageSize,
): Promise<Blob | undefined> {
  return (await db.get('images', [photoId, size]))?.blob
}

export async function deletePhoto(db: PhotoDb, photoId: string): Promise<void> {
  const tx = db.transaction(['photos', 'images', 'territories'], 'readwrite')
  const photo = await tx.objectStore('photos').get(photoId)
  if (photo) {
    const territories = tx.objectStore('territories')
    const territory = await territories.get(photo.territoryId)
    if (territory?.coverPhotoId === photoId) {
      await territories.put({ ...territory, coverPhotoId: null })
    }
  }
  await Promise.all([
    tx.objectStore('photos').delete(photoId),
    ...IMAGE_SIZES.map((size) => tx.objectStore('images').delete([photoId, size])),
    tx.done,
  ])
}

export async function setCover(db: PhotoDb, territoryId: string, photoId: string): Promise<void> {
  await db.put('territories', { id: territoryId, coverPhotoId: photoId })
}

// The photo shown on the map for every territory that has photos:
// the chosen cover if there is one, otherwise the first photo added.
export async function getCovers(db: PhotoDb): Promise<Map<string, Photo>> {
  const [photos, territories] = await Promise.all([db.getAll('photos'), db.getAll('territories')])
  const byId = new Map(photos.map((p) => [p.id, p]))
  const covers = new Map<string, Photo>()
  for (const photo of photos.sort(byAddedAt)) {
    if (!covers.has(photo.territoryId)) covers.set(photo.territoryId, photo)
  }
  for (const t of territories) {
    const chosen = t.coverPhotoId ? byId.get(t.coverPhotoId) : undefined
    if (chosen) covers.set(t.id, chosen)
  }
  return covers
}
