import { describe, expect, it } from 'vitest'
import {
  fitInside,
  looksLikeHeic,
  processImage,
  UnreadableImageError,
  type Deps,
  type Drawable,
  type Surface,
} from './resize'

describe('fitInside', () => {
  it('scales the longest side down to the limit', () => {
    expect(fitInside({ width: 4032, height: 3024 }, 2048)).toEqual({ width: 2048, height: 1536 })
    expect(fitInside({ width: 3024, height: 4032 }, 256)).toEqual({ width: 192, height: 256 })
  })

  it('never scales up', () => {
    expect(fitInside({ width: 800, height: 600 }, 2048)).toEqual({ width: 800, height: 600 })
  })

  it('keeps at least one pixel on a very thin panorama', () => {
    expect(fitInside({ width: 20000, height: 10 }, 256).height).toBe(1)
  })
})

describe('looksLikeHeic', () => {
  it('recognises HEIC by type or by name', () => {
    expect(looksLikeHeic(new Blob([], { type: 'image/heic' }))).toBe(true)
    expect(looksLikeHeic(new File([], 'IMG_0001.HEIC'))).toBe(true)
    expect(looksLikeHeic(new File([], 'IMG_0001.jpg', { type: 'image/jpeg' }))).toBe(false)
  })
})

// A fake canvas that records draws and encodes to a blob of the requested type,
// or to PNG for WebP when imitating Safari.
function fakeDeps(original: { width: number; height: number }, webp = true) {
  const draws: string[] = []
  const deps: Deps = {
    decode: async () => ({ ...original }) as Drawable,
    createSurface(width, height): Surface {
      const source = { width, height } as Drawable
      return {
        width,
        height,
        source,
        draw: (from, w, h) => draws.push(`${from.width}x${from.height}->${w}x${h}`),
        encode: async (type) =>
          new Blob([`${width}x${height}`], {
            type: type === 'image/webp' && !webp ? 'image/png' : type,
          }),
      }
    },
  }
  return { deps, draws }
}

describe('processImage', () => {
  it('makes the three sizes from a phone photo', async () => {
    const { deps } = fakeDeps({ width: 4032, height: 3024 })
    const result = await processImage(new Blob(), deps)
    expect(result).toMatchObject({ width: 2048, height: 1536 })
    expect(await result.images.full.text()).toBe('2048x1536')
    expect(await result.images.map.text()).toBe('1024x768')
    expect(await result.images.thumb.text()).toBe('256x192')
    expect(result.images.full.type).toBe('image/webp')
  })

  it('halves in steps instead of one big jump', async () => {
    const { deps, draws } = fakeDeps({ width: 8000, height: 6000 })
    await processImage(new Blob(), deps)
    expect(draws.slice(0, 3)).toEqual([
      '8000x6000->4000x3000',
      '4000x3000->2048x1536',
      '2048x1536->1024x768',
    ])
  })

  it('falls back to JPEG where the browser cannot encode WebP', async () => {
    const { deps } = fakeDeps({ width: 1000, height: 1000 }, false)
    const result = await processImage(new Blob(), deps)
    expect(result.images.full.type).toBe('image/jpeg')
    expect(result.images.thumb.type).toBe('image/jpeg')
  })

  it('reports a HEIC file the browser cannot decode', async () => {
    const deps: Deps = {
      ...fakeDeps({ width: 1, height: 1 }).deps,
      decode: () => Promise.reject(new Error('decode failed')),
    }
    const error = await processImage(new File([], 'IMG_1.heic'), deps).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UnreadableImageError)
    expect((error as UnreadableImageError).heic).toBe(true)
  })
})
