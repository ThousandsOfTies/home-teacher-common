import { useEffect, useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import type { PDFEditorPanelProps } from './PDFEditorPanel'

export default function PDFEditorLoader(props: PDFEditorPanelProps) {
  const { t } = useTranslation()
  const [Editor, setEditor] = useState<ComponentType<PDFEditorPanelProps> | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let disposed = false
    // A fresh document is needed to retry failed imports cached by the browser.
    import('./PDFEditorPanel').then(
      module => { if (!disposed) setEditor(() => module.default) },
      error => {
        console.error('Failed to load PDF editor:', error)
        if (!disposed) setFailed(true)
      },
    )
    return () => { disposed = true }
  }, [])

  if (Editor) return <Editor {...props} />

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <p role={failed ? 'alert' : 'status'}>
        {t(failed ? 'editorLoading.failed' : 'editorLoading.loading')}
      </p>
      {failed && (
        <button type="button" onClick={() => {
          const url = new URL(window.location.href)
          url.searchParams.set('pdfId', props.pdfId)
          url.searchParams.set('edit', '1')
          window.location.assign(url.href)
        }}>
          {t('editorLoading.retry')}
        </button>
      )}
      <button type="button" onClick={props.onBack}>{t('editorLoading.back')}</button>
    </div>
  )
}
