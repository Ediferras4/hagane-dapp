import { useCallback } from 'react'
import { erc20Abi } from 'viem'
import { useAccount, useGasPrice, useReadContract } from 'wagmi'
import { CHAIN, USDC_ADDRESS } from '@/lib/hagane'
import { Amount, gasTokenDecimalsFor, gasTokenToUsdc } from '@/onchain-money'

/** Gas price and the connected wallet's USDC (the gas token on Arc, read through its 6-decimal ERC-20 view). */
export function useGasCost() {
  const { address } = useAccount()
  const { data: gasPrice } = useGasPrice({ chainId: CHAIN.id, query: { refetchInterval: 30_000 } })
  const balanceQuery = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN.id,
    query: { enabled: address !== undefined, refetchInterval: 15_000 },
  })

  /** Cost of `gas` units in USDC, rounded up by one unit so it is never understated. Undefined until the price loads. */
  const toUsdc = useCallback(
    (gas: bigint): bigint | undefined => {
      if (gasPrice === undefined) return undefined
      const wei = Amount.fromRaw(gas * gasPrice, gasTokenDecimalsFor(CHAIN.id))
      return gasTokenToUsdc(CHAIN.id, wei, 'trunc').raw + 1n
    },
    [gasPrice],
  )

  return {
    toUsdc,
    usdcBalance: balanceQuery.data,
    refetchBalance: balanceQuery.refetch,
  }
}
