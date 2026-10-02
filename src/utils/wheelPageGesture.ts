export const WHEEL_PAGE_THRESHOLD = 180
export const WHEEL_GESTURE_IDLE_MS = 260

export type PageTurnDirection = -1 | 1

interface WheelDelta {
    deltaY: number
    deltaMode: number
}

/** Normalize mouse detents and trackpad scrolling to CSS pixels. */
export const normalizeWheelDelta = (event: WheelDelta, viewportHeight: number) => {
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewportHeight : 1
    const pixels = event.deltaY * unit
    // One large detent must not bypass the deliberate page-turn margin.
    return Number.isFinite(pixels) ? Math.max(-100, Math.min(100, pixels)) : 0
}

/** One page turn per wheel gesture; ignore its remaining inertial events. */
export class WheelPageGesture {
    private distance = 0
    private lastEventTime = -Infinity
    private locked = false

    move(delta: number, now: number, canGoBack: boolean, canGoForward: boolean) {
        if (now - this.lastEventTime > WHEEL_GESTURE_IDLE_MS) {
            this.distance = 0
            this.locked = false
        }
        this.lastEventTime = now
        if (this.locked) return { offset: 0, turn: null }

        if (Math.sign(delta) !== Math.sign(this.distance)) this.distance = 0
        this.distance += delta
        const direction: PageTurnDirection = this.distance < 0 ? -1 : 1
        const canTurn = direction === -1 ? canGoBack : canGoForward
        if (!canTurn) {
            this.distance = Math.max(-55, Math.min(55, this.distance))
            return { offset: -this.distance * 0.65, turn: null }
        }
        if (Math.abs(this.distance) >= WHEEL_PAGE_THRESHOLD) {
            this.locked = true
            return { offset: -direction * WHEEL_PAGE_THRESHOLD * 0.65, turn: direction }
        }
        return { offset: -this.distance * 0.65, turn: null }
    }

    hold(now: number) {
        this.lastEventTime = now
        this.locked = true
    }

    reset() {
        this.distance = 0
        this.lastEventTime = -Infinity
        this.locked = false
    }
}
