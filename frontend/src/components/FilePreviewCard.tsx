import { useCallback, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import type { StagedFile } from '../hooks/useFileUpload'
import { isImageStagedFile } from '../hooks/useFileUpload'
import { EntityFileTransferBars } from './EntityFileTransferBars'
import './FilePreviewCard.css'

function FileTypeIcon({ kind }: { kind: 'pdf' | 'image' }) {
  if (kind === 'pdf') {
    return (
      <span className="file-card-icon file-card-icon--pdf" aria-hidden>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <path
            d="M7 3h8l4 4v14H7V3z"
            fill="color-mix(in srgb, #ef4444 18%, var(--bg))"
            stroke="#ef4444"
            strokeWidth="1.2"
          />
          <path d="M14 3v4h4" stroke="#ef4444" strokeWidth="1.2" />
          <path d="M9 14h6M9 17h4" stroke="var(--text-h)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </span>
    )
  }
  return (
    <span className="file-card-icon file-card-icon--img" aria-hidden>
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect
          x="4"
          y="5"
          width="16"
          height="14"
          rx="2"
          fill="color-mix(in srgb, var(--accent) 15%, var(--bg))"
          stroke="var(--accent-border)"
          strokeWidth="1.2"
        />
        <circle cx="9" cy="10" r="1.5" fill="#eab308" />
        <path d="M4 17l4-4 3 3 4-5 5 6H4v0z" fill="color-mix(in srgb, #eab308 35%, transparent)" />
      </svg>
    </span>
  )
}

export function FilePreviewCard({
  item,
  formatSize,
  onRemove,
  disabled,
  isUploading,
}: {
  item: StagedFile
  formatSize: (n: number) => string
  onRemove: () => void
  disabled: boolean
  isUploading: boolean
}) {
  const { file, previewUrl, localProgress, uploadProgress } = item
  const image = isImageStagedFile(file)
  const kind = image ? 'image' : 'pdf'
  const pdfPreviewTitleId = useId()
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)

  const closePdfPreview = useCallback(() => {
    setPdfBlobUrl((u) => {
      if (u) URL.revokeObjectURL(u)
      return null
    })
    setPdfModalOpen(false)
  }, [])

  const openPdfPreview = useCallback(() => {
    if (image || localProgress < 100) return
    setPdfBlobUrl(URL.createObjectURL(file))
    setPdfModalOpen(true)
  }, [image, localProgress, file])

  useEffect(() => {
    return () => {
      setPdfBlobUrl((u) => {
        if (u) URL.revokeObjectURL(u)
        return null
      })
    }
  }, [])

  useEffect(() => {
    if (!pdfModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePdfPreview()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pdfModalOpen, closePdfPreview])

  return (
    <article className="file-preview-card">
      <div
        className={`file-preview-thumb${!image && localProgress >= 100 ? ' file-preview-thumb--pdf-ready' : ''}`}
      >
        {previewUrl && image ? (
          <img
            src={previewUrl}
            alt={`Preview of ${file.name}`}
            className="file-preview-thumb-img"
          />
        ) : image ? (
          <FileTypeIcon kind={kind} />
        ) : (
          <button
            type="button"
            className="file-preview-pdf-hit"
            onClick={openPdfPreview}
            disabled={localProgress < 100}
            aria-label={`Open full preview of PDF ${file.name}`}
          >
            <FileTypeIcon kind="pdf" />
          </button>
        )}
      </div>
      <div className="file-preview-body">
        <div className="file-preview-head">
          <h4 className="file-preview-name" title={file.name}>
            {file.name}
          </h4>
          <button type="button" className="btn ghost file-preview-remove" onClick={onRemove} disabled={disabled}>
            Remove
          </button>
        </div>
        <p className="file-preview-meta">
          {formatSize(file.size)}
          <span className="file-preview-dot"> · </span>
          <span className="file-preview-type">{file.type || (image ? 'image' : 'application/pdf')}</span>
        </p>
        <EntityFileTransferBars
          fileName={file.name}
          localProgress={localProgress}
          uploadProgress={uploadProgress}
          isUploading={isUploading}
        />
      </div>

      {pdfModalOpen &&
        pdfBlobUrl &&
        !image &&
        createPortal(
          <div
            className="file-preview-pdf-modal-backdrop"
            role="presentation"
            onClick={closePdfPreview}
          >
            <div
              className="file-preview-pdf-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={pdfPreviewTitleId}
              onClick={(e) => e.stopPropagation()}
            >
              <header className="file-preview-pdf-modal-head">
                <h2 id={pdfPreviewTitleId} className="file-preview-pdf-modal-title">
                  {file.name}
                </h2>
                <button type="button" className="btn file-preview-pdf-modal-close" onClick={closePdfPreview}>
                  Close
                </button>
              </header>
              <iframe
                className="file-preview-pdf-iframe"
                src={pdfBlobUrl}
                title={`PDF preview: ${file.name}`}
              />
            </div>
          </div>,
          document.body,
        )}
    </article>
  )
}
