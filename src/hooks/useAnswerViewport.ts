import { useZoomPan } from '@thousands-of-ties/drawing-common'
import type { RefObject } from 'react'
import { useAnswerWheel } from './useAnswerWheel'

/** Answer sheets keep their existing free pan and 20–500% zoom policy. */
export function useAnswerViewport(containerRef: RefObject<HTMLDivElement>) {
  const viewport = useZoomPan(containerRef, 0.2, undefined, undefined,
    { minimumZoom: 0.2, constrainPan: false, nativeWheel: false })
  useAnswerWheel(containerRef, viewport)
  return { ...viewport, startPanning: viewport.startPanningAt, doPanning: viewport.panTo }
}
