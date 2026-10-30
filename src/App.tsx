import { useCallback, useMemo, useState } from 'react'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { useAccount } from 'wagmi'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DeselectNotices, type DeselectNotice } from '@/components/DeselectNotices'
import { GasWarning } from '@/components/GasWarning'
import { Header } from '@/components/Header'
import { Hero } from '@/components/Hero'
import { NetworkGuard } from '@/components/NetworkGuard'
import { ProgressModal } from '@/components/ProgressModal'
import { ResultModal } from '@/components/ResultModal'
import { ReviewPanel } from '@/components/ReviewPanel'
import { TokenList } from '@/components/TokenList'
import { useArcNetwork } from '@/hooks/useArcNetwork'
import { useBatchSwap } from '@/hooks/useBatchSwap'
import { useEligibleTokens } from '@/hooks/useEligibleTokens'
import { useGasCost } from '@/hooks/useGasCost'
import { useHaganeConfig } from '@/hooks/useHaganeConfig'
import { useLiveRefresh } from '@/hooks/useLiveRefresh'
import { useQuotes, type QuoteInput } from '@/hooks/useQuotes'
import { useTokenList, type WalletToken } from '@/hooks/useTokenList'
import { REASON_LABEL, formatUsd, isIneligible } from '@/lib/eligibility'
import { toInputValue } from '@/lib/format'
import { BATCH_SWAP_ADDRESS, GAS, MAX_TOKENS } from '@/lib/hagane'
import type { SelectedItem } from '@/lib/types'
import { parseUnitsExact } from '@/onchain-money'

function parseItem(token: WalletToken, text: string): SelectedItem {
  if (text === '' || text === '.') return { token, amountText: text, amountRaw: undefined }
  try {
    const raw = parseUnitsExact(text, token.decimals)
    if (raw === 0n) return { token, amountText: text, amountRaw: undefined, error: 'Enter an amount above zero.' }
    if (raw > token.balance) return { token, amountText: text, amountRaw: raw, error: 'More than your balance.' }
    return { token, amountText: text, amountRaw: raw }
  } catch {
    return { token, amountText: text, amountRaw: undefined, error: `${token.symbol} allows up to ${token.decimals} decimals.` }
  }
}

export default function App() {
  const reduce = useReducedMotion()
  const { address, isConnected } = useAccount()
  const { wrongChain, switching, ensureArc, currentChainId } = useArcNetwork()
  const cfg = useHaganeConfig()
  const list = useTokenList(cfg.permit2)
  const [selection, setSelection] = useState<Record<string, true>>({})
  const [slippageBps, setSlippageBps] = useState(100)
  const [confirming, setConfirming] = useState(false)
  const [notices, setNotices] = useState<DeselectNotice[]>([])
  const { toUsdc: gasToUsdc, usdcBalance, refetchBalance } = useGasCost()

  const refetchTokens = list.refetch
  const onSettled = useCallback(() => {
    void refetchTokens()
    void refetchBalance()
  }, [refetchTokens, refetchBalance])
  const flow = useBatchSwap(onSettled)

  const { eligibility, eligibleByValue, sortedTokens } = useEligibleTokens({
    router: cfg.router,
    tokens: list.tokens,
    slippageBps,
    gasToUsdc,
  })

  // Display only: tokens the wallet does not hold are not listed. Eligibility is still evaluated for every token above.
  const visibleTokens = useMemo(() => sortedTokens.filter((t) => t.balance > 0n), [sortedTokens])

  const items = useMemo<SelectedItem[]>(
    () =>
      list.tokens
        .filter((t) => {
          const key = t.address.toLowerCase()
          return key in selection && !isIneligible(eligibility.get(key))
        })
        .map((t) => parseItem(t, toInputValue(t.balance, t.decimals))), // always the whole balance
    [list.tokens, selection, eligibility],
  )
  const selectedMap = useMemo(() => new Map(items.map((i) => [i.token.address.toLowerCase(), i])), [items])

  const quoteInputs = useMemo<QuoteInput[]>(
    () =>
      items
        .filter((i) => i.amountRaw !== undefined && !i.error)
        .map((i) => ({ token: i.token.address, amount: i.amountRaw as bigint })),
    [items],
  )
  const { quotes, updatedAt: quotesUpdatedAt, refetch: refetchQuotes } = useQuotes(cfg.router, quoteInputs)
  const refreshQuotes = useCallback(() => {
    void refetchQuotes()
  }, [refetchQuotes])

  const totalOut = useMemo(() => {
    let sum = 0n
    for (const q of quotes.values()) if (q.status === 'ok') sum += q.out
    return sum
  }, [quotes])
  const minOut = (totalOut * BigInt(10_000 - slippageBps)) / 10_000n

  const allowancesNeeded = items.filter((i) => i.amountRaw !== undefined && i.token.allowance < i.amountRaw).length

  const gasEstimate = gasToUsdc(GAS.BASE + BigInt(items.length) * GAS.PER_TOKEN + BigInt(allowancesNeeded) * GAS.PER_ALLOWANCE)
  const noGas = isConnected && usdcBalance === 0n
  const lowGas = isConnected && usdcBalance !== undefined && usdcBalance > 0n && gasEstimate !== undefined && items.length > 0 && usdcBalance < gasEstimate

  let blockReason: string | null = null
  if (noGas) blockReason = 'No USDC for gas'
  else if (lowGas) blockReason = 'Not enough USDC for gas'
  else if (items.length === 0) blockReason = 'Select tokens to swap'
  else if (items.some((i) => i.error)) blockReason = 'Fix the amounts above'
  else if (items.some((i) => i.amountRaw === undefined)) blockReason = 'Enter an amount'
  else if (quoteInputs.some((q) => quotes.get(q.token.toLowerCase())?.status === 'noRoute'))
    blockReason = 'Remove tokens with no route'
  else if (quoteInputs.some((q) => quotes.get(q.token.toLowerCase())?.status === 'zero'))
    blockReason = 'An amount is too small to swap'
  else if (!cfg.permit2 || !cfg.router) blockReason = 'Loading contract...'
  else if (totalOut === 0n) blockReason = 'Waiting for a quote'

  const locked = flow.state.status === 'waiting' || flow.state.status === 'processing'
  const showingResult = flow.state.status === 'success' || flow.state.status === 'error'

  // Live data: scan and the countdown both refresh balances, quotes, pools and the gas price.
  const queryClient = useQueryClient()
  const refreshAll = useCallback(() => {
    void queryClient.invalidateQueries()
  }, [queryClient])
  const { remaining: liveSeconds, refreshNow } = useLiveRefresh(
    30,
    isConnected && !wrongChain && !locked && !showingResult,
    refreshAll,
  )
  const scanning = useIsFetching() > 0

  // Summary: estimated value of the other tokens (router quotes; tokens without a route have no price).
  const summary = useMemo(() => {
    let others = 0n
    for (const e of eligibility.values()) {
      if (e.status === 'eligible' || (e.status === 'ineligible' && e.value !== undefined)) others += e.value ?? 0n
    }
    const connected = isConnected && address !== undefined
    return {
      othersValue: connected ? others : undefined,
      tokenCount: list.tokens.filter((t) => t.balance > 0n).length,
      usdc: connected ? usdcBalance : undefined,
      total: connected && usdcBalance !== undefined ? usdcBalance + others : undefined,
    }
  }, [eligibility, list.tokens, isConnected, address, usdcBalance])

  // A selected token whose price moved out of range (or whose balance is gone) is deselected with a warning.
  const outOfRange = useMemo(() => {
    const out: { key: string; message?: string }[] = []
    for (const key of Object.keys(selection)) {
      const token = list.tokens.find((t) => t.address.toLowerCase() === key)
      const e = eligibility.get(key)
      if (!token || !e) continue
      if (e.status === 'empty') {
        out.push({ key })
      } else if (e.status === 'ineligible') {
        const message =
          e.reason === 'high' && e.value !== undefined
            ? `${token.symbol} is now worth ${formatUsd(e.value)}, above $5.00, so it was deselected.`
            : e.reason === 'low' && e.value !== undefined
              ? `${token.symbol} is now worth ${formatUsd(e.value)}, below $0.05, so it was deselected.`
              : `${token.symbol} was deselected: ${REASON_LABEL[e.reason].toLowerCase()}.`
        out.push({ key, message })
      }
    }
    return out
  }, [selection, list.tokens, eligibility])

  if (!locked && !showingResult && outOfRange.length > 0) {
    const keys = new Set(outOfRange.map((o) => o.key))
    const messages = outOfRange.flatMap((o) => (o.message ? [o.message] : []))
    setSelection((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !keys.has(k))))
    setConfirming(false)
    if (messages.length > 0) {
      setNotices((prev) => {
        const fresh = messages.filter((m) => !prev.some((n) => n.id === m)).map((m) => ({ id: m, text: m }))
        return [...prev, ...fresh].slice(-4)
      })
    }
  }

  // Leaving Arc pauses everything: the confirmation closes and the selection is kept.
  const [wasWrongChain, setWasWrongChain] = useState(false)
  if (wrongChain !== wasWrongChain) {
    setWasWrongChain(wrongChain)
    if (wrongChain) setConfirming(false)
  }

  const toggle = (token: WalletToken) => {
    const key = token.address.toLowerCase()
    setSelection((prev) => {
      if (key in prev) {
        const { [key]: _removed, ...rest } = prev
        return rest
      }
      if (eligibility.get(key)?.status !== 'eligible') return prev
      if (Object.keys(prev).length >= MAX_TOKENS) return prev
      return { ...prev, [key]: true }
    })
  }

  const clearSelection = () => setSelection({})

  /** Selects the highest-value eligible tokens, up to the batch limit, each at its full balance. */
  const suggest = () => {
    setSelection(
      Object.fromEntries(
        eligibleByValue
          .slice(0, MAX_TOKENS)
          .map(({ token }) => [token.address.toLowerCase(), true] as const),
      ),
    )
  }

  const openConfirm = () => {
    if (wrongChain || blockReason !== null) return
    setConfirming(true)
  }

  const confirmSwap = () => {
    if (!address || !cfg.permit2 || wrongChain || blockReason !== null) return
    setConfirming(false)
    void flow.run({
      account: address,
      permit2: cfg.permit2,
      minUsdcOut: minOut,
      items: items.map((i) => ({
        token: i.token.address,
        symbol: i.token.symbol,
        decimals: i.token.decimals,
        amount: i.amountRaw as bigint,
        allowance: i.token.allowance,
        balance: i.token.balance,
      })),
    })
  }

  // Back from the result screen: converted tokens leave the selection, failed ones stay selected for another try.
  const finishResult = () => {
    const failed = new Set(flow.state.result?.tokens.filter((t) => !t.ok).map((t) => t.token.toLowerCase()))
    setSelection((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => failed.has(k))))
    flow.reset()
  }

  const allChecked = list.tokens.every((t) => eligibility.get(t.address.toLowerCase())?.status !== 'loading')
  const noEligible = visibleTokens.length > 0 && allChecked && eligibleByValue.length === 0

  const fade = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const },
  })

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 top-24 select-none font-display text-[26rem] leading-none text-cyan/[0.025] sm:text-[34rem]"
      >
        鋼
      </span>

      <Header />

      <main className="relative mx-auto w-full max-w-[1080px] px-4 pt-[76px] sm:px-8">
        <motion.div {...fade(0)}>
          <Hero />
        </motion.div>

        {!BATCH_SWAP_ADDRESS ? (
          <div role="alert" className="border border-seal/60 bg-seal/5 p-6 text-sm text-mist">
            The HaganeBatchSwap address is not configured. Set VITE_HAGANE_BATCH_SWAP_ADDRESS in .env and restart the dev
            server.
          </div>
        ) : (
          <motion.div {...fade(0.12)}>
            {isConnected && !wrongChain && <GasWarning balance={usdcBalance} needed={gasEstimate} />}
            <DeselectNotices
              notices={notices}
              onDismiss={(id) => setNotices((prev) => prev.filter((n) => n.id !== id))}
            />
            <div className="grid grid-cols-1 items-start gap-6 desk:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] desk:gap-8">
            <TokenList
              isConnected={isConnected}
              isLoading={list.isLoading || cfg.isLoading}
              isError={list.isError || cfg.isError}
              tokens={visibleTokens}
              selected={selectedMap}
              quotes={quotes}
              eligibility={eligibility}
              canSuggest={eligibleByValue.length > 0}
              noEligible={noEligible}
              onSuggest={suggest}
              onClear={clearSelection}
              onToggle={toggle}
              onRemoveCustom={list.removeCustom}
              locked={locked}
              summary={summary}
              scanning={scanning}
              liveSeconds={liveSeconds}
              onScan={refreshNow}
              onLive={refreshNow}
            />
            <ReviewPanel
              isConnected={isConnected}
              wrongChain={wrongChain}
              switching={switching}
              onSwitch={() => void ensureArc()}
              items={items}
              quotes={quotes}
              totalOut={totalOut}
              blockReason={blockReason}
              onSubmit={openConfirm}
              flow={flow.state}
              notice={flow.notice}
            />
            </div>
          </motion.div>
        )}

      </main>

      <footer className="relative mx-auto mt-auto w-full max-w-[1080px] px-4 pt-14 sm:px-8">
        <div className="flex items-center justify-between gap-4 pb-14 font-mono text-[10px] uppercase tracking-widest text-lichen">
          <span>Built on Arc</span>
          <span>Hagane © 2026</span>
        </div>
      </footer>

      {showingResult && flow.state.result && <ResultModal result={flow.state.result} onDone={finishResult} />}
      {locked && <ProgressModal flow={flow.state} />}
      <ConfirmDialog
        open={confirming && !wrongChain && !locked && !showingResult}
        items={items}
        quotes={quotes}
        totalOut={totalOut}
        minOut={minOut}
        gasEstimate={gasEstimate}
        allowancesNeeded={allowancesNeeded}
        slippageBps={slippageBps}
        onSlippage={setSlippageBps}
        gasBalance={usdcBalance}
        quoteUpdatedAt={quotesUpdatedAt}
        onRefresh={refreshQuotes}
        onConfirm={confirmSwap}
        onClose={() => setConfirming(false)}
      />
      <NetworkGuard active={wrongChain} currentChainId={currentChainId} switching={switching} onSwitch={() => void ensureArc()} />
    </div>
  )
}
