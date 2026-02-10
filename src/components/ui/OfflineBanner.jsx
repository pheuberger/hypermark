import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/15 border-b border-amber-500/20 text-amber-400 text-xs"
    >
      <WifiOff className="w-3.5 h-3.5" />
      <span>You're offline. Changes will sync when you reconnect.</span>
    </div>
  )
}
