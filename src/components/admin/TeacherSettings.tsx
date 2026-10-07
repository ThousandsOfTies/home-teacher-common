import { useTranslation } from 'react-i18next'
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

export default function TeacherSettings({ onClose, isPremium, onUpgrade, onManagePlan }: TeacherSettingsProps) {
  const { t } = useTranslation()

  const teachers: Array<{
    mode: TeacherMode
    label: string
    description: string
    icon: React.ReactNode
    alwaysEnabled?: boolean
  }> = [
    { mode: 'kind', label: t('teacherLevels.kind'), description: t('teacherSettings.kindDescription'), icon: <FiHeart />, alwaysEnabled: true },
    { mode: 'balanced', label: t('teacherLevels.balanced'), description: t('teacherSettings.balancedDescription'), icon: <MdBalance /> },
    { mode: 'strict', label: t('teacherLevels.strict'), description: t('teacherSettings.strictDescription'), icon: <FiTarget /> }
  ]
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
    <div className="teacher-settings-overlay" role="dialog" aria-modal="true" aria-label={t('teacherSettings.title')}>
      <section className="teacher-settings-panel">
        <header>
          <div className="teacher-settings-title">
            <span><MdOutlineSchool /></span>
            <div><small>{t('teacherSettings.style')}</small><h2>{t('teacherSettings.title')}</h2></div>
          </div>
          <button onClick={onClose} aria-label={t('common.close')}><MdClose /></button>
        </header>

        <p className="teacher-settings-lead">{t('teacherSettings.description')}</p>

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
                  <span>{teacher.alwaysEnabled ? t('teacherSettings.always') : !isPremium ? <><FiLock /> {t('teacherSettings.locked')}</> : enabled ? t('teacherSettings.on') : t('teacherSettings.off')}</span>
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
                  <span>{t('teacherSettings.default')}</span>
                </label>
              </article>
            )
          })}
        </div>

        {isPremium ? (
          <div className="teacher-settings-premium-note">
            <div className="teacher-settings-note">{t('teacherSettings.premiumNote')}</div>
            {onManagePlan && (
              <button className="teacher-settings-manage-plan" onClick={onManagePlan}>
                {t('teacherSettings.managePlan')}</button>
            )}
          </div>
        ) : (
          <button className="teacher-settings-upgrade" onClick={onUpgrade}>
            <span><FiLock /></span>
            <div><strong>{t('teacherSettings.unlock')}</strong><small>{t('teacherSettings.premiumHint')}</small></div>
            <b>→</b>
          </button>
        )}

        <footer>
          <button className="teacher-settings-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="teacher-settings-save" onClick={() => void save()} disabled={loading || saving}>
            {saving ? t('teacherSettings.saving') : t('teacherSettings.save')}
          </button>
        </footer>
      </section>
    </div>
  )
}
