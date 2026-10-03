export type PanelWheelDestination =
    | { type: 'panel'; index: number }
    | { type: 'marker'; id: string }

interface PanelWheelDestinationOptions {
    direction: -1 | 1
    currentIndex: number
    panelCount: number
    nextPanelId?: string
    /** Undefined follows the existing breadcrumb; a list represents the source's outgoing links. */
    outgoingIds?: readonly string[]
}

/** A wheel gesture must never choose between multiple outgoing links. */
export const getPanelWheelDestination = (options: PanelWheelDestinationOptions): PanelWheelDestination | null => {
    const { direction, currentIndex, panelCount, nextPanelId, outgoingIds } = options
    if (direction === -1) return currentIndex > 0 ? { type: 'panel', index: currentIndex - 1 } : null
    const nextIndex = currentIndex + 1
    if (outgoingIds !== undefined) {
        const ids = [...new Set(outgoingIds)]
        if (ids.length !== 1) return null
        if (nextIndex < panelCount && nextPanelId === ids[0]) return { type: 'panel', index: nextIndex }
        return { type: 'marker', id: ids[0] }
    }
    return nextIndex < panelCount ? { type: 'panel', index: nextIndex } : null
}
