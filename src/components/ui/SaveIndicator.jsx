import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '../../utils/cn'

/**
 * SaveIndicator - Brief inline "Saved ✓" indicator
 *
 * Triggered by incrementing the `show` counter prop.
 * Fades in over 200ms, holds for 600ms, fades out over 200ms (~1s total).
 */
export function SaveIndicator({ show }) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const prevShow = useRef(show)

  useEffect(() => {
    if (show === prevShow.current) return
    prevShow.current = show

    if (show === 0) return

    setVisible(true)
    setLeaving(false)

    const leaveTimer = setTimeout(() => setLeaving(true), 800)
    const hideTimer = setTimeout(() => setVisible(false), 1000)

    return () => {
      clearTimeout(leaveTimer)
      clearTimeout(hideTimer)
    }
  }, [show])

  if (!visible) return null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] text-green-500 transition-opacity duration-200',
        leaving ? 'opacity-0' : 'opacity-100'
      )}
      aria-live="polite"
    >
      <Check className="w-3 h-3" />
      Saved
    </span>
  )
}
