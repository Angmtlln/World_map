import exifr from 'exifr/dist/mini.esm.mjs'

export interface PhotoMeta {
  // Wall-clock time on the camera, stored as if it were UTC: EXIF usually has no time zone,
  // and "14:30 on the day of the trip" is what matters. Format it with timeZone 'UTC'.
  takenAt: number | null
}

const NO_META: PhotoMeta = { takenAt: null }

// "2023:07:12 14:30:05" → milliseconds, read as UTC. Null for missing or zeroed dates.
export function parseExifDate(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim())
  if (!m) return null
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number)
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null
  return Date.UTC(year, month - 1, day, hour, minute, second)
}

// The mini build of exifr has no tag dictionaries, so tags come keyed by number
// (and picking them by name throws).
const DATE_TAGS = [
  0x9003, // DateTimeOriginal: when the shutter fired
  0x9004, // CreateDate (DateTimeDigitized)
  0x0132, // DateTime: last modified, the weakest hint
]

// Date taken from a photo's EXIF. Never throws: a photo without metadata (or with
// broken metadata) is still a photo.
export async function readMeta(file: Blob | ArrayBuffer | Uint8Array): Promise<PhotoMeta> {
  try {
    // GPS is skipped: the app does not use where a photo was taken.
    const tags = (await exifr.parse(file, { reviveValues: false, gps: false })) as
      Record<string, unknown> | undefined
    if (!tags) return NO_META
    const takenAt = DATE_TAGS.map((tag) => parseExifDate(tags[tag])).find((t) => t !== null)
    return { takenAt: takenAt ?? null }
  } catch {
    return NO_META
  }
}
