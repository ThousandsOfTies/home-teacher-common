type Bounds = { left: number; top: number; width: number; height: number }

/** Put play inside the region and the delete icon's lower-left corner at its upper-right corner. */
export function getStudyRegionControlPositions(region: Bounds, viewport: Bounds) {
  const halfTarget = 22
  const deleteIconSize = 18
  const gap = 4
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  // Clamp the visible icons, not their transparent touch targets, so the icons stay attached to the frame.
  const cornerX = clamp(region.left + region.width, viewport.left,
    Math.max(viewport.left, viewport.left + viewport.width - deleteIconSize))
  const cornerY = clamp(region.top, viewport.top + deleteIconSize,
    Math.max(viewport.top + deleteIconSize, viewport.top + viewport.height))
  const visibleTop = Math.max(region.top, viewport.top)
  const visibleBottom = Math.min(region.top + region.height, viewport.top + viewport.height)
  const openIcon = {
    width: Math.min(18, Math.max(0, cornerX - gap - Math.max(region.left, viewport.left))),
    height: Math.min(22, Math.max(0, visibleBottom - visibleTop - gap)),
  }
  const open = { x: cornerX - gap - halfTarget,
    y: clamp(region.top + region.height / 2, visibleTop + openIcon.height / 2,
      Math.max(visibleTop + openIcon.height / 2, visibleBottom - openIcon.height / 2)) }
  // Separate the 44px touch targets horizontally, even when the selection is a single line.
  const remove = { x: cornerX + halfTarget, y: cornerY - halfTarget }
  const visible = region.left < viewport.left + viewport.width && region.left + region.width > viewport.left &&
    region.top < viewport.top + viewport.height && region.top + region.height > viewport.top
  return { open, remove, openIcon, visible }
}
