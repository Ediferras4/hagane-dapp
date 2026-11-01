import { useCallback, useState } from 'react'
import { erc20Abi, maxUint256, parseEventLogs, type Address, type Hex, type TransactionReceipt } from 'viem'
import { usePublicClient, useSignTypedData, useWriteContract } from 'wagmi'
import {
  BATCH_SWAP_ADDRESS,
  CHAIN,
  batchSwapAbi,
  friendlyError,
  permit2Types,
  randomPermitNonce,
} from '@/lib/hagane'
import { Amount, gasTokenDecimalsFor, gasTokenToUsdc } from '@/onchain-money'

export type FlowStatus = 'idle' | 'waiting' | 'processing' | 'success' | 'error'
export type FlowStep = 'allow' | 'sign' | 'submit' | 'confirm'

export interface TokenOutcome {
  token: Address
  symbol: string
  decimals: number
  requested: bigint
  converted: bigint
  ok: boolean
  reason?: string
}

export interface SwapResult {
  outcome: 'success' | 'partial' | 'failed'
  hash?: Hex
  usdcOut?: bigint
  gasSpent: bigint
  tokens: TokenOutcome[]
  reason?: string
}

export interface FlowState {
  status: FlowStatus
  step: FlowStep | null
  detail: string
  allowDone: number
  allowTotal: number
  hash?: Hex
  result?: SwapResult
}

export interface SwapItem {
  token: Address
  symbol: string
  decimals: number
  amount: bigint
  allowance: bigint
  balance: bigint
}

export interface RunParams {
  account: Address
  permit2: Address
  items: SwapItem[]
  minOuts: bigint[] // Atualizado para suportar o array de mínimos do Contrato V5
}

const IDLE: FlowState = { status: 'idle', step: null, detail: '', allowDone: 0, allowTotal: 0 }

function gasToUsdc(wei: bigint): bigint {
  return gasTokenToUsdc(CHAIN.id, Amount.fromRaw(wei, gasTokenDecimalsFor(CHAIN.id)), 'trunc').raw
}

export function useBatchSwap(onSettled: () => void) {
  const publicClient = usePublicClient({ chainId: CHAIN.id })
  const { writeContractAsync } = useWriteContract()
  const { signTypedDataAsync } = useSignTypedData()
  const [state, setState] = useState<FlowState>(IDLE)
  const [notice, setNotice] = useState<string | null>(null)

  const reset = useCallback(() => {
    setState(IDLE)
    setNotice(null)
  }, [])

  const run = useCallback(
    async ({ account, permit2, items, minOuts }: RunParams) => {
      const batch = BATCH_SWAP_ADDRESS
      if (!publicClient || !batch) return
      setNotice(null)

      const needAllowance = items.filter((it) => it.allowance < it.amount)
      const base = { allowTotal: needAllowance.length }
      let allowDone = 0
      let gasWei = 0n
      let step: FlowStep = 'allow'
      let swapHash: Hex | undefined
      const addGas = (r: TransactionReceipt) => {
        gasWei += r.gasUsed * r.effectiveGasPrice
      }

      const failAll = (reason: string): SwapResult => ({
        outcome: 'failed',
        hash: swapHash,
        gasSpent: gasToUsdc(gasWei),
        reason,
        tokens: items.map((it) => ({
          token: it.token,
          symbol: it.symbol,
          decimals: it.decimals,
          requested: it.amount,
          converted: 0n,
          ok: false,
          reason,
        })),
      })

      try {
        for (const it of needAllowance) {
          step = 'allow'
          setState({
            ...IDLE,
            ...base,
            allowDone,
            status: 'waiting',
            step,
            detail: `Confirm allowance ${allowDone + 1} of ${needAllowance.length} in your wallet`,
          })
          const approveHash = await writeContractAsync({
            address: it.token,
            abi: erc20Abi,
            functionName: 'approve',
            args: [permit2, maxUint256],
            chainId: CHAIN.id,
          })
          setState((s) => ({ ...s, status: 'processing', detail: 'Allowance confirming onchain' }))
          const approval = await publicClient.waitForTransactionReceipt({ hash: approveHash })
          addGas(approval)
          if (approval.status !== 'success') throw new Error('Allowance transaction reverted')
          allowDone += 1
        }

        step = 'sign'
        setState({
          ...IDLE,
          ...base,
          allowDone,
          status: 'waiting',
          step,
          detail: 'Sign the batch permit in your wallet (no gas)',
        })
        const nonce = randomPermitNonce()
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60)
        const signature = await signTypedDataAsync({
          domain: { name: 'Permit2', chainId: CHAIN.id, verifyingContract: permit2 },
          types: permit2Types,
          primaryType: 'PermitBatchTransferFrom',
          message: {
            permitted: items.map((it) => ({ token: it.token, amount: it.amount })),
            spender: batch,
            nonce,
            deadline,
          },
        })

        step = 'submit'
        setState({
          ...IDLE,
          ...base,
          allowDone,
          status: 'waiting',
          step,
          detail: 'Confirm the swap transaction in your wallet',
        })
        
        // Chamada adaptada para o batchSwap do Contrato V5 (com minOuts[])
        swapHash = await writeContractAsync({
          address: batch,
          abi: batchSwapAbi,
          functionName: 'batchSwap',
          args: [
            items.map((it) => it.token),
            items.map((it) => it.amount),
            minOuts,
            nonce,
            deadline,
            signature,
          ],
          chainId: CHAIN.id,
        })

        step = 'confirm'
        setState({
          ...IDLE,
          ...base,
          allowDone,
          status: 'processing',
          step,
          detail: 'Swap submitted. Waiting for confirmation',
          hash: swapHash,
        })
        const receipt = await publicClient.waitForTransactionReceipt({ hash: swapHash })
        addGas(receipt)

        if (receipt.status !== 'success') {
          setState({
            ...IDLE,
            ...base,
            allowDone,
            status: 'error',
            step,
            hash: swapHash,
            result: failAll('The swap reverted onchain. Your tokens were not moved.'),
          })
          return
        }

        const logs = parseEventLogs({ abi: batchSwapAbi, logs: receipt.logs, eventName: 'BatchSwapped' })
        const usdcOut = logs.find((l) => l.address.toLowerCase() === batch.toLowerCase())?.args.usdcOut

        let after: bigint[] | undefined
        try {
          after = await Promise.all(
            items.map((it) =>
              publicClient.readContract({
                address: it.token,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [account],
                blockNumber: receipt.blockNumber,
              }),
            ),
          )
        } catch {
          after = undefined
        }

        const tokens: TokenOutcome[] = items.map((it, i) => {
          const left = after ? (it.balance > after[i] ? it.balance - after[i] : 0n) : it.amount
          const ok = left >= it.amount
          return {
            token: it.token,
            symbol: it.symbol,
            decimals: it.decimals,
            requested: it.amount,
            converted: ok ? left : 0n,
            ok,
            reason: ok ? undefined : 'This swap did not go through. The token stays in your wallet.',
          }
        })
        const okCount = tokens.filter((t) => t.ok).length
        const result: SwapResult = {
          outcome: okCount === tokens.length ? 'success' : okCount === 0 ? 'failed' : 'partial',
          hash: swapHash,
          usdcOut,
          gasSpent: gasToUsdc(gasWei),
          tokens,
          reason: okCount === 0 ? 'No token was converted.' : undefined,
        }
        setState({
          ...IDLE,
          ...base,
          allowDone,
          status: result.outcome === 'failed' ? 'error' : 'success',
          step,
          hash: swapHash,
          result,
        })
      } catch (error) {
        const { cancelled, message } = friendlyError(error)
        if (cancelled) {
          setState(IDLE)
          setNotice(message)
        } else {
          setState({
            ...IDLE,
            ...base,
            allowDone,
            status: 'error',
            step,
            hash: swapHash,
            result: failAll(message),
          })
        }
      } finally {
        onSettled()
      }
    },
    [publicClient, writeContractAsync, signTypedDataAsync, onSettled],
  )

  return { state, notice, run, reset }
}

