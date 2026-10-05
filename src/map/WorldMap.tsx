import { geoPath } from 'd3-geo'
import { pointer, select } from 'd3-selection'
import 'd3-transition'
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  boundsOnSide,
  createMapGeometry,
  isWrapped,
  toShape,
  type Bounds,
  type Shape,
  type World,
} from './geo'
import './WorldMap.css'

const MAX_ZOOM = 50
// Pointer travel in px below which a press counts as a click rather than a drag.
const CLICK_DISTANCE = 5
// Dot radius in screen px grows from MIN at the whole-world view to MAX at DOT_FULL_ZOOM.
const DOT_RADIUS_MIN = 2
const DOT_RADIUS_MAX = 4
const DOT_FULL_ZOOM = 8
const ZOOM_DURATION = 750
// Share of the screen the zoomed-to territory may take.
const ZOOM_FILL = 0.8
// On a tall phone screen the whole world is a thin strip, so start closer:
// the map takes this share of the screen height, centred on Eurasia.
const INITIAL_HEIGHT_SHARE = 0.5
const INITIAL_CENTER: [number, number] = [60, 45]

function dotRadius(k: number, fit: number): number {
  const t = Math.min(1, Math.max(0, Math.log(k / fit) / Math.log(DOT_FULL_ZOOM)))
  return (DOT_RADIUS_MIN + (DOT_RADIUS_MAX - DOT_RADIUS_MIN) * t) / k
}

interface Props {
  world: World
  selectedId: string | null
  onSelect: (id: string | null) => void
}

interface Size {
  w: number
  h: number
}

// A transform showing map point `center` in the middle of the screen at scale `k`.
// Programmatic transforms skip the zoom limits, so they are applied here as a gesture would.
function centeredTransform(
  behavior: ZoomBehavior<SVGSVGElement, unknown>,
  size: Size,
  k: number,
  [cx, cy]: number[],
): ZoomTransform {
  const [minK, maxK] = behavior.scaleExtent()
  const scale = Math.max(minK, Math.min(maxK, k))
  const target = zoomIdentity
    .translate(size.w / 2, size.h / 2)
    .scale(scale)
    .translate(-cx, -cy)
  const extent: Bounds = [
    [0, 0],
    [size.w, size.h],
  ]
  return behavior.constrain()(target, extent, behavior.translateExtent())
}

export function WorldMap({ world, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const layerRef = useRef<SVGGElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>(null)
  const [size, setSize] = useState<Size | null>(null)

  const geometry = useMemo(() => createMapGeometry(), [])
  const { shapes, byId, dots, sphere, countryBorders, regionBorders } = useMemo(() => {
    const { projection } = geometry
    const path = geoPath(projection)
    const shapes = [...world.countries, ...world.regions].map((f) => toShape(f, projection))
    return {
      shapes,
      byId: new Map(shapes.map((s) => [s.feature.properties.id, s])),
      dots: shapes.filter((s) => s.dot),
      sphere: path({ type: 'Sphere' }) ?? '',
      countryBorders: path(world.countryBorders) ?? '',
      regionBorders: path(world.regionBorders) ?? '',
    }
  }, [world, geometry])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: width, h: height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Zoom and pan are applied straight to the DOM: re-rendering ~350 paths per frame
  // through React would be far too slow.
  useEffect(() => {
    const svg = svgRef.current
    const layer = layerRef.current
    if (!svg || !layer || !size) return

    const { width, height } = geometry
    const fit = Math.min(size.w / width, size.h / height)
    const behavior = zoom<SVGSVGElement, unknown>()
      .extent([
        [0, 0],
        [size.w, size.h],
      ])
      .scaleExtent([fit, fit * MAX_ZOOM])
      .translateExtent([
        [0, 0],
        [width, height],
      ])
      .clickDistance(CLICK_DISTANCE)
      .on('zoom', ({ transform }: { transform: ZoomTransform }) => {
        layer.setAttribute('transform', transform.toString())
        const r = String(dotRadius(transform.k, fit))
        layer.querySelectorAll('.map-dot').forEach((dot) => dot.setAttribute('r', r))
      })

    const k = Math.max(fit, (INITIAL_HEIGHT_SHARE * size.h) / height)
    const center = k > fit ? geometry.projection(INITIAL_CENTER)! : [width / 2, height / 2]
    select(svg)
      .call(behavior)
      .call(behavior.transform, centeredTransform(behavior, size, k, center))
    zoomRef.current = behavior
    return () => {
      select(svg).on('.zoom', null)
    }
  }, [size, geometry])

  function zoomTo([[x0, y0], [x1, y1]]: Bounds) {
    const svg = svgRef.current
    const behavior = zoomRef.current
    if (!svg || !behavior || !size) return
    const k = ZOOM_FILL * Math.min(size.w / (x1 - x0 || 1), size.h / (y1 - y0 || 1))
    const target = centeredTransform(behavior, size, k, [(x0 + x1) / 2, (y0 + y1) / 2])
    select(svg).transition().duration(ZOOM_DURATION).call(behavior.transform, target)
  }

  function boundsToZoom(shape: Shape, event: MouseEvent): Bounds {
    if (!isWrapped(shape) || !layerRef.current) return shape.bounds
    return boundsOnSide(shape, pointer(event.nativeEvent, layerRef.current))
  }

  function handleClick(event: MouseEvent<SVGSVGElement>) {
    const target = (event.target as Element).closest<SVGElement>('[data-id]')
    const shape = target?.dataset.id ? byId.get(target.dataset.id) : undefined
    if (!shape) {
      onSelect(null)
      return
    }
    onSelect(shape.feature.properties.id)
    zoomTo(boundsToZoom(shape, event))
  }

  const pathProps = (s: Shape) => ({
    d: s.d,
    'data-id': s.feature.properties.id,
    className: s.feature.properties.id === selectedId ? 'is-selected' : undefined,
  })

  return (
    <div ref={containerRef} className="world-map">
      {size && (
        <svg
          ref={svgRef}
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          onClick={handleClick}
        >
          <g ref={layerRef}>
            <path className="map-sphere" d={sphere} />
            <g className="map-territories">
              {shapes.map((s) => (
                <path key={s.feature.properties.id} {...pathProps(s)} />
              ))}
            </g>
            <path className="map-region-borders" d={regionBorders} />
            <path className="map-country-borders" d={countryBorders} />
            <g className="map-dots">
              {dots.map((s) => (
                <circle
                  key={s.feature.properties.id}
                  className={`map-dot${s.feature.properties.id === selectedId ? ' is-selected' : ''}`}
                  data-id={s.feature.properties.id}
                  cx={s.dot![0]}
                  cy={s.dot![1]}
                  r={DOT_RADIUS_MIN}
                />
              ))}
            </g>
          </g>
        </svg>
      )}
    </div>
  )
}
