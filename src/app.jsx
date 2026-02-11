import { useCallback } from 'react'
import { useYjs } from './hooks/useYjs'
import { useNostrSync } from './hooks/useNostrSync'
import { usePasteToBookmark } from './hooks/usePasteToBookmark'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { useRelayErrorToasts } from './hooks/useRelayErrorToasts'
import { BookmarkList } from './components/bookmarks/BookmarkList'
import { ToastProvider, useToastContext } from './contexts/ToastContext'
import { ToastContainer } from './components/ui/Toast'
import { OfflineBanner } from './components/ui/OfflineBanner'

function AppContent() {
  const { addToast, toasts, removeToast } = useToastContext()
  useRelayErrorToasts()

  const handlePasteSuccess = useCallback((url) => {
    const domain = new URL(url).hostname.replace('www.', '')
    addToast({ message: `Added "${domain}"`, type: 'success' })
  }, [addToast])

  const handlePasteDuplicate = useCallback(() => {
    addToast({ message: 'Already bookmarked', type: 'warning' })
  }, [addToast])

  usePasteToBookmark(handlePasteSuccess, handlePasteDuplicate)

  const isOnline = useOnlineStatus()

  return (
    <div className="h-dvh bg-background">
      {!isOnline && <OfflineBanner />}
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
