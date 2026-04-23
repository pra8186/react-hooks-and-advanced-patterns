import { FileTransferBar } from './FileTransferBar'
import './EntityFileTransferBars.css'

export { FileTransferBar } from './FileTransferBar'

/**
 * Per-file progress using {@link FileTransferBar} for both:
 * - **Device** — reading into the browser (same path for **Browse**, **drag & drop**, multi-select).
 * - **Server** — multipart upload after **Upload all**.
 */
export function EntityFileTransferBars({
  fileName,
  localProgress,
  uploadProgress,
  isUploading,
}: {
  fileName: string
  localProgress: number
  uploadProgress: number
  isUploading: boolean
}) {
  const deviceDone = localProgress >= 100
  const deviceAria = deviceDone
    ? `${fileName} finished reading on this device, 100%`
    : `Reading ${fileName} from this device into the browser (browse, drag and drop, or multi-select), ${localProgress}%`

  const serverAria = `Uploading ${fileName} to the server, ${uploadProgress}%`

  return (
    <div className="entity-file-transfer-bars">
      <section className="entity-transfer-block" aria-label="Progress reading file on your device">
        <span className="entity-transfer-caption">
          {deviceDone ? 'Device · ready (browse, drag & drop, multi-file)' : 'Device · reading (browse, drag & drop, multi-file)'}
        </span>
        <FileTransferBar percent={localProgress} ariaLabel={deviceAria} />
      </section>

      {isUploading && (
        <section className="entity-transfer-block" aria-label="Progress uploading file to the server">
          <span className="entity-transfer-caption">Server · uploading (Upload all)</span>
          <FileTransferBar percent={uploadProgress} ariaLabel={serverAria} />
        </section>
      )}
    </div>
  )
}
