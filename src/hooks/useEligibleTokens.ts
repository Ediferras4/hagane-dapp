import { useMemo } from 'react'
import type { Address } from 'viem'
import { useReadContracts } from 'wagmi'
import { useQuotes, type QuoteInput } from '@/hooks/useQuotes'
import type { WalletToken } from '@/hooks/useTokenList'
import { byValueDesc, evaluateEligibility, type Eligibility } from '@/lib/eligibility'
import { GAS, routerAbi, USDC_ADDRESS } from '@/lib/hagane'

interface Params {
  router: Address | undefined
  tokens: WalletToken[]
  slippageBps: number
  gasToUsdc: (gas: bigint) => bigint | undefined
}

export function useEligibleTokens({ router, tokens, slippageBps, gasToUsdc }: Params) {
  const held = useMemo(() => tokens.filter((t) => t.balance > 0n), [tokens])
  const heldAddresses = useMemo(() => held.map((t) => t.address), [held])
  
  const holdingInputs = useMemo<QuoteInput[]>(
    () => held.map((t) => ({ token: t.address, amount: t.balance })),
    [held],
  )

  const { quotes } = useQuotes(router, holdingInputs)

  const liquidityChecks = useMemo(() => {
    if (!router) return []
    return held.map((token) => ({
      address: router,
      abi: routerAbi,
      functionName: 'getAmountsOut',
      args: [token.balance, [token.address, USDC_ADDRESS]],
      chainId: 5042, 
    }))
  }, [router, held])

  const { data: liquidityData } = useReadContracts({
    contracts: liquidityChecks,
    query: { enabled: !!router && held.length > 0 },
  })

  const pools = useMemo(() => {
    const map = new Map<string, { liquidity: bigint } | undefined>()
    if (!liquidityData) return map
    held.forEach((token, index) => {
      const result = liquidityData[index]
      const hasLiquidity = result?.status === 'success' && result.result && result.result[0] > 0n
      map.set(token.address.toLowerCase(), hasLiquidity ? { liquidity: 10_000_000_000n } : undefined)
    })
    return map
  }, [liquidityData, held])

  const eligibility = useMemo(() => {
    const map = new Map<string, Eligibility>()
    for (const token of tokens) {
      const key = token.address.toLowerCase()
      const needsAllowance = token.allowance < token.balance
      const gasShare = gasToUsdc(GAS.PER_TOKEN + (needsAllowance ? GAS.PER_ALLOWANCE : 0n))
      
      const poolInfo = pools.get(key)
      map.set(
        key,
        evaluateEligibility({ token, quote: quotes.get(key), pool: poolInfo, gasShare, slippageBps }),
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
