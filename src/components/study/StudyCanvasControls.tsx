import { useTranslation } from 'react-i18next'
import { BiEraser } from 'react-icons/bi'
import { FiDroplet } from 'react-icons/fi'
import './StudyCanvasControls.css'

const ERASER_SIZE_OPTIONS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const

interface StudyCanvasControlsProps {
    tool: 'pen' | 'eraser' | null
    penSize: number
    setPenSize: (size: number) => void
    eraserSize: number
    setEraserSize: (size: number) => void
    /** Only supply this when the displayed drawing surface supports opacity. */
    opacity?: { value: number; onChange: (value: number) => void }
}

/** Mounted outside the sliding panels to keep the drawing adjustments in one place. */
export function StudyCanvasControls({
    tool, penSize, setPenSize, eraserSize, setEraserSize, opacity,
}: StudyCanvasControlsProps) {
    const { t } = useTranslation()
    const showOpacity = tool === 'pen' && opacity !== undefined
    const sizeLabel = t(tool === 'eraser' ? 'studyCanvasControls.eraserSize' : 'studyCanvasControls.penSize')
    const sizeValue = t(tool === 'eraser' ? 'studyCanvasControls.eraserValue' : 'studyCanvasControls.penValue', {
        size: tool === 'eraser' ? eraserSize : penSize,
    })

    return <aside className={`study-canvas-controls${opacity ? ' supports-opacity' : ''}`}
        aria-label={t('studyCanvasControls.title')} data-wheel-panel-navigation-ignore
        onPointerDown={event => event.stopPropagation()}
        onMouseDown={event => event.stopPropagation()}
        onTouchStart={event => event.stopPropagation()}>
        {tool && <div className="study-canvas-adjustments" role="group" aria-label={sizeLabel}>
            <label className="study-canvas-slider" title={sizeValue}>
                <span className="study-canvas-slider-icon" aria-hidden="true">
                    {tool === 'eraser' ? <BiEraser />
                        : <span className="study-canvas-size-preview"
                            style={{ width: 5 + penSize, height: 5 + penSize }} />}
                </span>
                {tool === 'eraser' ? <input type="range" min="0" max={ERASER_SIZE_OPTIONS.length - 1} step="1"
                    value={Math.max(0, ERASER_SIZE_OPTIONS.indexOf(eraserSize as typeof ERASER_SIZE_OPTIONS[number]))}
                    aria-label={sizeLabel} aria-valuetext={sizeValue}
                    onChange={event => setEraserSize(ERASER_SIZE_OPTIONS[Number(event.target.value)])} />
                    : <input type="range" min="1" max="10" step="1" value={penSize}
                        aria-label={sizeLabel} aria-valuetext={sizeValue}
                        onChange={event => setPenSize(Number(event.target.value))} />}
                <output>{tool === 'eraser' ? eraserSize : penSize}</output>
            </label>
            {showOpacity && <label className="study-canvas-slider" title={t('studyCanvasControls.opacityValue', { value: opacity.value })}>
                <span className="study-canvas-slider-icon" aria-hidden="true"><FiDroplet /></span>
                <input type="range" min="10" max="100" step="1" value={opacity.value}
                    aria-label={t('studyCanvasControls.opacity')}
                    aria-valuetext={t('studyCanvasControls.opacityValue', { value: opacity.value })}
                    onChange={event => opacity.onChange(Number(event.target.value))} />
                <output>{opacity.value}%</output>
            </label>}
        </div>}
    </aside>
}
