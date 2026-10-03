import { useEffect, useRef, useState } from 'react'

export const STUDY_TRACE_UNDO_MS = 10_000

/** Persist each deletion immediately, retaining only a short-lived in-memory undo stack. */
export const useStudyTraceUndo = <Target, Snapshot extends { pdfId: string }>(pdfId: string, actions: {
  remove: (target: Target) => Promise<Snapshot>
  restore: (snapshot: Snapshot) => Promise<void>
}) => {
  const historyRef = useRef<Snapshot[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busyRef = useRef(false)
  const scopeRef = useRef(0)
  const [undoAvailable, setUndoAvailable] = useState(false)
  const [busy, setBusy] = useState(false)

  const clearTimer = () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
  }
  const restartExpiry = () => {
    clearTimer()
    setUndoAvailable(historyRef.current.length > 0)
    if (!historyRef.current.length) return
    timerRef.current = setTimeout(() => {
      historyRef.current = []
      timerRef.current = null
      setUndoAvailable(false)
    }, STUDY_TRACE_UNDO_MS)
  }

  useEffect(() => {
    scopeRef.current++
    clearTimer()
    historyRef.current = []
    busyRef.current = false
    setBusy(false)
    setUndoAvailable(false)
    return () => {
      scopeRef.current++
      clearTimer()
      historyRef.current = []
    }
  }, [pdfId])

  const deleteTrace = async (target: Target, beforeDelete?: () => Promise<void>) => {
    if (busyRef.current) return null
    const scope = scopeRef.current
    busyRef.current = true
    setBusy(true)
    clearTimer()
    try {
      await beforeDelete?.()
      if (scope !== scopeRef.current) return null
      const snapshot = await actions.remove(target)
      if (scope !== scopeRef.current) return null
      historyRef.current.push(snapshot)
      return snapshot
    } finally {
      if (scope === scopeRef.current) {
        busyRef.current = false
        setBusy(false)
        restartExpiry()
      }
    }
  }

  const undoDelete = async () => {
    if (busyRef.current) return null
    const snapshot = historyRef.current[historyRef.current.length - 1]
    if (!snapshot || snapshot.pdfId !== pdfId) return null
    const scope = scopeRef.current
    busyRef.current = true
    setBusy(true)
    clearTimer()
    try {
      await actions.restore(snapshot)
      if (scope !== scopeRef.current) return null
      historyRef.current.pop()
      return snapshot
    } finally {
      if (scope === scopeRef.current) {
        busyRef.current = false
        setBusy(false)
        restartExpiry()
      }
    }
  }

  return { deleteTrace, undoDelete, undoAvailable, busy }
}
