import type { PDFStudyRegion } from './indexedDB'

export type StudySelectionRect = { x: number; y: number; width: number; height: number }
type CapturePane = { element: Element | null; canvas: HTMLCanvasElement | null | undefined; pageNumber: number }

/** Clip at both the rendered PDF and the pane, so hidden pixels never enter an adjacent pane. */
export function captureStudyPDFSelection(
  container: HTMLElement | null, selection: StudySelectionRect, panes: readonly CapturePane[], background?: string,
) {
  if (!container || selection.width <= 0 || selection.height <= 0) return null
  const canvas = document.createElement('canvas')
  canvas.width = selection.width
  canvas.height = selection.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height) }
  const containerBounds = container.getBoundingClientRect()
  const left = containerBounds.left + selection.x, top = containerBounds.top + selection.y
  const sourcePageNumbers: number[] = []
  const regions: PDFStudyRegion[] = []
  const captureRegions: StudySelectionRect[] = []
  let paperOrientation: 'landscape' | 'portrait' | undefined
  let pageDisplayWidth: number | undefined
  for (const { element, canvas: composite, pageNumber } of panes) {
    const visible = element?.querySelector('.pdf-canvas')
    if (!element || !composite || !visible) continue
    const pane = element.getBoundingClientRect(), page = visible.getBoundingClientRect()
    if (page.width <= 0 || page.height <= 0) continue
    const x = Math.max(left, page.left, pane.left), y = Math.max(top, page.top, pane.top)
    const width = Math.min(left + selection.width, page.right, pane.right) - x
    const height = Math.min(top + selection.height, page.bottom, pane.bottom) - y
    if (width <= 0 || height <= 0) continue
    const region = { pageNumber, x: (x - page.left) / page.width, y: (y - page.top) / page.height,
      width: width / page.width, height: height / page.height }
    const destination = { x: x - left, y: y - top, width, height }
    ctx.drawImage(composite, region.x * composite.width, region.y * composite.height,
      region.width * composite.width, region.height * composite.height,
      destination.x, destination.y, width, height)
    if (!sourcePageNumbers.includes(pageNumber)) sourcePageNumbers.push(pageNumber)
    regions.push(region)
    captureRegions.push(destination)
    paperOrientation ??= page.width > page.height ? 'landscape' : 'portrait'
    pageDisplayWidth = page.width
  }
  return sourcePageNumbers.length ? {
    image: canvas.toDataURL('image/png'), sourcePageNumbers, regions, paperOrientation,
    pageDisplayWidth: regions.length === 1 ? pageDisplayWidth : undefined,
    captureLayout: { width: canvas.width, height: canvas.height, regions: captureRegions },
  } : null
}
