import { useEffect, useRef, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

interface Props {
  /** id of the heading inside `children`, used as the dialog's accessible name. */
  labelledBy: string
  /** Small label above the title, for example "Review". */
  kicker: string
  /** Tone of the dot next to the kicker. */
  tone?: 'seal' | 'cyan' | 'warn'
  testId?: string
  /** When set, Escape and a click on the backdrop close the modal. Leave it out for modals that must not be dismissed. */
  onClose?: () => void
  children: ReactNode
}

const DOT = { seal: 'bg-seal', cyan: 'bg-cyan', warn: 'bg-warn' } as const

/** Shared frame for the Review, Processing and Result modals: same surface, border and motion as the rest of Hagane. */
export function ModalShell({ labelledBy, kicker, tone = 'seal', testId, onClose, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()

  // Move focus into the modal (unless a child already took it) and stop the page behind from scrolling.
  useEffect(() => {
    const el = panelRef.current
    if (el && !el.contains(document.activeElement)) el.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-sumi/80 backdrop-blur-sm sm:items-center sm:p-5"
      onClick={onClose}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto border border-vein bg-moss p-6 outline-none sm:p-7"
      >
        <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-fog">
          <span aria-hidden className={`size-1.5 rounded-full ${DOT[tone]}`} />
          {kicker}
        </div>
        {children}
      </motion.div>
    </div>
  )
}
