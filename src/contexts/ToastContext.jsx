import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)

const MAX_VISIBLE = 3
let toastId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback(({ message, type = 'info', action, actionLabel, duration = 5000 }) => {
    const id = ++toastId
    setToasts((prev) => {
      const next = [...prev, { id, message, type, action, actionLabel, duration }]
      return next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next
    })
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToastContext() {
  const context = useContext(ToastContext)
  if (context === null) {
    throw new Error('useToastContext must be used within a ToastProvider')
  }
  return context
}
