import { useEffect, useRef, type RefObject, type TouchEvent } from 'react'
import { pinchViewport, touchPair, type PinchGesture } from '@thousands-of-ties/drawing-common'
import type { PDFPaneHandle } from '../components/study/PDFPane'

type Pane = 'A' | 'B'
type Options = {
  containerRef: RefObject<HTMLElement>
  getTargetPane: (clientX: number) => Pane
  getPane: (pane: Pane) => PDFPaneHandle | null
  cancelSelection: () => void
}

export function useStudyOverlayTouch({ containerRef, getTargetPane, getPane, cancelSelection }: Options) {
  const gestureRef = useRef<(PinchGesture & { targetPane: Pane }) | null>(null)
  const pinchingPaneRef = useRef<PDFPaneHandle | null>(null)
  const stopPinch = () => {
    pinchingPaneRef.current?.setPinchActive(false)
    pinchingPaneRef.current = null
  }

  useEffect(() => () => {
    pinchingPaneRef.current?.setPinchActive(false)
    pinchingPaneRef.current = null
  }, [])

  const handleOverlayTouchStart = (event: TouchEvent, onSingleTouch?: (x: number, y: number) => void) => {
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) return
    if (event.touches.length >= 2) {
      event.preventDefault()
      const pair = touchPair(event.touches)
      const targetPane = getTargetPane(pair.center.x)
      const pane = getPane(targetPane)
      stopPinch()
      gestureRef.current = pair.distance > 0 && pane ? {
        targetPane, startDist: pair.distance, startCenter: pair.center,
        startZoom: pane.getZoom(),
        startPan: { ...pane.getPanOffset() },
      } : null
      pinchingPaneRef.current = gestureRef.current ? pane : null
      pinchingPaneRef.current?.setPinchActive(true)
      cancelSelection()
      return
    }
    if (event.touches.length !== 1) return
    stopPinch()
    gestureRef.current = null
    onSingleTouch?.(event.touches[0].clientX - bounds.left, event.touches[0].clientY - bounds.top)
  }

  const handleOverlayTouchMove = (event: TouchEvent, onSingleTouchMove?: (x: number, y: number) => void) => {
    const gesture = gestureRef.current
    if (event.touches.length >= 2 && gesture) {
      event.preventDefault()
      const pane = getPane(gesture.targetPane)
      const bounds = pane?.getContainerRect()
      if (!pane || !bounds) return
      const view = pinchViewport(gesture, touchPair(event.touches), bounds, pane.getMinimumZoom())
      if (view) {
        pane.setZoomValue(view.zoom)
        pane.setPanOffsetValue(view.panOffset)
      }
      return
    }
    // Do not turn the remaining finger into a new selection after a pinch.
    if (gesture) return
    if (event.touches.length === 1 && onSingleTouchMove) {
      const bounds = containerRef.current?.getBoundingClientRect()
      if (bounds) onSingleTouchMove(event.touches[0].clientX - bounds.left, event.touches[0].clientY - bounds.top)
    }
  }

  const handleOverlayTouchEnd = (event: TouchEvent, onTouchEnd?: () => void) => {
    if (event.touches.length < 2) stopPinch()
    if (event.touches.length === 0) {
      gestureRef.current = null
      onTouchEnd?.()
    }
  }

  const handleOverlayTouchCancel = () => {
    stopPinch()
    gestureRef.current = null
    cancelSelection()
  }

  return { handleOverlayTouchStart, handleOverlayTouchMove, handleOverlayTouchEnd, handleOverlayTouchCancel }
}
