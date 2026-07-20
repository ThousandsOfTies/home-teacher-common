import { useEffect, useState } from 'react'
import { FiHeart, FiLock, FiTarget } from 'react-icons/fi'
import { MdBalance, MdClose, MdOutlineSchool } from 'react-icons/md'
import { getAppSettings, saveAppSettings } from '../../utils/indexedDB'
import './TeacherSettings.css'

type TeacherMode = 'kind' | 'balanced' | 'strict'

interface TeacherSettingsProps {
  onClose: () => void
  isPremium: boolean
  onUpgrade: () => void
  onManagePlan?: () => void
}

const teachers: Array<{
  mode: TeacherMode
  label: string
  description: string
  icon: React.ReactNode
  alwaysEnabled?: boolean
}> = [
  { mode: 'kind', label: 'KIND', description: 'よかったところを中心に、やさしくアドバイス', icon: <FiHeart />, alwaysEnabled: true },
  { mode: 'balanced', label: 'BALANCED', description: 'よい点と改善点をバランスよくアドバイス', icon: <MdBalance /> },
  { mode: 'strict', label: 'HARD', description: '形や比率まで細かく、具体的にアドバイス', icon: <FiTarget /> }
]

export default function TeacherSettings({ onClose, isPremium, onUpgrade, onManagePlan }: TeacherSettingsProps) {
  const [enabledModes, setEnabledModes] = useState<TeacherMode[]>(['kind'])
  const [defaultMode, setDefaultMode] = useState<TeacherMode>('kind')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getAppSettings()
      .then(settings => {
        const enabled = new Set<TeacherMode>(['kind', ...(isPremium ? settings.enabledTeacherModes || [] : [])])
        setEnabledModes(teachers.map(teacher => teacher.mode).filter(mode => enabled.has(mode)))
        setDefaultMode(enabled.has(settings.defaultTeacherMode || 'kind') ? (settings.defaultTeacherMode || 'kind') : 'kind')
      })
      .finally(() => setLoading(false))
  }, [isPremium])

  const toggleTeacher = (mode: TeacherMode) => {
    if (mode === 'kind') return
    if (!isPremium) {
      onUpgrade()
      return
    }
    setEnabledModes(previous => {
      const next = previous.includes(mode)
        ? previous.filter(value => value !== mode)
        : teachers.map(teacher => teacher.mode).filter(value => previous.includes(value) || value === mode)
      if (!next.includes(defaultMode)) setDefaultMode('kind')
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      const current = await getAppSettings()
      await saveAppSettings({
        ...current,
        enabledTeacherModes: isPremium ? enabledModes : ['kind'],
        defaultTeacherMode: isPremium && enabledModes.includes(defaultMode) ? defaultMode : 'kind'
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="teacher-settings-overlay" role="dialog" aria-modal="true" aria-label="Teacher Settings">
      <section className="teacher-settings-panel">
        <header>
          <div className="teacher-settings-title">
            <span><MdOutlineSchool /></span>
            <div><small>FEEDBACK STYLE</small><h2>Teacher Settings</h2></div>
          </div>
          <button onClick={onClose} aria-label="閉じる"><MdClose /></button>
        </header>

        <p className="teacher-settings-lead">採点で選べる先生と、最初に表示する先生を設定します。</p>

        <div className="teacher-settings-list" aria-busy={loading}>
          {teachers.map(teacher => {
            const enabled = enabledModes.includes(teacher.mode)
            return (
              <article key={teacher.mode} className={`teacher-setting-card ${teacher.mode} ${enabled ? 'enabled' : 'disabled'} ${!teacher.alwaysEnabled && !isPremium ? 'locked' : ''}`}>
                <div className="teacher-setting-icon">{teacher.icon}</div>
                <div className="teacher-setting-copy">
                  <strong>{teacher.label}</strong>
                  <span>{teacher.description}</span>
                </div>
                <label className="teacher-enable-control" onClick={() => {
                  if (!teacher.alwaysEnabled && !isPremium) onUpgrade()
                }}>
                  <span>{teacher.alwaysEnabled ? 'ALWAYS' : !isPremium ? <><FiLock /> LOCKED</> : enabled ? 'ON' : 'OFF'}</span>
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={teacher.alwaysEnabled || loading || !isPremium}
                    onChange={() => toggleTeacher(teacher.mode)}
                  />
                  <i aria-hidden="true" />
                </label>
                <label className={`teacher-default-control ${enabled ? '' : 'unavailable'}`}>
                  <input
                    type="radio"
                    name="defaultTeacher"
                    checked={defaultMode === teacher.mode}
                    disabled={!enabled || loading || !isPremium}
                    onChange={() => setDefaultMode(teacher.mode)}
                  />
                  <span>DEFAULT</span>
                </label>
              </article>
            )
          })}
        </div>

        {isPremium ? (
          <div className="teacher-settings-premium-note">
            <div className="teacher-settings-note">KINDはいつでも利用できます。無効にした先生は採点ボタンのリストに表示されません。</div>
            {onManagePlan && (
              <button className="teacher-settings-manage-plan" onClick={onManagePlan}>
                プラン管理・解約
              </button>
            )}
          </div>
        ) : (
          <button className="teacher-settings-upgrade" onClick={onUpgrade}>
            <span><FiLock /></span>
            <div><strong>BALANCEDとHARDをアンロック</strong><small>Premiumで先生レベルを自由に設定できます</small></div>
            <b>→</b>
          </button>
        )}

        <footer>
          <button className="teacher-settings-cancel" onClick={onClose}>キャンセル</button>
          <button className="teacher-settings-save" onClick={() => void save()} disabled={loading || saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </footer>
      </section>
    </div>
  )
}
