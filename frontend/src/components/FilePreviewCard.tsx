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

  return (
    <article className="file-preview-card">
      <div className="file-preview-thumb">
        {previewUrl && image ? (
          <img
            src={previewUrl}
            alt={`Preview of ${file.name}`}
            className="file-preview-thumb-img"
          />
        ) : (
          <FileTypeIcon kind={kind} />
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
    </article>
  )
}
