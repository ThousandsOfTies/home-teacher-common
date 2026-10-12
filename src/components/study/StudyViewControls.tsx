import { useTranslation } from 'react-i18next'
import { FiColumns, FiRepeat } from 'react-icons/fi'
import './StudyViewControls.css'

export interface StudyViewControlsProps {
    pageViewControlsEnabled: boolean
    isSplitView: boolean
    activeTab: 'A' | 'B'
    toggleActiveTab: () => void
    toggleSplitView: () => void
}

/** Share the view buttons and their appearance across all three app toolbars. */
export function StudyViewControls({
    pageViewControlsEnabled, isSplitView, activeTab, toggleActiveTab, toggleSplitView,
}: StudyViewControlsProps) {
    const { t } = useTranslation()
    const switchLabel = t(isSplitView ? 'studyCanvasControls.single' : 'studyCanvasControls.switch')
    const splitLabel = t(isSplitView ? 'studyCanvasControls.swap' : 'studyCanvasControls.split')

    return <div className="study-view-controls" role="group"
        aria-label={t('studyCanvasControls.views')} data-wheel-panel-navigation-ignore>
        <button type="button" className="tab-switcher-btn"
            onClick={toggleActiveTab} disabled={!pageViewControlsEnabled}
            aria-label={switchLabel} aria-pressed={pageViewControlsEnabled && !isSplitView}
            title={pageViewControlsEnabled ? switchLabel : t('studyCanvasControls.pdfOnly')}>
            <span className={activeTab === 'A' ? 'study-view-active-tab' : undefined}>A</span>
            <span className="study-view-tab-separator" aria-hidden="true">/</span>
            <span className={activeTab === 'B' ? 'study-view-active-tab' : undefined}>B</span>
        </button>
        <button type="button" className="split-view-btn"
            onClick={toggleSplitView} disabled={!pageViewControlsEnabled}
            aria-label={splitLabel} aria-pressed={pageViewControlsEnabled && isSplitView}
            title={pageViewControlsEnabled ? splitLabel : t('studyCanvasControls.pdfOnly')}>
            {isSplitView ? <FiRepeat aria-hidden="true" /> : <FiColumns aria-hidden="true" />}
        </button>
    </div>
}
