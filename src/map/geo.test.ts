import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  boundsOnSide,
  createMapGeometry,
  isWrapped,
  MAP_WIDTH,
  toShape,
  toWorld,
  width,
} from './geo'
import type { WorldTopology } from './geo'

// Checks the generated public/data/world.topo.json, so a rebuild of the data
// that breaks drawing fails here instead of on the map.
const world = toWorld(
  JSON.parse(readFileSync('public/data/world.topo.json', 'utf8')) as WorldTopology,
)
const { projection, height } = createMapGeometry()
const shapes = [...world.countries, ...world.regions].map((f) => toShape(f, projection))
const shape = (id: string) => shapes.find((s) => s.feature.properties.id === id)!

describe('world data', () => {
  it('has the expected layers and unique ids', () => {
    expect(world.countries).toHaveLength(257)
    expect(world.regions).toHaveLength(85)
    const ids = shapes.map((s) => s.feature.properties.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has no Russia in the countries layer', () => {
    expect(world.countries.map((f) => f.properties.id)).not.toContain('RUS')
  })

  it('draws every territory inside the map', () => {
    for (const s of shapes) {
      expect(s.d, s.feature.properties.id).not.toBe('')
      const [[x0, y0], [x1, y1]] = s.bounds
      expect(x0).toBeGreaterThanOrEqual(-1)
      expect(y0).toBeGreaterThanOrEqual(-1)
      expect(x1).toBeLessThanOrEqual(MAP_WIDTH + 1)
      expect(y1).toBeLessThanOrEqual(height + 1)
    }
  })

  it('cuts only the USA and Antarctica at the map edge', () => {
    expect(shapes.filter(isWrapped).map((s) => s.feature.properties.id)).toEqual(['USA', 'ATA'])
  })

  it('keeps Chukotka whole across the 180th meridian', () => {
    expect(width(shape('RU-CHU').bounds)).toBeLessThan(MAP_WIDTH / 10)
  })

  it('draws no border along the 180th meridian cut', () => {
    const onCut = (lon: number) => Math.abs(lon) > 179.999
    for (const line of [...world.countryBorders.coordinates, ...world.regionBorders.coordinates]) {
      for (let i = 1; i < line.length; i++) {
        expect(onCut(line[i - 1][0]) && onCut(line[i][0])).toBe(false)
      }
    }
  })

  it('draws Russia–Kazakhstan as a country border, not a region border', () => {
    // A stretch of the border south of Orenburg, around 51°N 55–60°E.
    const nearBorder = (lines: number[][][]) =>
      lines.some((line) =>
        line.some(([lon, lat]) => lon > 55 && lon < 60 && lat > 50.5 && lat < 51.5),
      )
    expect(nearBorder(world.countryBorders.coordinates)).toBe(true)
    expect(nearBorder(world.regionBorders.coordinates)).toBe(false)
  })

  it('gives tiny territories a dot', () => {
    expect(shape('VAT').dot).not.toBeNull()
    expect(shape('MCO').dot).not.toBeNull()
    expect(shape('FRA').dot).toBeNull()
  })

  it('zooms to the clicked side of a territory cut by the map edge', () => {
    const usa = shape('USA')
    const alaska = projection([-150, 64])!
    const [[x0], [x1]] = boundsOnSide(usa, alaska)
    expect(x1 - x0).toBeLessThan(MAP_WIDTH / 2)
    // The mainland is on the same side as Alaska and is included.
    expect(x1).toBeGreaterThan(projection([-75, 40])![0])
  })
})
