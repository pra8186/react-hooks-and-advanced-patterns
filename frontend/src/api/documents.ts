import axios, { type AxiosError } from 'axios'

const client = axios.create({ baseURL: '' })

/** Matches typical list payloads; dev stub returns a plain array. */
export interface DocumentListItem {
  id: string
  originalFilename: string
  entityType: string | null
  uploadedAt?: string
}

function messageFromAxiosError(error: AxiosError): string {
  const data = error.response?.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const rec = data as Record<string, unknown>
    if (typeof rec.message === 'string') return rec.message
    if (typeof rec.error === 'string') {
      const detail = typeof rec.detail === 'string' ? rec.detail : null
      return detail ? `${rec.error}: ${detail}` : rec.error
    }
  }
  return error.message || 'Request failed'
}

function isDocumentListItem(v: unknown): v is DocumentListItem {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.originalFilename === 'string'
}

/** Normalized page result for {@link fetchDocumentsPage}. */
export interface FetchDocumentsPageResult {
  items: DocumentListItem[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  totalPages: number
}

function normalizePaginatedPayload(
  data: unknown,
  requestPage: number,
  requestPageSize: number,
): FetchDocumentsPageResult {
  if (Array.isArray(data)) {
    const items = data.filter(isDocumentListItem)
    const total = items.length
    const start = requestPage * requestPageSize
    const slice = items.slice(start, start + requestPageSize)
    const totalPages = Math.max(1, Math.ceil(total / requestPageSize) || 1)
    return {
      items: slice,
      total,
      page: requestPage,
      pageSize: requestPageSize,
      hasMore: start + requestPageSize < total,
      totalPages,
    }
  }
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    if ('content' in o && Array.isArray(o.content)) {
      const items = o.content.filter(isDocumentListItem)
      const total =
        typeof o.totalElements === 'number' ? o.totalElements : items.length
      const page = typeof o.number === 'number' ? o.number : requestPage
      const pageSize = typeof o.size === 'number' ? o.size : requestPageSize
      const last = o.last === true
      const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
      return {
        items,
        total,
        page,
        pageSize,
        hasMore: !last,
        totalPages,
      }
    }
    if ('documents' in o && Array.isArray(o.documents)) {
      const items = o.documents.filter(isDocumentListItem)
      const total = typeof o.total === 'number' ? o.total : items.length
      const page = typeof o.page === 'number' ? o.page : requestPage
      const pageSize = typeof o.pageSize === 'number' ? o.pageSize : requestPageSize
      const hasMore = typeof o.hasMore === 'boolean' ? o.hasMore : false
      const totalPages =
        typeof o.totalPages === 'number'
          ? o.totalPages
          : Math.max(1, Math.ceil(total / pageSize) || 1)
      return { items, total, page, pageSize, hasMore, totalPages }
    }
  }
  return {
    items: [],
    total: 0,
    page: requestPage,
    pageSize: requestPageSize,
    hasMore: false,
    totalPages: 1,
  }
}

/**
 * GET /api/documents?page=&pageSize=&userId=
 * Supports Spring-style page payloads (`content`, `totalElements`, `number`, `size`, `last`)
 * or a flat `{ documents, total, page, pageSize, hasMore, totalPages }` envelope.
 */
export async function fetchDocumentsPage(params: {
  userId?: string | null
  page?: number
  pageSize?: number
}): Promise<FetchDocumentsPageResult> {
  const page = Math.max(0, params.page ?? 0)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 10))
  const qs = new URLSearchParams()
  qs.set('page', String(page))
  qs.set('pageSize', String(pageSize))
  const uid = params.userId?.trim()
  if (uid) qs.set('userId', uid)
  try {
    const { data } = await client.get<unknown>(`/api/documents?${qs.toString()}`)
    return normalizePaginatedPayload(data, page, pageSize)
  } catch (e) {
    if (axios.isAxiosError(e)) {
      throw new Error(messageFromAxiosError(e), { cause: e })
    }
    if (e instanceof Error) throw e
    throw new Error('Request failed', { cause: e })
  }
}

/** DELETE /api/documents/{id} — remove one persisted document (dev stub or real API). */
export async function deleteDocument(id: string): Promise<void> {
  try {
    await client.delete(`/api/documents/${encodeURIComponent(id)}`)
  } catch (e) {
    if (axios.isAxiosError(e)) {
      throw new Error(messageFromAxiosError(e), { cause: e })
    }
    if (e instanceof Error) throw e
    throw new Error('Request failed', { cause: e })
  }
}

