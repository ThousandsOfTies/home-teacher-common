import { useTranslation } from 'react-i18next'
import { useLayoutEffect, useRef, useState, type CSSProperties, type SyntheticEvent, type RefObject } from 'react'
import { getStudyRegionControlPositions, STUDY_REGION_DELETE_ICON_SIZE,
  STUDY_REGION_DELETE_ICON_GAP, STUDY_REGION_UNDO_ICON_SIZE } from '../../utils/studyRegionControls'
import { StudyTraceUndoButton } from './StudyTraceUndoButton'
import './StudyRegionMarker.css'

interface StudyRegionMarkerProps {
  id: string
  completed?: boolean
  style: CSSProperties
  className?: string
  onOpen: (id: string) => void
  onDelete?: (id: string) => void
  onUndo?: () => void
  deleteDisabled?: boolean
  openLabel?: string
  /** Inverse of the containing page's zoom, keeping opt-in touch controls at screen size. */
  controlScale?: number
  viewportRef?: RefObject<HTMLElement>
}

export const StudyRegionMarker = ({ id, completed, style, className = '', onOpen, onDelete, onUndo,
  deleteDisabled = false, openLabel, controlScale = 1, viewportRef }: StudyRegionMarkerProps) => {
  const { t } = useTranslation()

  const hasControls = !!(onDelete || onUndo)
  const markerRef = useRef<HTMLDivElement>(null)
  const [controls, setControls] = useState<{ openIconWidth: number; openIconHeight: number;
    openLeft?: number; openTop?: number; deleteLeft?: number; deleteTop?: number; visible: boolean }>({
    openIconWidth: 18, openIconHeight: 22, visible: true,
  })
  useLayoutEffect(() => {
    if (!hasControls || !markerRef.current) return
    const marker = markerRef.current
    const viewport = viewportRef?.current
    const measure = () => {
      const rect = marker.getBoundingClientRect()
      const bounds = viewport?.getBoundingClientRect() ?? {
        left: rect.left - 44, top: rect.top - 44, width: rect.width + 88, height: rect.height + 88,
      }
      const positions = getStudyRegionControlPositions(rect, bounds,
        onUndo ? STUDY_REGION_UNDO_ICON_SIZE : STUDY_REGION_DELETE_ICON_SIZE)
      const next = { visible: positions.visible,
        openIconWidth: positions.openIcon.width * controlScale,
        openIconHeight: positions.openIcon.height * controlScale,
        openLeft: (positions.open.x - rect.left - 22) * controlScale - 2,
        openTop: (positions.open.y - rect.top - 22) * controlScale - 2,
        deleteLeft: (positions.remove.x - rect.left - 22) * controlScale - 2,
        deleteTop: (positions.remove.y - rect.top - 22) * controlScale - 2 }
      setControls(previous => Object.keys(next).every(key =>
        previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(marker)
    if (viewport) {
      observer.observe(viewport)
      viewport.addEventListener('scroll', measure, true)
    }
    return () => { observer.disconnect(); viewport?.removeEventListener('scroll', measure, true) }
  }, [hasControls, !!onUndo, controlScale, viewportRef, style])

  // Keep separate 44px touch targets even for a single-line selection.
  const scale = hasControls ? controlScale : 1
  const target = (hasControls ? 44 : 30) * scale
  const color = completed ? '#2e7d32' : '#1976d2'
  const controlStyle: CSSProperties = { width: target, height: target, right: -target / 2,
    visibility: controls.visible ? undefined : 'hidden' }
  const stopPointer = (event: SyntheticEvent) => event.stopPropagation()
  const deleteStyle: CSSProperties = controls.deleteLeft === undefined
    ? { ...controlStyle, top: -target - 2 - STUDY_REGION_DELETE_ICON_GAP * scale,
      right: -target - 2 - STUDY_REGION_DELETE_ICON_GAP * scale }
    : { ...controlStyle, right: 'auto', left: controls.deleteLeft, top: controls.deleteTop }

  if (onUndo) return (
    <div ref={markerRef} className={`study-region-marker ${className}`} style={{ ...style, borderColor: 'transparent' }}>
      <StudyTraceUndoButton available busy={deleteDisabled} onUndo={onUndo} inline traceId={id}
        style={deleteStyle} controlScale={scale} />
    </div>
  )

  return (
    <div ref={markerRef} className={`study-region-marker ${className}`} style={{ ...style, borderColor: color }}>
      <button type="button" className={`study-region-open${onDelete ? ' study-region-open-inline' : ''}`} data-study-trace-id={id}
        title={openLabel ?? t('pdfNavigation.openQuestion')} aria-label={openLabel ?? t('pdfNavigation.openQuestion')}
        style={controls.openLeft === undefined
          ? { ...controlStyle, right: onDelete ? 4 * scale - 2 : controlStyle.right,
            top: '50%', transform: 'translateY(-50%)' }
          : { ...controlStyle, right: 'auto', left: controls.openLeft, top: controls.openTop }}
        onPointerDown={stopPointer} onMouseDown={stopPointer} onTouchStart={stopPointer} onTouchEnd={stopPointer}
        onClick={event => { event.stopPropagation(); onOpen(id) }}>
        {onDelete ? (
          <svg aria-hidden="true" width={controls.openIconWidth} height={controls.openIconHeight}
            viewBox="0 0 18 22" preserveAspectRatio="none" fill="currentColor">
            <path d="M0 0L18 11L0 22Z" />
          </svg>
        ) : (
          <span aria-hidden="true" style={{ width: 30 * scale, height: 30 * scale,
            fontSize: 14 * scale, borderWidth: 2 * scale, background: color }}>▶</span>
        )}
      </button>
      {onDelete && (
        <button type="button" className="study-region-delete" data-study-trace-delete-id={id}
          disabled={deleteDisabled} title={t('pdfNavigation.deleteTrace')} aria-label={t('pdfNavigation.deleteTrace')}
          style={deleteStyle}
          onPointerDown={stopPointer} onMouseDown={stopPointer} onTouchStart={stopPointer} onTouchEnd={stopPointer}
          onClick={event => { event.stopPropagation(); onDelete(id) }}>
          <svg aria-hidden="true" width={STUDY_REGION_DELETE_ICON_SIZE * scale}
            height={STUDY_REGION_DELETE_ICON_SIZE * scale} viewBox="0 0 18 18">
            <circle cx="9" cy="9" r="9" fill="currentColor" />
            <path d="M5 5L13 13M13 5L5 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  )
}
