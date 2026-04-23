import type { DocumentRemovalRow } from '../hooks/useDocumentRemoval'
import { EntityFileTransferBars } from './EntityFileTransferBars'
import './DocumentRemovalQueueCard.css'

export function DocumentRemovalQueueCard({
  row,
  isRemoving,
}: {
  row: DocumentRemovalRow
  isRemoving: boolean
}) {
  return (
    <article className="document-removal-queue-card">
      <h4 className="document-removal-queue-title">{row.originalFilename}</h4>
      <EntityFileTransferBars
        fileName={row.originalFilename}
        localProgress={row.localProgress}
        uploadProgress={row.removeProgress}
        isUploading={isRemoving}
        mode="documentRemove"
      />
      {row.error ? (
        <p className="document-removal-queue-error" role="alert">
          {row.error}
        </p>
      ) : null}
    </article>
  )
}
