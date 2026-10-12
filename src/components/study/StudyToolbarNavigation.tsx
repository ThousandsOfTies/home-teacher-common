import React from 'react'
import { FiHome } from 'react-icons/fi'
import { StrokeInputDiagnostics } from './StrokeInputDiagnostics'

export interface BreadcrumbItem {
    label: string
    content?: React.ReactNode
    onClick: () => void
    isCurrent?: boolean
}

interface StudyToolbarNavigationProps {
    onBack?: () => void
    breadcrumbs?: BreadcrumbItem[]
    labels: {
        home: string
    }
}

/** Keep navigation mounted across PDF, answer and teacher panels to preserve layout. */
export function StudyToolbarNavigation({
    onBack, breadcrumbs, labels,
}: StudyToolbarNavigationProps) {
    return <>
        <StrokeInputDiagnostics />
        {onBack && <>
            <button type="button" onClick={onBack} title={labels.home} aria-label={labels.home}
                style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <FiHome size={20} />
            </button>
            {breadcrumbs && breadcrumbs.length > 0 && <div style={{
                display: 'flex', alignItems: 'center', gap: '2px',
                flexWrap: 'nowrap', overflowX: 'auto', minWidth: 0,
                scrollbarWidth: 'none', msOverflowStyle: 'none', marginLeft: '0',
                padding: '6px 0',
            }}>
                {breadcrumbs.map((crumb, index) => <React.Fragment key={index}>
                    <span aria-hidden="true" style={{ color: '#bbb', fontSize: '13px', flexShrink: 0 }}>›</span>
                    <span
                        onClick={crumb.isCurrent ? undefined : crumb.onClick}
                        title={crumb.content ? crumb.label : undefined}
                        style={{
                            display: crumb.content ? 'inline-flex' : undefined,
                            alignItems: crumb.content ? 'center' : undefined,
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
