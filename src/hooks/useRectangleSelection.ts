import { useCallback, useRef, useState, type RefObject } from 'react'
import type { StudySelectionRect } from '../utils/studySelection'

type Bounds = { left: number; top: number; right: number; bottom: number }

/** Mouse and touch share the same synchronous selection, including its final point. */
export function useRectangleSelection(containerRef: RefObject<HTMLElement>) {
  const [rect, setRect] = useState<StudySelectionRect | null>(null)
  const rectRef = useRef<StudySelectionRect | null>(null)
  const activeRef = useRef(false)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const publish = useCallback((value: StudySelectionRect | null) => {
    rectRef.current = value
    setRect(value)
  }, [])
  const begin = useCallback((x: number, y: number) => {
    activeRef.current = true
    startRef.current = { x, y }
    publish({ x, y, width: 0, height: 0 })
  }, [publish])
  const move = useCallback((x: number, y: number) => {
    const start = startRef.current
    if (!activeRef.current || !start) return
    publish({ x: Math.min(start.x, x), y: Math.min(start.y, y),
      width: Math.abs(x - start.x), height: Math.abs(y - start.y) })
  }, [publish])
  const cancel = useCallback(() => {
    activeRef.current = false
    startRef.current = null
    publish(null)
  }, [publish])
  const finish = useCallback((minimumSize = 10) => {
    if (!activeRef.current) return null
    activeRef.current = false
    startRef.current = null
    const value = rectRef.current
    if (!value || value.width < minimumSize || value.height < minimumSize) {
      publish(null)
      return null
    }
    return { ...value }
  }, [publish])
  const beginAt = useCallback((clientX: number, clientY: number) => {
    const bounds = containerRef.current?.getBoundingClientRect()
    if (bounds) begin(clientX - bounds.left, clientY - bounds.top)
  }, [containerRef, begin])
  const moveAt = useCallback((clientX: number, clientY: number, clip?: Bounds) => {
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) return
    move((clip ? Math.max(clip.left, Math.min(clip.right, clientX)) : clientX) - bounds.left,
      (clip ? Math.max(clip.top, Math.min(clip.bottom, clientY)) : clientY) - bounds.top)
  }, [containerRef, move])
  return { rect, rectRef, activeRef, startRef, begin, move, beginAt, moveAt, finish, cancel }
}
