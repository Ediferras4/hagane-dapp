import { Check, ExternalLink } from 'lucide-react'
import { ModalShell } from '@/components/ModalShell'
import type { SwapResult } from '@/hooks/useBatchSwap'
import { formatToken } from '@/lib/format'
import { CHAIN } from '@/lib/hagane'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { formatUnitsExact, formatUnitsFixed } from '@/onchain-money'

interface Props {
  result: SwapResult
  onDone: () => void
}

const TITLE = {
  success: 'Swap complete',
  partial: 'Partly complete',
  failed: 'Nothing was converted',
} as const

const KICKER = { success: 'Success', partial: 'Partial', failed: 'Error' } as const
const TONE = { success: 'cyan', partial: 'warn', failed: 'seal' } as const

/** Final screen after a swap: real USDC received, what converted, gas spent, and why anything failed. */
export function ResultModal({ result, onDone }: Props) {
  const converted = result.tokens.filter((t) => t.ok)
  const failed = result.tokens.filter((t) => !t.ok)

  return (
    <ModalShell
      labelledBy="result-title"
      kicker={`Result · ${KICKER[result.outcome]}`}
      tone={TONE[result.outcome]}
      testId="result-panel"
      onClose={onDone}
    >
      <h2 id="result-title" className="font-serif text-2xl font-medium tracking-wide text-mist">
        {TITLE[result.outcome]}
      </h2>

      <div className="mt-5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-fog">USDC received</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="tabular font-mono text-4xl font-medium tracking-wide text-mist">
            {result.usdcOut !== undefined ? formatUnitsFixed(result.usdcOut, 6, 4) : '0.0000'}
          </span>
          <span className="text-sm text-fog">USDC</span>
        </div>
      </div>

      <dl className="mt-6 space-y-2.5 border-t border-vein pt-5 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-fog">Tokens converted</dt>
          <dd className="tabular font-mono text-xs text-mist">
            {converted.length} of {result.tokens.length}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-fog">Gas spent</dt>
          <dd className="tabular font-mono text-xs text-mist">{formatUnitsExact(result.gasSpent, 6)} USDC</dd>
        </div>
      </dl>

      {converted.length > 0 && (
        <ul className="mt-5 divide-y divide-vein/70 border-y border-vein/70" aria-label="Converted tokens">
          {converted.map((t) => (
            <li key={t.token} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span className="flex items-center gap-2 text-mist">
                <Check className="size-4 text-cyan" aria-hidden />
                {t.symbol}
              </span>
              <span className="tabular font-mono text-xs text-fog">{formatToken(t.converted, t.decimals)}</span>
            </li>
          ))}
        </ul>
      )}

      {failed.length > 0 && (
        <div className="mt-5 border border-warn/50 bg-warn/5 p-4" role="alert" data-testid="result-failures">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-warn">
            <span aria-hidden className="size-2 rounded-full bg-warn" />
            Not converted
          </div>
          <p className="mt-1 text-xs text-fog">These stay in your wallet and remain available for the next batch.</p>
          <ul className="mt-3 space-y-2">
            {failed.map((t) => (
              <li key={t.token} className="text-sm">
                <span className="font-medium text-mist">{t.symbol}</span>
                <span className="text-fog"> · {t.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        {result.hash ? (
          <a
            href={buildTxExplorerUrl(CHAIN.id, result.hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 text-xs text-cyan underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan"
          >
            View on explorer <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : (
          <span />
        )}
        <button
          type="button"
          autoFocus
          onClick={onDone}
          className="min-h-12 rounded-sm bg-cyan px-7 text-sm font-semibold tracking-wide text-sumi transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
        >
          {failed.length > 0 ? 'Back to tokens' : 'Done'}
        </button>
      </div>
    </ModalShell>
  )
}
