import { useEffect, useMemo, useState } from 'react'
import { MdClose, MdDeleteOutline, MdOutlineCollections, MdSearch, MdTrendingUp } from 'react-icons/md'
import { deleteGradingHistory, getAllGradingHistory, GradingHistoryRecord } from '../../utils/indexedDB'
import './ProgressHistory.css'

interface ProgressHistoryProps {
  onClose: () => void
}

const teacherDisplay = {
  kind: { icon: '♡', label: 'KIND' },
  balanced: { icon: '⚖', label: 'BALANCED' },
  strict: { icon: '◎', label: 'HARD' }
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
    .find(line => line.trim().startsWith('次のポイント：'))
    ?.replace(/^\s*次のポイント：/, '') || ''
}

const getPracticeAdvice = (record: GradingHistoryRecord) => {
  if (record.practiceAdvice) return record.practiceAdvice
  return record.explanation
    ?.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('次のポイント：'))
    .join(' ') || ''
}

const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString('ja-JP', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

export default function ProgressHistory({ onClose }: ProgressHistoryProps) {
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
      const key = `${record.pdfId}:${record.pageNumber}`
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

  const workCount = new Set(records.map(record => `${record.pdfId}:${record.pageNumber}`)).size

  const handleDelete = async (record: GradingHistoryRecord) => {
    if (!confirm('この練習記録を削除しますか？')) return
    await deleteGradingHistory(record.id)
    if (selected?.id === record.id) setSelected(null)
    await loadRecords()
  }

  return (
    <div className="progress-overlay" role="dialog" aria-modal="true" aria-label="Progress">
      <section className="progress-panel">
        <header className="progress-header">
          <div className="progress-heading">
            <span className="progress-heading-icon"><MdTrendingUp /></span>
            <div>
              <span>YOUR PORTFOLIO</span>
              <h2>Progress</h2>
            </div>
          </div>
          <button className="progress-icon-button" onClick={onClose} aria-label="閉じる"><MdClose /></button>
        </header>

        <div className="progress-overview">
          <div><strong>{records.length}</strong><span>練習</span></div>
          <div><strong>{workCount}</strong><span>作品</span></div>
          <p>描いた一枚と先生のアドバイスを、次の練習につなげましょう。</p>
        </div>

        <div className="progress-search">
          <MdSearch />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="作品名やアドバイスを検索"
            aria-label="Progressを検索"
          />
        </div>

        <div className={`progress-content ${selected ? 'has-detail' : ''}`}>
          <div className="progress-gallery">
            {loading ? (
              <div className="progress-empty">読み込み中...</div>
            ) : filteredRecords.length === 0 ? (
              <div className="progress-empty">
                <MdOutlineCollections />
                <strong>{query ? '見つかりませんでした' : '最初の作品を残してみましょう'}</strong>
                <span>{query ? '検索する言葉を変えてください。' : '採点すると、作品とアドバイスがここに保存されます。'}</span>
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
                      ? <img src={record.imageData} alt="採点時の作品" />
                      : <MdOutlineCollections />}
                    <span>{attemptNumbers.get(record.id) || 1}回目</span>
                  </div>
                  <div className="progress-card-body">
                    <div className="progress-card-meta">
                      <span className={`progress-teacher ${record.teacherMode || 'kind'}`}>{teacher.icon} {teacher.label}</span>
                      <time>{formatDate(record.timestamp)}</time>
                    </div>
                    <h3>{record.pdfFileName}</h3>
                    <div className="progress-card-score">
                      {score ? <><strong>{score}</strong><span>/ 5</span></> : <span>評価記録</span>}
                    </div>
                    <p><span>→</span>{nextPoint || record.feedback || 'アドバイスを確認する'}</p>
                  </div>
                  <button
                    className="progress-delete"
                    onClick={event => { event.stopPropagation(); void handleDelete(record) }}
                    aria-label="この記録を削除"
                  ><MdDeleteOutline /></button>
                </article>
              )
            })}
          </div>

          {selected && (
            <aside className="progress-detail">
              <div className="progress-detail-header">
                <div>
                  <span>{formatDate(selected.timestamp)} ・ {attemptNumbers.get(selected.id) || 1}回目</span>
                  <h3>{selected.pdfFileName}</h3>
                </div>
                <button className="progress-icon-button" onClick={() => setSelected(null)} aria-label="詳細を閉じる"><MdClose /></button>
              </div>

              {selected.imageData && <img className="progress-detail-image" src={selected.imageData} alt="採点時のA面とB面" />}

              <div className="progress-detail-score">
                <span className={`progress-teacher ${selected.teacherMode || 'kind'}`}>
                  {teacherDisplay[selected.teacherMode || 'kind'].icon} {teacherDisplay[selected.teacherMode || 'kind'].label}
                </span>
                {getScore(selected) && <div><strong>{getScore(selected)}</strong><span>/ 5</span></div>}
              </div>

              {selected.overallComment && (
                <section><h4>全体の印象</h4><p>{selected.overallComment}</p></section>
              )}
              {selected.feedback && (
                <section className="progress-good"><h4>◎ よかったところ</h4><p>{selected.feedback}</p></section>
              )}
              {getNextPoint(selected) && (
                <section className="progress-next"><h4>→ 次に直すポイント</h4><p>{getNextPoint(selected)}</p></section>
              )}
              {getPracticeAdvice(selected) && (
                <section className="progress-practice"><h4>次の一枚でやってみよう</h4><p>{getPracticeAdvice(selected)}</p></section>
              )}
            </aside>
          )}
        </div>
      </section>
    </div>
  )
}
