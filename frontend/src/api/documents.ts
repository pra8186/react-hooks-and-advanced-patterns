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

function normalizeListPayload(data: unknown): DocumentListItem[] {
  if (Array.isArray(data)) {
    return data.filter(isDocumentListItem)
  }
  if (data && typeof data === 'object' && 'documents' in data) {
    const inner = (data as { documents: unknown }).documents
    if (Array.isArray(inner)) return inner.filter(isDocumentListItem)
  }
  return []
}

function isDocumentListItem(v: unknown): v is DocumentListItem {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.originalFilename === 'string'
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

/** GET /api/documents — refresh after a successful multipart upload. */
export async function fetchDocumentsList(): Promise<DocumentListItem[]> {
  try {
    const { data } = await client.get<unknown>('/api/documents')
    return normalizeListPayload(data)
  } catch (e) {
    if (axios.isAxiosError(e)) {
      throw new Error(messageFromAxiosError(e), { cause: e })
    }
    if (e instanceof Error) throw e
    throw new Error('Request failed', { cause: e })
  }
}
