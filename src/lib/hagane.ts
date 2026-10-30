import { isAddress, parseAbi, type Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc } from '@/onchain-facts'

export const CHAIN = arcTestnet
export const MAX_TOKENS = 10

const usdcFact = getUsdc(arcTestnet.id)
if (!usdcFact) {
  throw new Error('USDC is not registered for Arc Testnet')
}
export const USDC_ADDRESS = usdcFact.address as Address
export const USDC_DECIMALS = usdcFact.decimals

function envAddress(value: unknown): Address | undefined {
  return typeof value === 'string' && isAddress(value) ? value : undefined
}

/** The deployed HaganeBatchSwap contract (public value, set in .env). */
export const BATCH_SWAP_ADDRESS = envAddress(import.meta.env.VITE_HAGANE_BATCH_SWAP_ADDRESS)

/** Arc Testnet tokens offered by default. Users can add any other ERC-20 by address. */
export const BASE_TOKENS: Address[] = [
  envAddress(import.meta.env.VITE_EURC_ADDRESS),
  envAddress(import.meta.env.VITE_WETH_ADDRESS),
  envAddress(import.meta.env.VITE_CIRBTC_ADDRESS),
].filter((a): a is Address => a !== undefined)

export const batchSwapAbi = parseAbi([
  'function batchSwap(address[] tokens, uint256[] amounts, uint256 minUsdcOut, uint256 permitNonce, uint256 deadline, bytes signature) returns (uint256 usdcOut)',
  'function router() view returns (address)',
  'function PERMIT2() view returns (address)',
  'event BatchSwapped(address indexed user, uint256 tokenCount, uint256 usdcOut)',
  'error InvalidBatch()',
  'error ZeroAddress()',
  'error ZeroAmount()',
  'error DuplicateToken(address token)',
  'error TokenIsUSDC()',
  'error NothingReceived(address token)',
  'error Expired()',
  'error SlippageExceeded(uint256 received, uint256 minimum)',
])

export const routerAbi = parseAbi([
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
  'function factory() view returns (address)',
])

export const factoryAbi = parseAbi(['function getPair(address tokenA, address tokenB) view returns (address pair)'])

export const pairAbi = parseAbi([
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
])

/** A token whose USDC pool holds less than $1,000 is "suspect". */
export const SUSPECT_LIQUIDITY_USDC = 1_000_000_000n

/** Gas estimates, from measured batches (about 90k per token on mock pools; padded for real V2 pairs). */
export const GAS = {
  BASE: 100_000n,
  PER_TOKEN: 130_000n,
  PER_ALLOWANCE: 60_000n,
} as const

export const permit2Types = {
  PermitBatchTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions[]' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  TokenPermissions: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
} as const

export const SLIPPAGE_OPTIONS_BPS = [50, 100, 300] as const

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

/** Permit2 nonces are unordered bitmaps: a random 256-bit value is unused with overwhelming probability. */
export function randomPermitNonce(): bigint {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  return n
}

export function friendlyError(error: unknown): { cancelled: boolean; message: string } {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const lower = raw.toLowerCase()

  if (lower.includes('user rejected') || lower.includes('user denied') || lower.includes('rejected the request')) {
    return { cancelled: true, message: 'Cancelled in wallet.' }
  }
  if (raw.includes('SlippageExceeded')) {
    return { cancelled: false, message: 'The price moved and you would receive less than your minimum. Raise slippage or try again.' }
  }
  if (raw.includes('Expired')) {
    return { cancelled: false, message: 'The signed permit expired. Start the swap again.' }
  }
  if (raw.includes('InvalidSigner') || raw.includes('InvalidNonce')) {
    return { cancelled: false, message: 'The signature was rejected by Permit2. Start the swap again.' }
  }
  if (raw.includes('TRANSFER_FROM_FAILED') || lower.includes('insufficient allowance')) {
    return { cancelled: false, message: 'Permit2 cannot move one of the tokens. Check your balance and allowance.' }
  }
  if (lower.includes('insufficient funds') || lower.includes('exceeds balance')) {
    return { cancelled: false, message: 'Not enough USDC for gas. Use Get test USDC in the sidebar.' }
  }
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('fetch')) {
    return { cancelled: false, message: 'Network issue. Check your connection and retry.' }
  }
  if (lower.includes('revert')) {
    return { cancelled: false, message: 'The transaction reverted. A token may have no liquidity route to USDC.' }
  }
  return { cancelled: false, message: 'Something went wrong. Please try again.' }
}
