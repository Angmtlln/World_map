import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { t, territoryName } from '../i18n'
import { createMapGeometry, toShape, type TerritoryFeature } from '../map/geo'
import type { CoverImage } from '../photos/useCoverImages'
import { getImage, type Crop, type PhotoDb } from '../storage/db'
import { clampCrop, DEFAULT_CROP, imageRect, isDefaultCrop, panCrop, zoomCrop } from './crop'
import './CropEditor.css'

// Room around the territory's box, as a share of its size, where the dimmed rest of the
// photo shows.
const PADDING = 0.25
const WHEEL_ZOOM_SPEED = 0.002

interface Props {
  db: PhotoDb
  feature: TerritoryFeature
  cover: CoverImage
  onCancel: () => void
  onSave: (crop: Crop | null) => void
}

type Point = { x: number; y: number }

export function CropEditor({ db, feature, cover, onCancel, onSave }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  // Map coordinates of each finger or mouse button currently down.
  const pointers = useRef(new Map<number, Point>())

  // Only the main group is edited; far-away parts show the photo centred.
  const { group, outline } = useMemo(() => {
    const shape = toShape(feature, createMapGeometry().projection)
    return { group: shape.groups[0], outline: shape.outline }
  }, [feature])
  const [[x0, y0], [x1, y1]] = group.bounds
  const box = { width: x1 - x0, height: y1 - y0 }
  const center = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }

  const [crop, setCrop] = useState<Crop>(() => clampCrop(box, cover, cover.crop ?? DEFAULT_CROP))

  // The map shows a smaller version; editing deserves the sharpest one.
  const [fullUrl, setFullUrl] = useState<string | null>(null)
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    void getImage(db, cover.photoId, 'full').then((blob) => {
      if (!blob || cancelled) return
      url = URL.createObjectURL(blob)
      setFullUrl(url)
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [db, cover.photoId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  function toMap(clientX: number, clientY: number): Point {
    const svg = svgRef.current!
    const point = new DOMPoint(clientX, clientY).matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: point.x, y: point.y }
  }

  const fromCenter = (p: Point) => ({ x: p.x - center.x, y: p.y - center.y })

  // Wheel and trackpad pinch. Registered by hand: React's wheel listener is passive and
  // could not stop the browser from zooming the whole page on a pinch.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const focus = fromCenter(toMap(e.clientX, e.clientY))
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED)
      setCrop((c) => zoomCrop(box, cover, c, factor, focus))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  })

  function handlePointerDown(e: PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, toMap(e.clientX, e.clientY))
  }

  function handlePointerMove(e: PointerEvent<SVGSVGElement>) {
    const active = pointers.current
    const previous = active.get(e.pointerId)
    if (!previous) return
    const before = [...active.values()]
    active.set(e.pointerId, toMap(e.clientX, e.clientY))
    const after = [...active.values()]

    if (after.length === 1) {
      const dx = after[0].x - before[0].x
      const dy = after[0].y - before[0].y
      setCrop((c) => panCrop(box, cover, c, dx, dy))
      return
    }
    // Two fingers: follow the midpoint and scale by the change in their distance.
    const [a0, b0] = before
    const [a1, b1] = after
    const mid = (p: Point, q: Point) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })
    const m0 = mid(a0, b0)
    const m1 = mid(a1, b1)
    const factor =
      Math.hypot(b1.x - a1.x, b1.y - a1.y) / (Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1)
    setCrop((c) =>
      zoomCrop(
        box,
        cover,
        panCrop(box, cover, c, m1.x - m0.x, m1.y - m0.y),
        factor,
        fromCenter(m1),
      ),
    )
  }

  function handlePointerUp(e: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId)
  }

  const rect = imageRect(box, cover, crop)
  const image = {
    href: fullUrl ?? cover.href,
    x: x0 + rect.x,
    y: y0 + rect.y,
    width: rect.width,
    height: rect.height,
  }
  const padX = box.width * PADDING
  const padY = box.height * PADDING

  return (
    <div className="crop-editor" role="dialog" aria-label={t('cropTitle')}>
      <header className="crop-editor-header">
        <div className="crop-editor-title">{territoryName(feature.properties)}</div>
        <div className="crop-editor-hint">{t('cropHint')}</div>
      </header>
      <svg
        ref={svgRef}
        className="crop-editor-canvas"
        viewBox={`${x0 - padX} ${y0 - padY} ${box.width + 2 * padX} ${box.height + 2 * padY}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <clipPath id="crop-editor-clip">
            <path d={group.d} />
          </clipPath>
        </defs>
        <image {...image} className="crop-editor-outside" preserveAspectRatio="none" />
        <image {...image} clipPath="url(#crop-editor-clip)" preserveAspectRatio="none" />
        <path className="crop-editor-outline" d={outline} />
      </svg>
      <footer className="crop-editor-actions">
        <button type="button" onClick={onCancel}>
          {t('cancel')}
        </button>
        <button type="button" onClick={() => setCrop(DEFAULT_CROP)} disabled={isDefaultCrop(crop)}>
          {t('reset')}
        </button>
        <button
          type="button"
          className="crop-editor-done"
          onClick={() => onSave(isDefaultCrop(crop) ? null : crop)}
        >
          {t('done')}
        </button>
      </footer>
    </div>
  )
}
