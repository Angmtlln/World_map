import { describe, expect, it } from 'vitest'
import { clampCrop, imageRect, isDefaultCrop, MAX_SCALE, panCrop, zoomCrop } from './crop'

// A wide box and a 4:3 photo: at scale 1 the photo is as wide as the box and taller.
const box = { width: 200, height: 100 }
const photo = { width: 4000, height: 3000 }

describe('imageRect', () => {
  it('covers the box and centres the photo by default', () => {
    expect(imageRect(box, photo, null)).toEqual({ x: 0, y: -25, width: 200, height: 150 })
  })

  it('applies offset and scale', () => {
    const r = imageRect(box, photo, { x: 0.1, y: 0, scale: 2 })
    expect(r).toEqual({ x: -100 + 20, y: -100, width: 400, height: 300 })
  })
})

describe('clampCrop', () => {
  it('never lets the photo shrink below covering the box', () => {
    expect(clampCrop(box, photo, { x: 0, y: 0, scale: 0.5 }).scale).toBe(1)
    expect(clampCrop(box, photo, { x: 0, y: 0, scale: 99 }).scale).toBe(MAX_SCALE)
  })

  it('stops the photo edge at the box edge', () => {
    // At scale 1 the photo is exactly as wide as the box: no room to move sideways,
    // and 25 units of spare height on each side, a quarter of the box height.
    expect(clampCrop(box, photo, { x: 0.3, y: 0.9, scale: 1 })).toEqual({ x: 0, y: 0.25, scale: 1 })
  })
})

describe('panCrop', () => {
  it('moves by a share of the box size', () => {
    const c = panCrop(box, photo, { x: 0, y: 0, scale: 2 }, 20, -10)
    expect(c.x).toBeCloseTo(0.1)
    expect(c.y).toBeCloseTo(-0.1)
  })
})

describe('zoomCrop', () => {
  it('keeps the point under the fingers in place', () => {
    const before = { x: 0, y: 0, scale: 1 }
    const focus = { x: 50, y: 20 }
    const after = zoomCrop(box, photo, before, 2, focus)
    // The photo pixel under the focus point, as a share of the photo, must not change.
    const pixelAt = (crop: typeof before) => {
      const r = imageRect(box, photo, crop)
      const px = box.width / 2 + focus.x
      const py = box.height / 2 + focus.y
      return [(px - r.x) / r.width, (py - r.y) / r.height]
    }
    expect(pixelAt(after)[0]).toBeCloseTo(pixelAt(before)[0])
    expect(pixelAt(after)[1]).toBeCloseTo(pixelAt(before)[1])
  })

  it('zooming out to scale 1 recentres as far as the edges require', () => {
    const c = zoomCrop(box, photo, { x: 0.4, y: 0, scale: 2 }, 0.5, { x: 0, y: 0 })
    expect(c).toEqual({ x: 0, y: 0, scale: 1 })
  })
})

describe('isDefaultCrop', () => {
  it('recognises the untouched crop', () => {
    expect(isDefaultCrop({ x: 0, y: 0, scale: 1 })).toBe(true)
    expect(isDefaultCrop({ x: 0.01, y: 0, scale: 1 })).toBe(false)
  })
})
