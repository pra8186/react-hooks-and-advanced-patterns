import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deleteDocument, type DocumentListItem } from '../api/documents'

export interface DocumentRemovalRow {
  id: string
  originalFilename: string
  localProgress: number
  removeProgress: number
  error: string | null
}

function meanRemovalProgress(rows: Pick<DocumentRemovalRow, 'removeProgress'>[]): number {
  if (!rows.length) return 0
  return Math.min(
    100,
    Math.round(rows.reduce((s, r) => s + r.removeProgress, 0) / rows.length),
  )
}

/** DELETE has no upload progress; drive the same bar UX until the request settles. */
async function deleteWithSimulatedProgress(
  id: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  let p = 0
  const tick = () => {
    p = Math.min(p + 8, 92)
    onProgress(p)
  }
  const interval = setInterval(tick, 100)
  tick()
  try {
    await deleteDocument(id)
    onProgress(100)
  } finally {
    clearInterval(interval)
  }
}

export function useDocumentRemoval(options: {
  documents: DocumentListItem[]
  refresh: () => Promise<void>
  showToast: (message: string) => void
}) {
  const { documents, refresh, showToast } = options
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [removalRows, setRemovalRows] = useState<DocumentRemovalRow[]>([])
  const [isRemoving, setIsRemoving] = useState(false)
  const [deleteErrorsByDocId, setDeleteErrorsByDocId] = useState<Record<string, string>>({})
  const [showPostRemovalProgress, setShowPostRemovalProgress] = useState(false)
  const postRemovalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (postRemovalTimerRef.current) clearTimeout(postRemovalTimerRef.current)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      setSelectedIds((prev) => prev.filter((id) => documents.some((d) => d.id === id)))
    })
  }, [documents])

  useEffect(() => {
    queueMicrotask(() => {
      const ids = new Set(documents.map((d) => d.id))
      setDeleteErrorsByDocId((prev) => {
        const next: Record<string, string> = {}
        for (const [k, v] of Object.entries(prev)) {
          if (ids.has(k)) next[k] = v
        }
        if (Object.keys(next).length === Object.keys(prev).length) {
          for (const k of Object.keys(prev)) {
            if (prev[k] !== next[k]) return next
          }
          return prev
        }
        return next
      })
    })
  }, [documents])

  const toggleDocumentSelected = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const setAllDocumentsSelected = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? documents.map((d) => d.id) : [])
    },
    [documents],
  )

  const clearDocumentDeleteError = useCallback((id: string) => {
    setDeleteErrorsByDocId((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const aggregateRemovalProgress = useMemo(() => {
    if (!isRemoving || removalRows.length === 0) return 0
    return meanRemovalProgress(removalRows)
  }, [isRemoving, removalRows])

  const removeSelectedDocuments = useCallback(async () => {
    const docById = new Map(documents.map((d) => [d.id, d]))
    const ids = selectedIds.filter((id) => docById.has(id))
    if (ids.length === 0) return

    if (postRemovalTimerRef.current) {
      clearTimeout(postRemovalTimerRef.current)
      postRemovalTimerRef.current = null
    }
    setShowPostRemovalProgress(false)

    setDeleteErrorsByDocId((prev) => {
      const next = { ...prev }
      for (const id of ids) delete next[id]
      return next
    })

    const initialRows: DocumentRemovalRow[] = ids.map((id) => {
      const d = docById.get(id)!
      return {
        id,
        originalFilename: d.originalFilename,
        localProgress: 100,
        removeProgress: 0,
        error: null,
      }
    })
    setRemovalRows(initialRows)
    setIsRemoving(true)

    let failureCount = 0
    let successCount = 0

    for (const id of ids) {
      try {
        await deleteWithSimulatedProgress(id, (pct) => {
          setRemovalRows((prev) => prev.map((r) => (r.id === id ? { ...r, removeProgress: pct } : r)))
        })
        setRemovalRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, removeProgress: 100, error: null } : r)),
        )
        successCount++
      } catch (e) {
        failureCount++
        const msg = e instanceof Error ? e.message : 'Remove failed'
        setRemovalRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, removeProgress: 0, error: msg } : r)),
        )
        setDeleteErrorsByDocId((prev) => ({ ...prev, [id]: msg }))
      }
    }

    setIsRemoving(false)
    setRemovalRows([])
    setSelectedIds([])

    try {
      await refresh()
    } catch {
      /* list refresh failed; inline errors still apply */
    }

    if (failureCount === 0 && successCount > 0) {
      showToast('Selected documents were removed from the server list.')
      setShowPostRemovalProgress(true)
      postRemovalTimerRef.current = setTimeout(() => {
        postRemovalTimerRef.current = null
        setShowPostRemovalProgress(false)
      }, 900)
    } else if (failureCount > 0 && successCount > 0) {
      showToast(
        `Removed ${successCount} document(s). ${failureCount} could not be removed — see errors in the list.`,
      )
    } else if (failureCount > 0 && successCount === 0) {
      showToast('No documents were removed. See errors in the list next to each file.')
    }
  }, [documents, selectedIds, refresh, showToast])

  return useMemo(
    () => ({
      selectedIds,
      toggleDocumentSelected,
      setAllDocumentsSelected,
      isRemoving,
      removalRows,
      aggregateRemovalProgress,
      deleteErrorsByDocId,
      clearDocumentDeleteError,
      removeSelectedDocuments,
      showPostRemovalProgress,
    }),
    [
      selectedIds,
      toggleDocumentSelected,
      setAllDocumentsSelected,
      isRemoving,
      removalRows,
      aggregateRemovalProgress,
      deleteErrorsByDocId,
      clearDocumentDeleteError,
      removeSelectedDocuments,
      showPostRemovalProgress,
    ],
  )
}
