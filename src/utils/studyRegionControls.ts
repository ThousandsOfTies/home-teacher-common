type Bounds = { left: number; top: number; width: number; height: number }

/** Screen coordinates: 44px controls with an 8px gap, including small regions at the viewport edge. */
export function getStudyRegionControlPositions(region: Bounds, viewport: Bounds) {
  const inset = 24
  const separation = 52
  const minX = viewport.left + inset
  const maxX = Math.max(minX, viewport.left + viewport.width - inset)
  const minY = viewport.top + inset
  const maxY = Math.max(minY, viewport.top + viewport.height - inset)
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  const open = { x: clamp(region.left + region.width, minX, maxX),
    y: clamp(region.top + region.height / 2, minY, maxY) }
  const remove = { x: open.x,
    y: clamp(region.top - Math.max(0, separation - region.height / 2), minY, maxY) }
  if (Math.abs(remove.y - open.y) < separation) {
    if (open.x - separation >= minX) remove.x = open.x - separation
    else if (open.y - separation >= minY) remove.y = open.y - separation
    else if (open.y + separation <= maxY) remove.y = open.y + separation
    else remove.x = Math.min(maxX, open.x + separation)
  }
  const visible = region.left < viewport.left + viewport.width && region.left + region.width > viewport.left &&
    region.top < viewport.top + viewport.height && region.top + region.height > viewport.top
  return { open, remove, visible }
}
