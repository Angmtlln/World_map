import { readMeta, type PhotoMeta } from './exif'
import { processImage, type Deps, type ProcessedImage } from './resize'

export interface ProcessedPhoto extends ProcessedImage {
  meta: PhotoMeta
}

// The three sizes and the EXIF data, in one pass over the file. The metadata has to be
// read from the original: the re-encoded versions carry no EXIF.
export async function processWithMeta(file: Blob, deps: Deps): Promise<ProcessedPhoto> {
  const [image, meta] = await Promise.all([processImage(file, deps), readMeta(file)])
  return { ...image, meta }
}
