import { useState, useEffect, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFFileRecord, fetchPDFData, fetchPDFRange } from '../../utils/indexedDB'
import { isIOSLikeDevice } from '../../utils/platform'
import { LARGE_PDF_THRESHOLD_BYTES, PDFBlobRangeTransport, getRangePDFDocument } from '../../utils/pdfRange'

// PDF.jsのworkerを設定（ローカルファイルを使用、Safari/Edge対応）
// PDF.jsのworkerを設定
// ベースURLを動的に取得してworkerのパスを構築
const baseUrl = import.meta.env.BASE_URL
// 末尾がスラッシュで終わることを保証
const safeBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
pdfjsLib.GlobalWorkerOptions.workerSrc = `${safeBaseUrl}pdf.worker.min.js`

interface UsePDFRendererOptions {
  onLoadStart?: () => void
  onLoadSuccess?: (numPages: number) => void
  onLoadError?: (error: string) => void
  initialPage?: number
  retryTrigger?: number
}

export const usePDFRenderer = (
  pdfRecord: PDFFileRecord,
  options?: UsePDFRendererOptions
) => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)

  /* pageNum state removed - managed by parent */
  const [numPages, setNumPages] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // optionsをrefで保持して依存配列の問題を回避
  const optionsRef = useRef(options)
  optionsRef.current = options


  // Ref to hold latest pdfRecord to avoid stale closures in async calls if needed, 
  // though we mostly rely on the fact that if ID is same, content is same.
  const pdfRecordRef = useRef(pdfRecord)
  pdfRecordRef.current = pdfRecord

  // PDFを読み込む
  useEffect(() => {
    let isActive = true
    let loadingTask: { promise: Promise<pdfjsLib.PDFDocumentProxy>, destroy: () => Promise<void> } | null = null
    let loadedPdf: pdfjsLib.PDFDocumentProxy | null = null
    let rangeTransport: PDFBlobRangeTransport | null = null
    let timeoutId: number | null = null

    const loadPDF = async () => {
      // Use the current record
      const record = pdfRecordRef.current

      if (isActive) {
        setIsLoading(true)
        setError(null)
      }

      try {
        const isIOS = isIOSLikeDevice()

        if (isActive) {
          optionsRef.current?.onLoadStart?.()
        }

        const fileSize = record.fileData instanceof Blob ? record.fileData.size : 0
        let rangeFailure: Promise<never> | null = null
        if (fileSize >= LARGE_PDF_THRESHOLD_BYTES) {
          let rejectRangeRead: (error: Error) => void = () => {}
          rangeFailure = new Promise<never>((_, reject) => { rejectRangeRead = reject })
          rangeTransport = new PDFBlobRangeTransport(fileSize, (begin, end) => fetchPDFRange(record.id, begin, end), error => {
            rejectRangeRead(error)
            if (loadedPdf && isActive) {
              const message = `PDFの読み込みに失敗しました: ${error.message}`
              setError(message)
              setPdfDoc(null)
              setNumPages(0)
              optionsRef.current?.onLoadError?.(message)
            }
            void loadingTask?.destroy()
          })
          loadingTask = getRangePDFDocument(rangeTransport, {
            useWorkerFetch: false,
            isEvalSupported: false,
            stopAtErrors: true,
          })
        } else {
          // Small PDFs retain the established full-buffer path. Read a fresh Blob
          // from IndexedDB rather than a potentially stale Blob in props on iPad.
          const pdfData = await fetchPDFData(record.id)
          if (!isActive) return
          loadingTask = pdfjsLib.getDocument({
            data: pdfData,
            useWorkerFetch: false,
            isEvalSupported: false,
            stopAtErrors: true,
          })
        }

        // タイムアウト処理（iPad/iPhoneでは60秒、それ以外は30秒）
        const timeoutMs = isIOS ? 60000 : 30000
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(
            () => reject(new Error(`PDF読み込みがタイムアウトしました（${timeoutMs / 1000}秒）`)),
            timeoutMs
          )
        })
        const pdf = await Promise.race([
          loadingTask.promise,
          timeoutPromise,
          ...(rangeFailure ? [rangeFailure] : []),
        ])
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId)
          timeoutId = null
        }

        console.log('✅ PDF document loaded successfully, numPages:', pdf.numPages, 'isActive:', isActive);

        if (isActive) {
          loadedPdf = pdf
          setPdfDoc(pdf)
          setNumPages(pdf.numPages)
          setIsLoading(false)
          optionsRef.current?.onLoadSuccess?.(pdf.numPages)
        } else {
          // すでにアンマウントされている場合は破棄
          pdf.destroy()
        }

        // Store loadingTask for cleanup
        const originalDestroy = loadingTask.destroy
        loadingTask.destroy = async () => {
          if (originalDestroy) await originalDestroy.call(loadingTask!)
        }

      } catch (error) {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId)
          timeoutId = null
        }
        rangeTransport?.abort()
        if (loadingTask) loadingTask.destroy().catch(() => { })
        if (isActive) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          console.error('PDF読み込みエラー:', errorMsg)
          const fullErrorMsg = 'PDFの読み込みに失敗しました: ' + errorMsg
          setError(fullErrorMsg)
          optionsRef.current?.onLoadError?.(fullErrorMsg)
          setIsLoading(false)
        }
      }
    }

    loadPDF()

    return () => {
      isActive = false
      rangeTransport?.abort()
      if (timeoutId !== null) window.clearTimeout(timeoutId)
      if (loadingTask) {
        loadingTask.destroy().catch(() => { })
      }
      if (loadedPdf) {
        loadedPdf.destroy().catch(() => { })
      }
    }
  }, [pdfRecord.id, options?.retryTrigger]) // Reload if ID or retryTrigger changes

  return {
    pdfDoc,
    numPages,
    isLoading,
    error
  }
}
