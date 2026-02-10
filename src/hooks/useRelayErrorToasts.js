import { useEffect, useRef } from 'react'
import { useToastContext } from '../contexts/ToastContext'
import { subscribeToNostrSync } from './useNostrSync'
import { CONNECTION_STATES } from '../services/nostr-sync'

const DEBOUNCE_MS = 60_000

export function useRelayErrorToasts() {
  const { addToast } = useToastContext()
  const lastToastTimeRef = useRef({})
  const prevStatesRef = useRef({})

  useEffect(() => {
    const unsubscribe = subscribeToNostrSync((service) => {
      if (!service?.isInitialized) return

      const status = service.getStatus()
      const now = Date.now()

      status.relays.connections.forEach(({ url, state }) => {
        const prev = prevStatesRef.current[url]
        const lastToast = lastToastTimeRef.current[url] || 0

        if (state === CONNECTION_STATES.ERROR && prev !== CONNECTION_STATES.ERROR) {
          if (now - lastToast > DEBOUNCE_MS) {
            const host = new URL(url).hostname
            addToast({
              message: `Relay ${host} disconnected. Trying to reconnect...`,
              type: 'warning',
              duration: 5000,
            })
            lastToastTimeRef.current[url] = now
          }
        }

        if (state === CONNECTION_STATES.CONNECTED && prev === CONNECTION_STATES.ERROR) {
          const host = new URL(url).hostname
          addToast({
            message: `Relay ${host} reconnected`,
            type: 'success',
            duration: 3000,
          })
        }

        prevStatesRef.current[url] = state
      })
    })

    return unsubscribe
  }, [addToast])
}
