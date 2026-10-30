import { useReadContract } from 'wagmi'
import { BATCH_SWAP_ADDRESS, CHAIN, batchSwapAbi } from '@/lib/hagane'

/** Reads the router and Permit2 addresses straight from the deployed contract. */
export function useHaganeConfig() {
  const enabled = BATCH_SWAP_ADDRESS !== undefined
  const router = useReadContract({
    address: BATCH_SWAP_ADDRESS,
    abi: batchSwapAbi,
    functionName: 'router',
    chainId: CHAIN.id,
    query: { enabled },
  })
  const permit2 = useReadContract({
    address: BATCH_SWAP_ADDRESS,
    abi: batchSwapAbi,
    functionName: 'PERMIT2',
    chainId: CHAIN.id,
    query: { enabled },
  })

  return {
    configured: enabled,
    router: router.data,
    permit2: permit2.data,
    isLoading: router.isLoading || permit2.isLoading,
    isError: router.isError || permit2.isError,
  }
}
