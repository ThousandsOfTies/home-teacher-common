import React from 'react'
import { FiType } from 'react-icons/fi'
import { BiEraser } from 'react-icons/bi'

export type TextDirection = 'horizontal' | 'vertical-rl' | 'vertical-lr'

interface ToolButtonProps {
    active: boolean
    popupVisible: boolean
    onClick: () => void
    title: string
}

export function StudyEraserTool({ active, onClick, title }: Omit<ToolButtonProps, 'popupVisible'>) {
    return <button type="button" onClick={onClick} className={active ? 'active' : ''}
        title={title} aria-label={title} aria-pressed={active}>
        <BiEraser size={20} className="icon-scale-13" />
    </button>
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
