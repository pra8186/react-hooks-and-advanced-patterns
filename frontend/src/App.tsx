import { useCallback, useId, useRef, useState, type DragEvent } from 'react'
import {
  fetchUserTaxOverview,
  isLikelyUuid,
  type UserTaxOverviewResponse,
} from './api/capstone'
import { useFileUpload } from './hooks/useFileUpload'
import './App.css'

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function formatAmount(v: number | string): string {
  const n = typeof v === 'string' ? Number(v) : v
  if (Number.isNaN(n)) return String(v)
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function App() {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const { files, addFiles, removeFile, uploadAll, progress, isUploading, errors } =
    useFileUpload()

  const [dragActive, setDragActive] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)

  const [userIdInput, setUserIdInput] = useState('')
  const [overview, setOverview] = useState<UserTaxOverviewResponse | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)

  const loadOverview = useCallback(async () => {
    const trimmed = userIdInput.trim()
    setOverview(null)
    setOverviewError(null)
    if (!trimmed) {
      setOverviewError('Enter a user id (UUID).')
      return
    }
    if (!isLikelyUuid(trimmed)) {
      setOverviewError('That does not look like a valid UUID.')
      return
    }
    setOverviewLoading(true)
    try {
      const data = await fetchUserTaxOverview(trimmed)
      setOverview(data)
    } catch (e) {
      setOverviewError(e instanceof Error ? e.message : 'Could not load tax overview.')
    } finally {
      setOverviewLoading(false)
    }
  }, [userIdInput])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    if (isUploading) return
    if (e.dataTransfer.files?.length) {
      setUploadSuccess(false)
      addFiles(e.dataTransfer.files)
    }
  }

  const handleUploadAll = async () => {
    setUploadSuccess(false)
    const ok = await uploadAll()
    if (ok) setUploadSuccess(true)
  }

  return (
    <div className="dashboard">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Capstone · advanced-react-hooks</p>
          <h1>Tax workspace</h1>
          <p className="lede">
            Pull live data from your Spring app on port 7070, and stage PDF or image uploads
            (under 10MB) with axios progress. Dev and preview accept uploads locally; point{' '}
            <code>VITE_UPLOAD_URL</code> at a real endpoint when you add one in Boot.
          </p>
        </div>
      </header>

      <div className="grid-two">
        <section
          className={`panel upload-panel${dragActive ? ' drag-active' : ''}`}
          onDragEnter={(e) => {
            e.preventDefault()
            if (!isUploading) setDragActive(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            if (!isUploading) setDragActive(true)
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return
            setDragActive(false)
          }}
          onDrop={onDrop}
        >
          <div className="panel-head">
            <h2>Documents</h2>
            <p className="panel-sub">PDF, JPG, or PNG · max 9.99MB per file</p>
          </div>

          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            multiple
            className="visually-hidden"
            onChange={(e) => {
              const list = e.target.files
              if (list?.length) {
                setUploadSuccess(false)
                addFiles(list)
              }
              e.target.value = ''
            }}
          />

          <div
            className="drop-zone"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            onClick={() => !isUploading && inputRef.current?.click()}
          >
            <div className="drop-icon" aria-hidden />
            <p className="drop-title">Drop files here or browse</p>
            <p className="drop-hint">Your queue stays in React state until you upload.</p>
          </div>

          <div className="actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
            >
              Browse
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void handleUploadAll()}
              disabled={isUploading || files.length === 0}
            >
              {isUploading ? 'Uploading…' : 'Upload all'}
            </button>
          </div>

          <div className="progress-block" aria-live="polite">
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${isUploading ? progress : uploadSuccess ? 100 : 0}%` }}
              />
            </div>
            <span className="progress-meta">
              {isUploading ? `${progress}%` : uploadSuccess ? 'Done' : 'Idle'}
            </span>
          </div>

          {uploadSuccess && !isUploading && (
            <p className="success-banner" role="status">
              All files uploaded successfully.
            </p>
          )}

          {errors.length > 0 && (
            <div className="inline-errors" role="alert">
              <ul>
                {errors.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="queue">
            <h3 className="queue-title">Queue · {files.length}</h3>
            {files.length === 0 ? (
              <p className="empty">No files staged.</p>
            ) : (
              <ul className="file-list">
                {files.map(({ id, file }) => (
                  <li key={id} className="file-row">
                    <span className="file-name" title={file.name}>
                      {file.name}
                    </span>
                    <span className="file-meta">{formatSize(file.size)}</span>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        removeFile(id)
                      }}
                      disabled={isUploading}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="panel data-panel">
          <div className="panel-head">
            <h2>Tax overview</h2>
            <p className="panel-sub">{'GET /api/v1/users/{userId}/tax-overview'}</p>
          </div>

          <div className="overview-controls">
            <label className="field-label" htmlFor="user-id-field">
              User id (UUID)
            </label>
            <div className="field-row">
              <input
                id="user-id-field"
                className="text-input"
                placeholder="e.g. 8b3e2f1a-…"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn primary"
                onClick={() => void loadOverview()}
                disabled={overviewLoading}
              >
                {overviewLoading ? 'Loading…' : 'Load'}
              </button>
            </div>
          </div>

          {overviewError && (
            <div className="inline-errors overview-errors" role="alert">
              {overviewError}
            </div>
          )}

          {overview && (
            <div className="overview-body">
              <div className="summary-cards">
                <div className="stat">
                  <span className="stat-label">Name</span>
                  <span className="stat-value">{overview.summary.fullName}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Tax year</span>
                  <span className="stat-value">{overview.summary.taxYear}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Primary state</span>
                  <span className="stat-value">{overview.summary.primaryState}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Filing status</span>
                  <span className="stat-value">{overview.summary.filingStatus}</span>
                </div>
                <div className="stat wide">
                  <span className="stat-label">Work states</span>
                  <span className="stat-value">{overview.summary.workStates}</span>
                </div>
              </div>

              <div className="table-wrap">
                <table className="rates-table">
                  <caption className="sr-only">Per-state brackets and rates</caption>
                  <thead>
                    <tr>
                      <th scope="col">State</th>
                      <th scope="col">Bracket</th>
                      <th scope="col">Income min</th>
                      <th scope="col">Income max</th>
                      <th scope="col">Rate</th>
                      <th scope="col">Days rule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.perStateRatesAndThresholds.map((row, idx) => (
                      <tr key={`${row.stateCode}-${row.bracketType}-${idx}`}>
                        <td>
                          <span className="cell-strong">{row.stateCode}</span>
                          <span className="cell-muted">{row.stateName}</span>
                        </td>
                        <td>{row.bracketType}</td>
                        <td className="num">{formatAmount(row.incomeMin)}</td>
                        <td className="num">{formatAmount(row.incomeMax)}</td>
                        <td className="num">{formatAmount(row.rate)}</td>
                        <td>{row.filingThresholdDays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!overview && !overviewError && !overviewLoading && (
            <p className="empty soft">Load a user to see capstone data here.</p>
          )}
        </section>
      </div>
    </div>
  )
}

export default App
