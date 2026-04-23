import axios, { type AxiosError } from 'axios'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png'])

function extensionOk(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase()
  return ext === 'pdf' || ext === 'jpg' || ext === 'jpeg' || ext === 'png'
}

/** `null` if the file passes the same checks as `addFiles`; otherwise a single-line message. */
export function validateUploadCandidate(file: File): string | null {
  if (file.size >= UPLOAD_MAX_BYTES) {
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

/** Read file into the browser with progress (same underlying read the engine uses for upload bodies). */
function readFileIntoBrowser(
  file: File,
  onFilePercent: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onFilePercent(Math.min(100, Math.round((e.loaded / e.total) * 100)))
      }
    }
    reader.onload = () => {
      onFilePercent(100)
      resolve()
    }
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`))
    reader.readAsArrayBuffer(file)
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function useFileUpload(options: UseFileUploadOptions = {}) {
  const uploadUrl = options.uploadUrl ?? defaultUploadUrl()
  const fileFieldName = options.fileFieldName ?? 'file'

  const [files, setFiles] = useState<StagedFile[]>([])
  const [progress, setProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  /** 1-based index of the file currently uploading; 0 when idle. */
  const [uploadFileIndex, setUploadFileIndex] = useState(0)
  const [uploadFileTotal, setUploadFileTotal] = useState(0)
  const [uploadCurrentName, setUploadCurrentName] = useState<string | null>(null)

  const [localIngestProgress, setLocalIngestProgress] = useState(0)
  const [isLocalIngesting, setIsLocalIngesting] = useState(false)
  const [localIngestFileIndex, setLocalIngestFileIndex] = useState(0)
  const [localIngestFileTotal, setLocalIngestFileTotal] = useState(0)
  const [localIngestCurrentName, setLocalIngestCurrentName] = useState<string | null>(null)

  const filesRef = useRef<StagedFile[]>([])
  useEffect(() => {
    filesRef.current = files
  }, [files])

  const uploadingRef = useRef(false)
  const ingestingRef = useRef(false)

  const addFiles = useCallback(async (incoming: FileList | File[]) => {
    if (uploadingRef.current || ingestingRef.current) return

    const list = Array.from(incoming as Iterable<File>)
    const batchErrors: string[] = []
    const validFiles: File[] = []

    for (const file of list) {
      const err = validateUploadCandidate(file)
      if (err) batchErrors.push(err)
      else validFiles.push(file)
    }

    if (batchErrors.length) {
      setErrors((prev) => [...prev, ...batchErrors])
    }
    if (validFiles.length === 0) return

    ingestingRef.current = true
    setIsLocalIngesting(true)
    setLocalIngestProgress(0)
    setLocalIngestFileTotal(validFiles.length)
    setLocalIngestFileIndex(0)
    setLocalIngestCurrentName(null)

    const totalBytes = validFiles.reduce((sum, f) => sum + f.size, 0) || 1
    let completedBytes = 0

    try {
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i]!
        setLocalIngestFileIndex(i + 1)
        setLocalIngestCurrentName(file.name)

        await readFileIntoBrowser(file, (filePct) => {
          const slice = (filePct / 100) * file.size
          setLocalIngestProgress(
            Math.min(100, Math.round(((completedBytes + slice) / totalBytes) * 100)),
          )
        })

        completedBytes += file.size
        setLocalIngestProgress(Math.min(100, Math.round((completedBytes / totalBytes) * 100)))
      }

      const staged: StagedFile[] = validFiles.map((file) => ({ id: nextId(), file }))
      setFiles((prev) => [...prev, ...staged])
      setLocalIngestProgress(100)
      await delay(380)
    } catch (e) {
      setErrors((prev) => [
        ...prev,
        e instanceof Error ? e.message : 'Could not read file from this device',
      ])
    } finally {
      ingestingRef.current = false
      setIsLocalIngesting(false)
      setLocalIngestProgress(0)
      setLocalIngestFileIndex(0)
      setLocalIngestFileTotal(0)
      setLocalIngestCurrentName(null)
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
    setUploadFileTotal(queue.length)
    setUploadFileIndex(0)
    setUploadCurrentName(null)

    const totalBytes = queue.reduce((sum, { file }) => sum + file.size, 0) || 1
    let completedBytes = 0

    try {
      for (let i = 0; i < queue.length; i++) {
        const { file } = queue[i]!
        setUploadFileIndex(i + 1)
        setUploadCurrentName(file.name)

        const body = new FormData()
        body.append(fileFieldName, file)

        await axios.post(uploadUrl, body, {
          onUploadProgress: (evt) => {
            const slice =
              evt.total && evt.total > 0
                ? Math.min((evt.loaded / evt.total) * file.size, file.size)
                : Math.min(evt.loaded, file.size)
            const combined = completedBytes + slice
            setProgress(Math.min(100, Math.round((combined / totalBytes) * 100)))
          },
        })

        completedBytes += file.size
        setProgress(Math.min(100, Math.round((completedBytes / totalBytes) * 100)))
      }

      setFiles([])
      setProgress(100)
      setUploadFileIndex(0)
      setUploadFileTotal(0)
      setUploadCurrentName(null)
      return true
    } catch (e) {
      setProgress(0)
      if (axios.isAxiosError(e)) {
        setErrors([messageFromAxiosError(e)])
      } else {
        setErrors([e instanceof Error ? e.message : 'Upload failed'])
      }
      return false
    } finally {
      uploadingRef.current = false
      setIsUploading(false)
      setUploadFileIndex(0)
      setUploadFileTotal(0)
      setUploadCurrentName(null)
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
      uploadFileIndex,
      uploadFileTotal,
      uploadCurrentName,
      isLocalIngesting,
      localIngestProgress,
      localIngestFileIndex,
      localIngestFileTotal,
      localIngestCurrentName,
    }),
    [
      files,
      addFiles,
      removeFile,
      uploadAll,
      progress,
      isUploading,
      errors,
      uploadFileIndex,
      uploadFileTotal,
      uploadCurrentName,
      isLocalIngesting,
      localIngestProgress,
      localIngestFileIndex,
      localIngestFileTotal,
      localIngestCurrentName,
    ],
  )
}
