import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isStrokeInputDiagnosticsEnabled, startStrokeInputDiagnostics, stopStrokeInputDiagnostics,
  clearStrokeInputDiagnostics, getStrokeInputDiagnosticsSummary, getStrokeInputDiagnosticsReport } from '@thousands-of-ties/drawing-common'

/** The optional input recorder is shown only when the URL contains strokeDebug=1. */
export function StrokeInputDiagnostics() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(isStrokeInputDiagnosticsEnabled)
  const [summary, setSummary] = useState(getStrokeInputDiagnosticsSummary)
  const [copied, setCopied] = useState(false)
  const [report, setReport] = useState('')
  const version = (import.meta as any).env.VITE_APP_COMMIT_HASH || 'unknown'

  useEffect(() => {
    if (!visible) return
    startStrokeInputDiagnostics()
    const timer = window.setInterval(() => setSummary(getStrokeInputDiagnosticsSummary()), 250)
    return () => window.clearInterval(timer)
  }, [visible])

  if (!visible) return null
  const copy = async () => {
    const text = getStrokeInputDiagnosticsReport({ version, path: window.location.pathname })
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setReport('')
    } catch {
      setReport(text)
    }
  }

  return <aside aria-label={t('strokeDiagnostics.title')} style={{
    position: 'fixed', bottom: 12, left: 12, zIndex: 20000, width: 350,
    maxWidth: 'calc(100vw - 24px)', padding: '10px 12px', borderRadius: 8,
    background: '#fff', color: '#263238', border: '1px solid #b0bec5',
    boxShadow: '0 2px 10px #0002', fontSize: 12,
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <strong>{t('strokeDiagnostics.title')}</strong>
      <span>{t('strokeDiagnostics.version', { version })}</span>
    </div>
    <p style={{ margin: '6px 0' }}>{t('strokeDiagnostics.counts', {
      pen: summary.penDown, touch: summary.touchStart, started: summary.started,
    })}</p>
    <p style={{ margin: '6px 0', color: '#546e7a' }}>{t('strokeDiagnostics.local')}</p>
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="button" onClick={() => {
        clearStrokeInputDiagnostics(); setSummary(getStrokeInputDiagnosticsSummary()); setCopied(false); setReport('')
      }}>{t('strokeDiagnostics.reset')}</button>
      <button type="button" onClick={() => void copy()}>{t(copied ? 'strokeDiagnostics.copied' : 'strokeDiagnostics.copy')}</button>
      <button type="button" onClick={() => { stopStrokeInputDiagnostics(); setVisible(false) }}>{t('strokeDiagnostics.close')}</button>
    </div>
    {report && <textarea aria-label={t('strokeDiagnostics.report')} readOnly value={report}
      onFocus={event => event.currentTarget.select()} style={{ width: '100%', height: 120, marginTop: 8 }} />}
  </aside>
}
