import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { ModalShell } from '@/components/ModalShell'
import type { Quote } from '@/hooks/useQuotes'
import { formatToken, formatUsdcDisplay } from '@/lib/format'
import { SLIPPAGE_OPTIONS_BPS } from '@/lib/hagane'
import type { SelectedItem } from '@/lib/types'

/** The wallet only opens when the quote is younger than this. */
export const QUOTE_MAX_AGE_MS = 30_000

interface Props {
  open: boolean
  items: SelectedItem[]
  quotes: Map<string, Quote>
  totalOut: bigint
  minOut: bigint
  gasEstimate: bigint | undefined
  allowancesNeeded: number
  slippageBps: number
  onSlippage: (bps: number) => void
  /** Connected wallet's USDC, which pays gas on Arc. */
  gasBalance: bigint | undefined
  /** When the quotes were last read from the router, in ms. */
  quoteUpdatedAt: number
  onRefresh: () => void
  onConfirm: () => void
  onClose: () => void
}

/** Mounts only while open, so the quote age clock starts fresh each time. */
export function ConfirmDialog(p: Props) {
  return p.open ? <ConfirmBody {...p} /> : null
}

function ConfirmBody(p: Props) {
  const { onRefresh, onClose } = p
  const [now, setNow] = useState(() => Date.now())
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Age of the quote, ticking once a second while the dialog is open.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const age = p.quoteUpdatedAt === 0 ? Infinity : now - p.quoteUpdatedAt
  const fresh = age <= QUOTE_MAX_AGE_MS

  // Keep the quote current while the dialog is open: refresh as soon as it goes stale, and retry every 5 seconds.
  const retryTick = Math.floor(now / 5000)
  useEffect(() => {
    if (!fresh) onRefresh()
  }, [fresh, retryTick, onRefresh])

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  const net = p.gasEstimate !== undefined && p.totalOut > p.gasEstimate ? p.totalOut - p.gasEstimate : 0n

  return (
    <ModalShell labelledBy="confirm-title" kicker="Review" tone="seal" testId="confirm-dialog" onClose={onClose}>
      <h2 id="confirm-title" className="font-serif text-2xl font-medium tracking-wide text-mist">
        Confirm swap
      </h2>

      <div
        role="alert"
        data-testid="irreversible-warning"
        className="mt-5 flex items-start gap-3 border border-seal/70 bg-seal/10 p-4"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-seal" aria-hidden />
        <div className="text-sm">
          <div className="font-medium text-mist">This cannot be undone.</div>
          <p className="mt-1 leading-relaxed text-fog">
            Once confirmed, your tokens leave your wallet and are swapped to USDC. The swap cannot be reversed or
            refunded.
          </p>
        </div>
      </div>

      <ul className="mt-5 divide-y divide-vein/70 border-y border-vein/70">
        {p.items.map((i) => {
          const q = p.quotes.get(i.token.address.toLowerCase())
          return (
            <li key={i.token.address} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="text-mist">
                {i.token.symbol}{' '}
                <span className="tabular font-mono text-xs text-fog">
                  {i.amountRaw !== undefined ? formatToken(i.amountRaw, i.token.decimals) : '0'}
                </span>
              </span>
              <span className="tabular font-mono text-xs text-cyan">
                {q?.status === 'ok' ? `~${formatUsdcDisplay(q.out)}` : '...'}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.18em] text-fog">Slippage</span>
        <div className="flex gap-1" role="group" aria-label="Slippage tolerance">
          {SLIPPAGE_OPTIONS_BPS.map((bps) => (
            <button
              key={bps}
              type="button"
              aria-pressed={p.slippageBps === bps}
              onClick={() => p.onSlippage(bps)}
              className={`tabular min-h-11 min-w-14 rounded-sm border px-3 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan ${
                p.slippageBps === bps
                  ? 'border-cyan text-cyan'
                  : 'border-vein text-fog hover:border-fog/50 hover:text-mist'
              }`}
            >
              {bps / 100}%
            </button>
          ))}
        </div>
      </div>

      <dl className="mt-4 space-y-2.5 text-sm">
        <Row label="Estimated received" value={`~${formatUsdcDisplay(p.totalOut)} USDC`} />
        <Row
          label="Estimated gas"
          value={p.gasEstimate === undefined ? '-' : `~${formatUsdcDisplay(p.gasEstimate)} USDC`}
        />
        <Row label="Estimated net" value={`~${formatUsdcDisplay(net)} USDC`} strong />
        <Row label="Minimum expected" value={`${formatUsdcDisplay(p.minOut)} USDC`} />
        <Row
          label="USDC for gas"
          value={p.gasBalance === undefined ? '-' : `${formatUsdcDisplay(p.gasBalance)} USDC`}
        />
        <Row
          label="Wallet prompts"
          value={`${p.allowancesNeeded + 2}${p.allowancesNeeded > 0 ? ` (${p.allowancesNeeded} one-time allowance)` : ''}`}
        />
      </dl>

      <p className={`mt-4 text-xs ${fresh ? 'text-fog' : 'text-warn'}`} aria-live="polite">
        {fresh
          ? `Quote updated ${Math.max(0, Math.round(age / 1000))}s ago. It keeps refreshing while this is open.`
          : 'Quote is out of date. Refreshing before your wallet opens...'}
      </p>

      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 flex-1 rounded-sm border border-vein px-5 text-sm text-fog transition-colors hover:border-fog/50 hover:text-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
        >
          Back
        </button>
        <button
          ref={confirmRef}
          type="button"
          disabled={!fresh || p.items.length === 0}
          onClick={p.onConfirm}
          className="min-h-12 flex-[1.4] rounded-sm bg-cyan px-5 text-sm font-semibold tracking-wide text-sumi transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:cursor-not-allowed disabled:opacity-35"
        >
          I understand, swap
        </button>
      </div>
    </ModalShell>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-fog">{label}</dt>
      <dd className={`tabular font-mono text-xs ${strong ? 'text-sm text-mist' : 'text-mist'}`}>{value}</dd>
    </div>
  )
}
