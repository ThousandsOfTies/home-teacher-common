import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { DrawingPath } from '@thousands-of-ties/drawing-common'
import type { PreviewStrokeRenderer } from '../../components/study/components/PDFPagePreview'
import { createPageTurnSnapshot, disposePageTurnSnapshot } from '../../utils/pdfPageTurnSnapshot'
import { normalizeWheelDelta, WheelPageGesture, WHEEL_GESTURE_IDLE_MS, type PageTurnDirection } from '../../utils/wheelPageGesture'

interface WheelPageNavigationOptions {
    enabled: boolean
    containerRef: RefObject<HTMLDivElement>
    layerRef: RefObject<HTMLDivElement>
    /** A containing surface can receive wheel events over sibling selection/text overlays. */
    eventTargetRef?: RefObject<HTMLDivElement>
    pdfDoc: any
    pageNum: number
    numPages: number
    canvasSize: { width: number; height: number } | null
    renderScale: number
    zoom: number
    panOffset: { x: number; y: number }
    splitMode: boolean
    ready: boolean
    busy: boolean
    pathsByPage?: ReadonlyMap<number, DrawingPath[]>
    drawPreviewStroke?: PreviewStrokeRenderer
    onPageChange: (page: number) => void
    onViewportChange: (zoom: number, pan: { x: number; y: number }) => void
}

type Turn = {
    originPage: number
    targetPage: number
    controller: AbortController
    snapshot?: HTMLElement
    timer?: ReturnType<typeof setTimeout>
    frame?: number
    phase: 'preparing' | 'animating' | 'rendering' | 'revealing'
}

export const useWheelPageNavigation = (options: WheelPageNavigationOptions) => {
    const latest = useRef(options)
    latest.current = options
    const gesture = useRef(new WheelPageGesture())
    const pending = useRef<Turn | null>(null)
    const retiringSnapshots = useRef(new Set<HTMLElement>())
    const mounted = useRef(false)
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const overlayRef = useRef<HTMLDivElement>(null)
    const [offset, setOffset] = useState(0)
    const [tracking, setTracking] = useState(false)
    const [covered, setCovered] = useState(false)
    const [releaseCommit, setReleaseCommit] = useState(0)

    const clearTurn = useCallback((updateState = true) => {
        const turn = pending.current
        pending.current = null
        turn?.controller.abort()
        if (turn?.timer) clearTimeout(turn.timer)
        if (turn?.frame !== undefined) cancelAnimationFrame(turn.frame)
        if (turn?.snapshot) {
            if (updateState) {
                retiringSnapshots.current.add(turn.snapshot)
                // Commit even if the turn was cancelled before covered=true was painted.
                setReleaseCommit(value => value + 1)
            } else {
                disposePageTurnSnapshot(turn.snapshot)
            }
        }
        if (!updateState) {
            retiringSnapshots.current.forEach(disposePageTurnSnapshot)
            retiringSnapshots.current.clear()
        }
        if (idleTimer.current) clearTimeout(idleTimer.current)
        idleTimer.current = null
        if (updateState) {
            setCovered(false)
            setTracking(false)
            setOffset(0)
        }
    }, [])

    useLayoutEffect(() => {
        if (covered) return
        // React has made the real page visible. Remove the cover before the same paint.
        retiringSnapshots.current.forEach(disposePageTurnSnapshot)
        retiringSnapshots.current.clear()
    }, [covered, releaseCommit])

    useLayoutEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
            clearTurn(false)
        }
    }, [clearTurn])

    const startTurn = useCallback(async (direction: PageTurnDirection, startOffset: number) => {
        const current = latest.current
        if (!current.canvasSize || !current.layerRef.current || !current.containerRef.current) return
        const turn: Turn = {
            originPage: current.pageNum, targetPage: current.pageNum + direction,
            controller: new AbortController(), phase: 'preparing',
        }
        pending.current = turn
        turn.timer = setTimeout(() => clearTurn(), 8000)
        try {
            const snapshot = await createPageTurnSnapshot({
                layer: current.layerRef.current, pdfDoc: current.pdfDoc,
                targetPage: turn.targetPage, direction, canvasSize: current.canvasSize,
                renderScale: current.renderScale,
                paths: current.pathsByPage?.get(turn.targetPage) ?? [],
                drawPreviewStroke: current.drawPreviewStroke, signal: turn.controller.signal,
            })
            if (pending.current !== turn || !overlayRef.current) {
                disposePageTurnSnapshot(snapshot.layer)
                return
            }
            clearTimeout(turn.timer)
            turn.snapshot = snapshot.layer
            turn.phase = 'animating'
            let destinationZoom = current.zoom
            let destinationPan = current.panOffset
            // Match PDFPane's existing fit when the next page has a different paper size.
            if (snapshot.width !== current.canvasSize.width || snapshot.height !== current.canvasSize.height) {
                const container = current.containerRef.current!
                const height = container.clientHeight > window.innerHeight
                    ? window.innerHeight - 120 : container.clientHeight
                destinationZoom = Math.max(0.1, Math.min(2, current.splitMode
                    ? (height - 20) / snapshot.height
                    : Math.min((container.clientWidth - 20) / snapshot.width, (height - 20) / snapshot.height)))
                destinationPan = {
                    x: current.splitMode ? 10 : (container.clientWidth - snapshot.width * destinationZoom) / 2,
                    y: (height - snapshot.height * destinationZoom) / 2,
                }
                const remainingWidth = container.clientWidth - snapshot.width * destinationZoom
                const remainingHeight = container.clientHeight - snapshot.height * destinationZoom
                destinationPan = {
                    x: Math.max(Math.min(0, remainingWidth), Math.min(Math.max(0, remainingWidth), destinationPan.x)),
                    y: Math.max(Math.min(0, remainingHeight), Math.min(Math.max(0, remainingHeight), destinationPan.y)),
                }
            }
            const start = `translate(${current.panOffset.x}px, ${current.panOffset.y + startOffset}px) scale(${current.zoom})`
            const end = `translate(${destinationPan.x - snapshot.left * destinationZoom}px, ${destinationPan.y - snapshot.top * destinationZoom}px) scale(${destinationZoom})`
            snapshot.layer.style.transition = 'none'
            snapshot.layer.style.transform = start
            overlayRef.current.append(snapshot.layer)
            setCovered(true)
            setTracking(false)
            const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280
            // Establish the start frame before enabling the page slide.
            snapshot.layer.getBoundingClientRect()
            turn.frame = requestAnimationFrame(() => {
                if (pending.current !== turn) return
                snapshot.layer.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
                snapshot.layer.style.transform = end
                turn.timer = setTimeout(() => {
                    if (pending.current !== turn) return
                    turn.phase = 'rendering'
                    setOffset(0)
                    latest.current.onViewportChange(destinationZoom, destinationPan)
                    latest.current.onPageChange(turn.targetPage)
                    // Rendering failures must not leave a frozen overlay on screen.
                    turn.timer = setTimeout(() => clearTurn(), 8000)
                }, duration + 30)
            })
        } catch (error) {
            if (pending.current !== turn) return
            const cancelled = turn.controller.signal.aborted
            clearTurn()
            if (!cancelled) console.error('PDF page turn failed:', error)
        }
    }, [clearTurn])

    const onPageRendered = useCallback((page: number) => {
        const turn = pending.current
        if (!turn || turn.targetPage !== page || turn.phase !== 'rendering') return
        turn.phase = 'revealing'
        clearTimeout(turn.timer)
        // Wait for the drawing layer and page-size fit to catch up with the PDF bitmap.
        turn.frame = requestAnimationFrame(() => {
            turn.frame = requestAnimationFrame(() => {
                if (pending.current === turn) clearTurn()
            })
        })
    }, [clearTurn])

    useEffect(() => {
        if (!options.enabled) return
        const surface = options.eventTargetRef?.current ?? options.containerRef.current
        if (!surface) return
        const onWheel = (event: WheelEvent) => {
            if (event.defaultPrevented) return
            const current = latest.current
            if (!current.enabled) return
            const container = current.containerRef.current
            if (!container) return
            const bounds = container.getBoundingClientRect()
            if (event.clientX < bounds.left || event.clientX >= bounds.right
                || event.clientY < bounds.top || event.clientY >= bounds.bottom) return
            if (event.ctrlKey || event.metaKey) {
                clearTurn()
                gesture.current.reset()
                return // Let the existing Ctrl/Command-wheel zoom listener handle it.
            }
            if (event.shiftKey || event.altKey || event.buttons !== 0
                || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
            if (event.target instanceof Element && event.target.closest(
                'input, textarea, select, button, [contenteditable="true"], [role="dialog"], [data-wheel-page-navigation-ignore]',
            )) return
            const delta = normalizeWheelDelta(event, bounds.height)
            const turning = pending.current !== null || retiringSnapshots.current.size > 0
            if (!delta || !current.ready || (!turning && current.busy)) return
            event.preventDefault()
            event.stopPropagation()
            const now = performance.now()
            if (turning) {
                gesture.current.hold(now)
                return
            }
            const movement = gesture.current.move(delta, now, current.pageNum > 1, current.pageNum < current.numPages)
            if (idleTimer.current) clearTimeout(idleTimer.current)
            setOffset(movement.offset)
            setTracking(true)
            if (movement.turn !== null) {
                void startTurn(movement.turn, movement.offset)
            } else {
                idleTimer.current = setTimeout(() => {
                    setTracking(false)
                    setOffset(0)
                }, WHEEL_GESTURE_IDLE_MS)
            }
        }
        surface.addEventListener('wheel', onWheel, { passive: false })
        return () => {
            surface.removeEventListener('wheel', onWheel)
            clearTurn(mounted.current)
            gesture.current.reset()
        }
    }, [options.enabled, options.pdfDoc, options.containerRef, options.eventTargetRef, clearTurn, startTurn])

    useEffect(() => {
        const turn = pending.current
        if (turn && (options.pageNum === turn.originPage || options.pageNum === turn.targetPage)) return
        clearTurn()
        gesture.current.reset()
    }, [options.pageNum, options.enabled, options.pdfDoc, clearTurn])

    return { offset, tracking, covered, overlayRef, onPageRendered }
}
