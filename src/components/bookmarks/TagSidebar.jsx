import { useMemo, useEffect, useState } from 'react'
import { Tag as TagIcon, Hash, BookmarkCheck, PackageOpen, X, Settings, Inbox } from '../ui/Icons'
import { subscribeToWebrtcProvider } from '../../hooks/useYjs'
import { cn } from '@/utils/cn'

export function TagSidebar({
  bookmarks,
  selectedFilter,
  selectedTag,
  onFilterChange,
  onTagSelect,
  isOpen,
  onClose,
  onOpenSettings,
  isSettingsActive,
  onHomeClick,
}) {

  const [connected, setConnected] = useState(false)
  const [peerCount, setPeerCount] = useState(0)
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToWebrtcProvider((provider) => {
      if (!provider) {
        setConnected(false)
        setPeerCount(0)
        setSynced(false)
        return
      }

      const handleStatus = ({ connected }) => setConnected(connected)
      const handlePeers = ({ webrtcPeers }) => setPeerCount(webrtcPeers ? webrtcPeers.length : 0)
      const handleSynced = ({ synced }) => setSynced(synced)

      provider.on('status', handleStatus)
      provider.on('peers', handlePeers)
      provider.on('synced', handleSynced)

      setConnected(provider.connected || false)
      setPeerCount(provider.room?.webrtcConns?.size || 0)
      setSynced(provider.synced || false)

      return () => {
        provider.off('status', handleStatus)
        provider.off('peers', handlePeers)
        provider.off('synced', handleSynced)
      }
    })

    return unsubscribe
  }, [])

  const tagCounts = useMemo(() => {
    const counts = {}
    bookmarks.forEach((bookmark) => {
      if (Array.isArray(bookmark.tags)) {
        bookmark.tags.forEach((tag) => {
          counts[tag] = (counts[tag] || 0) + 1
        })
      }
    })
    return counts
  }, [bookmarks])

  const sortedTags = useMemo(() => {
    return Object.entries(tagCounts)
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1]
        return a[0].localeCompare(b[0])
      })
      .map(([tag, count]) => ({ tag, count }))
  }, [tagCounts])

  const readLaterCount = useMemo(() => {
    return bookmarks.filter((b) => b.readLater).length
  }, [bookmarks])

  const inboxCount = useMemo(() => {
    return bookmarks.filter((b) => b.inbox).length
  }, [bookmarks])

  const totalCount = bookmarks.length

  const handleFilterChange = (view) => {
    onFilterChange(view)
    onClose()
  }

  const handleTagSelect = (tag) => {
    onTagSelect(tag)
    onClose()
  }

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const getSyncColor = () => {
    if (!connected) return 'bg-muted-foreground/20'
    if (synced) return 'bg-green-500'
    return 'bg-yellow-500'
  }

  const getSyncText = () => {
    if (!connected) return 'Offline'
    if (peerCount === 0) return 'No peers'
    return `${peerCount} device${peerCount === 1 ? '' : 's'}`
  }

  return (
    <>
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30 backdrop-blur-sm transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'w-64 h-dvh bg-background flex flex-col overflow-hidden',
          'lg:relative lg:translate-x-0',
          'fixed top-0 left-0 z-40 transition-transform duration-300 ease-in-out shadow-xl lg:shadow-none',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="h-14 px-4 flex items-center justify-between">
           <button 
             onClick={onHomeClick}
             className="flex items-center gap-2.5 font-semibold text-foreground opacity-90 hover:opacity-100 transition-opacity"
           >
             <div className="p-1 bg-accent rounded-md">
               <TagIcon className="w-4 h-4" strokeWidth={2} />
             </div>
             <span>Hypermark</span>
           </button>
           
           <button
            onClick={onClose}
            className="lg:hidden p-2 hover:bg-accent rounded-md text-muted-foreground transition-colors"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          <button
            onClick={() => handleFilterChange('all')}
            className={cn(
              'w-full px-3 py-2 flex items-center justify-between text-left rounded-md transition-all duration-200 group',
              selectedFilter === 'all'
                ? 'bg-accent text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
          >
            <div className="flex items-center gap-2.5">
              <PackageOpen className={cn('w-4 h-4', selectedFilter === 'all' ? 'opacity-100' : 'opacity-70 group-hover:opacity-100')} strokeWidth={1.5} />
              <span className="text-sm">All Bookmarks</span>
            </div>
            <span className={cn('text-xs', selectedFilter === 'all' ? 'opacity-60' : 'opacity-40 group-hover:opacity-60')}>{totalCount}</span>
          </button>

          <button
            onClick={() => handleFilterChange('read-later')}
            className={cn(
              'w-full px-3 py-2 flex items-center justify-between text-left rounded-md transition-all duration-200 group',
              selectedFilter === 'read-later'
                ? 'bg-accent text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
          >
            <div className="flex items-center gap-2.5">
              <BookmarkCheck className={cn('w-4 h-4', selectedFilter === 'read-later' ? 'opacity-100' : 'opacity-70 group-hover:opacity-100')} strokeWidth={1.5} />
              <span className="text-sm">Read Later</span>
            </div>
            <span className={cn('text-xs', selectedFilter === 'read-later' ? 'opacity-60' : 'opacity-40 group-hover:opacity-60')}>{readLaterCount}</span>
          </button>

          <button
            onClick={() => handleFilterChange('inbox')}
            className={cn(
              'w-full px-3 py-2 flex items-center justify-between text-left rounded-md transition-all duration-200 group',
              selectedFilter === 'inbox'
                ? 'bg-accent text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
          >
            <div className="flex items-center gap-2.5">
              <Inbox className={cn('w-4 h-4', selectedFilter === 'inbox' ? 'opacity-100' : 'opacity-70 group-hover:opacity-100')} strokeWidth={1.5} />
              <span className="text-sm">Inbox</span>
            </div>
            {inboxCount > 0 && (
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary', selectedFilter === 'inbox' ? 'opacity-80' : 'opacity-60 group-hover:opacity-80')}>{inboxCount}</span>
            )}
          </button>

          {sortedTags.length > 0 && (
            <>
              <div className="px-3 pb-2 pt-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tags</span>
              </div>

              {sortedTags.map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => handleTagSelect(tag)}
                  className={cn(
                    'w-full px-3 py-1.5 flex items-center justify-between text-left rounded-md transition-all duration-200 group',
                    selectedFilter === 'tag' && selectedTag === tag
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Hash className={cn('w-3.5 h-3.5 flex-shrink-0', selectedFilter === 'tag' && selectedTag === tag ? 'opacity-70' : 'opacity-50 group-hover:opacity-70')} strokeWidth={1.5} />
                    <span className="text-sm truncate">{tag}</span>
                  </div>
                  <span className={cn('text-xs', selectedFilter === 'tag' && selectedTag === tag ? 'opacity-60' : 'opacity-30 group-hover:opacity-50')}>{count}</span>
                </button>
              ))}
            </>
          )}
        </nav>

        <div className="p-3 space-y-1">
          <div className="px-3 py-2 flex items-center gap-2.5 text-xs text-muted-foreground">
            <div className={cn('w-2 h-2 rounded-full', getSyncColor())} />
            <span className="font-medium">{getSyncText()}</span>
          </div>

          <button
             onClick={onOpenSettings}
             className={cn(
               'w-full px-3 py-2 flex items-center gap-2.5 text-left rounded-md transition-colors',
               isSettingsActive
                 ? 'bg-accent text-foreground font-medium'
                 : 'hover:bg-accent text-muted-foreground hover:text-foreground'
             )}
          >
            <Settings className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm font-medium">Settings</span>
          </button>
        </div>
      </aside>
    </>
  )
}
