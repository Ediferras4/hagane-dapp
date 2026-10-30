import { useMemo } from 'react'
import type { Address } from 'viem'
import { useReadContracts } from 'wagmi'
import { CHAIN, USDC_ADDRESS, routerAbi } from '@/lib/hagane'

export interface QuoteInput {
  token: Address
  amount: bigint
}

export type Quote =
  | { status: 'loading' }
  | { status: 'ok'; out: bigint }
  /** A pool exists but the amount is so small it would swap for zero USDC. */
  | { status: 'zero' }
  | { status: 'noRoute' }

/** Live router quotes (token -> USDC) for each selected amount. A failed quote means no pool route. */
export function useQuotes(router: Address | undefined, inputs: QuoteInput[]) {
  const contracts = useMemo(
    () =>
      router
        ? inputs.map(
            ({ token, amount }) =>
              ({
                address: router,
                abi: routerAbi,
                functionName: 'getAmountsOut',
                args: [amount, [token, USDC_ADDRESS]],
                chainId: CHAIN.id,
              }) as const,
          )
        : [],
    [router, inputs],
  )

  const query = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0, refetchInterval: 12_000 },
  })

  const quotes = useMemo(() => {
    const map = new Map<string, Quote>()
    inputs.forEach(({ token }, i) => {
      const res = query.data?.[i]
      if (!res) {
        map.set(token.toLowerCase(), { status: 'loading' })
      } else if (res.status === 'success') {
        const amounts = res.result
        const out = amounts[amounts.length - 1]
        map.set(token.toLowerCase(), out > 0n ? { status: 'ok', out } : { status: 'zero' })
      } else {
        map.set(token.toLowerCase(), { status: 'noRoute' })
      }
    })
    return map
  }, [query.data, inputs])

  return { quotes, isFetching: query.isFetching, updatedAt: query.dataUpdatedAt, refetch: query.refetch }
}
