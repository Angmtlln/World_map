import { describe, expect, it } from 'vitest'
import { parseExifDate, readMeta } from './exif'
import { jpegWithExif } from './exifFixture'

describe('parseExifDate', () => {
  it('reads the EXIF date as wall-clock time', () => {
    expect(parseExifDate('2023:07:12 14:30:05')).toBe(Date.UTC(2023, 6, 12, 14, 30, 5))
  })

  it('rejects missing and zeroed dates', () => {
    expect(parseExifDate(undefined)).toBeNull()
    expect(parseExifDate('0000:00:00 00:00:00')).toBeNull()
    expect(parseExifDate('not a date')).toBeNull()
  })
})

describe('readMeta', () => {
  it('reads the date taken from a JPEG', async () => {
    const meta = await readMeta(jpegWithExif('2023:07:12 14:30:05'))
    expect(meta.takenAt).toBe(Date.UTC(2023, 6, 12, 14, 30, 5))
  })

  it('returns nothing for a file without EXIF instead of failing', async () => {
    expect(await readMeta(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toEqual({ takenAt: null })
  })
})
