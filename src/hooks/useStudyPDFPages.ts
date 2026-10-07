import { useEffect, useState } from 'react'
import { flushDrawingSaves, updatePDFRecord, type PDFFileRecord } from '../utils/indexedDB'
import { usePDFRenderer } from './pdf/usePDFRenderer'

// Loading, page bounds and the existing 500 ms page-position persistence belong
// together. App-specific A/B switching and pane order remain with the caller.
export function useStudyPDFPages(pdfRecord: PDFFileRecord, pdfId: string) {
  const [pageA, setPageA] = useState(pdfRecord.lastPageNumberA || 1)
  const [pageB, setPageB] = useState(pdfRecord.lastPageNumberB || 1)
  const [retryCount, setRetryCount] = useState(0)
  const { pdfDoc, numPages, isLoading, error: pdfError } = usePDFRenderer(pdfRecord, {
    retryTrigger: retryCount,
    onLoadSuccess: pages => {
      if (pageA > pages) {
        setPageA(1)
        void updatePDFRecord(pdfRecord.id, { lastPageNumberA: 1 }).catch(() => {})
      }
      if (pageB > pages) {
        setPageB(1)
        void updatePDFRecord(pdfRecord.id, { lastPageNumberB: 1 }).catch(() => {})
      }
    },
    onLoadError: error => console.error(error),
  })

  const handlePageAChange = (page: number) => {
    if (page < 1 || page > numPages) return
    void flushDrawingSaves(pdfId, pageA)
    setPageA(page)
  }
  const handlePageBChange = (page: number) => {
    if (page < 1 || page > numPages) return
    void flushDrawingSaves(pdfId, pageB)
    setPageB(page)
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      const updates: Partial<PDFFileRecord> = {}
      if (pageA > 0 && pageA !== pdfRecord.lastPageNumberA) updates.lastPageNumberA = pageA
      if (pageB > 0 && pageB !== pdfRecord.lastPageNumberB) updates.lastPageNumberB = pageB
      if (Object.keys(updates).length) void updatePDFRecord(pdfRecord.id, updates).catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [pageA, pageB, pdfRecord.id, pdfRecord.lastPageNumberA, pdfRecord.lastPageNumberB])

  return { pageA, pageB, setPageA, setPageB, pdfDoc, numPages, isLoading, pdfError,
    handlePageAChange, handlePageBChange, setRetryCount }
}
