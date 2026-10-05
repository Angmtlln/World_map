import { describe, expect, it } from 'vitest'
import type { Photo } from '../storage/db'
import { coverFirst } from './order'

const photo = (id: string): Photo => ({
  id,
  territoryId: 'FRA',
  addedAt: 0,
  takenAt: null,
  width: 1,
  height: 1,
  crop: null,
})

describe('coverFirst', () => {
  const photos = ['a', 'b', 'c'].map(photo)

  it('moves the cover to the front and keeps the rest in order', () => {
    expect(coverFirst(photos, 'c').map((p) => p.id)).toEqual(['c', 'a', 'b'])
  })

  it('leaves the order alone without a known cover', () => {
    expect(coverFirst(photos, undefined).map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(coverFirst(photos, 'zzz').map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })
})
