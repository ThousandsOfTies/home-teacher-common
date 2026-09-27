import { PDFDataRangeTransport, getDocument } from 'pdfjs-dist'

// Preserve the existing path for PDFs within the usual 100 MiB import limit.
export const LARGE_PDF_THRESHOLD_BYTES = 100 * 1024 * 1024
export const PDF_RANGE_CHUNK_BYTES = 1024 * 1024

type RangeReader = (begin: number, end: number) => Promise<ArrayBuffer>

export class PDFBlobRangeTransport extends PDFDataRangeTransport {
  private disposed = false

  constructor(
    length: number,
    private readonly readRange: RangeReader,
    private readonly onReadError: (error: Error) => void,
  ) {
    super(length, null)
  }

  requestDataRange(begin: number, end: number): void {
    if (this.disposed) return

    void this.readRange(begin, end).then(buffer => {
      if (this.disposed) return
      if (buffer.byteLength !== end - begin) {
        throw new Error(`PDF range read returned ${buffer.byteLength} bytes instead of ${end - begin}`)
      }
      this.onDataRange(begin, new Uint8Array(buffer))
    }).catch(cause => {
      if (this.disposed) return
      this.onReadError(cause instanceof Error ? cause : new Error(String(cause)))
    })
  }

  abort(): void {
    this.disposed = true
  }
}

export function getRangePDFDocument(
  range: PDFBlobRangeTransport,
  options: {
    rangeChunkSize?: number
    useWorkerFetch?: boolean
    isEvalSupported?: boolean
    stopAtErrors?: boolean
  } = {},
) {
  return getDocument({
    range,
    rangeChunkSize: options.rangeChunkSize ?? PDF_RANGE_CHUNK_BYTES,
    disableAutoFetch: true,
    disableStream: true,
    useWorkerFetch: options.useWorkerFetch,
    isEvalSupported: options.isEvalSupported,
    stopAtErrors: options.stopAtErrors,
  })
}
