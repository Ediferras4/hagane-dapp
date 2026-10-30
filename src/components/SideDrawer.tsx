import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ChevronRight, Globe, Info, LifeBuoy, LogOut, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useAccount, useDisconnect } from 'wagmi'
import { Logo } from '@/components/Logo'
import { shortAddress } from '@/lib/hagane'

interface Props {
  open: boolean
  onClose: () => void
}

const sectionLabel = 'px-6 pb-2 pt-6 font-mono text-[10px] uppercase tracking-widest text-lichen'
const iconBox =
  'flex size-9 shrink-0 items-center justify-center rounded-full border border-vein text-fog'
const rowBase =
  'flex min-h-14 w-full items-center gap-3 px-6 py-2.5 text-left transition-colors'

/** A clickable menu row: small icon on the left, title and subtitle, chevron on the right. */
function Item({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${rowBase} hover:bg-white/[0.03] focus-visible:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan`}
    >
      <span className={iconBox} aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-mist">{title}</span>
        <span className="block truncate text-xs text-fog">{subtitle}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-fog/70" aria-hidden />
    </button>
  )
}

export function SideDrawer({ open, onClose }: Props) {
  const reduce = useReducedMotion()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [copied, setCopied] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Escape closes, the page behind does not scroll while the drawer is open, and focus moves into the drawer.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  const copyAddress = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy the address. Select it manually instead.')
    }
  }

  const soon = (what: string) => () => toast.info(`${what} is coming soon.`)

  const duration = reduce ? 0 : 0.28

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="drawer-backdrop"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration }}
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            key="drawer-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            tabIndex={-1}
            className="fixed inset-y-0 right-0 z-40 flex h-dvh w-[min(100%,360px)] flex-col border-l border-vein bg-[rgb(var(--c-bg))] outline-none"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center justify-between gap-3 px-6 py-5">
              <div className="flex min-w-0 items-center gap-3">
                <Logo size={36} />
                <span className="font-sans text-lg font-bold tracking-tight text-mist">Hagane</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-mist transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
              >
                <ArrowLeft className="size-5" aria-hidden />
              </button>
            </div>
            <div className="h-px bg-vein/60" />

            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
              <div className={sectionLabel}>Account</div>

              <div className={rowBase}>
                <span className={iconBox} aria-hidden>
                  <Wallet className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-mist">Wallet</span>
                  <span className="tabular block truncate font-mono text-xs text-fog">
                    {isConnected && address ? shortAddress(address) : 'Not connected'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void copyAddress()}
                  disabled={!isConnected || !address}
                  aria-label="Copy wallet address"
                  className="min-h-9 shrink-0 rounded-full border border-vein px-3 font-mono text-[10px] uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan disabled:cursor-not-allowed disabled:text-fog/50 disabled:hover:bg-transparent"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              <Item
                icon={<Globe className="size-4" />}
                title="Language"
                subtitle="English · Português · Español"
                onClick={soon('Language selection')}
              />

              <div className={sectionLabel}>Protocol</div>
              <Item
                icon={<Info className="size-4" />}
                title="How it works"
                subtitle="3 steps & limits"
                onClick={soon('The guide')}
              />
              <Item
                icon={<LifeBuoy className="size-4" />}
                title="Support"
                subtitle="Help with Hagane"
                onClick={soon('Support')}
              />
            </div>

            <div className="space-y-4 border-t border-vein/60 px-6 pb-6 pt-5">
              <button
                type="button"
                disabled={!isConnected}
                onClick={() => {
                  disconnect()
                  onClose()
                }}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-sm border border-vein px-4 font-mono text-[11px] uppercase tracking-widest text-mist transition-colors hover:border-seal/70 hover:text-seal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-vein disabled:hover:text-mist"
              >
                Disconnect wallet
                <LogOut className="size-4" aria-hidden />
              </button>

              <div className="flex items-center gap-3 border border-vein/60 px-4 py-3">
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-emerald-400" />
                <div className="leading-tight">
                  <div className="text-sm font-medium text-mist">Arc Network</div>
                  <div className="text-xs text-fog">Testnet interface</div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-widest text-lichen">
                <span>Less is more</span>
                <span>Hagane © 2026</span>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
