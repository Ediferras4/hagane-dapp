import { X } from 'lucide-react'

export interface DeselectNotice {
  id: string
  text: string
}

interface Props {
  notices: DeselectNotice[]
  onDismiss: (id: string) => void
}

/** Warnings for tokens that were deselected because their price moved out of the allowed range. */
export function DeselectNotices({ notices, onDismiss }: Props) {
  if (notices.length === 0) return null
  return (
    <div className="mb-6 space-y-2" data-testid="deselect-notices">
      {notices.map((n) => (
        <div key={n.id} role="alert" className="flex items-start gap-3 border border-warn/50 bg-warn/5 p-3 text-sm">
          <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-warn" />
          <p className="flex-1 text-mist">{n.text}</p>
          <button
            type="button"
            onClick={() => onDismiss(n.id)}
            aria-label="Dismiss warning"
            className="flex size-9 shrink-0 items-center justify-center rounded-sm text-fog transition-colors hover:text-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
