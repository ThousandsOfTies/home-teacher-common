import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
import { MdClose, MdDeleteOutline, MdOutlineCollections, MdSearch, MdTrendingUp } from 'react-icons/md'
import { deleteGradingHistory, getAllGradingHistory, GradingHistoryRecord } from '../../utils/indexedDB'
import './ProgressHistory.css'
import ja from '../../i18n/locales/ja.json'

interface ProgressHistoryProps {
  onClose: () => void
}

const teacherDisplay = {
  kind: { icon: '♡', labelKey: 'teacherLevels.kind' },
  balanced: { icon: '⚖', labelKey: 'teacherLevels.balanced' },
  strict: { icon: '◎', labelKey: 'teacherLevels.strict' }
} as const

const getScore = (record: GradingHistoryRecord) => {
  if (record.score && record.score >= 1 && record.score <= 5) return Math.round(record.score)
  const parsed = Number(record.problemNumber?.match(/([1-5])\s*\/\s*5/)?.[1])
  return Number.isFinite(parsed) ? parsed : null
}

const getNextPoint = (record: GradingHistoryRecord) => {
  if (record.nextPoint) return record.nextPoint
  return record.explanation
    ?.split('\n')
    .find(line => line.trim().startsWith(ja.copiStudy.result.nextPointPrefix))
    ?.trimStart().slice(ja.copiStudy.result.nextPointPrefix.length) || ''
}

const getPracticeAdvice = (record: GradingHistoryRecord) => {
  if (record.practiceAdvice) return record.practiceAdvice
  return record.explanation
    ?.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith(ja.copiStudy.result.nextPointPrefix))
    .join(' ') || ''
}

const formatDate = (timestamp: number, language: string) => new Date(timestamp).toLocaleString(language, {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

export default function ProgressHistory({ onClose }: ProgressHistoryProps) {
  const { t, i18n } = useTranslation()

  const [records, setRecords] = useState<GradingHistoryRecord[]>([])
  const [selected, setSelected] = useState<GradingHistoryRecord | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const loadRecords = async () => {
    setLoading(true)
    try {
      setRecords(await getAllGradingHistory())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRecords()
  }, [])

  const attemptNumbers = useMemo(() => {
    const counts = new Map<string, number>()
    const attempts = new Map<string, number>()
    ;[...records].sort((a, b) => a.timestamp - b.timestamp).forEach(record => {
      const key = `${record.pdfId}:${(record.sourcePageNumbers ?? [record.pageNumber]).join(',')}`
      const count = (counts.get(key) || 0) + 1
      counts.set(key, count)
      attempts.set(record.id, count)
    })
    return attempts
  }, [records])

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return [...records]
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter(record => !normalizedQuery || [
        record.pdfFileName,
        record.overallComment,
        record.feedback,
        getNextPoint(record)
      ].some(value => value?.toLowerCase().includes(normalizedQuery)))
  }, [query, records])

  const workCount = new Set(records.map(record => `${record.pdfId}:${(record.sourcePageNumbers ?? [record.pageNumber]).join(',')}`)).size

  const handleDelete = async (record: GradingHistoryRecord) => {
    if (!confirm(t('progressHistory.deleteConfirm'))) return
    await deleteGradingHistory(record.id)
    if (selected?.id === record.id) setSelected(null)
    await loadRecords()
  }

  return (
    <div className="progress-overlay" role="dialog" aria-modal="true" aria-label={t('progressHistory.title')}>
      <section className="progress-panel">
        <header className="progress-header">
          <div className="progress-heading">
            <span className="progress-heading-icon"><MdTrendingUp /></span>
            <div>
              <span>{t('progressHistory.portfolio')}</span>
              <h2>{t('progressHistory.title')}</h2>
            </div>
          </div>
          <button className="progress-icon-button" onClick={onClose} aria-label={t('common.close')}><MdClose /></button>
        </header>

        <div className="progress-overview">
          <div><strong>{records.length}</strong><span>{t('progressHistory.practiceCount')}</span></div>
          <div><strong>{workCount}</strong><span>{t('progressHistory.workCount')}</span></div>
          <p>{t('progressHistory.description')}</p>
        </div>

        <div className="progress-search">
          <MdSearch />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('progressHistory.searchPlaceholder')}
            aria-label={t('progressHistory.search')}
          />
        </div>

        <div className={`progress-content ${selected ? 'has-detail' : ''}`}>
          <div className="progress-gallery">
            {loading ? (
              <div className="progress-empty">{t('progressHistory.loading')}</div>
            ) : filteredRecords.length === 0 ? (
              <div className="progress-empty">
                <MdOutlineCollections />
                <strong>{query ? t('progressHistory.notFound') : t('progressHistory.emptyTitle')}</strong>
                <span>{query ? t('progressHistory.searchHint') : t('progressHistory.emptyHint')}</span>
              </div>
            ) : filteredRecords.map(record => {
              const teacher = teacherDisplay[record.teacherMode || 'kind']
              const score = getScore(record)
              const nextPoint = getNextPoint(record)
              return (
                <article
                  key={record.id}
                  className={`progress-card ${selected?.id === record.id ? 'selected' : ''}`}
                  onClick={() => setSelected(record)}
                >
                  <div className="progress-thumbnail">
                    {record.imageData
                      ? <img src={record.imageData} alt={t('progressHistory.workImage')} />
                      : <MdOutlineCollections />}
                    <span>{t('progressHistory.attempt', { count: attemptNumbers.get(record.id) || 1 })}</span>
                  </div>
                  <div className="progress-card-body">
                    <div className="progress-card-meta">
                      <span className={`progress-teacher ${record.teacherMode || 'kind'}`}>{teacher.icon} {t(teacher.labelKey)}</span>
                      <time>{formatDate(record.timestamp, i18n.language)}</time>
                    </div>
                    <h3>{record.pdfFileName}</h3>
                    <div className="progress-card-score">
                      {score ? <><strong>{score}</strong><span>/ 5</span></> : <span>{t('progressHistory.reviewRecord')}</span>}
                    </div>
                    <p><span>→</span>{nextPoint || record.feedback || t('progressHistory.viewAdvice')}</p>
                  </div>
                  <button
                    className="progress-delete"
                    onClick={event => { event.stopPropagation(); void handleDelete(record) }}
                    aria-label={t('progressHistory.delete')}
                  ><MdDeleteOutline /></button>
                </article>
              )
            })}
          </div>

          {selected && (
            <aside className="progress-detail">
              <div className="progress-detail-header">
                <div>
                  <span>{formatDate(selected.timestamp, i18n.language)} ・ {t('progressHistory.attempt', { count: attemptNumbers.get(selected.id) || 1 })}</span>
                  <h3>{selected.pdfFileName}</h3>
                </div>
                <button className="progress-icon-button" onClick={() => setSelected(null)} aria-label={t('progressHistory.closeDetail')}><MdClose /></button>
              </div>

              {selected.imageData && <img className="progress-detail-image" src={selected.imageData} alt={t('progressHistory.panesImage')} />}

              <div className="progress-detail-score">
                <span className={`progress-teacher ${selected.teacherMode || 'kind'}`}>
                  {teacherDisplay[selected.teacherMode || 'kind'].icon} {t(teacherDisplay[selected.teacherMode || 'kind'].labelKey)}
                </span>
                {getScore(selected) && <div><strong>{getScore(selected)}</strong><span>/ 5</span></div>}
              </div>

              {selected.overallComment && (
                <section><h4>{t('progressHistory.overall')}</h4><p>{selected.overallComment}</p></section>
              )}
              {selected.feedback && (
                <section className="progress-good"><h4>{t('progressHistory.goodPoints')}</h4><p>{selected.feedback}</p></section>
              )}
              {getNextPoint(selected) && (
                <section className="progress-next"><h4>{t('progressHistory.nextPoint')}</h4><p>{getNextPoint(selected)}</p></section>
              )}
              {getPracticeAdvice(selected) && (
                <section className="progress-practice"><h4>{t('progressHistory.practiceAdvice')}</h4><p>{getPracticeAdvice(selected)}</p></section>
              )}
            </aside>
          )}
        </div>
      </section>
    </div>
  )
}
