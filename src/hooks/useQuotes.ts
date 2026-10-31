import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { AppKit } from '@circle-fin/app-kit'

export interface QuoteInput {
  token: Address
  amount: bigint
}

export type Quote =
  | { status: 'loading' }
  | { status: 'ok'; out: bigint }
  | { status: 'zero' }
  | { status: 'noRoute' }

// Mapeamento dos endereços da Mainnet para os símbolos que a API entende
const TOKEN_SYMBOLS: Record<string, string> = {
  "0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1": "EURC",
  "0x171a4217b86a807a64eb94757db6849fb4bdbaa0": "CIRBTC",
}

export function useQuotes(router: Address | undefined, inputs: QuoteInput[]) {
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map())

  useEffect(() => {
    if (inputs.length === 0) return

    const fetchRates = async () => {
      const kit = new AppKit()
      const newQuotes = new Map<string, Quote>()

      for (const input of inputs) {
        const symbol = TOKEN_SYMBOLS[input.token.toLowerCase()]
        if (!symbol) {
          newQuotes.set(input.token.toLowerCase(), { status: 'noRoute' })
          continue
        }

        try {
          const result = await kit.getTokenRates({
            chain: "Arc",
            tokens: [symbol],
          })

          const rate = result.rates?.[input.token.toLowerCase()]
          if (rate && rate.priceUSD) {
            // Calcula o valor real em USDC (assumindo que USDC = 1 USD)
            const price = parseFloat(rate.priceUSD)
            const amountInTokens = Number(input.amount) / 10 ** rate.decimals
            const usdcOut = BigInt(Math.floor(amountInTokens * price * 1e6))
            
            newQuotes.set(input.token.toLowerCase(), { status: 'ok', out: usdcOut })
          } else {
            newQuotes.set(input.token.toLowerCase(), { status: 'noRoute' })
          }
        } catch (error) {
          newQuotes.set(input.token.toLowerCase(), { status: 'noRoute' })
        }
      }

      setQuotes(newQuotes)
    }

    fetchQuotes()
  }, [inputs])

  return { 
    quotes, 
    isFetching: false, 
    updatedAt: Date.now(), 
    refetch: () => {} 
  }
}
