import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

interface StubDocumentRow {
  id: string
  originalFilename: string
  entityType: string | null
  uploadedAt: string
}

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer | string) => {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** Best-effort parse for the dev stub only (not a full multipart parser). */
function parseMultipartStubFields(
  contentType: string | undefined,
  body: Buffer,
): { fileName: string | null; entityType: string | null } {
  if (!contentType || !/multipart\/form-data/i.test(contentType)) {
    return { fileName: null, entityType: null }
  }
  const m = /boundary=([^;\s]+)/i.exec(contentType)
  if (!m) return { fileName: null, entityType: null }
  const raw = body.toString('latin1')
  const fnQuoted = /filename="([^"]*)"/.exec(raw)
  const fnBare = /filename=([^;\s\r\n]+)/.exec(raw)
  const fileName = (fnQuoted?.[1] ?? fnBare?.[1] ?? '').trim() || null
  const et = /name="entityType"[\s\S]{0,400}?\r\n\r\n([^\r\n]+)/.exec(raw)
  const entityType = et?.[1]?.trim() ?? null
  return { fileName, entityType }
}

/**
 * Local dev stubs: POST /api/documents (multipart) + GET /api/documents, and legacy
 * POST /api/v1/documents/upload. Proxied Boot routes stay unchanged.
 */
function capstoneUploadStubPlugin(): Plugin {
  const stubDocuments: StubDocumentRow[] = []

  const drainRequestBody = (req: IncomingMessage) =>
    new Promise<void>((resolve, reject) => {
      req.on('data', () => {
        /* discard */
      })
      req.on('end', () => resolve())
      req.on('error', reject)
    })

  const sendJson = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(body))
  }

  const middleware = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ) => {
    const raw = req.url ?? ''
    const path = raw.split('?')[0] ?? ''

    if (req.method === 'GET' && path === '/api/documents') {
      const q = new URLSearchParams((raw.split('?')[1] ?? '').replace(/^\?/, ''))
      const hasPaging = q.has('page') || q.has('pageSize')
      if (!hasPaging) {
        sendJson(res, 200, stubDocuments)
        return
      }
      const page = Math.max(0, parseInt(q.get('page') ?? '0', 10) || 0)
      const pageSize = Math.min(100, Math.max(1, parseInt(q.get('pageSize') ?? '10', 10) || 10))
      const total = stubDocuments.length
      const start = page * pageSize
      const slice = stubDocuments.slice(start, start + pageSize)
      const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
      sendJson(res, 200, {
        documents: slice,
        total,
        page,
        pageSize,
        hasMore: start + pageSize < total,
        totalPages,
      })
      return
    }

    if (req.method === 'POST' && path === '/api/documents') {
      try {
        const body = await readRequestBody(req)
        const ct = req.headers['content-type']
        const { fileName, entityType } = parseMultipartStubFields(
          typeof ct === 'string' ? ct : undefined,
          body,
        )
        const row: StubDocumentRow = {
          id: randomUUID(),
          originalFilename: fileName ?? 'upload',
          entityType,
          uploadedAt: new Date().toISOString(),
        }
        stubDocuments.unshift(row)
        sendJson(res, 201, { message: 'Document uploaded', id: row.id })
      } catch {
        sendJson(res, 500, { message: 'Upload stub failed' })
      }
      return
    }

    if (req.method === 'DELETE' && path.startsWith('/api/documents/')) {
      const rest = path.slice('/api/documents/'.length)
      if (rest && !rest.includes('/')) {
        const id = decodeURIComponent(rest)
        const idx = stubDocuments.findIndex((d) => d.id === id)
        if (idx === -1) {
          sendJson(res, 404, { message: 'Document not found' })
          return
        }
        stubDocuments.splice(idx, 1)
        res.statusCode = 204
        res.end()
        return
      }
    }

    if (req.method !== 'POST' || path !== '/api/v1/documents/upload') {
      next()
      return
    }
    try {
      await drainRequestBody(req)
      sendJson(res, 201, { message: 'Document received', received: true })
    } catch {
      sendJson(res, 500, { message: 'Upload stub failed' })
    }
  }

  return {
    name: 'capstone-upload-stub',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

const capstoneTarget = 'http://localhost:7070'

/** Scoped proxy so `/api/v1/documents/upload` is handled by the local stub, not Spring. */
const capstoneProxy = {
  '/api/v1/users': { target: capstoneTarget, changeOrigin: true },
  '/api/v1/profiles': { target: capstoneTarget, changeOrigin: true },
  '/api/v1/workdayentry': { target: capstoneTarget, changeOrigin: true },
} as const

// Proxies to Spring Boot capstone (capstoneproject, default port 7070)
export default defineConfig({
  plugins: [react(), capstoneUploadStubPlugin()],
  server: {
    proxy: { ...capstoneProxy },
  },
  preview: {
    proxy: { ...capstoneProxy },
  },
})
