import { useRef, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { MoreHorizontal } from 'lucide-react'
import { useAccount } from 'wagmi'
import { Logo } from '@/components/Logo'
import { SideDrawer } from '@/components/SideDrawer'
import { CHAIN, shortAddress } from '@/lib/hagane'

/** The main call to action inside panels. */
export function ConnectButton({ className = '' }: { className?: string }) {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, isConnecting, show, address }) => (
        <button
          type="button"
          onClick={show}
          className={`min-h-11 rounded-sm border border-cyan/60 px-5 text-sm font-medium tracking-wide text-cyan transition-colors hover:bg-cyan/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan active:bg-cyan/20 ${className}`}
        >
          {isConnecting ? 'Connecting...' : isConnected && address ? shortAddress(address) : 'Connect Wallet'}
        </button>
      )}
    </ConnectKitButton.Custom>
  )
}

/** "0x" stays lowercase; the rest of the address is uppercase, as in the mockup. */
function walletLabel(address: string): string {
  const short = shortAddress(address)
  return `0x${short.slice(2).toUpperCase()}`
}

/** Header wallet button: a dark teal pill with a thin cyan border and small spaced monospace text. */
function WalletPill() {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, isConnecting, show, address }) => (
        <button
          type="button"
          onClick={show}
          className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full border border-cyan/50 bg-cyan-dim/25 px-4 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-cyan transition-colors hover:bg-cyan-dim/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan active:bg-cyan-dim/45"
        >
          {isConnected && address && <span aria-hidden className="size-1.5 rounded-full bg-cyan" />}
          {isConnecting ? 'Connecting...' : isConnected && address ? walletLabel(address) : 'Connect Wallet'}
        </button>
      )}
    </ConnectKitButton.Custom>
  )
}

export function Header() {
  const { isConnected, chainId } = useAccount()
  const onChain = isConnected && chainId === CHAIN.id
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuRef = useRef<HTMLButtonElement>(null)

  const closeDrawer = () => {
    setDrawerOpen(false)
    menuRef.current?.focus()
  }

  // The drawer is a sibling of <header>: the header's backdrop blur would otherwise trap a fixed child inside it.
  return (
    <>
    <header className="fixed inset-x-0 top-0 z-30 border-b border-vein/60 bg-sumi/70 backdrop-blur-md supports-[backdrop-filter]:bg-sumi/55">
      <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Logo size={40} />
          <div className="min-w-0 leading-tight">
            <div className="font-sans text-lg font-extrabold tracking-tight text-mist sm:text-xl">Hagane</div>
            <div className="mt-1 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.28em] text-fog">
              Quiet Finance
              <span className="hidden min-[480px]:inline"> · Arc Network</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-2 text-xs tracking-wide text-fog desk:inline-flex">
            <span aria-hidden className={`size-1.5 rounded-full ${onChain ? 'bg-cyan' : 'bg-fog/50'}`} />
            {CHAIN.name}
          </span>
          <WalletPill />
          <button
            ref={menuRef}
            type="button"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-transparent text-mist transition-colors hover:border-white/25 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
          >
            <MoreHorizontal className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    </header>
    <SideDrawer open={drawerOpen} onClose={closeDrawer} />
    </>
  )
}
