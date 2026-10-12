import React, { useEffect, useRef } from 'react'
import { FiChevronRight, FiHome } from 'react-icons/fi'
import './StudyToolbarNavigation.css'

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
    const breadcrumbsRef = useRef<HTMLDivElement>(null)
    const currentIndex = breadcrumbs?.findIndex(crumb => crumb.isCurrent) ?? -1
    const currentLabel = breadcrumbs?.[currentIndex]?.label
    const hasHome = Boolean(onBack)

    useEffect(() => {
        const strip = breadcrumbsRef.current
        const current = strip?.querySelector<HTMLElement>('[aria-current="page"]')
        if (!strip || !current) return
        const revealCurrent = () => {
            const viewport = strip.getBoundingClientRect()
            const item = current.getBoundingClientRect()
            const separatorLeft = current.previousElementSibling?.getBoundingClientRect().left ?? item.left
            // Reveal the separator with its crumb when both fit in the viewport.
            const left = item.right - separatorLeft <= viewport.width ? separatorLeft : item.left
            if (item.right > viewport.right) strip.scrollLeft += item.right - viewport.right
            else if (left < viewport.left) strip.scrollLeft += left - viewport.left
        }
        revealCurrent()
        const observer = new ResizeObserver(revealCurrent)
        observer.observe(strip)
        return () => observer.disconnect()
    }, [currentIndex, currentLabel, breadcrumbs?.length, hasHome])

    return <>
        {onBack && <div className="study-toolbar-navigation">
            <button type="button" className="study-toolbar-home" onClick={onBack} title={labels.home} aria-label={labels.home}
                style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <FiHome size={20} />
            </button>
            {breadcrumbs && breadcrumbs.length > 0 && <div className="study-toolbar-breadcrumbs" ref={breadcrumbsRef}>
                {breadcrumbs.map((crumb, index) => <React.Fragment key={index}>
                    <FiChevronRight className="study-toolbar-separator" aria-hidden="true" />
                    <span
                        onClick={crumb.isCurrent ? undefined : crumb.onClick}
                        title={crumb.content ? crumb.label : undefined}
                        aria-current={crumb.isCurrent ? 'page' : undefined}
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
        </div>}
    </>
}
