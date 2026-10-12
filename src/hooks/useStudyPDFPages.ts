import { useEffect, useRef, useState } from 'react'
import { flushDrawingSaves, updatePDFRecord, type PDFFileRecord } from '../utils/indexedDB'
import { usePDFRenderer } from './pdf/usePDFRenderer'

const isValidPage = (page: number, total: number) => Number.isInteger(page) && page >= 1 && page <= total

// Page changes and swaps share the same drawing flush and 500 ms position persistence.
// Physical pane order remains with the app.
export function useStudyPDFPages(pdfRecord: PDFFileRecord, pdfId: string) {
  const [pages, setPages] = useState({
    pageA: pdfRecord.lastPageNumberA || 1,
    pageB: pdfRecord.lastPageNumberB || 1,
  })
  const currentPages = useRef(pages)
  const pageCount = useRef(0)
  const { pageA, pageB } = pages
  const [retryCount, setRetryCount] = useState(0)

  const changePages = (next: typeof pages) => {
    if (!isValidPage(next.pageA, pageCount.current) || !isValidPage(next.pageB, pageCount.current)) return
    const previous = currentPages.current
    const leavingPages = new Set<number>()
    if (previous.pageA !== next.pageA) leavingPages.add(previous.pageA)
    if (previous.pageB !== next.pageB) leavingPages.add(previous.pageB)
    if (!leavingPages.size) return
    for (const page of leavingPages) void flushDrawingSaves(pdfId, page)
    currentPages.current = next
    setPages(next)
  }

  const { pdfDoc, numPages, isLoading, error: pdfError } = usePDFRenderer(pdfRecord, {
    retryTrigger: retryCount,
    onLoadSuccess: total => {
      pageCount.current = total
      const previous = currentPages.current
      changePages({
        pageA: isValidPage(previous.pageA, total) ? previous.pageA : 1,
        pageB: isValidPage(previous.pageB, total) ? previous.pageB : 1,
      })
    },
    onLoadError: error => console.error(error),
  })
  pageCount.current = numPages

  const handlePageAChange = (page: number) => {
    changePages({ ...currentPages.current, pageA: page })
  }
  const handlePageBChange = (page: number) => {
    changePages({ ...currentPages.current, pageB: page })
  }

  const swapPages = () => {
    const previous = currentPages.current
    changePages({ pageA: previous.pageB, pageB: previous.pageA })
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

  return { pageA, pageB, swapPages, pdfDoc, numPages, isLoading, pdfError,
    handlePageAChange, handlePageBChange, setRetryCount }
}
