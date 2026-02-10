import { useEffect, useState, useCallback } from 'react'
import { X, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/utils/cn'

const TYPE_CONFIG = {
  success: { icon: CheckCircle2, border: 'border-l-green-500', role: 'status', live: 'polite' },
  error: { icon: XCircle, border: 'border-l-red-500', role: 'alert', live: 'assertive' },
  warning: { icon: AlertTriangle, border: 'border-l-amber-500', role: 'alert', live: 'assertive' },
  info: { icon: Info, border: 'border-l-blue-500', role: 'status', live: 'polite' },
}

export function Toast({ message, type = 'info', action, actionLabel = 'Undo', duration = 5000, onClose }) {
  const [isVisible, setIsVisible] = useState(true)
  const [isLeaving, setIsLeaving] = useState(false)
  const [progressWidth, setProgressWidth] = useState('100%')

  const config = TYPE_CONFIG[type] || TYPE_CONFIG.info
  const Icon = config.icon

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

  // Trigger progress bar animation after mount
  useEffect(() => {
    if (duration > 0) {
      const frame = requestAnimationFrame(() => {
        setProgressWidth('0%')
      })
      return () => cancelAnimationFrame(frame)
    }
  }, [duration])

  if (!isVisible) return null

  return (
    <div
      role={config.role}
      aria-live={config.live}
      className={cn(
        'relative',
        'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg',
        'bg-card border border-border text-foreground',
        'border-l-4', config.border,
        'transition-all duration-150',
        isLeaving ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm flex-1">{message}</span>
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
      {duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted-foreground/20 rounded-b-lg overflow-hidden">
          <div
            className="h-full bg-current opacity-30"
            style={{
              width: progressWidth,
              transition: `width ${duration}ms linear`,
            }}
          />
        </div>
      )}
    </div>
  )
}

// Toast container that manages multiple toasts
export function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2" aria-live="polite">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          action={toast.action}
          actionLabel={toast.actionLabel}
          duration={toast.duration}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  )
}
