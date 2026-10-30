import { useCallback, useMemo, useState, useEffect } from 'react'
import { erc20Abi, type Address } from 'viem'
import { useAccount, useReadContracts } from 'wagmi'
import { BASE_TOKENS, CHAIN, USDC_ADDRESS } from '@/lib/hagane'

export interface WalletToken {
  address: Address
  symbol: string
  decimals: number
  balance: bigint
  allowance: bigint
  isCustom: boolean
  logo?: string | null
}

const STORAGE_KEY = 'hagane.customTokens'
const FIELDS_PER_TOKEN = 4

function loadCustom(): Address[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((a): a is Address => typeof a === 'string') : []
  } catch {
    return []
  }
}

export function useTokenList(permit2: Address | undefined) {
  const { address: owner } = useAccount()
  const [custom, setCustom] = useState<Address[]>(loadCustom)
  const [logos, setLogos] = useState<Record<string, string | null>>({})

  const candidates = useMemo(() => {
    const seen = new Set<string>()
    const out: { address: Address; isCustom: boolean }[] = []
    seen.add(USDC_ADDRESS.toLowerCase())
    for (const a of BASE_TOKENS) {
      if (!seen.has(a.toLowerCase())) {
        seen.add(a.toLowerCase())
        out.push({ address: a, isCustom: false })
      }
    }
    for (const a of custom) {
      if (!seen.has(a.toLowerCase())) {
        seen.add(a.toLowerCase())
        out.push({ address: a, isCustom: true })
      }
    }
    return out
  }, [custom])

  const enabled = owner !== undefined && permit2 !== undefined && candidates.length > 0

  const contracts = useMemo(() => {
    if (!owner || !permit2) return []
    return candidates.flatMap(({ address }) => [
      { address, abi: erc20Abi, functionName: 'symbol', chainId: CHAIN.id },
      { address, abi: erc20Abi, functionName: 'decimals', chainId: CHAIN.id },
      { address, abi: erc20Abi, functionName: 'balanceOf', args: [owner], chainId: CHAIN.id },
      { address, abi: erc20Abi, functionName: 'allowance', args: [owner, permit2], chainId: CHAIN.id },
    ] as const)
  }, [candidates, owner, permit2])

  const query = useReadContracts({
    contracts,
    query: { enabled, refetchInterval: 20_000 },
  })

  // Nova lógica: buscar os logos na API do Explorer da Arc
  useEffect(() => {
    if (!owner) return
    const fetchLogos = async () => {
      try {
        const res = await fetch(`https://explorer.arc.io/api/v2/addresses/${owner}/token-balances`)
        if (!res.ok) return
        const data = await res.json()
        const newLogos: Record<string, string | null> = {}
        for (const item of data) {
          if (item.token && item.token.address_hash) {
             newLogos[item.token.address_hash.toLowerCase()] = item.token.icon_url || null
          }
        }
        setLogos(newLogos)
      } catch (e) {
        console.error("Failed to fetch logos", e)
      }
    }
    fetchLogos()
  }, [owner])

  const tokens = useMemo<WalletToken[]>(() => {
    const data = query.data
    if (!data) return []
    const rows: WalletToken[] = []
    candidates.forEach((c, i) => {
      const [symbol, decimals, balance, allowance] = data.slice(i * FIELDS_PER_TOKEN, (i + 1) * FIELDS_PER_TOKEN)
      if (
        symbol?.status !== 'success' ||
        decimals?.status !== 'success' ||
        balance?.status !== 'success' ||
        allowance?.status !== 'success'
      ) {
        return
      }
      rows.push({
        address: c.address,
        symbol: String(symbol.result),
        decimals: Number(decimals.result),
        balance: BigInt(balance.result),
        allowance: BigInt(allowance.result),
        isCustom: c.isCustom,
        logo: logos[c.address.toLowerCase()] || null, // Adiciona o logo encontrado
      })
    })
    return rows
  }, [query.data, candidates, logos])

  const addCustom = useCallback((address: Address) => {
    setCustom((prev) => {
      if (prev.some((a) => a.toLowerCase() === address.toLowerCase())) return prev
      const next = [...prev, address]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const removeCustom = useCallback((address: Address) => {
    setCustom((prev) => {
      const next = prev.filter((a) => a.toLowerCase() !== address.toLowerCase())
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return {
    tokens,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    addCustom,
    removeCustom,
  }
}
