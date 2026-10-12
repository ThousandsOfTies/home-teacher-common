import { useState } from 'react'

type Tool = 'text' | 'pen' | 'eraser'
type ToolModes = Record<Tool, { active: boolean; toggle: () => void }>
const CLOSED_POPUPS = { text: false, pen: false }

/** Pen/text settings open on repeated taps; the eraser has its own persistent size slider. */
export function useStudyToolPopups(modes: ToolModes) {
    const [popups, setPopups] = useState(CLOSED_POPUPS)

    const handleClick = (tool: Tool) => {
        if (tool !== 'eraser' && modes[tool].active) {
            setPopups(previous => ({ ...previous, [tool]: !previous[tool] }))
        } else {
            modes[tool].toggle()
            setPopups(CLOSED_POPUPS)
        }
    }

    return {
        showTextPopup: popups.text,
        showPenPopup: popups.pen,
        handleTextClick: () => handleClick('text'),
        handlePenClick: () => handleClick('pen'),
        handleEraserClick: () => handleClick('eraser'),
    }
}
