import React from 'react'
import { FiType } from 'react-icons/fi'
import { BiEraser } from 'react-icons/bi'

export type TextDirection = 'horizontal' | 'vertical-rl' | 'vertical-lr'

const ERASER_SIZE_OPTIONS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const

interface ToolButtonProps {
    active: boolean
    popupVisible: boolean
    onClick: () => void
    title: string
}

interface StudyEraserToolProps extends ToolButtonProps {
    size: number
    setSize: (size: number) => void
    sizeLabel: string
}

export function StudyEraserTool({ active, popupVisible, onClick, title, size, setSize, sizeLabel }: StudyEraserToolProps) {
    return <div style={{ position: 'relative' }}>
        <button onClick={onClick} className={active ? 'active' : ''} title={title}>
            <BiEraser size={20} className="icon-scale-13" />
        </button>
        {active && popupVisible && <div className="tool-popup">
            <div className="popup-row">
                <label>{sizeLabel}</label>
                <input type="range" min="0" max={ERASER_SIZE_OPTIONS.length - 1} step="1"
                    value={Math.max(0, ERASER_SIZE_OPTIONS.indexOf(size as typeof ERASER_SIZE_OPTIONS[number]))}
                    onChange={event => setSize(ERASER_SIZE_OPTIONS[Number(event.target.value)])}
                    style={{ width: '100px' }} aria-valuetext={`${size}px`} />
                <span>{size}px</span>
            </div>
        </div>}
    </div>
}

interface StudyTextToolProps extends ToolButtonProps {
    fontSize: number
    setFontSize: (size: number) => void
    direction: TextDirection
    setDirection: (direction: TextDirection) => void
    color: string
    setColor: (color: string) => void
    labels: {
        size: string
        direction: string
        horizontal: string
        verticalRight: string
        verticalLeft: string
        color: string
    }
    colorInputClassName?: string
    colorInputStyle?: React.CSSProperties
}

export function StudyTextTool({
    active, popupVisible, onClick, title, fontSize, setFontSize, direction, setDirection,
    color, setColor, labels, colorInputClassName, colorInputStyle,
}: StudyTextToolProps) {
    return <div style={{ position: 'relative' }}>
        <button onClick={onClick} className={active ? 'active' : ''} title={title}>
            <FiType size={20} />
        </button>
        {active && popupVisible && <div className="tool-popup" style={{ minWidth: '180px' }}>
            <div className="popup-row">
                <label>{labels.size}</label>
                <input type="range" min="10" max="32" value={fontSize}
                    onChange={event => setFontSize(Number(event.target.value))} style={{ width: '80px' }} />
                <span>{fontSize}px</span>
            </div>
            <div className="popup-row">
                <label>{labels.direction}</label>
                <select value={direction} onChange={event => setDirection(event.target.value as TextDirection)}
                    style={{ padding: '4px', borderRadius: '4px' }}>
                    <option value="horizontal">{labels.horizontal}</option>
                    <option value="vertical-rl">{labels.verticalRight}</option>
                    <option value="vertical-lr">{labels.verticalLeft}</option>
                </select>
            </div>
            <div className="popup-row">
                <label>{labels.color}</label>
                <input type="color" value={color} onChange={event => setColor(event.target.value)}
                    className={colorInputClassName} style={colorInputStyle} />
            </div>
        </div>}
    </div>
}
