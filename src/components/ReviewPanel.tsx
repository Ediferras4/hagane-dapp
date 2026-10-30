import { Loader2 } from 'lucide-react'
import { ConnectButton } from '@/components/Header'
import type { FlowState } from '@/hooks/useBatchSwap'
import type { Quote } from '@/hooks/useQuotes'
import { formatUsdcDisplay } from '@/lib/format'
import { CHAIN } from '@/lib/hagane'
import type { SelectedItem } from '@/lib/types'

interface Props {
  isConnected: boolean
  wrongChain: boolean
  switching: boolean
  onSwitch: () => void
  items: SelectedItem[]
  quotes: Map<string, Quote>
  totalOut: bigint
  blockReason: string | null
  onSubmit: () => void
  flow: FlowState
  notice: string | null
}

/** Main screen summary: the estimated total and one button. Every detail lives in the review modal. */
export function ReviewPanel(p: Props) {
  const busy = p.flow.status === 'waiting' || p.flow.status === 'processing'
  const anyLoading = p.items.some((i) => p.quotes.get(i.token.address.toLowerCase())?.status === 'loading')

  let cta: React.ReactNode
  if (!p.isConnected) {
    cta = <ConnectButton className="w-full" />
  } else if (p.wrongChain) {
    cta = (
      <button
        type="button"
        onClick={p.onSwitch}
        disabled={p.switching}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-sm bg-[#71977a] px-5 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-sumi transition-all hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
      >
        {p.switching ? 'Switching...' : `Switch to ${CHAIN.name}`}
      </button>
    )
  } else {
    const disabled = busy || p.blockReason !== null || anyLoading
    cta = (
      <>
        <button type="button" onClick={p.onSubmit} disabled={disabled} className="flex h-10 w-full items-center justify-center gap-2 rounded-sm bg-[#71977a] px-5 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-sumi transition-all hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100">
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {p.flow.status === 'waiting' ? 'Confirm in wallet...' : 'Processing...'}
            </>
          ) : (
            'Review →'
          )}
        </button>
      </>
    )
  }

  return (
    <section
      aria-labelledby="review-heading"
      className="border border-[#2b3933] bg-[#171f1c]/90 backdrop-blur-md p-4 sm:p-5 desk:sticky desk:top-24"
    >
      <h2 id="review-heading" className="font-serif text-xl font-medium tracking-wide text-mist">
        Review
      </h2>

      <div className="mt-4">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-fog">Estimated you receive</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="tabular font-mono text-4xl font-medium tracking-wide text-mist">
            {formatUsdcDisplay(p.totalOut)}
          </span>
          <span className="font-mono text-sm tracking-wider text-fog">USDC</span>
        </div>
      </div>

      <div className="mt-4">{cta}</div>

      {p.notice && p.flow.status === 'idle' && <p className="mt-2 text-xs text-fog">{p.notice}</p>}
    </section>
  )
}
