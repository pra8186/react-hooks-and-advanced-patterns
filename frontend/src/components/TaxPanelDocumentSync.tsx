import { useDocumentList } from '../hooks/useDocumentList'
import './TaxPanelDocumentSync.css'

/** Second consumer of {@link useDocumentList} — stays in sync with the upload panel list. */
export function TaxPanelDocumentSync({
  documentUserId,
}: {
  documentUserId: string | null
}) {
  const docList = useDocumentList(documentUserId)

  return (
    <div className="tax-panel-doc-sync" role="region" aria-label="Document list sync">
      <p className="tax-panel-doc-sync-text">
        <span className="tax-panel-doc-sync-label">Documents (same list as upload)</span>
        {docList.loading ? (
          <span> · Loading…</span>
        ) : docList.error ? (
          <span className="tax-panel-doc-sync-err"> · {docList.error}</span>
        ) : (
          <span>
            {' '}
            · {docList.total} on server
            {docList.totalPages > 1
              ? ` · page ${docList.page + 1} / ${docList.totalPages}`
              : ''}
          </span>
        )}
      </p>
      <button
        type="button"
        className="btn ghost tax-panel-doc-sync-btn"
        onClick={() => void docList.refresh()}
        disabled={docList.loading}
      >
        {docList.loading ? 'Refreshing…' : 'Refresh documents'}
      </button>
    </div>
  )
}
