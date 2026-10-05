// Builds a minimal JPEG whose EXIF block holds only a date taken, for tests.
// Not used by the app.
export function jpegWithExif(date: string) {
  // Big-endian TIFF: header, IFD0 with a pointer to the Exif IFD, which holds
  // DateTimeOriginal; the 20-byte date string follows at offset 44.
  const tiff = new Uint8Array(64)
  const v = new DataView(tiff.buffer)
  tiff.set([0x4d, 0x4d, 0x00, 0x2a])
  v.setUint32(4, 8)
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    v.setUint16(at, tag)
    v.setUint16(at + 2, type)
    v.setUint32(at + 4, count)
    v.setUint32(at + 8, value)
  }
  v.setUint16(8, 1)
  entry(10, 0x8769, 4, 1, 26) // Exif IFD pointer
  v.setUint16(26, 1)
  entry(28, 0x9003, 2, 20, 44) // DateTimeOriginal
  tiff.set(new TextEncoder().encode(date.slice(0, 19)), 44)

  const header = new TextEncoder().encode('Exif\0\0')
  const length = 2 + header.length + tiff.length
  return new Uint8Array([
    ...[0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff],
    ...header,
    ...tiff,
    ...[0xff, 0xd9],
  ])
}
