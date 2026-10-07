import { useEffect, useRef, type RefObject } from 'react'
import { zoomAtPoint, type Viewport, type Point } from '@thousands-of-ties/drawing-common'

type Options = Viewport & { setZoom: (zoom: number) => void; setPanOffset: (pan: Point) => void }

export function useAnswerWheel(containerRef: RefObject<HTMLElement>, options: Options) {
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handleWheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.buttons !== 0) return
      if (event.target instanceof Element && event.target.closest(
        '.voice-text-editor, input, textarea, select, button, [contenteditable="true"], [role="dialog"]'
      )) return
      const deltaY = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1)
      if (!Number.isFinite(deltaY) || deltaY === 0) return
      event.preventDefault()
      event.stopPropagation()
      const current = optionsRef.current
      let next: Viewport
      if (event.ctrlKey || event.metaKey) {
        const bounds = container.getBoundingClientRect()
        next = zoomAtPoint(current, { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
          Math.min(Math.max(deltaY < 0 ? current.zoom * 1.1 : current.zoom / 1.1, 0.2), 5))
        current.setZoom(next.zoom)
      } else {
        next = { zoom: current.zoom, panOffset: { ...current.panOffset, y: current.panOffset.y - deltaY } }
      }
      // Wheel bursts can precede React's next render.
      optionsRef.current = { ...current, ...next }
      current.setPanOffset(next.panOffset)
    }
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [containerRef])
}
