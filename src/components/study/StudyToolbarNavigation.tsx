import React from 'react'
import { FiHome } from 'react-icons/fi'

export interface BreadcrumbItem {
    label: string
    content?: React.ReactNode
    onClick: () => void
    isCurrent?: boolean
}

interface StudyToolbarNavigationProps {
    onBack?: () => void
    breadcrumbs?: BreadcrumbItem[]
    pageViewControlsEnabled: boolean
    isSplitView: boolean
    toggleSplitView: () => void
    activeTab: 'A' | 'B'
    toggleActiveTab: () => void
    labels: {
        home: string
        switchPane: string
        splitView: string
        switchPaneAriaLabel?: string
        splitViewAriaLabel?: string
    }
    beforeBreadcrumbs?: React.ReactNode
    breadcrumbStyle?: React.CSSProperties
    contentBreadcrumbClassName?: string
}

function TabIndicator({ tab, activeTab }: { tab: 'A' | 'B'; activeTab: 'A' | 'B' }) {
    const active = tab === activeTab
    return <span style={{
        fontWeight: active ? 'bold' : 'normal',
        textDecoration: active ? 'underline' : 'none',
        color: active ? '#4CAF50' : 'inherit',
        fontSize: '0.85rem',
    }}>{tab}</span>
}

/** Keep navigation mounted across PDF, answer and teacher panels to preserve layout. */
export function StudyToolbarNavigation({
    onBack, breadcrumbs, pageViewControlsEnabled, isSplitView, toggleSplitView,
    activeTab, toggleActiveTab, labels, beforeBreadcrumbs, breadcrumbStyle,
    contentBreadcrumbClassName,
}: StudyToolbarNavigationProps) {
    return <>
        {onBack && <button onClick={onBack} title={labels.home}
            style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <FiHome size={20} />
        </button>}
        {onBack && <div className="divider" aria-hidden="true" />}
        <div className="toolbar-view-controls">
            <button
                className={`tab-switcher-btn ${pageViewControlsEnabled && !isSplitView ? 'active' : ''}`}
                onClick={toggleActiveTab}
                disabled={!pageViewControlsEnabled}
                title={labels.switchPane}
                aria-label={labels.switchPaneAriaLabel}
                style={{ minWidth: '45px' }}
            >
                <TabIndicator tab="A" activeTab={activeTab} />
                <span style={{ margin: '0 4px', color: '#ccc', fontSize: '0.85rem' }}>/</span>
                <TabIndicator tab="B" activeTab={activeTab} />
            </button>
            <button
                onClick={toggleSplitView}
                disabled={!pageViewControlsEnabled}
                title={labels.splitView}
                aria-label={labels.splitViewAriaLabel}
                className={`split-view-btn ${pageViewControlsEnabled && isSplitView ? 'active' : ''}`}
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="4" width="9" height="16" rx="1" stroke="currentColor" strokeWidth="1" fill={isSplitView ? 'white' : 'none'} />
                    <rect x="13" y="4" width="9" height="16" rx="1" stroke="currentColor" strokeWidth="1" fill={isSplitView ? 'white' : 'none'} />
                </svg>
            </button>
        </div>
        <div className="divider" aria-hidden="true" />
        {onBack && <>
            {beforeBreadcrumbs}
            {breadcrumbs && breadcrumbs.length > 0 && <div style={{
                display: 'flex', alignItems: 'center', gap: '2px',
                flexWrap: 'nowrap', overflowX: 'auto', minWidth: 0,
                scrollbarWidth: 'none', msOverflowStyle: 'none', marginLeft: '0',
                ...breadcrumbStyle,
            }}>
                {breadcrumbs.map((crumb, index) => <React.Fragment key={index}>
                    {index > 0 && <span style={{ color: '#bbb', fontSize: '13px', flexShrink: 0 }}>›</span>}
                    <span
                        className={crumb.content ? contentBreadcrumbClassName : undefined}
                        onClick={crumb.isCurrent ? undefined : crumb.onClick}
                        style={{
                            fontSize: '13px', color: crumb.isCurrent ? '#333' : '#2c7be5',
                            fontWeight: 600, cursor: crumb.isCurrent ? 'default' : 'pointer',
                            padding: crumb.content ? '0 6px' : '3px 6px', borderRadius: '10px',
                            whiteSpace: 'nowrap', flexShrink: 0,
                        }}
                    >{crumb.content ?? crumb.label}</span>
                </React.Fragment>)}
            </div>}
        </>}
    </>
}
