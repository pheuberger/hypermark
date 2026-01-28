import { useState, useCallback } from 'react'
import { useYjs } from './hooks/useYjs'
import { useNostrSync } from './hooks/useNostrSync'
import { usePasteToInbox } from './hooks/usePasteToInbox'
import { BookmarkList } from './components/bookmarks/BookmarkList'

export function App() {
  useYjs()
  useNostrSync()
  
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const handlePasteSuccess = useCallback((url) => {
    const domain = new URL(url).hostname.replace('www.', '')
    showToast(`Added "${domain}" to inbox`, 'success')
  }, [showToast])

  const handlePasteDuplicate = useCallback(() => {
    showToast('Already bookmarked', 'warning')
  }, [showToast])

  usePasteToInbox(handlePasteSuccess, handlePasteDuplicate)

  return (
    <div className="h-dvh bg-background">
      <BookmarkList />
      
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className={`alert shadow-lg ${
            toast.type === 'success' ? 'alert-success' : 
            toast.type === 'warning' ? 'alert-warning' : 
            'alert-info'
          }`}>
            <span className="text-sm">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}
