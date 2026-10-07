import { useEffect, useRef, useState } from 'react'
import type { DrawingPath } from '@thousands-of-ties/drawing-common'
import { flushDrawingSaves, getAllDrawings, getAllTextAnnotations, saveTextAnnotation, scheduleDrawingSave } from '../utils/indexedDB'

export function useStudyDrawingSaveQueue(pdfId: string, revision: unknown) {
  const pendingDrawingWritesRef = useRef(new Map<number, string>())
  useEffect(() => {
    const flushPendingDrawings = () => {
      pendingDrawingWritesRef.current.forEach((data, page) => scheduleDrawingSave(pdfId, page, data))
      pendingDrawingWritesRef.current.clear()
      void flushDrawingSaves(pdfId)
    }
    window.addEventListener('pagehide', flushPendingDrawings)
    return () => {
      window.removeEventListener('pagehide', flushPendingDrawings)
      flushPendingDrawings()
    }
  }, [pdfId])
  useEffect(() => {
    pendingDrawingWritesRef.current.forEach((data, page) => scheduleDrawingSave(pdfId, page, data))
    pendingDrawingWritesRef.current.clear()
  }, [revision, pdfId])
  return pendingDrawingWritesRef
}

export function useStudyTextAnnotations<T>(pdfId: string) {
  const [textAnnotations, setTextAnnotations] = useState<Map<number, T[]>>(new Map())
  useEffect(() => {
    let active = true
    getAllTextAnnotations(pdfId).then(saved => {
      const annotations = new Map<number, T[]>()
      for (const [page, json] of Object.entries(saved)) {
        const values = JSON.parse(json) as T[]
        if (values.length) annotations.set(Number(page), values)
      }
      if (active) setTextAnnotations(annotations)
    }).catch(error => console.error('Failed to load text annotations:', error))
    return () => { active = false }
  }, [pdfId])
  const persistTextAnnotations = (page: number, annotations: T[]) => {
    void saveTextAnnotation(pdfId, page, JSON.stringify(annotations)).catch(error =>
      console.error('Failed to save text annotations:', error))
  }
  return { textAnnotations, setTextAnnotations, persistTextAnnotations }
}

export function useStudyDrawingState(pdfId: string) {
  const [drawingPaths, setDrawingPaths] = useState<Map<number, DrawingPath[]>>(new Map())
  const pendingDrawingWritesRef = useStudyDrawingSaveQueue(pdfId, drawingPaths)
  useEffect(() => {
    let active = true
    getAllDrawings(pdfId).then(saved => {
      const paths = new Map<number, DrawingPath[]>()
      for (const [page, json] of Object.entries(saved)) {
        const values = JSON.parse(json) as DrawingPath[]
        if (values.length) paths.set(Number(page), values)
      }
      if (active) setDrawingPaths(paths)
    }).catch(error => console.error('Failed to load drawings:', error))
    return () => { active = false }
  }, [pdfId])
  return { drawingPaths, setDrawingPaths, pendingDrawingWritesRef }
}
