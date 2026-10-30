import { FlowStatus } from '@/components/FlowStatus'
import { ModalShell } from '@/components/ModalShell'
import type { FlowState } from '@/hooks/useBatchSwap'

interface Props {
  flow: FlowState
}

/** Shown from the moment the wallet is asked until the swap is confirmed. It cannot be dismissed. */
export function ProgressModal({ flow }: Props) {
  const waiting = flow.status === 'waiting'
  return (
    <ModalShell
      labelledBy="progress-title"
      kicker={waiting ? 'Waiting' : 'Processing'}
      tone="cyan"
      testId="progress-modal"
    >
      <h2 id="progress-title" className="font-serif text-2xl font-medium tracking-wide text-mist">
        {waiting ? 'Confirm in your wallet' : 'Processing your swap'}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-fog">
        {waiting
          ? 'Nothing moves until you approve each wallet prompt. Cancel in your wallet to go back to your list.'
          : 'Your swap is on its way. Keep this page open until the result appears.'}
      </p>
      <FlowStatus flow={flow} />
    </ModalShell>
  )
}
