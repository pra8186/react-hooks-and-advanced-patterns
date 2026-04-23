import axios, { type AxiosError } from 'axios'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png'])

function extensionOk(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase()
  return ext === 'pdf' || ext === 'jpg' || ext === 'jpeg' || ext === 'png'
}

function validateFile(file: File): string | null {
  if (file.size >= MAX_BYTES) {
    return `${file.name}: must be smaller than 10MB`
  }
  const mime = file.type?.toLowerCase() ?? ''
  const mimeOk = mime ? ALLOWED_MIME.has(mime) : extensionOk(file.name)
  if (!mimeOk) {
    return `${file.name}: only PDF, JPG, and PNG are allowed`
  }
  return null
}

let idCounter = 0
function nextId(): string {
  return `f-${Date.now()}-${++idCounter}`
}

export interface StagedFile {
  id: string
  file: File
}

export interface UseFileUploadOptions {
  /** POST target; default uses Vite proxy to capstone (7070). Override with full URL if needed. */
  uploadUrl?: string
  /** Multipart field name (Spring often uses `file`). */
  fileFieldName?: string
}

function defaultUploadUrl(): string {
  return import.meta.env.VITE_UPLOAD_URL ?? '/api/v1/documents/upload'
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
  return error.message || 'Upload failed'
}

export function useFileUpload(options: UseFileUploadOptions = {}) {
  const uploadUrl = options.uploadUrl ?? defaultUploadUrl()
  const fileFieldName = options.fileFieldName ?? 'file'

  const [files, setFiles] = useState<StagedFile[]>([])
  const [progress, setProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const filesRef = useRef<StagedFile[]>([])
  useEffect(() => {
    filesRef.current = files
  }, [files])

  const uploadingRef = useRef(false)

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const list = Array.from(incoming as Iterable<File>)
    const batchErrors: string[] = []
    const accepted: StagedFile[] = []

    for (const file of list) {
      const err = validateFile(file)
      if (err) batchErrors.push(err)
      else accepted.push({ id: nextId(), file })
    }

    if (batchErrors.length) {
      setErrors((prev) => [...prev, ...batchErrors])
    }
    if (accepted.length) {
      setFiles((prev) => [...prev, ...accepted])
    }
  }, [])

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const uploadAll = useCallback(async (): Promise<boolean> => {
    const queue = [...filesRef.current]
    if (!queue.length || uploadingRef.current) return false

    uploadingRef.current = true
    setIsUploading(true)
    setProgress(0)
    setErrors([])

    const totalBytes = queue.reduce((sum, { file }) => sum + file.size, 0) || 1
    let completedBytes = 0

    try {
      for (const { file } of queue) {
        const body = new FormData()
        body.append(fileFieldName, file)

        await axios.post(uploadUrl, body, {
          onUploadProgress: (evt) => {
            const slice = evt.loaded
            const combined = completedBytes + slice
            setProgress(Math.min(100, Math.round((combined / totalBytes) * 100)))
          },
        })

        completedBytes += file.size
        setProgress(Math.min(100, Math.round((completedBytes / totalBytes) * 100)))
      }

      setFiles([])
      setProgress(0)
      return true
    } catch (e) {
      if (axios.isAxiosError(e)) {
        setErrors([messageFromAxiosError(e)])
      } else {
        setErrors([e instanceof Error ? e.message : 'Upload failed'])
      }
      return false
    } finally {
      uploadingRef.current = false
      setIsUploading(false)
    }
  }, [uploadUrl, fileFieldName])

  return useMemo(
    () => ({
      files,
      addFiles,
      removeFile,
      uploadAll,
      progress,
      isUploading,
      errors,
    }),
    [files, addFiles, removeFile, uploadAll, progress, isUploading, errors],
  )
}
