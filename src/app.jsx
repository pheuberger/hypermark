import { useCallback } from 'react'
import { useYjs } from './hooks/useYjs'
import { useNostrSync } from './hooks/useNostrSync'
import { usePasteToInbox } from './hooks/usePasteToInbox'
import { BookmarkList } from './components/bookmarks/BookmarkList'
import { ToastProvider, useToastContext } from './contexts/ToastContext'
import { ToastContainer } from './components/ui/Toast'

function AppContent() {
  const { addToast, toasts, removeToast } = useToastContext()

  const handlePasteSuccess = useCallback((url) => {
    const domain = new URL(url).hostname.replace('www.', '')
    addToast({ message: `Added "${domain}" to inbox`, type: 'success' })
  }, [addToast])

  const handlePasteDuplicate = useCallback(() => {
    addToast({ message: 'Already bookmarked', type: 'warning' })
  }, [addToast])

  usePasteToInbox(handlePasteSuccess, handlePasteDuplicate)

  return (
    <div className="h-dvh bg-background">
      <BookmarkList />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}

export function App() {
  useYjs()
  useNostrSync()
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}
