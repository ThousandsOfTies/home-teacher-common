import { useState } from 'react'

export type StudyToolMode = 'none' | 'pen' | 'eraser' | 'text' | 'select-pdf' | 'select-result'

export function studyToolForPanel(panel: 'pdf' | 'answer' | 'grading', answerTool: 'pen' | 'text') {
  return panel === 'pdf' ? 'select-pdf' : panel === 'grading' ? 'select-result' : answerTool
}

/** A single selection makes incompatible tool combinations unrepresentable. */
export function useStudyToolMode(initialTool: StudyToolMode) {
  const [tool, setTool] = useState<StudyToolMode>(initialTool)
  return {
    tool, setTool,
    isDrawingMode: tool === 'pen',
    isEraserMode: tool === 'eraser',
    isTextMode: tool === 'text',
    isSelectionMode: tool === 'select-pdf',
    isGradingCaptureMode: tool === 'select-result',
  }
}
