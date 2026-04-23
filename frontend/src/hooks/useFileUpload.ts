import axios, { type AxiosError } from 'axios'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type DocumentEntityValue,
  inferDocumentEntityFromFileName,
} from '../domain/documentEntities'

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

export function isImageStagedFile(file: File): boolean {
  const t = file.type?.toLowerCase() ?? ''
  if (t === 'image/jpeg' || t === 'image/png') return true
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext === 'jpg' || ext === 'jpeg' || ext === 'png'
}

let idCounter = 0
function nextId(): string {
  return `f-${Date.now()}-${++idCounter}`
}

export interface StagedFile {
  id: string
  file: File
  /** Data URL from FileReader for images; null for PDF or before load. */
  previewUrl: string | null
  /** Reading file into the browser (FileReader), 0–100. */
  localProgress: number
  /** Uploading this file to the server, 0–100. */
  uploadProgress: number
  /**
   * Tax / finance document category (required before upload). Values align with
   * Java-style enum names for future capstone DTOs (`W2`, `FORM_1099`, …).
   */
  entityType: DocumentEntityValue | null
  /** True when `entityType` was set by filename inference at ingest time. */
  entityTypeAutoDetected: boolean
}

/** Overall 0–100% from per-file progress weighted by file size (multi-file selection). */
export function aggregateProgressForFiles(
  items: StagedFile[],
  key: 'localProgress' | 'uploadProgress',
): number {
  if (!items.length) return 0
  const total = items.reduce((s, f) => s + f.file.size, 0) || 1
  const done = items.reduce((s, f) => s + (f[key] / 100) * f.file.size, 0)
  return Math.min(100, Math.round((done / total) * 100))
}

export interface UseFileUploadOptions {
  uploadUrl?: string
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

function readAsDataURLWithProgress(
  file: File,
  onPercent: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onPercent(Math.min(100, Math.round((e.loaded / e.total) * 100)))
      }
    }
    reader.onload = () => {
      onPercent(100)
      const r = reader.result
      if (typeof r === 'string') resolve(r)
      else reject(new Error(`Could not preview ${file.name}`))
    }
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

function readAsArrayBufferWithProgress(
  file: File,
  onPercent: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onPercent(Math.min(100, Math.round((e.loaded / e.total) * 100)))
      }
    }
    reader.onload = () => {
      onPercent(100)
      resolve()
    }
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`))
    reader.readAsArrayBuffer(file)
  })
}

export function useFileUpload(options: UseFileUploadOptions = {}) {
  const uploadUrl = options.uploadUrl ?? defaultUploadUrl()
  const fileFieldName = options.fileFieldName ?? 'file'

  const [files, setFiles] = useState<StagedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [isLocalIngesting, setIsLocalIngesting] = useState(false)
  /** Staged file ids for the current add-files batch (for overall local progress). */
  const [ingestBatchIds, setIngestBatchIds] = useState<string[]>([])

  const filesRef = useRef<StagedFile[]>([])
  useEffect(() => {
    filesRef.current = files
  }, [files])

  const uploadingRef = useRef(false)
  const ingestingRef = useRef(false)

  const patchFile = useCallback(
    (
      id: string,
      partial: Partial<
        Pick<
          StagedFile,
          | 'previewUrl'
          | 'localProgress'
          | 'uploadProgress'
          | 'entityType'
          | 'entityTypeAutoDetected'
        >
      >,
    ) => {
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...partial } : f)))
    },
    [],
  )

  const setFileEntityType = useCallback((id: string, entityType: DocumentEntityValue) => {
    patchFile(id, { entityType, entityTypeAutoDetected: false })
  }, [patchFile])

  const ingestOne = useCallback(
    async (id: string, file: File) => {
      if (isImageStagedFile(file)) {
        const dataUrl = await readAsDataURLWithProgress(file, (pct) => patchFile(id, { localProgress: pct }))
        patchFile(id, { previewUrl: dataUrl, localProgress: 100 })
      } else {
        await readAsArrayBufferWithProgress(file, (pct) => patchFile(id, { localProgress: pct }))
        patchFile(id, { localProgress: 100 })
      }
    },
    [patchFile],
  )

  const addFiles = useCallback(
    async (incoming: FileList | File[]) => {
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

      const newItems: StagedFile[] = validFiles.map((file) => {
        const inferred = inferDocumentEntityFromFileName(file.name)
        return {
          id: nextId(),
          file,
          previewUrl: null,
          localProgress: 0,
          uploadProgress: 0,
          entityType: inferred,
          entityTypeAutoDetected: inferred !== null,
        }
      })

      const batchIds = new Set(newItems.map((n) => n.id))
      const batchIdList = newItems.map((n) => n.id)
      setFiles((prev) => [...prev, ...newItems])
      ingestingRef.current = true
      setIngestBatchIds(batchIdList)
      setIsLocalIngesting(true)

      try {
        await Promise.all(newItems.map((item) => ingestOne(item.id, item.file)))
      } catch (e) {
        setErrors((prev) => [
          ...prev,
          e instanceof Error ? e.message : 'Could not read file from this device',
        ])
        setFiles((prev) => prev.filter((f) => !batchIds.has(f.id)))
      } finally {
        ingestingRef.current = false
        setIsLocalIngesting(false)
        setIngestBatchIds([])
      }
    },
    [ingestOne],
  )

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const uploadAll = useCallback(async (): Promise<boolean> => {
    const queue = [...filesRef.current]
    if (!queue.length || uploadingRef.current) return false

    const missingType = queue.some((item) => !item.entityType)
    if (missingType) {
      setErrors(['Every file must have a document type selected before upload.'])
      return false
    }

    uploadingRef.current = true
    setIsUploading(true)
    setErrors([])
    setFiles((prev) => prev.map((f) => ({ ...f, uploadProgress: 0 })))

    try {
      for (const item of queue) {
        const { id, file, entityType } = item
        const body = new FormData()
        body.append(fileFieldName, file)
        if (entityType) {
          body.append('entityType', entityType)
        }

        await axios.post(uploadUrl, body, {
          onUploadProgress: (evt) => {
            let pct: number
            if (evt.total && evt.total > 0) {
              pct = Math.min(100, Math.round((evt.loaded / evt.total) * 100))
            } else {
              pct = Math.min(100, Math.round((evt.loaded / Math.max(file.size, 1)) * 100))
            }
            patchFile(id, { uploadProgress: pct })
          },
        })

        patchFile(id, { uploadProgress: 100 })
      }

      setFiles([])
      return true
    } catch (e) {
      setFiles((prev) => prev.map((f) => ({ ...f, uploadProgress: 0 })))
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
  }, [uploadUrl, fileFieldName, patchFile])

  return useMemo(
    () => ({
      files,
      addFiles,
      removeFile,
      uploadAll,
      setFileEntityType,
      isUploading,
      errors,
      isLocalIngesting,
      ingestBatchIds,
    }),
    [
      files,
      addFiles,
      removeFile,
      uploadAll,
      setFileEntityType,
      isUploading,
      errors,
      isLocalIngesting,
      ingestBatchIds,
    ],
  )
}
