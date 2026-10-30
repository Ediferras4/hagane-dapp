import { useMemo } from 'react'
import type { Address } from 'viem'
import { usePoolLiquidity } from '@/hooks/usePoolLiquidity'
import { useQuotes, type QuoteInput } from '@/hooks/useQuotes'
import type { WalletToken } from '@/hooks/useTokenList'
import { byValueDesc, evaluateEligibility, type Eligibility } from '@/lib/eligibility'
import { GAS } from '@/lib/hagane'

interface Params {
  router: Address | undefined
  tokens: WalletToken[]
  slippageBps: number
  /** Converts gas units to USDC; undefined result while the gas price loads. */
  gasToUsdc: (gas: bigint) => bigint | undefined
}

/**
 * Applies the Hagane rules to every held token:
 * value range, pool depth (suspect), net value after gas and slippage, and no-liquidity.
 * Returns tokens sorted with eligible ones first, highest value on top.
 */
export function useEligibleTokens({ router, tokens, slippageBps, gasToUsdc }: Params) {
  const held = useMemo(() => tokens.filter((t) => t.balance > 0n), [tokens])
  const heldAddresses = useMemo(() => held.map((t) => t.address), [held])
  const holdingInputs = useMemo<QuoteInput[]>(
    () => held.map((t) => ({ token: t.address, amount: t.balance })),
    [held],
  )

  // The quote and the pool both describe the route the swap executes: token -> USDC on the router.
  const { quotes } = useQuotes(router, holdingInputs)
  const pools = usePoolLiquidity(router, heldAddresses)

  const eligibility = useMemo(() => {
    const map = new Map<string, Eligibility>()
    for (const token of tokens) {
      const key = token.address.toLowerCase()
      // Gas share of this token in a batch, plus its one-time allowance if it still needs one.
      const needsAllowance = token.allowance < token.balance
      const gasShare = gasToUsdc(GAS.PER_TOKEN + (needsAllowance ? GAS.PER_ALLOWANCE : 0n))
      map.set(
        key,
        evaluateEligibility({ token, quote: quotes.get(key), pool: pools.get(key), gasShare, slippageBps }),
      )
    }
    return map
  }, [tokens, quotes, pools, gasToUsdc, slippageBps])

  const eligibleByValue = useMemo(
    () =>
      tokens
        .flatMap((token) => {
          const e = eligibility.get(token.address.toLowerCase())
          return e?.status === 'eligible' ? [{ token, value: e.value }] : []
        })
        .sort(byValueDesc),
    [tokens, eligibility],
  )

  // Eligible first (highest value on top), then tokens still being checked, then ineligible, then empty.
  const sortedTokens = useMemo(() => {
    const rank = (t: WalletToken): number => {
      const status = eligibility.get(t.address.toLowerCase())?.status
      return status === 'eligible' ? 0 : status === 'loading' || status === undefined ? 1 : status === 'ineligible' ? 2 : 3
    }
    const valueOf = (t: WalletToken): bigint => {
      const e = eligibility.get(t.address.toLowerCase())
      return e?.status === 'eligible' || (e?.status === 'ineligible' && e.value !== undefined) ? (e.value ?? 0n) : 0n
    }
    return [...tokens].sort((a, b) => {
      const byRank = rank(a) - rank(b)
      if (byRank !== 0) return byRank
      const va = valueOf(a)
      const vb = valueOf(b)
      return va > vb ? -1 : va < vb ? 1 : 0
    })
  }, [tokens, eligibility])

  return { eligibility, eligibleByValue, sortedTokens }
}
