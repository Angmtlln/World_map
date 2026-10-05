import { describe, expect, it } from 'vitest'
import { sizeForScreen } from './useCoverImages'

describe('sizeForScreen', () => {
  it('uses the thumbnail while the photo is small on screen', () => {
    expect(sizeForScreen(0)).toBe('thumb')
    expect(sizeForScreen(256)).toBe('thumb')
  })

  it('switches to 1024 px, then to 2048 px as the photo grows', () => {
    expect(sizeForScreen(257)).toBe('map')
    expect(sizeForScreen(1024)).toBe('map')
    expect(sizeForScreen(1025)).toBe('full')
  })
})
