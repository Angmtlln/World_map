import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addPhoto,
  deletePhoto,
  getCovers,
  getImage,
  getPhotos,
  openPhotoDb,
  setCover,
  type NewPhoto,
  type PhotoDb,
} from './db'

let db: PhotoDb
let dbName: string
let counter = 0

beforeEach(async () => {
  dbName = `test-${++counter}`
  db = await openPhotoDb(dbName)
})

afterEach(async () => {
  db.close()
  indexedDB.deleteDatabase(dbName)
})

const image = (label: string) => new Blob([label], { type: 'image/webp' })

const newPhoto = (territoryId: string, addedAt: number): NewPhoto => ({
  territoryId,
  addedAt,
  takenAt: null,
  width: 2048,
  height: 1536,
  images: { thumb: image('thumb'), map: image('map'), full: image('full') },
})

describe('photo storage', () => {
  it('saves a photo with all three image sizes', async () => {
    const photo = await addPhoto(db, newPhoto('FRA', 1))
    expect(photo).toMatchObject({ territoryId: 'FRA', addedAt: 1, crop: null })
    for (const size of ['thumb', 'map', 'full'] as const) {
      expect(await (await getImage(db, photo.id, size))?.text()).toBe(size)
    }
  })

  it('lists the photos of one territory in the order they were added', async () => {
    const second = await addPhoto(db, newPhoto('FRA', 20))
    const first = await addPhoto(db, newPhoto('FRA', 10))
    await addPhoto(db, newPhoto('RU-MOW', 15))
    expect((await getPhotos(db, 'FRA')).map((p) => p.id)).toEqual([first.id, second.id])
  })

  it('deletes a photo together with its images', async () => {
    const photo = await addPhoto(db, newPhoto('FRA', 1))
    await deletePhoto(db, photo.id)
    expect(await getPhotos(db, 'FRA')).toEqual([])
    expect(await getImage(db, photo.id, 'full')).toBeUndefined()
  })

  it('keeps data after the database is reopened', async () => {
    const photo = await addPhoto(db, newPhoto('FRA', 1))
    db.close()
    db = await openPhotoDb(dbName)
    expect((await getPhotos(db, 'FRA'))[0].id).toBe(photo.id)
  })
})

describe('covers', () => {
  it('uses the first added photo by default', async () => {
    const first = await addPhoto(db, newPhoto('FRA', 1))
    await addPhoto(db, newPhoto('FRA', 2))
    const moscow = await addPhoto(db, newPhoto('RU-MOW', 3))
    const covers = await getCovers(db)
    expect(covers.get('FRA')?.id).toBe(first.id)
    expect(covers.get('RU-MOW')?.id).toBe(moscow.id)
    expect(covers.has('DEU')).toBe(false)
  })

  it('uses the chosen cover when there is one', async () => {
    await addPhoto(db, newPhoto('FRA', 1))
    const chosen = await addPhoto(db, newPhoto('FRA', 2))
    await setCover(db, 'FRA', chosen.id)
    expect((await getCovers(db)).get('FRA')?.id).toBe(chosen.id)
  })

  it('falls back to the first photo when the chosen cover is deleted', async () => {
    const first = await addPhoto(db, newPhoto('FRA', 1))
    const chosen = await addPhoto(db, newPhoto('FRA', 2))
    await setCover(db, 'FRA', chosen.id)
    await deletePhoto(db, chosen.id)
    expect((await getCovers(db)).get('FRA')?.id).toBe(first.id)
  })

  it('drops the territory from covers when its last photo is deleted', async () => {
    const only = await addPhoto(db, newPhoto('FRA', 1))
    await deletePhoto(db, only.id)
    expect((await getCovers(db)).has('FRA')).toBe(false)
  })
})
