import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

export interface PDFTextInspection {
  status: 'present' | 'absent' | 'unknown'
  checkedPages: number
  totalPages: number
}

// Presence can be established by one page. Absence requires every page to be
// read successfully. This reads embedded text only; it never renders or uploads.
export async function inspectPDFText(
  pdf: Pick<PDFDocumentProxy, 'numPages' | 'getPage'>,
  onProgress?: (progress: { checkedPages: number; totalPages: number }) => void,
): Promise<PDFTextInspection> {
  const totalPages = Number.isInteger(pdf.numPages) && pdf.numPages > 0 ? pdf.numPages : 0
  onProgress?.({ checkedPages: 0, totalPages })
  let failed = !totalPages
  for (let number = 1; number <= totalPages; number++) {
    let page: PDFPageProxy | undefined
    let present = false
    try {
      page = await pdf.getPage(number)
      const content = await page.getTextContent()
      present = content.items.some(item => 'str' in item && item.str.trim().length > 0)
    } catch {
      failed = true
    } finally {
      page?.cleanup()
      onProgress?.({ checkedPages: number, totalPages })
    }
    if (present) return { status: 'present', checkedPages: number, totalPages }
  }
  return { status: failed ? 'unknown' : 'absent', checkedPages: totalPages, totalPages }
}
