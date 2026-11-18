import { useEffect } from 'react'

export default function useVisibleRefresh(enabled, refresh) {
  useEffect(() => {
    if (!enabled) return
    let active = true
    let pending = false

    async function update() {
      if (pending || document.visibilityState !== 'visible') return
      pending = true
      try {
        await refresh(() => active)
      } catch {
        // Keep the current view during a network interruption and retry next time.
      } finally {
        pending = false
      }
    }

    const timer = window.setInterval(update, 15000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [enabled, refresh])
}
