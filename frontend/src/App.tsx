import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  fetchUserTaxOverview,
  isLikelyUuid,
  type UserTaxOverviewResponse,
} from './api/capstone'
import { FilePreviewCard } from './components/FilePreviewCard'
import { FileTransferBar } from './components/FileTransferBar'
import {
  aggregateProgressForFiles,
  useFileUpload,
  validateUploadCandidate,
} from './hooks/useFileUpload'
import './App.css'

type DragScanState =
  | { kind: 'idle' }
  | { kind: 'opaque'; hint: string }
  | { kind: 'preview'; accepted: number; rejected: { name: string; detail: string }[] }

function collectFilesFromDataTransfer(dt: DataTransfer): File[] {
  const out: File[] = []
  const seen = new Set<string>()
  const push = (f: File | null) => {
    if (!f) return
    const key = `${f.name}\0${f.size}\0${f.lastModified}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(f)
  }
  if (dt.items?.length) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === 'file') push(item.getAsFile())
    }
  }
  if (dt.files?.length) {
    for (const f of Array.from(dt.files)) push(f)
  }
  return out
}

function scanDataTransfer(dt: DataTransfer): DragScanState {
  const types = Array.from(dt.types)
  const offersFiles = types.includes('Files')
  const collected = collectFilesFromDataTransfer(dt)

  if (collected.length === 0) {
    if (offersFiles) {
      return {
        kind: 'opaque',
        hint: 'Drop to add — each file is checked for type and size. Or use Browse / Enter.',
      }
    }
    return {
      kind: 'opaque',
      hint: 'Only files from your device can be dropped here. Click this area or Browse, or press Enter while focused.',
    }
  }

  const rejected: { name: string; detail: string }[] = []
  let accepted = 0
  for (const f of collected) {
    const err = validateUploadCandidate(f)
    if (err) {
      const sep = `${f.name}: `
      const detail = err.startsWith(sep) ? err.slice(sep.length) : err
      rejected.push({ name: f.name, detail })
    } else {
      accepted++
    }
  }
  return { kind: 'preview', accepted, rejected }
}

function dragTone(scan: DragScanState): 'idle' | 'unknown' | 'accept' | 'reject' | 'mixed' {
  if (scan.kind === 'idle') return 'idle'
  if (scan.kind === 'opaque') return 'unknown'
  if (scan.rejected.length === 0) return 'accept'
  if (scan.accepted === 0) return 'reject'
  return 'mixed'
}

type DragOverlay = { state: 'off' } | { state: 'on'; scan: DragScanState }

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
  const {
    files,
    addFiles,
    removeFile,
    setFileEntityType,
    uploadAll,
    isUploading,
    errors,
    isLocalIngesting,
    ingestBatchIds,
  } = useFileUpload()

  const transferBusy = isUploading || isLocalIngesting

  const everyStagedFileHasEntityType = useMemo(
    () => files.length > 0 && files.every((f) => f.entityType != null),
    [files],
  )

  const [dragOverlay, setDragOverlay] = useState<DragOverlay>({ state: 'off' })
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [showPostSuccessProgress, setShowPostSuccessProgress] = useState(false)
  const postSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (postSuccessTimerRef.current) clearTimeout(postSuccessTimerRef.current)
    }
  }, [])

  const aggregateLocalProgress = useMemo(() => {
    if (!isLocalIngesting || ingestBatchIds.length === 0) return 0
    const subset = files.filter((f) => ingestBatchIds.includes(f.id))
    return aggregateProgressForFiles(subset, 'localProgress')
  }, [files, isLocalIngesting, ingestBatchIds])

  const aggregateUploadProgress = useMemo(() => {
    if (!isUploading || files.length === 0) return 0
    return aggregateProgressForFiles(files, 'uploadProgress')
  }, [files, isUploading])

  const showGlobalProgress =
    isLocalIngesting || isUploading || showPostSuccessProgress

  const globalProgressPercent = isLocalIngesting
    ? aggregateLocalProgress
    : isUploading
      ? aggregateUploadProgress
      : showPostSuccessProgress
        ? 100
        : 0

  const globalProgressLabel = isLocalIngesting
    ? `Overall reading from device, ${globalProgressPercent}% across ${ingestBatchIds.length} file(s)`
    : isUploading
      ? `Overall uploading to server, ${globalProgressPercent}% across ${files.length} file(s)`
      : showPostSuccessProgress
        ? 'Overall upload finished, 100%'
        : ''

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

  const updateDragScan = (e: DragEvent) => {
    e.preventDefault()
    if (transferBusy) return
    const scan = scanDataTransfer(e.dataTransfer)
    setDragOverlay({ state: 'on', scan })
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOverlay({ state: 'off' })
    if (transferBusy) return
    const list = e.dataTransfer.files
    if (list?.length) {
      setUploadSuccess(false)
      void addFiles(list)
    }
  }

  const dragActive = dragOverlay.state === 'on'
  const dragScan: DragScanState = dragOverlay.state === 'on' ? dragOverlay.scan : { kind: 'idle' }

  const handleUploadAll = async () => {
    setUploadSuccess(false)
    setShowPostSuccessProgress(false)
    if (postSuccessTimerRef.current) {
      clearTimeout(postSuccessTimerRef.current)
      postSuccessTimerRef.current = null
    }
    const ok = await uploadAll()
    if (ok) {
      setUploadSuccess(true)
      setShowPostSuccessProgress(true)
      postSuccessTimerRef.current = setTimeout(() => {
        postSuccessTimerRef.current = null
        setShowPostSuccessProgress(false)
      }, 900)
    }
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
            if (transferBusy) return
            updateDragScan(e)
          }}
          onDragOver={updateDragScan}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return
            setDragOverlay({ state: 'off' })
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
                void addFiles(list)
              }
              e.target.value = ''
            }}
          />

          <div
            className={`drop-zone${dragActive ? ` drop-zone--tone-${dragTone(dragScan)}` : ''}`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (transferBusy) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            onClick={() => !transferBusy && inputRef.current?.click()}
          >
            <div className={`drop-icon drop-icon--${dragActive ? dragTone(dragScan) : 'idle'}`} aria-hidden />
            {dragActive && dragScan.kind === 'preview' ? (
              <>
                <p className="drop-title">Release to add to queue</p>
                <div className="drop-indicators" aria-live="polite">
                  <span className="drop-chip drop-chip--ok">
                    <span className="drop-chip-mark" aria-hidden>
                      ✓
                    </span>
                    {dragScan.accepted} accepted
                  </span>
                  {dragScan.rejected.length > 0 && (
                    <span className="drop-chip drop-chip--bad">
                      <span className="drop-chip-mark" aria-hidden>
                        ✗
                      </span>
                      {dragScan.rejected.length} rejected
                    </span>
                  )}
                </div>
                {dragScan.rejected.length > 0 && (
                  <ul className="drop-reject-list">
                    {dragScan.rejected.slice(0, 5).map((r) => (
                      <li key={r.name}>
                        <span className="drop-reject-name">{r.name}</span>
                        <span className="drop-reject-detail">{r.detail}</span>
                      </li>
                    ))}
                    {dragScan.rejected.length > 5 && (
                      <li className="drop-reject-more">+{dragScan.rejected.length - 5} more</li>
                    )}
                  </ul>
                )}
              </>
            ) : dragActive && dragScan.kind === 'opaque' ? (
              <>
                <p className="drop-title">Drop files here</p>
                <p className="drop-hint drop-hint--live" id={`${inputId}-drop-hint`}>
                  {dragScan.hint}
                </p>
              </>
            ) : (
              <>
                <p className="drop-title">Drop files here or click to browse</p>
                <p className="drop-hint" id={`${inputId}-drop-hint`}>
                  PDF, JPG, or PNG · under 10MB each. Same rules apply when you pick files with the
                  button below — drag is optional.
                </p>
              </>
            )}
          </div>

          <div className="actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => inputRef.current?.click()}
              disabled={transferBusy}
            >
              Browse
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void handleUploadAll()}
              disabled={transferBusy || files.length === 0 || !everyStagedFileHasEntityType}
            >
              {isUploading ? 'Uploading…' : 'Upload all'}
            </button>
          </div>

          {showGlobalProgress && (
            <div className="global-transfer-panel" aria-live="polite">
              <div className="global-transfer-head">
                <span className="global-transfer-title">
                  {isLocalIngesting
                    ? 'Overall · reading from your device'
                    : isUploading
                      ? 'Overall · uploading to server'
                      : 'Overall · complete'}
                </span>
              </div>
              <FileTransferBar
                variant="global"
                percent={globalProgressPercent}
                ariaLabel={globalProgressLabel}
              />
            </div>
          )}

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
            <h3 className="queue-title">Files · {files.length}</h3>
            {files.length === 0 ? (
              <p className="empty">No files staged.</p>
            ) : (
              <ul className="file-preview-grid">
                {files.map((item) => (
                  <li key={item.id}>
                    <FilePreviewCard
                      item={item}
                      formatSize={formatSize}
                      isUploading={isUploading}
                      onRemove={() => removeFile(item.id)}
                      onEntityTypeChange={(value) => setFileEntityType(item.id, value)}
                      disabled={transferBusy}
                    />
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
