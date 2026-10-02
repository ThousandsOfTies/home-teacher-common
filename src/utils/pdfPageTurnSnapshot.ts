import type { DrawingPath } from '@thousands-of-ties/drawing-common'
import { drawPreviewPaths, type PreviewStrokeRenderer } from '../components/study/components/PDFPagePreview'
import type { PageTurnDirection } from './wheelPageGesture'

const PAGE_GAP = 20
const MAX_SNAPSHOT_PIXELS = 4_000_000

const copyCanvas = (source: HTMLCanvasElement, destination: HTMLCanvasElement) => {
    const scale = Math.min(1, Math.sqrt(MAX_SNAPSHOT_PIXELS / (source.width * source.height)))
    destination.width = Math.max(1, Math.ceil(source.width * scale))
    destination.height = Math.max(1, Math.ceil(source.height * scale))
    destination.getContext('2d')?.drawImage(source, 0, 0, destination.width, destination.height)
}

export const disposePageTurnSnapshot = (layer: HTMLElement) => {
    layer.remove()
    layer.querySelectorAll('canvas').forEach(canvas => { canvas.width = 1; canvas.height = 1 })
}

/** Keep the two visible pages stable until the newly selected page has rendered. */
export const createPageTurnSnapshot = async (options: {
    layer: HTMLElement
    pdfDoc: any
    targetPage: number
    direction: PageTurnDirection
    canvasSize: { width: number; height: number }
    renderScale: number
    paths: DrawingPath[]
    drawPreviewStroke?: PreviewStrokeRenderer
    signal: AbortSignal
}) => {
    const { layer, pdfDoc, targetPage, direction, canvasSize, signal } = options
    let snapshot: HTMLElement | null = null
    let target: HTMLCanvasElement | null = null
    try {
        const page = await pdfDoc.getPage(targetPage)
        signal.throwIfAborted()
        const rotation = typeof page.rotate === 'number' ? page.rotate : 0
        const viewport = page.getViewport({ scale: 1, rotation })
        const preview = layer.querySelector<HTMLCanvasElement>(`.pdf-page-preview[data-page-number="${targetPage}"]`)
        target = document.createElement('canvas')
        if (preview?.dataset.rendered === 'true') {
            copyCanvas(preview, target)
        } else {
            const scale = Math.max(0.1, Math.min(options.renderScale, 2,
                Math.sqrt(MAX_SNAPSHOT_PIXELS / (viewport.width * viewport.height))))
            const renderViewport = page.getViewport({ scale, rotation })
            target.width = Math.max(1, Math.ceil(renderViewport.width))
            target.height = Math.max(1, Math.ceil(renderViewport.height))
            const context = target.getContext('2d')
            if (!context) throw new Error('Page preview canvas unavailable')
            const task = page.render({ canvasContext: context, viewport: renderViewport })
            const cancel = () => task.cancel()
            signal.addEventListener('abort', cancel, { once: true })
            try {
                await task.promise
                signal.throwIfAborted()
                drawPreviewPaths(context, target, options.paths, scale, options.drawPreviewStroke)
            } finally {
                signal.removeEventListener('abort', cancel)
            }
        }
        signal.throwIfAborted()

        snapshot = layer.cloneNode(true) as HTMLElement
        const sourceCanvases = layer.querySelectorAll('canvas')
        const copiedCanvases = snapshot.querySelectorAll('canvas')
        sourceCanvases.forEach((source, index) => {
            const destination = copiedCanvases[index]
            if (source.classList.contains('pdf-page-preview')) destination.remove()
            else copyCanvas(source, destination)
        })
        const top = direction === 1 ? canvasSize.height + PAGE_GAP : -viewport.height - PAGE_GAP
        const left = (canvasSize.width - viewport.width) / 2
        target.className = 'pdf-page-preview'
        Object.assign(target.style, {
            position: 'absolute', top: `${top}px`, left: `${left}px`,
            width: `${viewport.width}px`, height: `${viewport.height}px`,
            background: 'white', boxShadow: '0 2px 12px rgba(0, 0, 0, 0.18)',
        })
        snapshot.prepend(target)
        snapshot.setAttribute('aria-hidden', 'true')
        snapshot.setAttribute('inert', '')
        Object.assign(snapshot.style, { opacity: '1', visibility: 'visible', pointerEvents: 'none' })
        return { layer: snapshot, width: viewport.width, height: viewport.height, top, left }
    } catch (error) {
        if (snapshot) disposePageTurnSnapshot(snapshot)
        if (target) { target.width = 1; target.height = 1 }
        throw error
    }
}
