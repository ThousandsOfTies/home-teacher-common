import { FiRotateCcw } from 'react-icons/fi'
import './StudyTraceUndoButton.css'

interface StudyTraceUndoButtonProps {
  available: boolean
  busy: boolean
  onUndo: () => void
  label?: string
}

export const StudyTraceUndoButton = ({ available, busy, onUndo,
  label = '直前の選択跡の削除を取り消す' }: StudyTraceUndoButtonProps) => available ? (
  <button type="button" className="study-trace-undo-button" disabled={busy}
    title={label} aria-label={label} onClick={onUndo}>
    <FiRotateCcw size={22} aria-hidden="true" />
  </button>
) : null
