import type { PoolLiquidity } from '@/hooks/usePoolLiquidity'
import type { Quote } from '@/hooks/useQuotes'
import type { WalletToken } from '@/hooks/useTokenList'
import { SUSPECT_LIQUIDITY_USDC } from '@/lib/hagane'
import { formatUnitsFixed } from '@/onchain-money'

/**
 * Hagane eligibility, all amounts in USDC with 6 decimals (USDC is treated as $1):
 * - the estimated value (router quote for the whole balance, same route the swap uses) is $0.05 to $5.00
 * - the pool behind that route holds at least $1,000
 * - the net value after gas and the slippage allowance is positive (the 0.3% pool fee is already in the quote)
 */
export const MIN_VALUE_USDC = 50_000n
export const MAX_VALUE_USDC = 5_000_000n

export type IneligibleReason = 'noLiquidity' | 'suspect' | 'low' | 'high' | 'loss'

export type Eligibility =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'eligible'; value: bigint; net: bigint }
  | { status: 'ineligible'; reason: IneligibleReason; value?: bigint; liquidity?: bigint; net?: bigint }

export interface EligibilityInput {
  token: WalletToken
  /** Quote for the whole balance. */
  quote: Quote | undefined
  pool: PoolLiquidity | undefined
  /** Estimated gas for this token's share of a batch, in USDC. Undefined while the gas price loads. */
  gasShare: bigint | undefined
  slippageBps: number
}

export function evaluateEligibility({ token, quote, pool, gasShare, slippageBps }: EligibilityInput): Eligibility {
  if (token.balance === 0n) return { status: 'empty' }
  if (!quote || quote.status === 'loading' || !pool || pool.status === 'loading' || gasShare === undefined) {
    return { status: 'loading' }
  }

  // Rule 7: no route, or no pool behind the route, means no liquidity.
  if (quote.status === 'noRoute' || pool.status === 'none') return { status: 'ineligible', reason: 'noLiquidity' }

  const value = quote.status === 'zero' ? 0n : quote.out

  if (pool.usdc < SUSPECT_LIQUIDITY_USDC) {
    return { status: 'ineligible', reason: 'suspect', value, liquidity: pool.usdc }
  }
  if (value < MIN_VALUE_USDC) return { status: 'ineligible', reason: 'low', value }
  if (value > MAX_VALUE_USDC) return { status: 'ineligible', reason: 'high', value }

  const net = (value * BigInt(10_000 - slippageBps)) / 10_000n - gasShare
  if (net <= 0n) return { status: 'ineligible', reason: 'loss', value, net }

  return { status: 'eligible', value, net }
}

/** True when the token must not be part of a batch. */
export function isIneligible(e: Eligibility | undefined): boolean {
  return e?.status === 'ineligible' || e?.status === 'empty'
}

export const REASON_LABEL: Record<IneligibleReason, string> = {
  suspect: 'Suspect',
  high: 'Value too high',
  low: 'Value too low',
  noLiquidity: 'No liquidity',
  loss: 'High loss',
}

export function formatUsd(value: bigint): string {
  return `$${formatUnitsFixed(value, 6, value < 1_000_000n ? 4 : 2)}`
}

/** Short explanation shown next to the reason. */
export function reasonDetail(e: Extract<Eligibility, { status: 'ineligible' }>): string | null {
  switch (e.reason) {
    case 'suspect':
      return e.liquidity !== undefined ? `pool holds ${formatUsd(e.liquidity)}, under $1,000` : null
    case 'low':
    case 'high':
      return e.value !== undefined ? formatUsd(e.value) : null
    case 'loss':
      return 'gas, fees and slippage exceed the value'
    case 'noLiquidity':
      return null
  }
}

/** Highest value first. */
export function byValueDesc<T extends { value: bigint }>(a: T, b: T): number {
  return a.value > b.value ? -1 : a.value < b.value ? 1 : 0
}
