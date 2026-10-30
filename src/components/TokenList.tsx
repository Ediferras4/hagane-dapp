import { Check, X } from 'lucide-react'
import type { Address } from 'viem'
import type { Quote } from '@/hooks/useQuotes'
import type { WalletToken } from '@/hooks/useTokenList'
import { REASON_LABEL, formatUsd, reasonDetail, type Eligibility } from '@/lib/eligibility'
import { formatToken } from '@/lib/format'
import { MAX_TOKENS, shortAddress } from '@/lib/hagane'
import type { SelectedItem } from '@/lib/types'
import { formatUnitsFixed } from '@/onchain-money'
import './TokenPanel.css'

interface Props {
  isConnected: boolean
  isLoading: boolean
  isError: boolean
  tokens: WalletToken[]
  selected: Map<string, SelectedItem>
  quotes: Map<string, Quote>
  eligibility: Map<string, Eligibility>
  canSuggest: boolean
  noEligible: boolean
  onSuggest: () => void
  onClear: () => void
  onToggle: (token: WalletToken) => void
  onRemoveCustom: (address: Address) => void
  locked: boolean
  summary: {
    othersValue: bigint | undefined
    tokenCount: number
    usdc: bigint | undefined
    total: bigint | undefined
  }
  scanning: boolean
  liveSeconds: number
  onScan: () => void
  onLive: () => void
}

const usd = (v: bigint | undefined, prefix = ''): string =>
  v === undefined ? '--' : `${prefix}$${formatUnitsFixed(v, 6, 2)}`

function Skeleton() {
  return (
    <div className="space-y-px" aria-busy="true" aria-label="Loading tokens">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex min-h-[64px] items-center gap-4 px-3">
          <div className="size-5 animate-pulse rounded-sm bg-pine" />
          <div className="size-9 animate-pulse rounded-full bg-pine" />
          <div className="space-y-2">
            <div className="h-3 w-16 animate-pulse rounded bg-pine" />
            <div className="h-2.5 w-24 animate-pulse rounded bg-pine" />
          </div>
        </div>
      ))}
    </div>
  )
}

function Warning({ elig }: { elig: Eligibility }) {
  if (elig.status !== 'ineligible') return null
  const detail = reasonDetail(elig)
  return (
    <span className="mt-1.5 block leading-snug text-warn" data-testid="eligibility-warning">
      <span className="flex items-center gap-2 font-sans text-[13px] font-semibold">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-warn" />
        {REASON_LABEL[elig.reason]}
      </span>
      {detail && <span className="tabular mt-0.5 block pl-4 font-sans text-xs font-normal text-warn/55">{detail}</span>}
    </span>
  )
}

export function TokenList(props: Props) {
  const { isConnected, isLoading, isError, tokens, selected, quotes, eligibility, locked } = props
  const count = selected.size

  return (
    <section aria-label="Your tokens" className="panel hagane-tokens border border-[#2b3933] bg-[#171f1c]/90 backdrop-blur-md">
      <div className="sub-panel">
        <div className="panel-top-layout">
          <div className="panel-action-group">
            <button
              className="panel-circle-btn"
              type="button"
              onClick={props.onScan}
              disabled={!isConnected}
              aria-label="Scan wallet for tokens"
            >
              <span className={`scan-anim-icon${props.scanning ? ' is-scanning' : ''}`} aria-hidden>
                ⌖
              </span>
            </button>
            <span className="panel-circle-label">scan</span>
          </div>
          <div className="panel-center-info">
            <div className="panel-main-kicker">Other tokens</div>
            <div className="panel-main-amount">{usd(props.summary.othersValue, '~')}</div>
            <div className="panel-main-count">
              {isConnected ? `${props.summary.tokenCount} tokens found` : 'wallet not connected'}
            </div>
          </div>
          <div className="panel-action-group">
            <button
              className="panel-circle-btn"
              type="button"
              onClick={props.onLive}
              disabled={!isConnected}
              aria-label="Refresh prices now"
            >
              <span className="live-countdown-val">{isConnected ? `${props.liveSeconds}s` : '--'}</span>
            </button>
            <span className="panel-circle-label">live</span>
          </div>
        </div>
        <div className="panel-stats-grid">
          <div>
            <div className="panel-stat-label">USDC BALANCE</div>
            <div className="panel-stat-value">{usd(props.summary.usdc)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="panel-stat-label">TOTAL BALANCE</div>
            <div className="panel-stat-value">{usd(props.summary.total)}</div>
          </div>
        </div>
      </div>

      {isConnected && !isLoading && tokens.length > 0 && props.noEligible && (
        <div role="status" data-testid="no-eligible" className="token-banner px-4 py-8 text-center">
          <p className="font-serif text-lg font-medium text-mist">No eligible tokens found</p>
          <p className="mt-1.5 text-sm text-lichen">These tokens can't be swapped right now, and why:</p>
        </div>
      )}

      <div className="token-scroll">
        {!isConnected && (
          <p className="py-12 text-center text-sm text-fog">Connect your wallet to see your tokens.</p>
        )}

        {isConnected && isLoading && <Skeleton />}

        {isConnected && !isLoading && isError && (
          <p role="alert" className="py-12 text-center text-sm text-seal">
            Could not read your balances from Arc Mainnet. Retrying shortly.
          </p>
        )}

        {isConnected && !isLoading && !isError && tokens.length === 0 && (
          <p className="py-12 text-center text-sm text-fog">
            No tokens found in this wallet yet.
          </p>
        )}

        {isConnected && !isLoading && tokens.length > 0 && (
          <ul>
            {tokens.map((t) => {
              const key = t.address.toLowerCase()
              const item = selected.get(key)
              const checked = item !== undefined
              const elig: Eligibility = eligibility.get(key) ?? { status: 'loading' }
              const eligible = elig.status === 'eligible'
              const limitHit = !checked && count >= MAX_TOKENS
              const disabled = locked || (!checked && !eligible) || limitHit
              const quote = quotes.get(key)
              return (
                <li
                  key={t.address}
                  className={`token-row${checked ? ' is-selected' : ''}`}
                >
                  {checked && <span aria-hidden className="absolute inset-y-0 left-0 w-px bg-cyan" />}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 sm:px-4">
                    <label
                      className={`flex min-h-12 min-w-0 flex-1 basis-60 items-start gap-3 sm:gap-4 ${
                        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => props.onToggle(t)}
                      />
                      <span
                        aria-hidden
                        className={`mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors peer-checked:border-[#9bdcf4] peer-checked:bg-[#9bdcf4]/10 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#9bdcf4] ${
                          disabled && !checked ? 'border-fog/20' : 'border-fog/40'
                        }`}
                      >
                        {checked && <Check className="size-2.5 text-[#9bdcf4]" strokeWidth={3} />}
                      </span>
                      
                      {/* AQUI ESTÁ A MUDANÇA: A lógica para mostrar a foto em vez da letra */}
                      <span
                        aria-hidden
                        className={`flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-vein bg-sumi font-display text-sm text-mist ${
                          !eligible && !checked ? 'opacity-50' : ''
                        }`}
                      >
                        {t.logo ? (
                          <img src={t.logo} alt={t.symbol} className="h-full w-full object-cover" />
                        ) : (
                          t.symbol.slice(0, 1).toUpperCase()
                        )}
                      </span>

                      <span className="min-w-0">
                        <span
                          className={`flex min-h-6 items-center gap-2 font-sans text-[15px] font-medium leading-6 ${
                            !eligible && !checked ? 'text-mist/60' : 'text-mist'
                          }`}
                        >
                          {t.symbol}
                          {elig.status === 'ineligible' && (
                            <span aria-hidden className="size-2 shrink-0 rounded-full bg-warn" />
                          )}
                        </span>
                        <span className="tabular mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-xs leading-snug tracking-wide text-fog">
                          <span>
                            {elig.status === 'empty' ? 'No balance' : `${formatToken(t.balance, t.decimals)} held`}
                          </span>
                          {elig.status === 'eligible' && <span className="text-fog/70">{formatUsd(elig.value)}</span>}
                          {elig.status === 'loading' && <span className="text-fog/60">checking value</span>}
                          <span className="text-fog/50">{shortAddress(t.address)}</span>
                        </span>
                        <Warning elig={elig} />
                      </span>
                    </label>

                    {!checked && t.isCustom && (
                      <button
                        type="button"
                        onClick={() => props.onRemoveCustom(t.address)}
                        aria-label={`Remove ${t.symbol} from the list`}
                        className="flex size-11 items-center justify-center rounded-sm text-fog/70 transition-colors hover:text-seal focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>

                  {checked && item && (item.error || quote?.status === 'noRoute') && (
                    <p role="alert" className="px-3 pb-3 text-xs leading-snug text-seal sm:px-4 sm:pl-[4.75rem]">
                      {item.error ?? 'No liquidity route to USDC for this token on the current router.'}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="asset-foot">
        <div aria-live="polite">{count === 1 ? '1 asset selected' : `${count} assets selected`}</div>
        <div>
          <button className="text-btn" type="button" onClick={props.onClear} disabled={locked || count === 0}>
            Clear selection
          </button>
          <button
            className="text-btn active"
            type="button"
            onClick={props.onSuggest}
            disabled={locked || !props.canSuggest}
          >
            Suggest
          </button>
        </div>
      </div>

    </section>
  )
        }
