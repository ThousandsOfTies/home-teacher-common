import { useEffect, useRef, type RefObject } from 'react'
import { normalizeWheelDelta, WheelPageGesture } from '../utils/wheelPageGesture'

interface WheelPanelNavigationOptions {
    enabled: boolean
    containerRef: RefObject<HTMLDivElement>
    /** Stable identity of the displayed screen, used to discard an unfinished gesture after navigation. */
    navigationKey: unknown
    canGoBack: boolean
    canGoForward: boolean
    busy?: boolean
    onNavigate: (direction: -1 | 1) => void | Promise<void>
}

/** Opt-in horizontal wheel navigation; route decisions belong to the caller. */
export const useWheelPanelNavigation = (options: WheelPanelNavigationOptions) => {
    const latest = useRef(options)
    latest.current = options
    const gesture = useRef(new WheelPageGesture())
    const previousKey = useRef(options.navigationKey)

    useEffect(() => {
        if (Object.is(previousKey.current, options.navigationKey)) return
        previousKey.current = options.navigationKey
        gesture.current.reset()
        gesture.current.hold(performance.now())
    }, [options.navigationKey])

    useEffect(() => {
        if (!options.enabled) return
        const surface = options.containerRef.current
        if (!surface) return
        let pending = false
        let disposed = false
        const onWheel = (event: WheelEvent) => {
            if (event.defaultPrevented || !latest.current.enabled) return
            if (event.ctrlKey || event.metaKey) {
                gesture.current.reset()
                return
            }
            if (event.altKey || event.buttons !== 0) return
            if (event.target instanceof Element && event.target.closest(
                'input, textarea, select, button, [contenteditable="true"], [role="dialog"], [data-wheel-panel-navigation-ignore]',
            )) return
            if (!event.shiftKey && Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
            const horizontal = event.shiftKey && Math.abs(event.deltaY) >= Math.abs(event.deltaX)
                ? event.deltaY : event.deltaX
            const delta = normalizeWheelDelta({ deltaY: horizontal, deltaMode: event.deltaMode }, surface.clientWidth)
            if (!delta) return
            // Capture before canvas pan/zoom handlers and before browser history gestures.
            event.preventDefault()
            event.stopPropagation()
            const now = performance.now()
            const current = latest.current
            if (pending || current.busy) {
                gesture.current.hold(now)
                return
            }
            const movement = gesture.current.move(delta, now, current.canGoBack, current.canGoForward)
            if (movement.turn === null) return
            pending = true
            void Promise.resolve().then(() => {
                if (!disposed) return current.onNavigate(movement.turn!)
            }).catch(error => console.error('Panel wheel navigation failed:', error)).finally(() => {
                pending = false
                if (!disposed) gesture.current.hold(performance.now())
            })
        }
        surface.addEventListener('wheel', onWheel, { passive: false, capture: true })
        return () => {
            disposed = true
            surface.removeEventListener('wheel', onWheel, true)
            gesture.current.reset()
        }
    }, [options.enabled, options.containerRef])
}
