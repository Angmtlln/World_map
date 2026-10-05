// How a photo sits in a territory's bounding box. A crop is stored as three numbers:
// x and y move the photo's centre by a share of the box width and height, and scale
// enlarges it relative to the size that just covers the box (scale 1, the default).

import type { Crop } from '../storage/db'

export interface Size {
  width: number
  height: number
}

export interface Rect extends Size {
  x: number
  y: number
}

export const DEFAULT_CROP: Crop = { x: 0, y: 0, scale: 1 }
export const MAX_SCALE = 5

// The photo's size at scale 1: the smallest that still covers the whole box.
function coverSize(box: Size, photo: Size): Size {
  const k = Math.max(box.width / photo.width, box.height / photo.height)
  return { width: photo.width * k, height: photo.height * k }
}

// Where the photo goes, relative to the box's top-left corner.
export function imageRect(box: Size, photo: Size, crop: Crop | null): Rect {
  const { x, y, scale } = crop ?? DEFAULT_CROP
  const cover = coverSize(box, photo)
  const width = cover.width * scale
  const height = cover.height * scale
  return {
    x: box.width / 2 + x * box.width - width / 2,
    y: box.height / 2 + y * box.height - height / 2,
    width,
    height,
  }
}

// Keeps the photo covering the whole box: scale at least 1, and no edge pulled inside.
export function clampCrop(box: Size, photo: Size, crop: Crop): Crop {
  const scale = Math.min(MAX_SCALE, Math.max(1, crop.scale))
  const cover = coverSize(box, photo)
  const maxX = (cover.width * scale - box.width) / 2 / box.width
  const maxY = (cover.height * scale - box.height) / 2 / box.height
  const clamp = (v: number, max: number) => Math.min(max, Math.max(-max, v))
  return { x: clamp(crop.x, maxX), y: clamp(crop.y, maxY), scale }
}

// Moves the photo by (dx, dy) in the box's units.
export function panCrop(box: Size, photo: Size, crop: Crop, dx: number, dy: number): Crop {
  return clampCrop(box, photo, {
    ...crop,
    x: crop.x + dx / box.width,
    y: crop.y + dy / box.height,
  })
}

// Scales the photo by `factor` keeping the point `focus` (in box units, relative to the
// box centre) where it is: the spot under the fingers stays under the fingers.
export function zoomCrop(
  box: Size,
  photo: Size,
  crop: Crop,
  factor: number,
  focus: { x: number; y: number },
): Crop {
  const scale = Math.min(MAX_SCALE, Math.max(1, crop.scale * factor))
  const f = scale / crop.scale
  const fx = focus.x / box.width
  const fy = focus.y / box.height
  return clampCrop(box, photo, {
    x: fx + (crop.x - fx) * f,
    y: fy + (crop.y - fy) * f,
    scale,
  })
}

export function isDefaultCrop(crop: Crop): boolean {
  return Math.abs(crop.x) < 1e-6 && Math.abs(crop.y) < 1e-6 && Math.abs(crop.scale - 1) < 1e-6
}
