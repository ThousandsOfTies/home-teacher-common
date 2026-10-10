import { useEffect, useRef, type RefObject } from 'react'
import type { Viewport, Point } from '@thousands-of-ties/drawing-common'

type Options = {
  getViewport: () => Viewport
  zoomAt: (zoom: (previous: number) => number, anchor: Point) => unknown
  setPanOffset: (pan: Point) => unknown
}

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
      const commands = optionsRef.current
      if (event.ctrlKey || event.metaKey) {
        const bounds = container.getBoundingClientRect()
        commands.zoomAt(previous => deltaY < 0 ? previous * 1.1 : previous / 1.1,
          { x: event.clientX - bounds.left, y: event.clientY - bounds.top })
      } else {
        const current = commands.getViewport()
        commands.setPanOffset({ ...current.panOffset, y: current.panOffset.y - deltaY })
      }
    }
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [containerRef])
}
