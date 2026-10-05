// Turns one photo file into the three stored sizes. Runs in a Web Worker when possible,
// otherwise on the main thread; the decoder and canvas are passed in so the same code
// works in both places and in tests.

import type { ImageSize } from '../storage/db'

// Longest side in px. Smaller photos are never scaled up.
export const MAX_SIDE: Record<ImageSize, number> = { thumb: 256, map: 1024, full: 2048 }
export const QUALITY = 0.85
const PREFERRED_TYPE = 'image/webp'
// Safari cannot encode WebP from a canvas and silently returns PNG instead.
const FALLBACK_TYPE = 'image/jpeg'

export interface Size {
  width: number
  height: number
}

export function fitInside({ width, height }: Size, maxSide: number): Size {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

// Anything drawImage accepts and that knows its size: ImageBitmap, canvases.
export type Drawable = CanvasImageSource & Size

export interface Surface extends Size {
  source: Drawable
  draw(from: Drawable, width: number, height: number): void
  encode(type: string, quality: number): Promise<Blob>
}

export interface Deps {
  decode(file: Blob): Promise<Drawable>
  createSurface(width: number, height: number): Surface
}

export interface ProcessedImage extends Size {
  images: Record<ImageSize, Blob>
}

export class UnreadableImageError extends Error {
  readonly heic: boolean

  constructor(heic: boolean) {
    super(heic ? 'HEIC is not supported by this browser' : 'The file is not a readable image')
    this.heic = heic
  }
}

export function looksLikeHeic(file: Blob & { name?: string }): boolean {
  return /image\/hei[cf]/.test(file.type) || /\.hei[cf]$/i.test(file.name ?? '')
}

// Halving in steps keeps downscaled photos sharp: a single big jump makes most browsers
// skip pixels and alias.
function scaleDown(deps: Deps, from: Drawable, target: Size): Surface {
  let source = from
  let current: Size = { width: from.width, height: from.height }
  while (current.width / 2 >= target.width && current.height / 2 >= target.height) {
    current = { width: Math.round(current.width / 2), height: Math.round(current.height / 2) }
    const step = deps.createSurface(current.width, current.height)
    step.draw(source, current.width, current.height)
    source = step.source
  }
  const out = deps.createSurface(target.width, target.height)
  out.draw(source, target.width, target.height)
  return out
}

async function encode(surface: Surface): Promise<Blob> {
  const blob = await surface.encode(PREFERRED_TYPE, QUALITY)
  return blob.type === PREFERRED_TYPE ? blob : surface.encode(FALLBACK_TYPE, QUALITY)
}

export async function processImage(file: Blob, deps: Deps): Promise<ProcessedImage> {
  let original: Drawable
  try {
    // The decoder applies the EXIF orientation, so width/height are as the photo is seen.
    original = await deps.decode(file)
  } catch {
    throw new UnreadableImageError(looksLikeHeic(file))
  }
  // Each size is made from the previous one: cheaper, and the quality is the same.
  const full = scaleDown(deps, original, fitInside(original, MAX_SIDE.full))
  // A decoded 12 MP photo holds ~48 MB; free it now rather than whenever GC gets to it.
  if ('close' in original && typeof original.close === 'function') original.close()
  const map = scaleDown(deps, full.source, fitInside(full, MAX_SIDE.map))
  const thumb = scaleDown(deps, map.source, fitInside(map, MAX_SIDE.thumb))
  const [fullBlob, mapBlob, thumbBlob] = await Promise.all([full, map, thumb].map(encode))
  return {
    width: full.width,
    height: full.height,
    images: { full: fullBlob, map: mapBlob, thumb: thumbBlob },
  }
}

// The real browser implementations of Deps.
export function browserDeps(): Deps {
  return {
    decode: (file) => createImageBitmap(file, { imageOrientation: 'from-image' }),
    createSurface(width, height) {
      const canvas =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(width, height)
          : Object.assign(document.createElement('canvas'), { width, height })
      const ctx = canvas.getContext('2d') as
        CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
      if (!ctx) throw new Error('2D canvas is not available')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      return {
        width,
        height,
        source: canvas,
        draw: (from, w, h) => ctx.drawImage(from, 0, 0, w, h),
        // HTMLCanvasElement does not exist inside a worker, so test for the method.
        encode: (type, quality) =>
          'convertToBlob' in canvas
            ? canvas.convertToBlob({ type, quality })
            : new Promise<Blob>((resolve, reject) =>
                canvas.toBlob(
                  (b) => (b ? resolve(b) : reject(new Error('Encoding failed'))),
                  type,
                  quality,
                ),
              ),
      }
    },
  }
}
