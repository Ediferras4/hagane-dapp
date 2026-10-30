import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAccount } from 'wagmi'
import { CHAIN } from '@/lib/hagane'
import { requireChain } from '@/onchain-facts'

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

function isProvider(value: unknown): value is Eip1193Provider {
  return typeof value === 'object' && value !== null && typeof (value as Eip1193Provider).request === 'function'
}

function errorCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error).code
    return typeof code === 'number' ? code : undefined
  }
  return undefined
}

/**
 * Adds Arc Testnet to the connected wallet (wallet_addEthereumChain) and switches to it.
 * Wallets that already know the chain just ask the user to switch.
 */
export function useArcNetwork() {
  const { connector, address, isConnected, chainId } = useAccount()
  const [switching, setSwitching] = useState(false)
  const promptedFor = useRef<string | null>(null)
  const previousChain = useRef<number | undefined>(undefined)

  const wrongChain = isConnected && chainId !== CHAIN.id

  const ensureArc = useCallback(async () => {
    if (!connector) return
    const provider: unknown = await connector.getProvider()
    if (!isProvider(provider)) {
      toast.error('Your wallet cannot add networks. Add Arc Testnet manually.')
      return
    }

    const chain = requireChain(CHAIN.id)
    setSwitching(true)
    try {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: `0x${CHAIN.id.toString(16)}`,
            chainName: chain.name,
            nativeCurrency: {
              name: chain.nativeCurrency.symbol,
              symbol: chain.nativeCurrency.symbol,
              decimals: chain.nativeCurrency.decimals,
            },
            rpcUrls: [chain.rpcUrls[0]],
            blockExplorerUrls: [chain.explorerBase],
          },
        ],
      })
    } catch (error) {
      if (errorCode(error) === 4001) {
        toast.info('Network change cancelled in wallet.')
      } else {
        toast.error('Could not add Arc Testnet to your wallet. Add it manually and try again.')
      }
    } finally {
      setSwitching(false)
    }
  }, [connector])

  // Prompt when a wallet connects on another network, and again every time it leaves Arc Testnet afterwards.
  useEffect(() => {
    if (!isConnected || !address) {
      promptedFor.current = null
      previousChain.current = undefined
      return
    }
    const leftArc = previousChain.current === CHAIN.id && chainId !== CHAIN.id
    previousChain.current = chainId
    if (chainId === CHAIN.id) {
      promptedFor.current = address
      return
    }
    if (promptedFor.current !== address || leftArc) {
      promptedFor.current = address
      void ensureArc()
    }
  }, [isConnected, address, chainId, ensureArc])

  return { wrongChain, switching, ensureArc, currentChainId: chainId }
}
