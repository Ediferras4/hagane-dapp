import { AlertTriangle, Check, ExternalLink, Loader2 } from 'lucide-react'
import type { FlowState, FlowStep } from '@/hooks/useBatchSwap'
import { CHAIN } from '@/lib/hagane'
import { buildTxExplorerUrl } from '@/onchain-facts'

const ORDER: FlowStep[] = ['allow', 'sign', 'submit', 'confirm']

const LABELS: Record<FlowStep, string> = {
  allow: 'Allow tokens for Permit2',
  sign: 'Sign the batch permit',
  submit: 'Send the swap',
  confirm: 'Confirm onchain',
}

type StepStatus = 'done' | 'waiting' | 'processing' | 'error' | 'pending'

function stepStatus(step: FlowStep, flow: FlowState): StepStatus {
  if (flow.step === null) return 'pending'
  const cur = ORDER.indexOf(flow.step)
  const idx = ORDER.indexOf(step)
  if (flow.status === 'success') return 'done'
  if (idx < cur) return 'done'
  if (idx > cur) return 'pending'
  if (flow.status === 'error') return 'error'
  return flow.status === 'processing' ? 'processing' : 'waiting'
}

function StepMark({ status }: { status: StepStatus }) {
  const base = 'flex size-5 shrink-0 items-center justify-center rounded-full border'
  if (status === 'done') {
    return (
      <span className={`${base} border-cyan bg-cyan text-sumi`}>
        <Check className="size-3" strokeWidth={3} aria-hidden />
      </span>
    )
  }
  if (status === 'processing') {
    return (
      <span className={`${base} border-cyan text-cyan`}>
        <Loader2 className="size-3 animate-spin" aria-hidden />
      </span>
    )
  }
  if (status === 'waiting') {
    return (
      <span className={`${base} border-cyan`}>
        <span className="size-1.5 animate-pulse rounded-full bg-cyan" />
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className={`${base} border-seal text-seal`}>
        <AlertTriangle className="size-3" aria-hidden />
      </span>
    )
  }
  return <span className={`${base} border-vein`} />
}

const STATUS_WORD: Record<StepStatus, string> = {
  done: 'Done',
  waiting: 'Waiting',
  processing: 'Processing',
  error: 'Failed',
  pending: '',
}

interface Props {
  flow: FlowState
}

export function FlowStatus({ flow }: Props) {
  if (flow.status === 'idle') return null

  const steps = ORDER.filter((s) => s !== 'allow' || flow.allowTotal > 0)
  const swapHash = flow.step === 'confirm' ? flow.hash : undefined

  return (
    <div
      className="mt-6 border-t border-vein pt-5"
      role="status"
      aria-live="polite"
      data-testid="flow-status"
    >
      <ol className="space-y-3">
        {steps.map((step) => {
          const st = stepStatus(step, flow)
          return (
            <li key={step} className="flex items-center gap-3">
              <StepMark status={st} />
              <span className={`text-sm ${st === 'pending' ? 'text-fog/60' : 'text-mist'}`}>
                {step === 'allow' && flow.allowTotal > 0
                  ? `${LABELS.allow} (${Math.min(flow.allowDone + (st === 'done' ? 0 : 1), flow.allowTotal)}/${flow.allowTotal})`
                  : LABELS[step]}
              </span>
              <span
                className={`ml-auto text-[11px] uppercase tracking-[0.16em] ${
                  st === 'error' ? 'text-seal' : st === 'done' ? 'text-fog' : 'text-cyan'
                }`}
              >
                {STATUS_WORD[st]}
              </span>
            </li>
          )
        })}
      </ol>

      {(flow.status === 'waiting' || flow.status === 'processing') && flow.detail && (
        <p className="mt-4 text-sm text-fog">{flow.detail}</p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        {swapHash ? (
          <a
            href={buildTxExplorerUrl(CHAIN.id, swapHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 text-xs text-cyan underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan"
          >
            View on explorer <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}
