import { useEffect, useRef } from 'react'
import { CHAIN } from '@/lib/hagane'
import { getChain } from '@/onchain-facts'

interface Props {
  /** True while a wallet is connected on a network other than Arc Testnet. */
  active: boolean
  currentChainId: number | undefined
  switching: boolean
  onSwitch: () => void
}

/** Pauses the whole app when the wallet leaves Arc Testnet and asks the user to switch back. */
export function NetworkGuard({ active, currentChainId, switching, onSwitch }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (active) buttonRef.current?.focus()
  }, [active])

  if (!active) return null
  const current = currentChainId === undefined ? undefined : getChain(currentChainId)?.name

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sumi/85 p-5 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="network-title"
        aria-describedby="network-desc"
        className="w-full max-w-md border border-warn/60 bg-moss p-7"
      >
        <div className="flex items-center gap-3">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-warn" />
          <h2 id="network-title" className="font-serif text-2xl font-medium text-mist">
            Wrong network
          </h2>
        </div>
        <p id="network-desc" className="mt-4 text-sm leading-relaxed text-fog">
          Your wallet switched to {current ?? `network ${currentChainId ?? 'unknown'}`}. Hagane is paused until you
          return to {CHAIN.name}. Nothing was sent, and your selection is kept.
        </p>
        <button
          ref={buttonRef}
          type="button"
          onClick={onSwitch}
          disabled={switching}
          className="mt-6 min-h-12 w-full rounded-sm bg-cyan px-5 text-sm font-semibold tracking-wide text-sumi transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:opacity-50"
        >
          {switching ? 'Waiting for your wallet...' : `Switch back to ${CHAIN.name}`}
        </button>
      </div>
    </div>
  )
}
