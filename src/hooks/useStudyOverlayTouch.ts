import { useRef, type RefObject, type TouchEvent } from 'react'
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

  const handleOverlayTouchStart = (event: TouchEvent, onSingleTouch?: (x: number, y: number) => void) => {
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) return
    if (event.touches.length >= 2) {
      event.preventDefault()
      const pair = touchPair(event.touches)
      const targetPane = getTargetPane(pair.center.x)
      const pane = getPane(targetPane)
      gestureRef.current = pair.distance > 0 ? {
        targetPane, startDist: pair.distance, startCenter: pair.center,
        startZoom: pane?.getZoom() ?? 1,
        startPan: { ...(pane?.getPanOffset() ?? { x: 0, y: 0 }) },
      } : null
      cancelSelection()
      return
    }
    if (event.touches.length !== 1) return
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
      const view = pinchViewport(gesture, touchPair(event.touches), bounds, 0.1)
      if (view) {
        pane.setZoomValue(view.zoom)
        pane.setPanOffsetValue(view.panOffset)
      }
      return
    }
    if (event.touches.length === 1 && onSingleTouchMove) {
      const bounds = containerRef.current?.getBoundingClientRect()
      if (bounds) onSingleTouchMove(event.touches[0].clientX - bounds.left, event.touches[0].clientY - bounds.top)
    }
  }

  const handleOverlayTouchEnd = (event: TouchEvent, onTouchEnd?: () => void) => {
    if (event.touches.length === 0) {
      gestureRef.current = null
      onTouchEnd?.()
    }
  }

  return { handleOverlayTouchStart, handleOverlayTouchMove, handleOverlayTouchEnd }
}
