import { geoEqualEarth, geoPath, type GeoProjection } from 'd3-geo'
import type { Feature, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'

export type TerritoryKind = 'country' | 'region'

export interface TerritoryProps {
  id: string
  kind: TerritoryKind
  name_ru: string
  name_en: string
}

export type TerritoryFeature = Feature<Polygon | MultiPolygon, TerritoryProps>

export type WorldTopology = Topology<{
  countries: GeometryCollection<TerritoryProps>
  regions: GeometryCollection<TerritoryProps>
}>

export const WORLD_URL = `${import.meta.env.BASE_URL}data/world.topo.json`

// Map coordinates: the whole world is MAP_WIDTH wide; height follows the projection.
export const MAP_WIDTH = 1000

// Central meridian 11°E puts the map edge (169°W) through the Bering Strait, between
// Big Diomede (Russia) and Little Diomede (USA), so Chukotka stays whole. No meridian there
// misses every US island: this one cuts St. Lawrence Island, which groupParts allows for.
export const CENTRAL_MERIDIAN = 11

// Territories smaller than this in map units² get a visible dot so they can be found.
export const TINY_AREA = 2

// Parts of a territory further apart than this (map units; 1 unit ≈ 40 km at the equator)
// form separate groups, each with its own copy of the photo: France and French Guiana,
// the USA and Hawaii. Archipelagos like Indonesia stay one group.
export const GROUP_GAP = 25

export interface World {
  countries: TerritoryFeature[]
  regions: TerritoryFeature[]
  // Borders are drawn as one mesh of arcs shared by two territories, not as outlines of
  // each territory. That leaves out the cuts Natural Earth makes along the 180th meridian,
  // which would otherwise show up as a line through Chukotka and Wrangel Island.
  countryBorders: MultiLineString
  regionBorders: MultiLineString
}

export function toWorld(topology: WorldTopology): World {
  const { countries, regions } = topology.objects
  const all: GeometryCollection<TerritoryProps> = {
    type: 'GeometryCollection',
    geometries: [...countries.geometries, ...regions.geometries],
  }
  const isRegion = (g: { properties?: unknown }) =>
    (g.properties as TerritoryProps | undefined)?.kind === 'region'
  return {
    countries: feature(topology, countries).features as TerritoryFeature[],
    regions: feature(topology, regions).features as TerritoryFeature[],
    countryBorders: mesh(topology, all, (a, b) => a !== b && !(isRegion(a) && isRegion(b))),
    regionBorders: mesh(topology, all, (a, b) => a !== b && isRegion(a) && isRegion(b)),
  }
}

export async function loadWorld(url = WORLD_URL): Promise<World> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url}: HTTP ${res.status}`)
  return toWorld((await res.json()) as WorldTopology)
}

export interface MapGeometry {
  projection: GeoProjection
  width: number
  height: number
}

export function createMapGeometry(): MapGeometry {
  const projection = geoEqualEarth().rotate([-CENTRAL_MERIDIAN, 0])
  projection.fitWidth(MAP_WIDTH, { type: 'Sphere' })
  const [[, y0], [, y1]] = geoPath(projection).bounds({ type: 'Sphere' })
  return { projection, width: MAP_WIDTH, height: Math.ceil(y1 - y0) }
}

export type Bounds = [[number, number], [number, number]]

function polygons(f: TerritoryFeature): Polygon[] {
  return f.geometry.type === 'Polygon'
    ? [f.geometry]
    : f.geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }))
}

// A cluster of nearby polygons of one territory, filled with one copy of the photo.
export interface PartGroup {
  d: string
  bounds: Bounds
  area: number
}

// Precomputed, zoom-independent drawing data for one territory.
export interface Shape {
  feature: TerritoryFeature
  d: string
  bounds: Bounds
  // Where the dot goes for tiny territories; null for everything visible on its own.
  dot: [number, number] | null
  // Bounds of each separate polygon, used to zoom to the clicked side of a wrapped territory.
  parts: { bounds: Bounds }[]
  // Groups of nearby parts, the largest (by area) first.
  groups: PartGroup[]
  // The territory's edge without the cuts Natural Earth makes along the 180th meridian,
  // for drawing the selection.
  outline: string
}

export function unionBounds(list: Bounds[]): Bounds {
  return [
    [Math.min(...list.map((b) => b[0][0])), Math.min(...list.map((b) => b[0][1]))],
    [Math.max(...list.map((b) => b[1][0])), Math.max(...list.map((b) => b[1][1]))],
  ]
}

function gap(a: Bounds, b: Bounds): number {
  const dx = Math.max(0, a[0][0] - b[1][0], b[0][0] - a[1][0])
  const dy = Math.max(0, a[0][1] - b[1][1], b[0][1] - a[1][1])
  return Math.hypot(dx, dy)
}

// A polygon cut by the map edge projects to bounds spanning the whole map.
const spansMap = ([[x0], [x1]]: Bounds) => x1 - x0 > MAP_WIDTH / 2

// Single-linkage clustering: parts closer than GROUP_GAP to any part of a group join it.
// A part cut by the map edge stays on its own: its bounds would touch everything.
function groupParts(parts: { bounds: Bounds; d: string; area: number }[]): PartGroup[] {
  const groupOf = parts.map((_, i) => i)
  const find = (i: number): number => (groupOf[i] === i ? i : (groupOf[i] = find(groupOf[i])))
  for (let i = 0; i < parts.length; i++) {
    if (spansMap(parts[i].bounds)) continue
    for (let j = i + 1; j < parts.length; j++) {
      if (spansMap(parts[j].bounds)) continue
      if (gap(parts[i].bounds, parts[j].bounds) < GROUP_GAP) groupOf[find(i)] = find(j)
    }
  }
  const members = new Map<number, typeof parts>()
  parts.forEach((part, i) => members.set(find(i), [...(members.get(find(i)) ?? []), part]))
  return [...members.values()]
    .map((list) => ({
      d: list.map((p) => p.d).join(''),
      bounds: unionBounds(list.map((p) => p.bounds)),
      area: list.reduce((sum, p) => sum + p.area, 0),
    }))
    .sort((a, b) => b.area - a.area)
}

const onCut = (p: Position) => Math.abs(p[0]) > 179.999

// Rings broken into lines wherever an edge runs along the 180th meridian.
export function outlineWithoutCuts(f: TerritoryFeature): MultiLineString {
  const lines: Position[][] = []
  for (const polygon of polygons(f)) {
    for (const ring of polygon.coordinates) {
      let line: Position[] = [ring[0]]
      for (let i = 1; i < ring.length; i++) {
        if (onCut(ring[i - 1]) && onCut(ring[i])) {
          if (line.length > 1) lines.push(line)
          line = [ring[i]]
        } else {
          line.push(ring[i])
        }
      }
      if (line.length > 1) lines.push(line)
    }
  }
  return { type: 'MultiLineString', coordinates: lines }
}

export function toShape(f: TerritoryFeature, projection: GeoProjection): Shape {
  const path = geoPath(projection)
  const parts = polygons(f).map((polygon) => ({
    bounds: path.bounds(polygon) as Bounds,
    d: path(polygon) ?? '',
    area: path.area(polygon),
  }))
  let dot: Shape['dot'] = null
  if (path.area(f) < TINY_AREA) {
    const largest = polygons(f).reduce((a, b) => (path.area(b) > path.area(a) ? b : a))
    dot = path.centroid(largest)
  }
  return {
    feature: f,
    d: path(f) ?? '',
    bounds: path.bounds(f) as Bounds,
    dot,
    parts: parts.map(({ bounds }) => ({ bounds })),
    groups: groupParts(parts),
    outline: path(outlineWithoutCuts(f)) ?? '',
  }
}

export function width(b: Bounds): number {
  return b[1][0] - b[0][0]
}

// Territories cut by the map edge (USA, Kiribati) have bounds spanning the whole map.
export function isWrapped(shape: Shape): boolean {
  return width(shape.bounds) > MAP_WIDTH / 2
}

// The group of parts under (or nearest to) a point in map coordinates: a click on French
// Guiana zooms to Guiana, a click on Alaska to Alaska and the mainland, not the whole map.
export function groupAt(shape: Shape, point: [number, number]): PartGroup {
  const box: Bounds = [point, point]
  return shape.groups.reduce((a, b) => (gap(box, b.bounds) < gap(box, a.bounds) ? b : a))
}
