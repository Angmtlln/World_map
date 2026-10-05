import { geoPath } from 'd3-geo'
import { pointer, select } from 'd3-selection'
import 'd3-transition'
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { imageRect } from '../crop/crop'
import { sizeForScreen, type CoverImage } from '../photos/useCoverImages'
import type { ImageSize } from '../storage/db'
import { createMapGeometry, groupAt, toShape, type Bounds, type Shape, type World } from './geo'
import './WorldMap.css'

const MAX_ZOOM = 50
// Pointer travel in px below which a press counts as a click rather than a drag.
const CLICK_DISTANCE = 5
// Dot radius in screen px grows from MIN at the whole-world view to MAX at DOT_FULL_ZOOM.
const DOT_RADIUS_MIN = 2
const DOT_RADIUS_MAX = 4
const DOT_FULL_ZOOM = 8
// Dots showing a photo are this many times larger, so the photo can be made out.
const PHOTO_DOT_SCALE = 2
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
  covers: Map<string, CoverImage>
  onSelect: (id: string | null) => void
  // Image size needed by each territory with a photo that is larger than a thumbnail on screen.
  onImageSizesChange: (sizes: Map<string, ImageSize>) => void
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

// Pattern ids must be valid in url(#…); territory ids are letters, digits and hyphens.
const photoPatternId = (id: string, group: number) => `photo-${id}-${group}`
const dotPatternId = (id: string) => `dot-photo-${id}`
// Passed as a CSS variable: a CSS fill rule would override a fill attribute.
const photoStyle = (patternId: string) => ({ '--photo': `url(#${patternId})` }) as CSSProperties

export function WorldMap({ world, selectedId, covers, onSelect, onImageSizesChange }: Props) {
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

  // Keyed by the set of ids, so swapping a thumbnail for the larger image does not count
  // as a change of which territories have photos.
  const photoIdsKey = [...covers.keys()].sort().join(',')
  const withPhoto = useMemo(() => {
    const ids = new Set(photoIdsKey.split(','))
    return shapes.filter((s) => ids.has(s.feature.properties.id))
  }, [shapes, photoIdsKey])
  const selected = selectedId ? byId.get(selectedId) : undefined

  // The zoom handlers live outside React; they read the latest values through refs.
  const withPhotoRef = useRef(withPhoto)
  const onImageSizesChangeRef = useRef(onImageSizesChange)
  const imageSizesKeyRef = useRef('')
  useEffect(() => {
    withPhotoRef.current = withPhoto
    onImageSizesChangeRef.current = onImageSizesChange
  })

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

    const applyDotRadius = (k: number) => {
      const r = dotRadius(k, fit)
      layer.querySelectorAll<SVGCircleElement>('.map-dot').forEach((dot) => {
        const scale = dot.dataset.photo ? PHOTO_DOT_SCALE : 1
        dot.setAttribute('r', String(r * scale))
      })
    }

    // How large each territory's photo is on screen, so it gets an image sharp enough.
    const updateImageSizes = (t: ZoomTransform) => {
      const [[vx0, vy0], [vx1, vy1]] = [t.invert([0, 0]), t.invert([size.w, size.h])]
      const devicePxPerUnit = t.k * (window.devicePixelRatio || 1)
      const sizes = new Map<string, ImageSize>()
      for (const s of withPhotoRef.current) {
        let largest = 0
        for (const {
          bounds: [[x0, y0], [x1, y1]],
        } of s.groups) {
          const visible = x1 > vx0 && x0 < vx1 && y1 > vy0 && y0 < vy1
          if (visible) largest = Math.max(largest, x1 - x0, y1 - y0)
        }
        const imageSize = sizeForScreen(largest * devicePxPerUnit)
        if (imageSize !== 'thumb') sizes.set(s.feature.properties.id, imageSize)
      }
      const key = [...sizes]
        .map(([id, size]) => `${id}=${size}`)
        .sort()
        .join(',')
      if (key === imageSizesKeyRef.current) return
      imageSizesKeyRef.current = key
      onImageSizesChangeRef.current(sizes)
    }

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
        applyDotRadius(transform.k)
      })
      // Swapping images mid-gesture would stutter; decide once the map comes to rest.
      .on('end', ({ transform }: { transform: ZoomTransform }) => updateImageSizes(transform))

    const k = Math.max(fit, (INITIAL_HEIGHT_SHARE * size.h) / height)
    const center = k > fit ? geometry.projection(INITIAL_CENTER)! : [width / 2, height / 2]
    select(svg)
      .call(behavior)
      .call(behavior.transform, centeredTransform(behavior, size, k, center))
    zoomRef.current = behavior
    updateImageSizes(zoomTransform(svg))
    return () => {
      select(svg).on('.zoom', null)
    }
  }, [size, geometry])

  // New photos: size the newly drawn dots and check whether they need the larger image.
  useEffect(() => {
    const svg = svgRef.current
    const behavior = zoomRef.current
    if (!svg || !behavior) return
    // Re-applying the current transform runs the zoom and end handlers.
    select(svg).call(behavior.transform, zoomTransform(svg))
  }, [withPhoto])

  function zoomTo([[x0, y0], [x1, y1]]: Bounds) {
    const svg = svgRef.current
    const behavior = zoomRef.current
    if (!svg || !behavior || !size) return
    const k = ZOOM_FILL * Math.min(size.w / (x1 - x0 || 1), size.h / (y1 - y0 || 1))
    const target = centeredTransform(behavior, size, k, [(x0 + x1) / 2, (y0 + y1) / 2])
    select(svg).transition().duration(ZOOM_DURATION).call(behavior.transform, target)
  }

  function boundsToZoom(shape: Shape, event: MouseEvent): Bounds {
    if (shape.groups.length === 1 || !layerRef.current) return shape.bounds
    return groupAt(shape, pointer(event.nativeEvent, layerRef.current)).bounds
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
          <defs>
            {/* Patterns are in map coordinates, so zoom and pan need no recalculation. */}
            {withPhoto.flatMap((s) => {
              const id = s.feature.properties.id
              const cover = covers.get(id)!
              return s.groups.map(({ bounds: [[x0, y0], [x1, y1]] }, i) => {
                const box = { width: x1 - x0, height: y1 - y0 }
                // The crop belongs to the main group; far-away parts show the photo centred.
                const rect = imageRect(box, cover, i === 0 ? cover.crop : null)
                return (
                  <pattern
                    key={photoPatternId(id, i)}
                    id={photoPatternId(id, i)}
                    patternUnits="userSpaceOnUse"
                    x={x0}
                    y={y0}
                    width={box.width}
                    height={box.height}
                  >
                    <image href={cover.href} {...rect} preserveAspectRatio="none" />
                  </pattern>
                )
              })
            })}
            {dots
              .filter((s) => covers.has(s.feature.properties.id))
              .map((s) => (
                <pattern
                  key={dotPatternId(s.feature.properties.id)}
                  id={dotPatternId(s.feature.properties.id)}
                  patternContentUnits="objectBoundingBox"
                  width={1}
                  height={1}
                >
                  <image
                    href={covers.get(s.feature.properties.id)!.href}
                    width={1}
                    height={1}
                    preserveAspectRatio="xMidYMid slice"
                  />
                </pattern>
              ))}
          </defs>
          <g ref={layerRef}>
            <path className="map-sphere" d={sphere} />
            <g className="map-territories">
              {shapes.map((s) => (
                <path
                  key={s.feature.properties.id}
                  d={s.d}
                  data-id={s.feature.properties.id}
                  className={s === selected ? 'is-selected' : undefined}
                />
              ))}
            </g>
            <g className="map-photos">
              {withPhoto.flatMap((s) =>
                s.groups.map((group, i) => (
                  <path
                    key={photoPatternId(s.feature.properties.id, i)}
                    d={group.d}
                    data-id={s.feature.properties.id}
                    style={photoStyle(photoPatternId(s.feature.properties.id, i))}
                  />
                )),
              )}
            </g>
            <path className="map-region-borders" d={regionBorders} />
            <path className="map-country-borders" d={countryBorders} />
            {selected && <path className="map-selection" d={selected.outline} />}
            <g className="map-dots">
              {dots.map((s) => {
                const id = s.feature.properties.id
                const [cx, cy] = s.dot!
                const isSelected = id === selectedId
                if (!covers.has(id)) {
                  return (
                    <circle
                      key={id}
                      className={`map-dot${isSelected ? ' is-selected' : ''}`}
                      data-id={id}
                      cx={cx}
                      cy={cy}
                      r={DOT_RADIUS_MIN}
                    />
                  )
                }
                return (
                  <g key={id}>
                    <circle
                      className={`map-dot map-dot-photo${isSelected ? ' is-selected' : ''}`}
                      data-photo="1"
                      cx={cx}
                      cy={cy}
                      r={DOT_RADIUS_MIN * PHOTO_DOT_SCALE}
                      style={photoStyle(dotPatternId(id))}
                    />
                    {/* Invisible, wider target on top so the photo dot is easy to tap. */}
                    <circle
                      className="map-dot map-dot-hit"
                      data-photo="1"
                      data-id={id}
                      cx={cx}
                      cy={cy}
                      r={DOT_RADIUS_MIN * PHOTO_DOT_SCALE}
                    />
                  </g>
                )
              })}
            </g>
          </g>
        </svg>
      )}
    </div>
  )
}
