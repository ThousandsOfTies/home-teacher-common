import { FiRotateCcw } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import type { CSSProperties, SyntheticEvent } from 'react'
import { STUDY_REGION_UNDO_ICON_SIZE } from '../../utils/studyRegionControls'
import './StudyTraceUndoButton.css'

interface StudyTraceUndoButtonProps {
  available: boolean
  busy: boolean
  onUndo: () => void
  label?: string
  inline?: boolean
  traceId?: string
  style?: CSSProperties
  controlScale?: number
}

export const StudyTraceUndoButton = ({ available, busy, onUndo,
  label, inline = false, traceId, style,
  controlScale = 1 }: StudyTraceUndoButtonProps) => {
  const { t } = useTranslation()
  if (!available) return null
  const stopPointer = (event: SyntheticEvent) => event.stopPropagation()
  return (
    <button type="button" className={`study-trace-undo-button${inline ? ' study-trace-undo-button-inline' : ''}`}
      disabled={busy} data-study-trace-undo-id={traceId} style={style}
      title={label ?? t('pdfNavigation.undoTrace')} aria-label={label ?? t('pdfNavigation.undoTrace')}
      onPointerDown={stopPointer} onMouseDown={stopPointer} onTouchStart={stopPointer} onTouchEnd={stopPointer}
      onClick={event => { event.stopPropagation(); onUndo() }}>
      {inline ? (
        <span className="study-trace-undo-icon" aria-hidden="true"
          style={{ width: STUDY_REGION_UNDO_ICON_SIZE * controlScale, height: STUDY_REGION_UNDO_ICON_SIZE * controlScale }}>
          <FiRotateCcw size={STUDY_REGION_UNDO_ICON_SIZE * 0.75 * controlScale} />
        </span>
      ) : <FiRotateCcw size={22} aria-hidden="true" />}
    </button>
  )
}
