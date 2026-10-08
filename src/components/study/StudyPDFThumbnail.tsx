import React from 'react'
import { FiFileText } from 'react-icons/fi'
import type { PDFFileRecord } from '../../utils/indexedDB'
import './StudyPDFThumbnail.css'

export function StudyPDFThumbnail({ record, children }: {
    record: Pick<PDFFileRecord, 'fileName' | 'thumbnail'>
    children?: React.ReactNode
}) {
    return <span className="study-pdf-thumbnail">
        <span className="study-pdf-thumbnail-image">
            {record.thumbnail ? <img src={record.thumbnail} alt={record.fileName} /> :
                <span className="study-pdf-thumbnail-placeholder" role="img" aria-label={record.fileName}>
                    <FiFileText aria-hidden="true" />
                </span>}
            {children}
        </span>
    </span>
}
