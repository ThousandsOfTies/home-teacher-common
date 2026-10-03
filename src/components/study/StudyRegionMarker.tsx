import { useLayoutEffect, useRef, useState, type CSSProperties, type SyntheticEvent, type RefObject } from 'react'
import { getStudyRegionControlPositions, STUDY_REGION_DELETE_ICON_SIZE } from '../../utils/studyRegionControls'
import './StudyRegionMarker.css'

interface StudyRegionMarkerProps {
  id: string
  completed?: boolean
  style: CSSProperties
  className?: string
  onOpen: (id: string) => void
  onDelete?: (id: string) => void
  deleteDisabled?: boolean
  openLabel?: string
  /** Inverse of the containing page's zoom, keeping opt-in touch controls at screen size. */
  controlScale?: number
  viewportRef?: RefObject<HTMLElement>
}

export const StudyRegionMarker = ({ id, completed, style, className = '', onOpen, onDelete,
  deleteDisabled = false, openLabel = 'この範囲の質問を開く', controlScale = 1, viewportRef }: StudyRegionMarkerProps) => {
  const markerRef = useRef<HTMLDivElement>(null)
  const [controls, setControls] = useState<{ openIconWidth: number; openIconHeight: number;
    openLeft?: number; openTop?: number; deleteLeft?: number; deleteTop?: number; visible: boolean }>({
    openIconWidth: 18, openIconHeight: 22, visible: true,
  })
  useLayoutEffect(() => {
    if (!onDelete || !markerRef.current) return
    const marker = markerRef.current
    const viewport = viewportRef?.current
    const measure = () => {
      const rect = marker.getBoundingClientRect()
      const bounds = viewport?.getBoundingClientRect() ?? {
        left: rect.left - 44, top: rect.top - 44, width: rect.width + 88, height: rect.height + 88,
      }
      const positions = getStudyRegionControlPositions(rect, bounds)
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
  }, [!!onDelete, controlScale, viewportRef, style])

  // Keep separate 44px touch targets even for a single-line selection.
  const scale = onDelete ? controlScale : 1
  const target = (onDelete ? 44 : 30) * scale
  const color = completed ? '#2e7d32' : '#1976d2'
  const controlStyle: CSSProperties = { width: target, height: target, right: -target / 2,
    visibility: controls.visible ? undefined : 'hidden' }
  const stopPointer = (event: SyntheticEvent) => event.stopPropagation()

  return (
    <div ref={markerRef} className={`study-region-marker ${className}`} style={{ ...style, borderColor: color }}>
      <button type="button" className={`study-region-open${onDelete ? ' study-region-open-inline' : ''}`} data-study-trace-id={id}
        title={openLabel} aria-label={openLabel}
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
          disabled={deleteDisabled} title="この選択跡と続く履歴を削除" aria-label="この選択跡と続く履歴を削除"
          style={controls.deleteLeft === undefined
            ? { ...controlStyle, top: -target - 2, right: -target - 2 }
            : { ...controlStyle, right: 'auto', left: controls.deleteLeft, top: controls.deleteTop }}
          onPointerDown={stopPointer} onMouseDown={stopPointer} onTouchStart={stopPointer} onTouchEnd={stopPointer}
          onClick={event => { event.stopPropagation(); onDelete(id) }}>
          <svg aria-hidden="true" width={STUDY_REGION_DELETE_ICON_SIZE * scale}
            height={STUDY_REGION_DELETE_ICON_SIZE * scale} viewBox="0 0 18 18"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M1 1L17 17M17 1L1 17" />
          </svg>
        </button>
      )}
    </div>
  )
}
