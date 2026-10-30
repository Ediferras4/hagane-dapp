import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A real countdown that refreshes live data when it reaches zero, then restarts.
 * `refreshNow` refreshes immediately and restarts the countdown (the scan and live buttons use it).
 */
export function useLiveRefresh(seconds: number, enabled: boolean, onRefresh: () => void) {
  const remainingRef = useRef(seconds)
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => {
      remainingRef.current -= 1
      if (remainingRef.current <= 0) {
        remainingRef.current = seconds
        onRefresh()
      }
      setRemaining(remainingRef.current)
    }, 1000)
    return () => clearInterval(id)
  }, [enabled, seconds, onRefresh])

  const refreshNow = useCallback(() => {
    remainingRef.current = seconds
    setRemaining(seconds)
    onRefresh()
  }, [seconds, onRefresh])

  return { remaining, refreshNow }
}
