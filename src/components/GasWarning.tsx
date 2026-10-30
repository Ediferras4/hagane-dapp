interface Props {
  /** USDC in the wallet (6 decimals), undefined while loading. */
  balance: bigint | undefined
  /** Estimated gas for the current batch in USDC, if any tokens are selected. */
  needed: bigint | undefined
}

/** Rule: no USDC for gas means no conversion. USDC is the gas token on Arc. */
export function GasWarning({ balance, needed }: Props) {
  const none = balance === 0n
  const short = balance !== undefined && balance > 0n && needed !== undefined && balance < needed
  if (!none && !short) return null

  return (
    <div
      role="alert"
      data-testid="gas-warning"
      className="mb-6 flex items-start gap-3 border border-warn/50 bg-warn/5 p-4 text-sm"
    >
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-warn" />
      <div>
        <div className="font-medium text-mist">
          {none ? 'You have no USDC for gas' : 'Not enough USDC for this batch'}
        </div>
        <p className="mt-1 text-fog">
          On Arc, USDC pays the network fee. Swaps are blocked until your wallet holds USDC. Use Get test USDC in the
          Arc Studio sidebar, then come back.
        </p>
      </div>
    </div>
  )
}
