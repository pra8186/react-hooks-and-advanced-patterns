import './FileTransferBar.css'

export function FileTransferBar({
  percent,
  ariaLabel,
  variant = 'inline',
}: {
  percent: number
  ariaLabel: string
  /** `global` = larger bar (overall batch, same yellow style as earlier full-width UI). */
  variant?: 'inline' | 'global'
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)))
  const wrapClass =
    variant === 'global'
      ? 'file-transfer-bar-wrap file-transfer-bar-wrap--global'
      : 'file-transfer-bar-wrap'
  return (
    <div className={wrapClass}>
      <progress className="visually-hidden" max={100} value={clamped} aria-label={ariaLabel} />
      <div className="file-transfer-track" aria-hidden>
        <div className="file-transfer-fill" style={{ width: `${clamped}%` }} />
      </div>
      <span className="file-transfer-overlay-pct">{clamped}%</span>
    </div>
  )
}
