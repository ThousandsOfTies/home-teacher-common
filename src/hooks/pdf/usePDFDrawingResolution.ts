import { useEffect, useRef, useState } from 'react'
import { isIOSLikeDevice } from '../../utils/platform'

interface Size { width: number; height: number }

/** Keep line edges sharp independently of the PDF image's render scale and scale steps. */
export function getPDFDrawingBitmapSize(paper: Size, zoom: number, pixelRatio: number, maxPixels: number): Size {
    if (paper.width <= 0 || paper.height <= 0) return { width: 1, height: 1 }
    const density = Math.min(2, Math.max(1, pixelRatio || 1))
    const scale = Math.min(Math.max(1, zoom) * density * 1.25,
        Math.sqrt(maxPixels / (paper.width * paper.height)))
    return {
        width: Math.max(1, Math.floor(paper.width * scale)),
        height: Math.max(1, Math.floor(paper.height * scale)),
    }
}

function displaySize(paper: Size, zoom: number): Size {
    return getPDFDrawingBitmapSize(paper, zoom, window.devicePixelRatio || 1,
        isIOSLikeDevice() ? 7_000_000 : 16_000_000)
}

/** Refine only after interaction settles; resizing a canvas clears its live stroke. */
export function usePDFDrawingResolution(paper: Size | null, zoom: number, paused: boolean): Size | null {
    const [snapshot, setSnapshot] = useState<{ paper: Size; bitmap: Size } | null>(null)
    const previousPaperRef = useRef<Size | null>(null)
    useEffect(() => {
        if (!paper) return
        const update = () => {
            const bitmap = displaySize(paper, zoom)
            setSnapshot(current => current
                && current.paper.width === paper.width && current.paper.height === paper.height
                && current.bitmap.width === bitmap.width && current.bitmap.height === bitmap.height
                ? current : { paper, bitmap })
        }
        const previous = previousPaperRef.current
        if (!previous || previous.width !== paper.width || previous.height !== paper.height) {
            previousPaperRef.current = paper
            update()
            return
        }
        if (paused) return
        const timer = window.setTimeout(update, 220)
        return () => window.clearTimeout(timer)
    }, [paper?.width, paper?.height, zoom, paused])
    if (!paper) return null
    return snapshot && snapshot.paper.width === paper.width && snapshot.paper.height === paper.height
        ? snapshot.bitmap : displaySize(paper, zoom)
}
