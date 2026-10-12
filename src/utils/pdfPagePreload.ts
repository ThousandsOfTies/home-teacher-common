import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { INITIAL_PDF_RENDER_SCALE } from '../constants/pdf'

export interface PDFRenderMetrics {
    pixelWidth: number
    pixelHeight: number
    layoutWidth: number
    layoutHeight: number
}

interface PageBitmap {
    pageNum: number
    canvas: HTMLCanvasElement
    metrics: PDFRenderMetrics
}

interface PendingPreload {
    pageNum: number
    cancelled: boolean
    cancelIdle?: () => void
    task?: RenderTask
    canvas?: HTMLCanvasElement
}

interface DocumentCache {
    ready?: PageBitmap
    pending?: PendingPreload
}

// Keep only the hidden pane's current page, with at most 8 MB of RGBA pixels.
// PDF.js document/image caches are separate from this bitmap budget.
export const MAX_PRELOAD_PIXELS = 2_000_000
const MAX_PRELOAD_EDGE = 2048
const caches = new WeakMap<PDFDocumentProxy, DocumentCache>()

export function getPDFPageViewport(page: PDFPageProxy, scale: number) {
    const rotation = [0, 90, 180, 270].includes(page.rotate) ? page.rotate : 0
    return page.getViewport({ scale, rotation })
}

export function releasePDFPageBitmap(canvas: HTMLCanvasElement) {
    canvas.width = 0
    canvas.height = 0
}

function runWhenIdle(callback: () => void, fallbackDelay = 50) {
    if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(callback, { timeout: 1000 })
        return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(callback, fallbackDelay)
    return () => window.clearTimeout(id)
}

function cancelPending(cache: DocumentCache) {
    const pending = cache.pending
    if (!pending) return
    cache.pending = undefined
    pending.cancelled = true
    pending.cancelIdle?.()
    pending.task?.cancel()
    // An in-progress render releases its canvas after its promise settles.
}

/** Foreground PDF rendering takes priority over speculative work. */
export function cancelPDFPagePreload(pdfDoc: PDFDocumentProxy) {
    const cache = caches.get(pdfDoc)
    if (cache) cancelPending(cache)
}

/** Transfer a prepared bitmap to the visible canvas; do not retain a duplicate. */
export function takePDFPagePreload(pdfDoc: PDFDocumentProxy, pageNum: number) {
    const cache = caches.get(pdfDoc)
    if (cache?.ready?.pageNum !== pageNum) return undefined
    const bitmap = cache.ready
    cache.ready = undefined
    return bitmap
}

export function clearPDFPagePreload(pdfDoc: PDFDocumentProxy) {
    const cache = caches.get(pdfDoc)
    if (!cache) return
    cancelPending(cache)
    if (cache.ready) releasePDFPageBitmap(cache.ready.canvas)
    caches.delete(pdfDoc)
}

/** Called after the visible page is ready. A same-page source avoids rendering twice. */
export function schedulePDFPagePreload(
    pdfDoc: PDFDocumentProxy,
    pageNum: number,
    source?: PageBitmap,
) {
    if (!Number.isInteger(pageNum) || pageNum < 1 || pageNum > pdfDoc.numPages) return () => {}
    let cache = caches.get(pdfDoc)
    if (!cache) {
        cache = {}
        caches.set(pdfDoc, cache)
    }
    if (cache.ready?.pageNum === pageNum || cache.pending?.pageNum === pageNum) return () => {}
    cancelPending(cache)
    if (cache.ready) {
        releasePDFPageBitmap(cache.ready.canvas)
        cache.ready = undefined
    }

    const pending: PendingPreload = { pageNum, cancelled: false }
    cache.pending = pending
    const isActive = () => !pending.cancelled && cache.pending === pending

    const prepare = async () => {
        try {
            const reusableSource = source?.pageNum === pageNum && source.canvas.width > 1 && source.canvas.height > 1
                ? source : undefined
            const page = reusableSource ? undefined : await pdfDoc.getPage(pageNum)
            if (!isActive()) return
            const layout = reusableSource?.metrics ?? (() => {
                const viewport = getPDFPageViewport(page!, 1)
                return { layoutWidth: viewport.width, layoutHeight: viewport.height }
            })()
            const { layoutWidth, layoutHeight } = layout
            if (!Number.isFinite(layoutWidth) || !Number.isFinite(layoutHeight) || layoutWidth <= 0 || layoutHeight <= 0) return
            const scale = Math.min(INITIAL_PDF_RENDER_SCALE,
                Math.sqrt(MAX_PRELOAD_PIXELS / (layoutWidth * layoutHeight)),
                MAX_PRELOAD_EDGE / layoutWidth, MAX_PRELOAD_EDGE / layoutHeight,
                reusableSource ? reusableSource.metrics.pixelWidth / layoutWidth : Infinity,
                reusableSource ? reusableSource.metrics.pixelHeight / layoutHeight : Infinity)
            const canvas = document.createElement('canvas')
            pending.canvas = canvas
            canvas.width = Math.max(1, Math.floor(layoutWidth * scale))
            canvas.height = Math.max(1, Math.floor(layoutHeight * scale))
            const context = canvas.getContext('2d')
            if (!context) return

            if (reusableSource) {
                context.drawImage(reusableSource.canvas, 0, 0, canvas.width, canvas.height)
            } else {
                const task = page!.render({ canvasContext: context, viewport: getPDFPageViewport(page!, scale) })
                pending.task = task
                // Yield PDF.js drawing chunks to browser input/painting, including on WebKit.
                task.onContinue = resume => {
                    pending.cancelIdle = runWhenIdle(() => { if (isActive()) resume() }, 16)
                }
                await task.promise
            }
            if (!isActive()) return
            cache.ready = { pageNum, canvas, metrics: {
                pixelWidth: canvas.width, pixelHeight: canvas.height, layoutWidth, layoutHeight,
            } }
            pending.canvas = undefined
        } catch {
            // Best effort: cancellation or an unreadable page must not affect the visible pane.
        } finally {
            pending.cancelIdle?.()
            pending.task = undefined
            if (pending.canvas) releasePDFPageBitmap(pending.canvas)
            if (cache.pending === pending) cache.pending = undefined
        }
    }

    pending.cancelIdle = runWhenIdle(() => { void prepare() }, 300)
    return () => { if (cache.pending === pending) cancelPending(cache) }
}
