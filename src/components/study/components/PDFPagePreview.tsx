import { useEffect, useRef } from 'react'
import type { DrawingPath } from '@thousands-of-ties/drawing-common'

interface PDFPagePreviewProps {
    pdfDoc: any
    pageNum: number
    renderScale: number
    paths: DrawingPath[]
    style: React.CSSProperties
}

// Serialize neighbouring-page renders so their temporary canvases do not all
// exist at once on memory-constrained browsers.
let previewRenderQueue: Promise<void> = Promise.resolve()

const drawPaths = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    paths: DrawingPath[],
    renderScale: number
) => {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    paths.forEach(path => {
        if (path.kind === 'fill' || path.points.length === 0) return

        ctx.save()
        ctx.strokeStyle = path.color
        ctx.fillStyle = path.color
        ctx.globalAlpha = path.opacity ?? 1
        const points = path.points

        if (points.length === 1) {
            ctx.beginPath()
            ctx.arc(
                points[0].x * canvas.width,
                points[0].y * canvas.height,
                (points[0].width ?? path.width) * renderScale / 2,
                0,
                Math.PI * 2
            )
            ctx.fill()
            ctx.restore()
            return
        }

        if (path.style === 'brush') {
            for (let index = 1; index < points.length; index += 1) {
                const previous = points[index - 1]
                const current = points[index]
                ctx.beginPath()
                ctx.lineWidth = ((previous.width ?? path.width) + (current.width ?? path.width)) * renderScale / 2
                ctx.moveTo(previous.x * canvas.width, previous.y * canvas.height)
                ctx.lineTo(current.x * canvas.width, current.y * canvas.height)
                ctx.stroke()
            }
        } else {
            ctx.lineWidth = path.width * renderScale
            ctx.beginPath()
            ctx.moveTo(points[0].x * canvas.width, points[0].y * canvas.height)
            for (let index = 1; index < points.length - 1; index += 1) {
                const current = points[index]
                const next = points[index + 1]
                ctx.quadraticCurveTo(
                    current.x * canvas.width,
                    current.y * canvas.height,
                    (current.x + next.x) / 2 * canvas.width,
                    (current.y + next.y) / 2 * canvas.height
                )
            }
            const last = points[points.length - 1]
            ctx.lineTo(last.x * canvas.width, last.y * canvas.height)
            ctx.stroke()
        }
        ctx.restore()
    })
}

export const PDFPagePreview = ({ pdfDoc, pageNum, renderScale, paths, style }: PDFPagePreviewProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const renderTaskRef = useRef<any>(null)

    useEffect(() => {
        let cancelled = false

        const render = async () => {
            if (cancelled || !pdfDoc || !canvasRef.current) return
            const page = await pdfDoc.getPage(pageNum)
            if (cancelled || !canvasRef.current) return

            const rotation = typeof page.rotate === 'number' ? page.rotate : 0
            const viewport = page.getViewport({ scale: renderScale, rotation })
            const layoutViewport = page.getViewport({ scale: 1, rotation })
            const buffer = document.createElement('canvas')
            buffer.width = Math.max(1, Math.ceil(viewport.width))
            buffer.height = Math.max(1, Math.ceil(viewport.height))
            const bufferContext = buffer.getContext('2d')
            if (!bufferContext) return

            renderTaskRef.current = page.render({ canvasContext: bufferContext, viewport })
            try {
                await renderTaskRef.current.promise
            } catch (error: any) {
                if (error?.name !== 'RenderingCancelledException') throw error
                return
            } finally {
                renderTaskRef.current = null
            }

            if (cancelled || !canvasRef.current) return
            const canvas = canvasRef.current
            canvas.width = buffer.width
            canvas.height = buffer.height
            canvas.style.width = `${layoutViewport.width}px`
            canvas.style.height = `${layoutViewport.height}px`
            const context = canvas.getContext('2d')
            if (!context) return
            context.drawImage(buffer, 0, 0)
            drawPaths(context, canvas, paths, renderScale)
            buffer.width = 1
            buffer.height = 1
        }

        const queuedRender = previewRenderQueue.then(render)
        previewRenderQueue = queuedRender.catch(error => {
            if (!cancelled) console.error(`PDF preview render failed for page ${pageNum}:`, error)
        })

        return () => {
            cancelled = true
            renderTaskRef.current?.cancel()
            renderTaskRef.current = null
        }
    }, [pdfDoc, pageNum, paths, renderScale])

    useEffect(() => () => {
        if (canvasRef.current) {
            canvasRef.current.width = 1
            canvasRef.current.height = 1
        }
    }, [])

    return (
        <canvas
            ref={canvasRef}
            className="pdf-page-preview"
            aria-hidden="true"
            style={{
                position: 'absolute',
                display: 'block',
                pointerEvents: 'none',
                background: 'white',
                boxShadow: '0 2px 12px rgba(0, 0, 0, 0.18)',
                ...style,
            }}
        />
    )
}
