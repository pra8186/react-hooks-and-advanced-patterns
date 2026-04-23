import { FileTransferBar } from './FileTransferBar'
import './EntityFileTransferBars.css'

export { FileTransferBar } from './FileTransferBar'

type EntityTransferMode = 'upload' | 'documentRemove'

/**
 * Per-file progress using {@link FileTransferBar} for both:
 * - **Device** — reading into the browser (same path for **Browse**, **drag & drop**, multi-select).
 * - **Server** — multipart upload after **Upload all**.
 *
 * `documentRemove` reuses the same two-bar layout for server-stored rows: ready + delete in progress.
 */
export function EntityFileTransferBars({
  fileName,
  localProgress,
  uploadProgress,
  isUploading,
  mode = 'upload',
}: {
  fileName: string
  localProgress: number
  uploadProgress: number
  isUploading: boolean
  mode?: EntityTransferMode
}) {
  const deviceDone = localProgress >= 100
  const isRemove = mode === 'documentRemove'

  const deviceAria = isRemove
    ? deviceDone
      ? `${fileName} is on the server list and ready to remove, 100%`
      : `${fileName} on server list, ${localProgress}%`
    : deviceDone
      ? `${fileName} finished reading on this device, 100%`
      : `Reading ${fileName} from this device into the browser (browse, drag and drop, or multi-select), ${localProgress}%`

  const serverAria = isRemove
    ? `Removing ${fileName} from the server, ${uploadProgress}%`
    : `Uploading ${fileName} to the server, ${uploadProgress}%`

  const deviceCaptionDone = isRemove
    ? 'Server list · ready'
    : 'Device · ready (browse, drag & drop, multi-file)'
  const deviceCaptionBusy = isRemove
    ? 'Server list · preparing'
    : 'Device · reading (browse, drag & drop, multi-file)'

  const serverCaption = isRemove ? 'Server · removing from list' : 'Server · uploading (Upload all)'

  return (
    <div className="entity-file-transfer-bars">
      <section
        className="entity-transfer-block"
        aria-label={
          isRemove ? 'Document status on server list' : 'Progress reading file on your device'
        }
      >
        <span className="entity-transfer-caption">{deviceDone ? deviceCaptionDone : deviceCaptionBusy}</span>
        <FileTransferBar percent={localProgress} ariaLabel={deviceAria} />
      </section>

      {isUploading && (
        <section
          className="entity-transfer-block"
          aria-label={isRemove ? 'Progress removing document from the server' : 'Progress uploading file to the server'}
        >
          <span className="entity-transfer-caption">{serverCaption}</span>
          <FileTransferBar percent={uploadProgress} ariaLabel={serverAria} />
        </section>
      )}
    </div>
  )
}
