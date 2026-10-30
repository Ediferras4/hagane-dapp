import { useMemo } from 'react'
import { zeroAddress, type Address } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { CHAIN, USDC_ADDRESS, factoryAbi, pairAbi, routerAbi } from '@/lib/hagane'

export type PoolLiquidity =
  | { status: 'loading' }
  /** No pair for token/USDC, or its reserves could not be read. */
  | { status: 'none' }
  /** `usdc` is the pool's total value in USDC (6 decimals): twice the USDC reserve. */
  | { status: 'ok'; usdc: bigint }

/**
 * Liquidity of the token/USDC pair on the router's factory, which is the pool the swap route goes through.
 * USDC is the quote asset, so the pool's value is twice its USDC reserve.
 */
export function usePoolLiquidity(router: Address | undefined, tokens: Address[]) {
  const factoryQuery = useReadContract({
    address: router,
    abi: routerAbi,
    functionName: 'factory',
    chainId: CHAIN.id,
    query: { enabled: router !== undefined },
  })
  const factory = factoryQuery.data

  const pairContracts = useMemo(
    () =>
      factory
        ? tokens.map(
            (token) =>
              ({
                address: factory,
                abi: factoryAbi,
                functionName: 'getPair',
                args: [token, USDC_ADDRESS],
                chainId: CHAIN.id,
              }) as const,
          )
        : [],
    [factory, tokens],
  )
  const pairsQuery = useReadContracts({
    contracts: pairContracts,
    query: { enabled: pairContracts.length > 0, refetchInterval: 30_000 },
  })

  // Per token: undefined while loading, null when there is no pair, otherwise the pair address.
  const pairs = useMemo<(Address | null | undefined)[]>(() => {
    return tokens.map((_, i) => {
      const res = pairsQuery.data?.[i]
      if (!res) return pairsQuery.isError ? null : undefined
      if (res.status !== 'success') return null
      const pair = res.result
      return pair === zeroAddress ? null : pair
    })
  }, [tokens, pairsQuery.data, pairsQuery.isError])

  const reserveContracts = useMemo(
    () =>
      pairs.flatMap((pair) =>
        pair
          ? ([
              { address: pair, abi: pairAbi, functionName: 'getReserves', chainId: CHAIN.id },
              { address: pair, abi: pairAbi, functionName: 'token0', chainId: CHAIN.id },
            ] as const)
          : [],
      ),
    [pairs],
  )
  const reservesQuery = useReadContracts({
    contracts: reserveContracts,
    query: { enabled: reserveContracts.length > 0, refetchInterval: 30_000 },
  })

  const liquidity = useMemo(() => {
    const map = new Map<string, PoolLiquidity>()
    let cursor = 0
    tokens.forEach((token, i) => {
      const key = token.toLowerCase()
      const pair = pairs[i]
      if (factoryQuery.isError) {
        map.set(key, { status: 'none' })
        return
      }
      if (pair === undefined || (factory === undefined && !factoryQuery.isError)) {
        map.set(key, { status: 'loading' })
        return
      }
      if (pair === null) {
        map.set(key, { status: 'none' })
        return
      }
      const reserves = reservesQuery.data?.[cursor]
      const token0 = reservesQuery.data?.[cursor + 1]
      cursor += 2
      if (!reserves || !token0) {
        map.set(key, reservesQuery.isError ? { status: 'none' } : { status: 'loading' })
        return
      }
      if (reserves.status !== 'success' || token0.status !== 'success') {
        map.set(key, { status: 'none' })
        return
      }
      const [reserve0, reserve1] = reserves.result
      const usdcReserve = String(token0.result).toLowerCase() === USDC_ADDRESS.toLowerCase() ? reserve0 : reserve1
      map.set(key, { status: 'ok', usdc: BigInt(usdcReserve) * 2n })
    })
    return map
  }, [tokens, pairs, factory, factoryQuery.isError, reservesQuery.data, reservesQuery.isError])

  return liquidity
}
