import type { ReactNode } from 'react'
import { StrokeInputDiagnostics } from './StrokeInputDiagnostics'
import { StudyToolbarNavigation, type BreadcrumbItem } from './StudyToolbarNavigation'
import { StudyViewControls, type StudyViewControlsProps } from './StudyViewControls'
import './StudyToolbarFrame.css'

export interface StudyToolbarFrameProps {
    onBack?: () => void
    breadcrumbs?: BreadcrumbItem[]
    viewControls: StudyViewControlsProps
    homeLabel: string
    children: ReactNode
}

/** Shared placement and styling; app tools and submission actions occupy the tools slot. */
export function StudyToolbarFrame({
    onBack, breadcrumbs, viewControls, homeLabel, children,
}: StudyToolbarFrameProps) {
    return <div className="toolbar study-toolbar">
        <StrokeInputDiagnostics />
        <StudyViewControls {...viewControls} />
        <StudyToolbarNavigation onBack={onBack} breadcrumbs={breadcrumbs} labels={{ home: homeLabel }} />
        <div className="toolbar-tools study-toolbar-tools">{children}</div>
    </div>
}
