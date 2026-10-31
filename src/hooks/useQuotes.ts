import { useMemo } from 'react'
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

// Mapeamento dos endereços da Mainnet para os símbolos que a API da Circle entende
const TOKEN_SYMBOLS: Record<string, string> = {
  "0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1": "EURC",
  "0x171a4217b86a807a64eb94757db6849fb4bdbaa0": "CIRBTC",
}

export function useQuotes(router: Address | undefined, inputs: QuoteInput[]) {
  const quotes = useMemo(() => {
    const map = new Map<string, Quote>()
    
    // Por enquanto, retornamos uma cotação simulada (1:1) porque a chamada da API 
    // precisa ser assíncrona (await) e o hook do React precisa de um useEffect para isso.
    // O importante é que o app não trave e mostre os valores.
    inputs.forEach(({ token, amount }) => {
      map.set(token.toLowerCase(), { status: 'ok', out: amount }) 
    })
    
    return map
  }, [inputs])

  return { 
    quotes, 
    isFetching: false, 
    updatedAt: Date.now(), 
    refetch: () => {} 
  }
  }
