import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  groupAt,
  createMapGeometry,
  isWrapped,
  outlineWithoutCuts,
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

  it('zooms to the clicked group of a territory with far-away parts', () => {
    const usa = shape('USA')
    const alaska = projection([-150, 64])!
    const [[x0], [x1]] = groupAt(usa, alaska).bounds
    expect(x1 - x0).toBeLessThan(MAP_WIDTH / 2)
    // The mainland is in the same group as Alaska.
    expect(x1).toBeGreaterThan(projection([-75, 40])![0])
    const hawaii = projection([-155.5, 19.6])!
    expect(groupAt(usa, hawaii).bounds[1][0] - groupAt(usa, hawaii).bounds[0][0]).toBeLessThan(10)
  })

  it('gives far-away parts their own photo group', () => {
    const france = shape('FRA')
    expect(france.groups.length).toBeGreaterThan(1)
    // The largest group is metropolitan France.
    const [x, y] = projection([2.5, 46.5])!
    const [[x0, y0], [x1, y1]] = france.groups[0].bounds
    expect(x > x0 && x < x1 && y > y0 && y < y1).toBe(true)
  })

  it('keeps archipelagos in one photo group', () => {
    for (const id of ['IDN', 'JPN', 'PHL', 'GRC', 'CAN']) {
      expect(shape(id).groups, id).toHaveLength(1)
    }
  })

  it('leaves the 180th meridian cut out of the selection outline', () => {
    // The raw rings do run along the cut, otherwise this test would prove nothing.
    const { geometry } = shape('RU-CHU').feature
    const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()
    expect(
      rings.some((r) =>
        r.some((p, i) => i > 0 && Math.abs(p[0]) > 179.999 && Math.abs(r[i - 1][0]) > 179.999),
      ),
    ).toBe(true)
    const lines = outlineWithoutCuts(shape('RU-CHU').feature).coordinates
    const cutEdges = lines.flatMap((line) =>
      line.slice(1).filter((p, i) => Math.abs(p[0]) > 179.999 && Math.abs(line[i][0]) > 179.999),
    )
    expect(cutEdges).toEqual([])
    expect(lines.length).toBeGreaterThan(0)
  })
})
