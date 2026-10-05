import { geoEqualEarth, geoPath, type GeoProjection } from 'd3-geo'
import type { Feature, MultiLineString, MultiPolygon, Polygon } from 'geojson'
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

// Central meridian 11°E puts the map edge (169°W) through the Bering Strait,
// between Big Diomede (Russia) and Little Diomede (USA), so Chukotka stays whole.
export const CENTRAL_MERIDIAN = 11

// Territories smaller than this in map units² get a visible dot so they can be found.
export const TINY_AREA = 2

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

// Precomputed, zoom-independent drawing data for one territory.
export interface Shape {
  feature: TerritoryFeature
  d: string
  bounds: Bounds
  // Where the dot goes for tiny territories; null for everything visible on its own.
  dot: [number, number] | null
  // Bounds of each separate polygon, used to zoom to the clicked side of a wrapped territory.
  parts: { bounds: Bounds }[]
}

export function toShape(f: TerritoryFeature, projection: GeoProjection): Shape {
  const path = geoPath(projection)
  const parts = polygons(f).map((polygon) => ({ bounds: path.bounds(polygon) as Bounds }))
  let dot: Shape['dot'] = null
  if (path.area(f) < TINY_AREA) {
    const largest = polygons(f).reduce((a, b) => (path.area(b) > path.area(a) ? b : a))
    dot = path.centroid(largest)
  }
  return { feature: f, d: path(f) ?? '', bounds: path.bounds(f) as Bounds, dot, parts }
}

export function width(b: Bounds): number {
  return b[1][0] - b[0][0]
}

// Territories cut by the map edge (USA, Kiribati) have bounds spanning the whole map.
export function isWrapped(shape: Shape): boolean {
  return width(shape.bounds) > MAP_WIDTH / 2
}

// For a territory cut by the map edge: the bounds of its parts on the same half of the map
// as the point, so a click on Alaska shows Alaska and the mainland, not the whole map.
export function boundsOnSide(shape: Shape, [x]: [number, number]): Bounds {
  const left = x < MAP_WIDTH / 2
  const side = shape.parts.filter(
    (p) => (p.bounds[0][0] + p.bounds[1][0]) / 2 < MAP_WIDTH / 2 === left,
  )
  if (!side.length) return shape.bounds
  return [
    [Math.min(...side.map((p) => p.bounds[0][0])), Math.min(...side.map((p) => p.bounds[0][1]))],
    [Math.max(...side.map((p) => p.bounds[1][0])), Math.max(...side.map((p) => p.bounds[1][1]))],
  ]
}
