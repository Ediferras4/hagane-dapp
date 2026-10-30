import { formatUnitsExact, formatUnitsFixed } from '@/onchain-money'

/** Token amount for display: up to `maxFraction` decimals, trailing zeros trimmed. */
export function formatToken(raw: bigint, decimals: number, maxFraction = 6): string {
  const fixed = formatUnitsFixed(raw, decimals, Math.min(decimals, maxFraction))
  if (!fixed.includes('.')) return fixed
  return fixed.replace(/0+$/, '').replace(/\.$/, '')
}

/** Exact amount for an input field. */
export function toInputValue(raw: bigint, decimals: number): string {
  return formatUnitsExact(raw, decimals)
}

/** USDC amount for display, 4 decimals (rounded down, never overstated). */
export function formatUsdcDisplay(raw: bigint): string {
  return formatUnitsFixed(raw, 6, 4)
}
