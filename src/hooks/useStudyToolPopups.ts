import { useState } from 'react'

type Tool = 'text' | 'pen' | 'eraser'
type ToolModes = Record<Tool, { active: boolean; toggle: () => void }>
const CLOSED_POPUPS = { text: false, pen: false, eraser: false }

/** The first tap activates a tool; further taps toggle its settings popup. */
export function useStudyToolPopups(modes: ToolModes) {
    const [popups, setPopups] = useState(CLOSED_POPUPS)

    const handleClick = (tool: Tool) => {
        if (modes[tool].active) {
            setPopups(previous => ({ ...previous, [tool]: !previous[tool] }))
        } else {
            modes[tool].toggle()
            setPopups(CLOSED_POPUPS)
        }
    }

    return {
        showTextPopup: popups.text,
        showPenPopup: popups.pen,
        showEraserPopup: popups.eraser,
        handleTextClick: () => handleClick('text'),
        handlePenClick: () => handleClick('pen'),
        handleEraserClick: () => handleClick('eraser'),
    }
}
