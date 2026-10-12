import { useRef, useEffect, useState } from 'react'
import type { RenderTask } from 'pdfjs-dist'
import { cancelPDFPagePreload, getPDFPageViewport, releasePDFPageBitmap,
    schedulePDFPagePreload, takePDFPagePreload, type PDFRenderMetrics } from '../../../utils/pdfPagePreload'

export type { PDFRenderMetrics } from '../../../utils/pdfPagePreload'

interface PDFCanvasProps {
    pdfDoc: any // pdfjsLib.PDFDocumentProxy | null
    canvasRef: React.RefObject<HTMLCanvasElement>
    renderScale?: number
    renderContent?: boolean
    onPageRendered?: (metrics: PDFRenderMetrics) => void
    pageNum: number
    preloadPageNum?: number
}

const PDFCanvas = ({
    pdfDoc,
    canvasRef,
    renderScale = 1.0,
    renderContent = true,
    onPageRendered,
    pageNum,
    preloadPageNum,
}: PDFCanvasProps) => {
    const onPageRenderedRef = useRef(onPageRendered)
    onPageRenderedRef.current = onPageRendered
    const [completed, setCompleted] = useState<{
        pdfDoc: typeof pdfDoc; pageNum: number; metrics: PDFRenderMetrics
    } | null>(null)

    useEffect(() => {
        if (!pdfDoc || !canvasRef.current) return
        let disposed = false
        let task: RenderTask | undefined
        let buffer: HTMLCanvasElement | undefined
        const isActive = () => !disposed && !!canvasRef.current

        const showBitmap = (bitmap: HTMLCanvasElement, metrics: PDFRenderMetrics) => {
            if (!isActive()) return
            const canvas = canvasRef.current!
            const context = canvas.getContext('2d')
            if (!context) return
            canvas.width = bitmap.width
            canvas.height = bitmap.height
            canvas.style.width = `${metrics.layoutWidth}px`
            canvas.style.height = `${metrics.layoutHeight}px`
            context.drawImage(bitmap, 0, 0)
            onPageRenderedRef.current?.(metrics)
            setCompleted({ pdfDoc, pageNum, metrics })
        }

        const renderPage = async () => {
            cancelPDFPagePreload(pdfDoc)
            try {
                if (renderContent) {
                    const prepared = takePDFPagePreload(pdfDoc, pageNum)
                    if (prepared) {
                        showBitmap(prepared.canvas, prepared.metrics)
                        releasePDFPageBitmap(prepared.canvas)
                        const { metrics } = prepared
                        // Larger pages may first show the bounded preview, then sharpen normally.
                        if (metrics.pixelWidth >= Math.floor(metrics.layoutWidth * renderScale)
                            && metrics.pixelHeight >= Math.floor(metrics.layoutHeight * renderScale)) return
                    }
                }
                const page = await pdfDoc.getPage(pageNum)
                if (!isActive()) return
                const viewport = getPDFPageViewport(page, renderScale)
                const layout = getPDFPageViewport(page, 1)
                const metrics = {
                    pixelWidth: Math.max(1, Math.ceil(viewport.width)),
                    pixelHeight: Math.max(1, Math.ceil(viewport.height)),
                    layoutWidth: layout.width, layoutHeight: layout.height,
                }
                if (!renderContent) {
                    const canvas = canvasRef.current!
                    canvas.width = 1
                    canvas.height = 1
                    canvas.style.width = `${layout.width}px`
                    canvas.style.height = `${layout.height}px`
                    onPageRenderedRef.current?.(metrics)
                    setCompleted({ pdfDoc, pageNum, metrics })
                    return
                }

                // Keep the previous bitmap visible while adaptive resolution catches up.
                buffer = document.createElement('canvas')
                buffer.width = metrics.pixelWidth
                buffer.height = metrics.pixelHeight
                const context = buffer.getContext('2d')
                if (!context) return
                task = page.render({ canvasContext: context, viewport })
                await task.promise
                showBitmap(buffer, metrics)
            } catch {
                // A newer request replaces cancelled rendering. Preloading is optional.
            } finally {
                task = undefined
                if (buffer) releasePDFPageBitmap(buffer)
            }
        }
        void renderPage()
        return () => { disposed = true; task?.cancel() }
    }, [pdfDoc, pageNum, renderScale, renderContent, canvasRef])

    useEffect(() => {
        if (!pdfDoc || !preloadPageNum || !completed || completed.pdfDoc !== pdfDoc || completed.pageNum !== pageNum) return
        return schedulePDFPagePreload(pdfDoc, preloadPageNum, renderContent && canvasRef.current
            ? { pageNum, canvas: canvasRef.current, metrics: completed.metrics } : undefined)
    }, [pdfDoc, pageNum, preloadPageNum, completed, renderContent, canvasRef])

    return <canvas ref={canvasRef} className="pdf-canvas" style={{ transformOrigin: 'top left', display: 'block' }} />
}

export default PDFCanvas
