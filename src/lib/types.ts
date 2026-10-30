import type { WalletToken } from '@/hooks/useTokenList'

export interface SelectedItem {
  token: WalletToken
  amountText: string
  /** Parsed amount in the token's own units. Undefined when the text is empty or invalid. */
  amountRaw: bigint | undefined
  error?: string
}
