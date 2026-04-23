import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Capstone Java app has no multipart upload endpoint yet. This drains the body so
 * axios onUploadProgress completes, then returns 201 — other /api routes still proxy to Boot.
 */
function capstoneUploadStubPlugin(): Plugin {
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
