import { useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  fetchDocumentsPage,
  type DocumentListItem,
  type FetchDocumentsPageResult,
} from '../api/documents'

export const DEFAULT_DOCUMENT_PAGE_SIZE = 10

type DocumentListSnapshot = {
  items: DocumentListItem[]
  loading: boolean
  error: string | null
  page: number
  pageSize: number
  total: number
  hasMore: boolean
  totalPages: number
}

function emptySnapshot(pageSize: number): DocumentListSnapshot {
  return {
    items: [],
    loading: false,
    error: null,
    page: 0,
    pageSize,
    total: 0,
    hasMore: false,
    totalPages: 1,
  }
}

type DocumentListStore = {
  subscribe: (onStoreChange: () => void) => () => void
  getSnapshot: () => DocumentListSnapshot
  refresh: () => Promise<void>
  setPage: (page: number) => Promise<void>
  setPageSize: (pageSize: number) => Promise<void>
  nextPage: () => Promise<void>
  prevPage: () => Promise<void>
}

const sharedStores = new Map<string, DocumentListStore>()

function getOrCreateStore(scopeKey: string): DocumentListStore {
  const existing = sharedStores.get(scopeKey)
  if (existing) return existing
  const created = createDocumentListStore(scopeKey)
  sharedStores.set(scopeKey, created)
  return created
}

function createDocumentListStore(scopeKey: string): DocumentListStore {
  let snapshot: DocumentListSnapshot = emptySnapshot(DEFAULT_DOCUMENT_PAGE_SIZE)
  const listeners = new Set<() => void>()

  const emit = () => {
    for (const l of listeners) l()
  }

  const applyResult = (res: FetchDocumentsPageResult, loading: boolean) => {
    snapshot = {
      items: res.items,
      loading,
      error: null,
      page: res.page,
      pageSize: res.pageSize,
      total: res.total,
      hasMore: res.hasMore,
      totalPages: res.totalPages,
    }
    emit()
  }

  async function runFetch(): Promise<void> {
    const prev = snapshot
    snapshot = { ...prev, loading: true, error: null }
    emit()
    try {
      const userId = scopeKey === '' ? null : scopeKey
      const res = await fetchDocumentsPage({
        userId,
        page: prev.page,
        pageSize: prev.pageSize,
      })
      applyResult(res, false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load documents.'
      snapshot = {
        ...emptySnapshot(prev.pageSize),
        loading: false,
        error: msg,
        page: prev.page,
        pageSize: prev.pageSize,
      }
      emit()
    }
  }

  return {
    subscribe(onStoreChange) {
      listeners.add(onStoreChange)
      return () => listeners.delete(onStoreChange)
    },
    getSnapshot() {
      return snapshot
    },
    refresh() {
      return runFetch()
    },
    async setPage(page: number) {
      const p = Math.max(0, page)
      snapshot = { ...snapshot, page: p }
      emit()
      await runFetch()
    },
    async setPageSize(pageSize: number) {
      const clamped = Math.min(100, Math.max(1, pageSize))
      snapshot = { ...snapshot, pageSize: clamped, page: 0 }
      emit()
      await runFetch()
    },
    async nextPage() {
      const maxPage = Math.max(0, snapshot.totalPages - 1)
      if (snapshot.page >= maxPage) return
      snapshot = { ...snapshot, page: snapshot.page + 1 }
      emit()
      await runFetch()
    },
    async prevPage() {
      if (snapshot.page <= 0) return
      snapshot = { ...snapshot, page: snapshot.page - 1 }
      emit()
      await runFetch()
    },
  }
}

export interface UseDocumentListResult {
  documents: DocumentListItem[]
  loading: boolean
  error: string | null
  page: number
  pageSize: number
  total: number
  hasMore: boolean
  totalPages: number
  hasPreviousPage: boolean
  refresh: () => Promise<void>
  setPage: (page: number) => Promise<void>
  setPageSize: (pageSize: number) => Promise<void>
  nextPage: () => Promise<void>
  prevPage: () => Promise<void>
}

/**
 * Paginated document list for a user scope, with a shared in-memory store per `userId`
 * so multiple surfaces (e.g. tax dashboard + upload panel) stay in sync.
 *
 * Pass `null` or `undefined` for the anonymous / unscoped key (legacy dev list).
 */
export function useDocumentList(userId: string | null | undefined): UseDocumentListResult {
  const scopeKey = userId?.trim() ?? ''
  const store = useMemo(() => getOrCreateStore(scopeKey), [scopeKey])
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)

  useEffect(() => {
    queueMicrotask(() => {
      void store.refresh()
    })
  }, [store])

  return useMemo(
    () => ({
      documents: snap.items,
      loading: snap.loading,
      error: snap.error,
      page: snap.page,
      pageSize: snap.pageSize,
      total: snap.total,
      hasMore: snap.hasMore,
      totalPages: snap.totalPages,
      hasPreviousPage: snap.page > 0,
      refresh: () => store.refresh(),
      setPage: (page: number) => store.setPage(page),
      setPageSize: (pageSize: number) => store.setPageSize(pageSize),
      nextPage: () => store.nextPage(),
      prevPage: () => store.prevPage(),
    }),
    [snap, store],
  )
}
