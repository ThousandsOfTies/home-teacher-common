import { useLayoutEffect, useRef, useState, type CSSProperties, type SyntheticEvent, type RefObject } from 'react'
import { FiX } from 'react-icons/fi'
import { getStudyRegionControlPositions } from '../../utils/studyRegionControls'
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
  const [controls, setControls] = useState<{ height: number; openLeft?: number; openTop?: number;
    deleteLeft?: number; deleteTop?: number; visible: boolean }>({ height: 0, visible: true })
  useLayoutEffect(() => {
    if (!onDelete || !markerRef.current) return
    const marker = markerRef.current
    const viewport = viewportRef?.current
    const measure = () => {
      const rect = marker.getBoundingClientRect()
      const positions = viewport ? getStudyRegionControlPositions(rect, viewport.getBoundingClientRect()) : null
      const next = { height: marker.offsetHeight, visible: positions?.visible ?? true,
        openLeft: positions ? (positions.open.x - rect.left - 22) * controlScale - 2 : undefined,
        openTop: positions ? (positions.open.y - rect.top - 22) * controlScale - 2 : undefined,
        deleteLeft: positions ? (positions.remove.x - rect.left - 22) * controlScale - 2 : undefined,
        deleteTop: positions ? (positions.remove.y - rect.top - 22) * controlScale - 2 : undefined }
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
  const separateHorizontally = controls.height / 2 + 4 * scale < 52 * scale
  const color = completed ? '#2e7d32' : '#1976d2'
  const controlStyle: CSSProperties = { width: target, height: target, right: -target / 2,
    visibility: controls.visible ? undefined : 'hidden' }
  const stopPointer = (event: SyntheticEvent) => event.stopPropagation()

  return (
    <div ref={markerRef} className={`study-region-marker ${className}`} style={{ ...style, borderColor: color }}>
      <button type="button" className="study-region-open" data-study-trace-id={id}
        title={openLabel} aria-label={openLabel}
        style={controls.openLeft === undefined
          ? { ...controlStyle, top: '50%', transform: 'translateY(-50%)' }
          : { ...controlStyle, right: 'auto', left: controls.openLeft, top: controls.openTop }}
        onPointerDown={stopPointer} onMouseDown={stopPointer} onTouchStart={stopPointer} onTouchEnd={stopPointer}
        onClick={event => { event.stopPropagation(); onOpen(id) }}>
        <span aria-hidden="true" style={{ width: 30 * scale, height: 30 * scale,
          fontSize: 14 * scale, borderWidth: 2 * scale, background: color }}>▶</span>
      </button>
      {onDelete && (
        <button type="button" className="study-region-delete" data-study-trace-delete-id={id}
          disabled={deleteDisabled} title="この選択跡と続く履歴を削除" aria-label="この選択跡と続く履歴を削除"
          style={controls.deleteLeft === undefined
            ? { ...controlStyle, top: -4 * scale - target / 2,
              right: (separateHorizontally ? 52 * scale : 0) - target / 2 }
            : { ...controlStyle, right: 'auto', left: controls.deleteLeft, top: controls.deleteTop }}
          onPointerDown={stopPointer} onMouseDown={stopPointer} onTouchStart={stopPointer} onTouchEnd={stopPointer}
          onClick={event => { event.stopPropagation(); onDelete(id) }}>
          <FiX aria-hidden="true" size={18 * scale} />
        </button>
      )}
    </div>
  )
}
