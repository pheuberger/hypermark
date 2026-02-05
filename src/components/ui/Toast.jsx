import { useEffect, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'

export function Toast({ message, action, actionLabel = 'Undo', duration = 5000, onClose }) {
  const [isVisible, setIsVisible] = useState(true)
  const [isLeaving, setIsLeaving] = useState(false)

  const handleClose = useCallback(() => {
    setIsLeaving(true)
    setTimeout(() => {
      setIsVisible(false)
      onClose?.()
    }, 150)
  }, [onClose])

  const handleAction = useCallback(() => {
    action?.()
    handleClose()
  }, [action, handleClose])

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(handleClose, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, handleClose])

  if (!isVisible) return null

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50',
        'flex items-center gap-4 px-4 py-3 rounded-lg shadow-lg',
        'bg-card border border-border text-foreground',
        'transition-all duration-150',
        isLeaving ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
      )}
    >
      <span className="text-sm">{message}</span>
      {action && (
        <button
          onClick={handleAction}
          className="text-sm font-medium text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
      <button
        onClick={handleClose}
        className="p-1 rounded hover:bg-muted transition-colors flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  )
}

// Toast container that manages multiple toasts
export function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          action={toast.action}
          actionLabel={toast.actionLabel}
          duration={toast.duration}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  )
}
