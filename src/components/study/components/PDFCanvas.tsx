import { useRef, useEffect } from 'react'

interface PDFCanvasProps {
    pdfDoc: any // pdfjsLib.PDFDocumentProxy | null
    canvasRef: React.RefObject<HTMLCanvasElement>
    renderScale?: number
    renderContent?: boolean
    onPageRendered?: (metrics: PDFRenderMetrics) => void
    pageNum: number // Strictly required now
}

export interface PDFRenderMetrics {
    pixelWidth: number
    pixelHeight: number
    layoutWidth: number
    layoutHeight: number
}

const PDFCanvas = ({
    pdfDoc,
    canvasRef,
    renderScale = 1.0,
    renderContent = true,
    onPageRendered,
    pageNum
}: PDFCanvasProps) => {

    // レンダリングタスク管理
    const renderTaskRef = useRef<any>(null)
    const renderGenerationRef = useRef(0)

    // ページレンダリング
    useEffect(() => {
        if (!pdfDoc || !canvasRef.current) return

        const generation = ++renderGenerationRef.current
        let disposed = false

        const renderPage = async () => {
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel()
                renderTaskRef.current = null
            }

            try {
                const page = await pdfDoc.getPage(pageNum)

                let pageRotation = 0
                try {
                    const rotate = page.rotate
                    if (typeof rotate === 'number' && [0, 90, 180, 270].includes(rotate)) {
                        pageRotation = rotate
                    }
                } catch (error) {
                    // console.warn('⚠️ rotation属性取得エラー:', error)
                }

                const viewport = page.getViewport({ scale: renderScale, rotation: pageRotation })
                const layoutViewport = page.getViewport({ scale: 1, rotation: pageRotation })
                if (disposed || generation !== renderGenerationRef.current || !canvasRef.current) return

                if (!renderContent) {
                    const canvas = canvasRef.current
                    canvas.width = 1
                    canvas.height = 1
                    canvas.style.width = `${layoutViewport.width}px`
                    canvas.style.height = `${layoutViewport.height}px`
                    onPageRendered?.({
                        pixelWidth: Math.max(1, Math.ceil(viewport.width)),
                        pixelHeight: Math.max(1, Math.ceil(viewport.height)),
                        layoutWidth: layoutViewport.width,
                        layoutHeight: layoutViewport.height,
                    })
                    return
                }

                // Render away from the visible DOM. The old bitmap remains visible while
                // adaptive resolution catches up after a pinch gesture.
                const buffer = document.createElement('canvas')
                buffer.height = Math.max(1, Math.ceil(viewport.height))
                buffer.width = Math.max(1, Math.ceil(viewport.width))
                const bufferContext = buffer.getContext('2d')
                if (!bufferContext) return

                const renderContext = {
                    canvasContext: bufferContext,
                    viewport: viewport,
                }

                try {
                    renderTaskRef.current = page.render(renderContext)
                    await renderTaskRef.current.promise
                    renderTaskRef.current = null

                    if (disposed || generation !== renderGenerationRef.current || !canvasRef.current) return
                    const canvas = canvasRef.current
                    canvas.width = buffer.width
                    canvas.height = buffer.height
                    canvas.style.width = `${layoutViewport.width}px`
                    canvas.style.height = `${layoutViewport.height}px`
                    const context = canvas.getContext('2d')
                    if (!context) return
                    context.drawImage(buffer, 0, 0)
                    onPageRendered?.({
                        pixelWidth: buffer.width,
                        pixelHeight: buffer.height,
                        layoutWidth: layoutViewport.width,
                        layoutHeight: layoutViewport.height,
                    })
                } catch (error: any) {
                    if (error?.name === 'RenderingCancelledException') {
                        // console.log('🛑 Rendering Cancelled')
                        return
                    }
                }
            } catch {
                // A newer render request or page change will replace this one.
            }
        }

        renderPage()

        return () => {
            disposed = true
            renderGenerationRef.current += 1
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel()
                renderTaskRef.current = null
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pdfDoc, pageNum, renderScale, renderContent])

    // canvas要素自体への参照が必要な場合（useZoomPanなどで使われる）
    // ただし、forwardRefで公開しているのはHandleなので、canvasRefへのアクセス方法を検討する必要がある
    // 今回はクラス名を指定して親からquerySelectorで取るか、
    // あるいは専用のref prop (canvasRef) を渡す形にするか。
    // StudyPanelのロジックを見ると、useZoomPanにcanvasRefを渡している。
    // ここではシンプルに、canvas要素に特定のIDやクラスを付与し、スタイルを適用する。

    return (
        <canvas
            ref={canvasRef}
            className="pdf-canvas"
            style={{
                transformOrigin: 'top left',
                display: 'block' // 余白除去
            }}
        />
    )
}

export default PDFCanvas
