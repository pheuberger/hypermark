import { useMemo, useEffect, useState } from 'preact/hooks'
import { Tag as TagIcon, Hash, BookmarkCheck, PackageOpen, X, Settings } from '../ui/Icons'
import { webrtcProviderSignal } from '../../hooks/useYjs'
import { SettingsModal } from '../ui/SettingsModal'

/**
 * Fixed left sidebar with tag navigation, sync status, and settings
 * Linear-inspired design with DaisyUI styling
 */
export function TagSidebar({
  bookmarks,
  selectedFilter,
  selectedTag,
  onFilterChange,
  onTagSelect,
  isOpen,
  onClose,
}) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Sync Status Logic
  const [connected, setConnected] = useState(false)
  const [peerCount, setPeerCount] = useState(0)
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    const provider = webrtcProviderSignal.value
    if (!provider) return

    const handleStatus = ({ connected }) => setConnected(connected)
    const handlePeers = ({ webrtcPeers }) => setPeerCount(webrtcPeers ? webrtcPeers.length : 0)
    const handleSynced = ({ synced }) => setSynced(synced)

    provider.on('status', handleStatus)
    provider.on('peers', handlePeers)
    provider.on('synced', handleSynced)

    // Initial state
    setConnected(provider.connected || false)
    setPeerCount(provider.room?.webrtcConns?.size || 0)
    setSynced(provider.synced || false)

    return () => {
      provider.off('status', handleStatus)
      provider.off('peers', handlePeers)
      provider.off('synced', handleSynced)
    }
  }, [webrtcProviderSignal.value])

  // Calculate tag counts
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

  // Sort tags by count (descending) then alphabetically
  const sortedTags = useMemo(() => {
    return Object.entries(tagCounts)
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1] // Count descending
        return a[0].localeCompare(b[0]) // Name ascending
      })
      .map(([tag, count]) => ({ tag, count }))
  }, [tagCounts])

  // Calculate read later count
  const readLaterCount = useMemo(() => {
    return bookmarks.filter((b) => b.readLater).length
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

  // Close sidebar on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Sync status helpers
  const getSyncColor = () => {
    if (!connected) return 'bg-base-content/20'
    if (synced) return 'bg-success'
    return 'bg-warning'
  }

  const getSyncText = () => {
    if (!connected) return 'Offline'
    if (peerCount === 0) return 'No peers'
    return `${peerCount} device${peerCount === 1 ? '' : 's'}`
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30 backdrop-blur-sm transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          w-64 h-screen bg-base-100 border-r border-base-200 flex flex-col overflow-hidden
          lg:relative lg:translate-x-0
          fixed top-0 left-0 z-40 transition-transform duration-300 ease-in-out shadow-xl lg:shadow-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Header - Minimal */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-base-200/50">
           <div className="flex items-center gap-2.5 font-semibold text-base-content opacity-90">
             <div className="p-1 bg-base-content/5 rounded-md">
               <TagIcon className="w-4 h-4" strokeWidth={2} />
             </div>
             <span>Hypermark</span>
           </div>
           
           <button
            onClick={onClose}
            className="lg:hidden btn btn-ghost btn-sm btn-circle text-base-content/60"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {/* All bookmarks */}
          <button
            onClick={() => handleFilterChange('all')}
            className={`w-full px-3 py-2 flex items-center justify-between text-left rounded-md transition-all duration-200 group ${
              selectedFilter === 'all'
                ? 'bg-base-200 text-base-content font-medium'
                : 'text-base-content/60 hover:text-base-content hover:bg-base-200/50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <PackageOpen className={`w-4 h-4 ${selectedFilter === 'all' ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`} strokeWidth={1.5} />
              <span className="text-sm">All Bookmarks</span>
            </div>
            <span className={`text-xs ${selectedFilter === 'all' ? 'opacity-60' : 'opacity-40 group-hover:opacity-60'}`}>{totalCount}</span>
          </button>

          {/* Read Later */}
          <button
            onClick={() => handleFilterChange('read-later')}
            className={`w-full px-3 py-2 flex items-center justify-between text-left rounded-md transition-all duration-200 group ${
              selectedFilter === 'read-later'
                ? 'bg-base-200 text-base-content font-medium'
                : 'text-base-content/60 hover:text-base-content hover:bg-base-200/50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <BookmarkCheck className={`w-4 h-4 ${selectedFilter === 'read-later' ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`} strokeWidth={1.5} />
              <span className="text-sm">Read Later</span>
            </div>
            <span className={`text-xs ${selectedFilter === 'read-later' ? 'opacity-60' : 'opacity-40 group-hover:opacity-60'}`}>{readLaterCount}</span>
          </button>

          {/* Divider */}
          <div className="my-4 h-px bg-base-200 mx-1" />

          {/* Tags section */}
          {sortedTags.length > 0 && (
            <>
              <div className="px-3 pb-2 pt-1">
                <span className="text-xs font-medium text-base-content/40 uppercase tracking-wider">Tags</span>
              </div>

              {sortedTags.map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => handleTagSelect(tag)}
                  className={`w-full px-3 py-1.5 flex items-center justify-between text-left rounded-md transition-all duration-200 group ${
                    selectedFilter === 'tag' && selectedTag === tag
                      ? 'bg-base-200 text-base-content font-medium'
                      : 'text-base-content/60 hover:text-base-content hover:bg-base-200/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Hash className={`w-3.5 h-3.5 flex-shrink-0 ${selectedFilter === 'tag' && selectedTag === tag ? 'opacity-70' : 'opacity-50 group-hover:opacity-70'}`} strokeWidth={1.5} />
                    <span className="text-sm truncate">{tag}</span>
                  </div>
                  <span className={`text-xs ${selectedFilter === 'tag' && selectedTag === tag ? 'opacity-60' : 'opacity-30 group-hover:opacity-50'}`}>{count}</span>
                </button>
              ))}
            </>
          )}
        </nav>

        {/* Bottom Section: Sync & Settings */}
        <div className="p-3 border-t border-base-200 space-y-1 bg-base-50/50">
          {/* Sync Status */}
          <div className="px-3 py-2 flex items-center gap-2.5 text-xs text-base-content/60">
            <div className={`w-2 h-2 rounded-full ring-2 ring-opacity-20 ring-offset-1 ring-offset-base-100 ${getSyncColor().replace('bg-', 'ring-')} ${getSyncColor()}`} />
            <span className="font-medium">{getSyncText()}</span>
          </div>

          {/* Settings Button */}
          <button
             onClick={() => setIsSettingsOpen(true)}
             className="w-full px-3 py-2 flex items-center gap-2.5 text-left rounded-md hover:bg-base-200 transition-colors text-base-content/70 hover:text-base-content"
          >
            <Settings className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-sm font-medium">Settings</span>
          </button>
        </div>
      </aside>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  )
}
