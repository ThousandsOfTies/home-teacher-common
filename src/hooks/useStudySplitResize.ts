import { useEffect, useRef, useState } from 'react'

const clampRatio = (ratio: number) => Math.max(0.2, Math.min(0.8, ratio))

export function useStudySplitResize(storageKey: string, getContainer: () => HTMLElement | null) {
  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    const parsed = saved === null ? NaN : Number(saved)
    return Number.isFinite(parsed) ? clampRatio(parsed) : 0.5
  })
  const [isResizing, setIsResizing] = useState(false)
  const containerResolverRef = useRef(getContainer)
  containerResolverRef.current = getContainer

  useEffect(() => {
    if (!isResizing) return
    const ratioAt = (clientX: number) => {
      const bounds = containerResolverRef.current()?.getBoundingClientRect()
      return bounds && bounds.width > 0 ? clampRatio((clientX - bounds.left) / bounds.width) : null
    }
    const move = (clientX: number) => {
      const ratio = ratioAt(clientX)
      if (ratio !== null) setSplitRatio(ratio)
    }
    const end = (clientX: number | undefined) => {
      const ratio = clientX === undefined ? null : ratioAt(clientX)
      if (ratio !== null) { setSplitRatio(ratio); localStorage.setItem(storageKey, String(ratio)) }
      setIsResizing(false)
    }
    const mouseMove = (event: MouseEvent) => { event.preventDefault(); move(event.clientX) }
    const touchMove = (event: TouchEvent) => {
      event.preventDefault()
      if (event.touches[0]) move(event.touches[0].clientX)
    }
    const mouseEnd = (event: MouseEvent) => end(event.clientX)
    const touchEnd = (event: TouchEvent) => end(event.changedTouches[0]?.clientX)
    const cancel = () => end(undefined)
    document.addEventListener('mousemove', mouseMove)
    document.addEventListener('mouseup', mouseEnd)
    document.addEventListener('touchmove', touchMove, { passive: false })
    document.addEventListener('touchend', touchEnd)
    document.addEventListener('touchcancel', cancel)
    return () => {
      document.removeEventListener('mousemove', mouseMove)
      document.removeEventListener('mouseup', mouseEnd)
      document.removeEventListener('touchmove', touchMove)
      document.removeEventListener('touchend', touchEnd)
      document.removeEventListener('touchcancel', cancel)
    }
  }, [isResizing, storageKey])

  return { splitRatio, isResizing, handleResizeStart: () => setIsResizing(true) }
}
