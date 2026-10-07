import { useTranslation } from 'react-i18next'
import { localizeErrorMessage } from '../../i18n/errorMessages'

import { useState } from 'react'
import { getAllPDFRecords, deletePDFRecord, savePDFRecord, generatePDFId, PDFFileRecord } from '../../utils/indexedDB'
import * as pdfjsLib from 'pdfjs-dist'
import { detectSubject } from '../../services/api'
import { isSupportedImageFile, processImageFiles } from '../../utils/imageProcessor'
import { LARGE_PDF_THRESHOLD_BYTES, PDFBlobRangeTransport, getRangePDFDocument } from '../../utils/pdfRange'
import { inspectPDFText, type PDFTextInspection } from '../../utils/pdfTextInspection'

// Workerの設定
// Workerの設定（ローカルファイルを使用）
const baseUrl = import.meta.env.BASE_URL
const safeBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
pdfjsLib.GlobalWorkerOptions.workerSrc = `${safeBaseUrl}pdf.worker.min.js`

type ImportError = string | { key: string; values?: Record<string, string | number> }

export const usePDFRecords = (maxPDFFileSizeMB = 100, checkPDFTextOnImport = false) => {
  const { t } = useTranslation()
  const [pdfRecords, setPdfRecords] = useState<PDFFileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [textInspectionProgress, setTextInspectionProgress] = useState<{ checkedPages: number; totalPages: number } | null>(null)
  const [errorMessage, setErrorMessage] = useState<ImportError | null>(null)

  const loadPDFRecords = async () => {
    try {
      setLoading(true)
      const records = await getAllPDFRecords()
      setPdfRecords(records)
    } catch (error) {
      console.error('Failed to load PDFs:', error)
      setErrorMessage({ key: 'pdfImport.loadFailed' })
    } finally {
      setLoading(false)
    }
  }

  // サムネイルを生成
  const preparePDF = async (file: Blob): Promise<{ thumbnail: string; textInspection?: PDFTextInspection }> => {
    let rangeError: (error: Error) => void = () => {}
    const rangeFailure = new Promise<never>((_, reject) => { rangeError = reject })
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | undefined
    const range = file.size >= LARGE_PDF_THRESHOLD_BYTES
      ? new PDFBlobRangeTransport(file.size, (begin, end) => file.slice(begin, end).arrayBuffer(), error => {
          rangeError(error)
          void loadingTask?.destroy()
        })
      : null

    try {
      loadingTask = range
        ? getRangePDFDocument(range)
        : pdfjsLib.getDocument({ data: await file.arrayBuffer() })
      const pdf = await Promise.race([loadingTask.promise, rangeFailure])
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: 0.5 })

      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) throw new Error(t('errors.canvasUnavailable'))

      canvas.height = viewport.height
      canvas.width = viewport.width
      await page.render({ canvasContext: context, viewport }).promise
      const thumbnail = canvas.toDataURL('image/jpeg', 0.7)
      const textInspection = checkPDFTextOnImport ? await inspectPDFText(pdf, setTextInspectionProgress) : undefined
      return { thumbnail, textInspection }
    } finally {
      range?.abort()
      await loadingTask?.destroy()
    }
  }

  // PDFファイルを追加
  const addPDF = async (file: Blob, fileName: string) => {
    setUploading(true)
    setTextInspectionProgress(null)
    try {
      const id = generatePDFId(fileName)

      const { thumbnail, textInspection } = await preparePDF(file)
      setTextInspectionProgress(null)

      // 教科を自動検出（表紙画像を使用）
      let detectedSubjectId: string | undefined = undefined
      try {
        console.log('🔍 Detecting subject from cover page...')
        const subjectResponse = await detectSubject(thumbnail)
        if (subjectResponse.success && subjectResponse.subjectId) {
          detectedSubjectId = subjectResponse.subjectId
          console.log(`✅ Subject detected: ${detectedSubjectId} (confidence: ${subjectResponse.confidence})`)
        } else {
          console.warn('⚠️ Subject detection failed or returned no result')
        }
      } catch (error) {
        console.error('❌ Subject detection error:', error)
        // エラーが起きても続行（教科は未設定のまま）
      }

      const newRecord: PDFFileRecord = {
        id,
        fileName,
        fileData: file,
        thumbnail,
        ...(textInspection ? { textInspection } : {}),
        lastOpened: Date.now(),
        drawings: {},
        subjectId: detectedSubjectId, // 検出された教科ID（未検出の場合はundefined）
      }

      await savePDFRecord(newRecord)
      await loadPDFRecords()
      return true
    } catch (error) {
      console.error('Failed to add PDF:', error)
      setErrorMessage(error instanceof DOMException && error.name === 'QuotaExceededError'
        ? { key: 'pdfImport.storageFull' }
        : { key: 'pdfImport.addFailed', values: { detail: error instanceof Error ? error.message : String(error) } })
      return false
    } finally {
      setUploading(false)
      setTextInspectionProgress(null)
    }
  }

  const handleFileSelect = async (mode: 'pdf' | 'image' = 'pdf') => {
    setUploading(true)
    try {
      let files: File[] = []

      if ('showOpenFilePicker' in window) {
        console.log('📂 Using modern file picker API...')
        try {
          const pickerOptions: any = { multiple: true }
          if (mode === 'pdf') {
            pickerOptions.types = [{ description: t('admin.pdfFiles'), accept: { 'application/pdf': ['.pdf'] } }]
          }
          const fileHandles = await (window as any).showOpenFilePicker(pickerOptions)
          console.log(`📂 File handles received: ${fileHandles.length}`)
          files = await Promise.all(fileHandles.map((handle: any) => handle.getFile()))
          console.log(`📂 Files loaded: ${files.length}`)

          if (!files || files.length === 0) {
            console.log('⚠️ No files selected')
            setUploading(false)
            return
          }
        } catch (error) {
          if (error instanceof Error && error.name !== 'AbortError') {
            console.error('File picker failed:', error)
          } else {
            console.log('📂 File picker cancelled by user')
          }
          setUploading(false)
          return
        }
      } else {
        console.log('📂 Using fallback file picker...')
        const selectedFiles = await new Promise<FileList | null>((resolve) => {
          const input = document.createElement('input')
          input.type = 'file'
          if (mode === 'pdf') {
            input.accept = 'application/pdf'
          }
          input.multiple = true

          let isResolved = false

          // ファイル選択イベント
          input.onchange = (e) => {
            if (isResolved) return
            isResolved = true
            const selectedFiles = (e.target as HTMLInputElement).files
            resolve(selectedFiles)
          }

          // キャンセルイベント（ファイル選択ダイアログを閉じた時）
          input.oncancel = () => {
            if (isResolved) return
            isResolved = true
            resolve(null)
          }

          // フォーカスが戻った時の処理
          // iPadのSafariではonchangeが発火しないことがあるため、
          // フォーカスハンドラーでinput.filesを直接チェック
          const handleFocus = () => {
            setTimeout(() => {
              if (isResolved) return

              if (!input.files || input.files.length === 0) {
                isResolved = true
                resolve(null)
              } else {
                // ファイルが選択されているがonchangeが呼ばれていない場合
                isResolved = true
                resolve(input.files)
              }
            }, 1000) // iPadのために待機時間を延長
          }

          window.addEventListener('focus', handleFocus, { once: true })
          input.click()
        })

        if (!selectedFiles || selectedFiles.length === 0) {
          setUploading(false)
          return
        }

        files = Array.from(selectedFiles)
      }

      // ファイル数制限チェック
      const MAX_FILES = 100
      const MAX_IMAGE_FILE_SIZE_MB = 100
      const MAX_TOTAL_SIZE_MB = Math.max(300, maxPDFFileSizeMB)

      if (files.length > MAX_FILES) {
        const message = t('pdfImport.tooManyFiles', { max: MAX_FILES, count: files.length })
        setErrorMessage(message)
        alert(message)
        setUploading(false)
        return
      }

      // PDF and image imports have separate limits; apps can opt into large PDFs.
      console.log(`📁 Selected ${files.length} file(s)`)
      let totalSize = 0

      for (const file of files) {
        console.log(`  - ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB, ${file.type})`)
        totalSize += file.size

        const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        const maxFileSizeMB = isPDF ? maxPDFFileSizeMB : MAX_IMAGE_FILE_SIZE_MB
        if (file.size > maxFileSizeMB * 1024 * 1024) {
          const message = t('pdfImport.fileTooLarge', { max: maxFileSizeMB, name: file.name, size: (file.size / 1024 / 1024).toFixed(2) })
          setErrorMessage(message)
          alert(message)
          setUploading(false)
          return
        }
      }

      // 合計サイズチェック
      const totalSizeMB = totalSize / 1024 / 1024
      console.log(`📊 Total size: ${totalSizeMB.toFixed(2)}MB`)

      if (totalSizeMB > MAX_TOTAL_SIZE_MB) {
        const message = t('pdfImport.totalTooLarge', { max: MAX_TOTAL_SIZE_MB, size: totalSizeMB.toFixed(2) })
        setErrorMessage(message)
        alert(message)
        setUploading(false)
        return
      }

      // ファイルを種類別に分類
      console.log('🔍 Classifying files...')
      const pdfFiles: File[] = []
      const imageFiles: File[] = []

      for (const file of files) {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          pdfFiles.push(file)
          console.log(`  ✅ PDF: ${file.name}`)
        } else if (isSupportedImageFile(file)) {
          imageFiles.push(file)
          console.log(`  ✅ Image: ${file.name}`)
        } else {
          console.warn(`  ⚠️ Unsupported file type: ${file.name}`)
        }
      }

      console.log(`📊 Classification result: ${pdfFiles.length} PDF(s), ${imageFiles.length} image(s)`)

      // 画像ファイルをPDFに変換
      if (imageFiles.length > 0) {
        console.log(`📷 Converting ${imageFiles.length} image(s) to PDF...`)
        try {
          const { convertImagesToPDF } = await import('../../services/pdfConverter').catch(error => {
            console.error('Failed to load PDF converter:', error)
            throw new Error(t('errors.converterLoad'))
          })
          console.log('  🔄 Step 1: Processing images...')
          const processedImages = await processImageFiles(imageFiles)
          console.log(`  ✅ Step 1 complete: ${processedImages.length} images processed`)

          console.log('  🔄 Step 2: Converting to PDF...')
          const pdfBlob = await convertImagesToPDF(processedImages, 'converted-images.pdf')
          console.log(`  ✅ Step 2 complete: PDF created (${(pdfBlob.size / 1024 / 1024).toFixed(2)}MB)`)

          // 変換されたPDFを追加
          const fileName = imageFiles.length === 1
            ? imageFiles[0].name.replace(/\.[^/.]+$/, '.pdf') // 拡張子をpdfに変更
            : 'converted-images.pdf'

          console.log(`  🔄 Step 3: Saving PDF as "${fileName}"...`)
          if (!await addPDF(pdfBlob, fileName)) return
          console.log(`  ✅ Step 3 complete: PDF saved`)
        } catch (error) {
          console.error('❌ Image conversion failed:', error)
          throw error
        }
      }

      // PDFファイルを直接追加
      if (pdfFiles.length > 0) {
        console.log(`📄 Adding ${pdfFiles.length} PDF file(s)...`)
        for (const pdfFile of pdfFiles) {
          console.log(`  🔄 Adding: ${pdfFile.name}`)
          if (!await addPDF(pdfFile, pdfFile.name)) return
          console.log(`  ✅ Added: ${pdfFile.name}`)
        }
      }

      console.log('🎉 All files processed successfully!')

    } catch (error) {
      console.error('Failed to select files:', error)
      setErrorMessage({ key: 'pdfImport.selectFailed', values: { detail: error instanceof Error ? error.message : String(error) } })
      setUploading(false)
    }
  }

  const handleDeleteRecord = async (id: string) => {
    try {
      await deletePDFRecord(id)
      await loadPDFRecords()
    } catch (error) {
      console.error('Failed to delete:', error)
      setErrorMessage({ key: 'pdfImport.deleteFailed' })
    }
  }


  return {
    pdfRecords,
    loading,
    uploading,
    textInspectionProgress,
    errorMessage: errorMessage === null ? null : typeof errorMessage === 'string'
      ? localizeErrorMessage(errorMessage, t)
      : t(errorMessage.key, { ...errorMessage.values, ...(errorMessage.values?.detail
          ? { detail: localizeErrorMessage(errorMessage.values.detail, t) } : {}) }),
    setErrorMessage,
    loadPDFRecords,
    handleFileSelect,
    handleDeleteRecord,
    addPDF
  }
}
